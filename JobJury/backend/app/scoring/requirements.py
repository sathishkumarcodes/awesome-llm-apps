"""Per-requirement assessment combining all three layers.

Layer 2 (hybrid semantic + keyword search) selects candidate resume lines for each requirement,
Layer 1 (deterministic checks) adds hard facts, and Layer 3 (LLM) judges whether the lines
demonstrate it. Each requirement is judged in its own call, so an answer can't be attached to
the wrong requirement and one bad output affects only one item.

Hard facts then settle what they can, in both directions: degree level, years in the named
area, certifications and named skills can raise a verdict as well as lower it. Conditions a
resume can't show (travel, office days, work authorization) are set aside, not scored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from app.core.errors import LLMOutputError
from app.core.logging import get_logger
from app.llm.outputs import SingleAssessmentOut
from app.llm.parallel import pmap
from app.llm.structured import call_structured
from app.parsing.job_parser import is_logistics
from app.schemas.analysis import NOT_DEMONSTRATED, RequirementAssessment
from app.schemas.job import JobProfile
from app.scoring.deterministic import DeterministicFacts, RequirementCheck, degree_level
from app.scoring.evidence import EvidenceBuilder
from app.scoring.semantic import Hit, SemanticIndex
from app.services.text_utils import skill_present

log = get_logger("requirements")
PROMPT = "requirement_assessment_v2"
MAX_RESPONSIBILITIES = 8
CANDIDATES = 8
FALLBACK_NOTE = "AI assessment unavailable for this item; shown from search similarity only."


@dataclass
class Item:
    id: str
    text: str
    kind: str  # must_have | preferred | responsibility | inferred
    category: str
    search_text: str


def collect_items(job: JobProfile) -> tuple[list[Item], list[str]]:
    """Requirements to assess, plus logistics conditions that a resume can't show."""
    items: list[Item] = []
    logistics: list[str] = []
    for r in job.requirements:
        if r.kind not in ("must_have", "preferred"):
            continue
        if is_logistics(r.text):
            logistics.append(r.text)
            continue
        items.append(Item(r.id, r.text, r.kind, r.category, r.text))
    items += [
        Item(r.id, r.text, r.kind, r.category, r.text)
        for r in job.by_kind("responsibility")[:MAX_RESPONSIBILITIES]
        if not is_logistics(r.text)
    ]
    for i, s in enumerate(job.inferred_signals, start=1):
        items.append(Item(f"S{i}", s.signal, "inferred", "other", f"{s.signal}. {s.rationale}"))
    return items, logistics


# --- retrieval ---------------------------------------------------------------------------
_STOP = set(
    [
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "has",
        "have",
        "in",
        "into",
        "is",
        "it",
        "its",
        "of",
        "on",
        "or",
        "our",
        "the",
        "to",
        "with",
        "we",
        "you",
        "your",
        "will",
        "who",
        "what",
        "that",
        "this",
        "their",
        "them",
        "they",
        "experience",
        "ability",
        "strong",
        "proven",
        "including",
        "such",
        "using",
        "use",
        "work",
        "working",
        "across",
        "etc",
    ]
)


def _tokens(text: str) -> set[str]:
    words = [w.rstrip("./-") for w in re.findall(r"[a-z0-9][a-z0-9+#./-]*", text.lower())]
    return {w.rstrip("s") if len(w) > 4 else w for w in words if w not in _STOP and len(w) > 1}


def clauses(text: str) -> list[str]:
    """Sub-clauses of a long requirement, searched separately so each part finds its evidence."""
    body = re.sub(r"\([^)]*\)", " ", text)
    parts = re.split(r"[;:,]|\b(?:and|or|including|such as|as well as)\b", body)
    out = [p.strip(" .") for p in parts if len(p.strip()) >= 6 and len(p.split()) >= 1]
    return out[:6] if len(out) > 1 else []


def candidate_lines(item: Item, index: SemanticIndex) -> list[Hit]:
    """Top resume lines by blended embedding similarity (best over clauses) and keyword overlap."""
    if not index.lines:
        return []
    queries = [item.search_text, *clauses(item.text)]
    cos = index.cosine(queries).max(axis=0)
    req_tokens = _tokens(item.text)
    lex = np.array(
        [
            len(req_tokens & _tokens(ln.text)) / len(req_tokens) if req_tokens else 0.0
            for ln in index.lines
        ],
        dtype=np.float32,
    )
    score = 0.75 * cos + 0.25 * np.minimum(1.0, lex * 2)
    order = np.argsort(-score)[:CANDIDATES]
    return [Hit(index.lines[i].id, float(score[i])) for i in order]


# --- hard facts ----------------------------------------------------------------------------
_OR_ADVANCED = re.compile(r"\bor (an? )?(advanced|master|graduate|equivalent)", re.I)
_FIELD = re.compile(r"\bdegree in\b|\b(in|of) (computer|engineering|business|science|math|economics|statistics|a related)", re.I)  # fmt: skip
_ACRONYM = re.compile(r"\b[A-Z][A-Z0-9]{2,6}\b")


@dataclass
class FactVerdict:
    floor: str | None = None  # minimum status the facts support
    cap: str | None = None  # maximum status the facts allow
    line_ids: tuple[str, ...] = ()
    note: str = ""


RANK = {"not_demonstrated": 0, "partial": 1, "demonstrated": 2}


_YEARS_PHRASE = re.compile(r"\d{1,2}\s*\+?\s*(?:-|–|to)?\s*\d{0,2}\s*\+?\s*years?", re.I)
_AREA_PHRASE = re.compile(
    r"\b(product (management|manager|leadership|owner)|software engineering|engineering)\b", re.I
)
_FILLER = {
    "experience",
    "year",
    "years",
    "minimum",
    "least",
    "professional",
    "relevant",
    "role",
    "plu",
}


def _only_years_and_area(text: str) -> bool:
    """True when a requirement says only 'N+ years of <area> experience', nothing more specific."""
    rest = _AREA_PHRASE.sub(" ", _YEARS_PHRASE.sub(" ", text))
    return not (_tokens(rest) - _FILLER)


_LINE_ID = re.compile(r"\bL\d{4}\b")


def cited_ids(text: str) -> list[str]:
    return list(dict.fromkeys(_LINE_ID.findall(text)))


_LIST_SPLIT = re.compile(r",\s*(?:and\s+)?|\s+and\s+")
_LAST_HEAD = re.compile(r".*\b(?:of|with|in|across|including)\s+(.+)$", re.I)


def all_of_items(text: str) -> list[str]:
    """Items of an 'A, B, and C' list (empty for 'or' lists and plain sentences)."""
    body = text.strip().rstrip(".")
    if re.search(r"\bor\b", body):
        return []
    m = _LAST_HEAD.match(body)  # the list follows the LAST "of/with/in..."
    tail = m.group(1) if m else body
    items = [i.strip() for i in _LIST_SPLIT.split(tail) if i.strip()]
    if len(items) < 2 or any(len(i.split()) > 3 for i in items):
        return []
    return items


def _lines_with(evb: EvidenceBuilder, term: str, sections: tuple[str, ...] = ()) -> list[str]:
    return [
        ln.id
        for ln in evb.lines.values()
        if ln.kind != "heading"
        and (not sections or ln.section in sections)
        and skill_present(ln.text, term)
    ]


def fact_verdicts(item: Item, chk: RequirementCheck | None, evb: EvidenceBuilder) -> list[FactVerdict]:  # fmt: skip
    """What the deterministic checks establish about this requirement."""
    out: list[FactVerdict] = []
    text = item.text
    # Degree level: the resume either lists a degree at the required level or it doesn't.
    req_level = degree_level(text)
    if req_level and chk is not None:
        cand = chk.degree_candidate or 0
        mba_only = re.search(r"\bm\.?b\.?a\b", text, re.I) and not _OR_ADVANCED.search(text)
        edu_ids = [
            ln.id
            for ln in evb.lines.values()
            if ln.section == "education" and ln.kind != "heading" and degree_level(ln.text)
        ][:2]
        if cand >= req_level and not mba_only and edu_ids:
            if _FIELD.search(text):  # level met; whether the field matches is a judgment call
                out.append(FactVerdict(floor="partial", line_ids=tuple(edu_ids), note="Degree level is met; field judged from the resume."))  # fmt: skip
            else:
                out.append(FactVerdict(floor="demonstrated", line_ids=tuple(edu_ids), note="The resume lists a degree at the required level."))  # fmt: skip
        elif 0 < cand < req_level:
            out.append(FactVerdict(cap="not_demonstrated", note="The highest degree listed is below the required level."))  # fmt: skip
    if chk is None:
        return out
    # Years in the named area (e.g. product management), from role titles and dates.
    if chk.years_required:
        if chk.area_years_met:
            floor = "demonstrated" if _only_years_and_area(text) else "partial"
            out.append(FactVerdict(floor=floor, line_ids=tuple(chk.area_line_ids), note=f"Resume dates show {chk.area_years:g} years in {chk.area} roles ({chk.years_required:g}+ required)."))  # fmt: skip
        elif chk.area_years_met is False:
            out.append(FactVerdict(cap="partial", note=f"Resume dates show {chk.area_years:g} years in {chk.area} roles vs {chk.years_required:g} required."))  # fmt: skip
        elif chk.years_met is False:
            out.append(FactVerdict(cap="partial", note=f"Resume dates show {chk.years_candidate:g} years total vs {chk.years_required:g} required."))  # fmt: skip
        elif chk.years_met:
            out.append(FactVerdict(floor="partial", note=f"Resume dates show {chk.years_candidate:g} years total ({chk.years_required:g}+ required); whether it's in this area is judged from the bullets."))  # fmt: skip
    # Named tools/skills. "or"-lists need any one; otherwise all.
    if chk.skills_found or chk.skills_missing:
        any_of = bool(re.search(r"\bor\b", text, re.I))
        found_ids = [i for s in chk.skills_found for i in _lines_with(evb, s)][:3]
        if chk.skills_found and (any_of or not chk.skills_missing) and found_ids:
            out.append(FactVerdict(floor="partial", line_ids=tuple(found_ids), note=f"Resume names {', '.join(chk.skills_found)}."))  # fmt: skip
        elif not chk.skills_found:
            out.append(FactVerdict(cap="partial", note=f"Named skill(s) {', '.join(chk.skills_missing)} do not appear in the resume."))  # fmt: skip
    # "A, B, and C" lists: if the resume shows some items but not others, at most partial.
    items = all_of_items(text)
    if items:
        resume_text = " ".join(ln.text for ln in evb.lines.values())
        present = [i for i in items if skill_present(resume_text, i) or skill_present(resume_text, i.rstrip("s"))]  # fmt: skip
        if present and len(present) < len(items):
            missing = [i for i in items if i not in present]
            out.append(FactVerdict(cap="partial", note=f"The resume shows {', '.join(present)} but not {', '.join(missing)}."))  # fmt: skip
    # Certifications named by acronym (e.g. "PMP or CSPO").
    if item.category == "certification" or re.search(r"certif", text, re.I):
        acronyms = [a for a in _ACRONYM.findall(text) if a not in ("AND", "OR")]
        hits = [(a, _lines_with(evb, a)) for a in acronyms]
        hits = [(a, ids) for a, ids in hits if ids]
        any_of = bool(re.search(r"\bor\b", text, re.I))
        if hits and (any_of or len(hits) == len(acronyms)):
            out.append(FactVerdict(floor="demonstrated", line_ids=tuple(hits[0][1][:2]), note=f"The resume lists {hits[0][0]}."))  # fmt: skip
    return out


def _format_checks(chk: RequirementCheck | None) -> str:
    if chk is None:
        return "none"
    parts = []
    if chk.skills_missing:
        parts.append(f"named skills NOT found anywhere in resume: {chk.skills_missing}")
    if chk.skills_found:
        parts.append(f"named skills found in resume: {chk.skills_found}")
    if chk.years_required:
        parts.append(
            f"requires {chk.years_required:g} years; resume dates show {chk.years_candidate} years total"
        )
        if chk.area:
            parts.append(f"{chk.area_years} years in {chk.area} roles")
    return "; ".join(parts) or "none"


# --- assessment ----------------------------------------------------------------------------
def _assess_one(
    item: Item,
    hits: list[Hit],
    evb: EvidenceBuilder,
    facts: DeterministicFacts,
    facts_text: str,
) -> RequirementAssessment:
    chk = facts.checks.get(item.id)
    verdicts = fact_verdicts(item, chk, evb)
    # Lines the facts point at are always shown to the model alongside the search hits.
    fact_ids = [i for v in verdicts for i in v.line_ids]
    shown = list(dict.fromkeys([*fact_ids, *(h.line_id for h in hits)]))[: CANDIDATES + 2]
    lines = "\n".join(f"{lid}: {evb.text(lid)}" for lid in shown)
    label = "inferred signal, not stated in the job" if item.kind == "inferred" else item.kind
    try:
        out, _ = call_structured(
            PROMPT,
            SingleAssessmentOut,
            facts=facts_text,
            kind=label,
            requirement=item.text,
            checks=_format_checks(chk),
            lines=lines or "(no lines found)",
        )
    except LLMOutputError:
        log.warning("assessment failed for %s; using search fallback", item.id)
        return _fallback(item, hits, evb, verdicts)
    return _apply_guardrails(item, out, hits, evb, chk, verdicts)


def _apply_guardrails(
    item: Item,
    out: SingleAssessmentOut,
    hits: list[Hit],
    evb: EvidenceBuilder,
    chk: RequirementCheck | None,
    verdicts: list[FactVerdict],
) -> RequirementAssessment:
    status, support, rationale = out.status, out.support, out.rationale.strip()
    strength_by_id = {e.line_id: e.strength for e in out.evidence}
    ids = evb.valid([e.line_id for e in out.evidence])
    notes: list[str] = []
    if not ids and status != "not_demonstrated":
        # Small models often name the line in the rationale but leave "evidence" empty.
        # Accept those ids, but only lines the model was actually shown.
        shown = {h.line_id for h in hits} | {i for v in verdicts for i in v.line_ids}
        ids = [i for i in evb.valid(cited_ids(rationale)) if i in shown]

    if status != "not_demonstrated" and not ids:
        status = "not_demonstrated"
        notes.append("No resume line was cited as evidence.")

    # Hard facts settle what they can: caps first, then floors (a floor carries its evidence).
    for v in verdicts:
        if v.cap and RANK[status] > RANK[v.cap]:
            status = v.cap  # type: ignore[assignment]
            notes.append(v.note)
    for v in verdicts:
        if v.floor and RANK[status] < RANK[v.floor] and v.line_ids:
            capped = any(c.cap and RANK[c.cap] < RANK[v.floor] for c in verdicts)
            if capped:
                continue
            status = v.floor  # type: ignore[assignment]
            ids = list(dict.fromkeys([*evb.valid(list(v.line_ids)), *ids]))
            for lid in v.line_ids:
                strength_by_id.setdefault(
                    lid, "strong" if v.floor == "demonstrated" else "moderate"
                )  # type: ignore[arg-type]
            notes.append(v.note)

    if status == "not_demonstrated":
        support, ids = "not_demonstrated", []
    elif status == "demonstrated":
        support = "confirmed"
    elif support in ("confirmed", "not_demonstrated"):
        support = "potentially_transferable"

    evidence = []
    for lid in ids[:3]:
        evidence += evb.build([lid], item.text, strength_by_id.get(lid, "moderate"))
    if notes:
        rationale = f"{rationale} {' '.join(dict.fromkeys(notes))}".strip()
    if status == "not_demonstrated" and not rationale:
        rationale = NOT_DEMONSTRATED
    return RequirementAssessment(
        requirement_id=item.id,
        text=item.text,
        kind=item.kind,
        category=item.category,
        status=status,
        support=support,
        rationale=rationale,
        evidence=evidence,
        semantic_score=round(hits[0].score, 3) if hits else 0.0,
        deterministic=chk.as_dict() if chk else {},
    )


def _fallback(
    item: Item, hits: list[Hit], evb: EvidenceBuilder, verdicts: list[FactVerdict]
) -> RequirementAssessment:
    """Used only if the model fails for this item. Facts decide where they can; otherwise
    conservative: never 'demonstrated' from similarity alone."""
    floors = [v for v in verdicts if v.floor and v.line_ids]
    caps = [v for v in verdicts if v.cap]
    if floors and not caps:
        v = max(floors, key=lambda f: RANK[f.floor or "partial"])
        status = v.floor or "partial"
        ids = list(v.line_ids)
        note = v.note
    else:
        top = hits[0] if hits else None
        related = top is not None and top.score >= 0.55 and not caps
        status = "partial" if related else "not_demonstrated"
        ids = [top.line_id] if related and top else []
        note = "A related resume line exists; review it." if related else NOT_DEMONSTRATED
    return RequirementAssessment(
        requirement_id=item.id,
        text=item.text,
        kind=item.kind,
        category=item.category,
        status=status,  # type: ignore[arg-type]
        support={"demonstrated": "confirmed", "partial": "potentially_transferable"}.get(
            status, "not_demonstrated"
        ),  # type: ignore[arg-type]
        rationale=f"{FALLBACK_NOTE} {note}",
        evidence=evb.build(ids, item.text, "weak") if ids else [],
        semantic_score=round(hits[0].score, 3) if hits else 0.0,
    )


def assess(
    job: JobProfile,
    index: SemanticIndex,
    evb: EvidenceBuilder,
    facts: DeterministicFacts,
) -> tuple[list[RequirementAssessment], list[str]]:
    """Assess every requirement (one model call each, concurrently where the model allows).

    Returns (assessments, logistics conditions set aside)."""
    items, logistics = collect_items(job)
    facts_text = facts.summary()
    hits = [candidate_lines(it, index) for it in items]
    results = pmap(lambda pair: _assess_one(pair[0], pair[1], evb, facts, facts_text), list(zip(items, hits, strict=True)))  # fmt: skip
    return results, logistics


def coverage(
    assessments: list[RequirementAssessment], *, kinds=None, categories=None
) -> float | None:
    """0-100 coverage score; must-haves count double. None when nothing matches the filter."""
    value = {"demonstrated": 1.0, "partial": 0.5, "not_demonstrated": 0.0}
    total = weight_sum = 0.0
    for a in assessments:
        if kinds and a.kind not in kinds:
            continue
        if categories and a.category not in categories:
            continue
        w = 2.0 if a.kind == "must_have" else 1.0
        total += w * value[a.status]
        weight_sum += w
    return round(100 * total / weight_sum, 1) if weight_sum else None
