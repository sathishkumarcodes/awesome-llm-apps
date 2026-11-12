"""Scorecard validation and repair. Runs before any resume is evaluated.

Checks (each recorded as a ValidationCheck, with automatic fixes where safe):
  supported      every criterion traces to real job requirements (unsupported ones dropped)
  consolidated   overlapping criteria are merged
  coverage       every explicit must-have and preferred requirement is covered
  count          8-12 criteria when the job supports it; fewer for short JDs, never padded
  labels         inferred-only criteria are labeled inferred, capped at medium, never hard
  importance     must-have criteria are at least high; preferred-only at most medium
  hard           hard requirements are explicit must-haves of a non-negotiable kind
  protected      no criterion relies on protected characteristics or their proxies
  rubric         every criterion has all rubric anchors
  rules          every criterion maps to registered rules
  weights        weights sum to 100
  independent    generated from the job only (no resume input)
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.rules.registry import BY_ID
from app.scorecards.schemas import (
    HiringCriterion,
    Rubric,
    ScorecardContent,
    ValidationCheck,
)

MIN_CRITERIA, MAX_CRITERIA = 8, 12
_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}


@dataclass(frozen=True)
class PoolItem:
    id: str
    kind: str  # must_have | preferred | responsibility | inferred
    category: str
    text: str


# --- text helpers -------------------------------------------------------------------------
_STOP = {
    *[
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
        "of",
        "on",
        "or",
        "our",
        "the",
        "to",
        "with",
    ],
    *[
        "we",
        "you",
        "your",
        "will",
        "who",
        "that",
        "this",
        "their",
        "experience",
        "ability",
        "strong",
        "proven",
    ],
    *["including", "using", "work", "across", "years", "year"],
}


def tokens(text: str) -> set[str]:
    words = [w.rstrip(".,;:/-") for w in re.findall(r"[a-z0-9][a-z0-9+#./-]*", text.lower())]
    return {w.rstrip("s") if len(w) > 4 else w for w in words if w and w not in _STOP}


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


# --- protected characteristics --------------------------------------------------------------
_PROTECTED = re.compile(
    r"\b(age[ds]?\b(?! of)|young|youthful|digital native|recent (college )?grad\w*|gender|male|female|"
    r"man|woman|race|racial|ethnic\w*|religio\w*|national origin|native (english )?speaker|"
    r"pregnan\w*|marital|married|disabilit\w*|able[- ]bodied|sexual orientation|veteran status)\b",
    re.I,
)


def protected_terms(c: HiringCriterion) -> list[str]:
    text = " ".join(
        [
            c.name,
            c.description,
            c.evaluation_guidance,
            c.recruiter_guidance,
            c.hiring_manager_guidance,
        ]
    )
    return sorted({m.group(0).lower() for m in _PROTECTED.finditer(text)})


# --- hard requirements ------------------------------------------------------------------------
_NON_NEGOTIABLE = re.compile(
    r"\b(licen[cs]e[ds]?|licensure|board[- ]certified|security clearance|clearance|"
    r"certification required|must (hold|have|possess) (an? |the )?(active |valid |current )?"
    r"(licen|certif|clearance|registration)|registered (nurse|pharmacist|engineer)|\bCPA\b|\bRN\b|bar admission)",
    re.I,
)


_STRICT_CREDENTIAL = re.compile(
    r"\b(must|required|requires|active|valid|current)\b.*\b(certif\w*|licen[cs]\w*|clearance)\b",
    re.I,
)


def is_hard(c: HiringCriterion, pool: dict[str, PoolItem]) -> bool:
    """Hard = rests on an explicit must-have of a non-negotiable kind (license, clearance,
    required certification). Missing keywords, degrees with 'or equivalent' and inferred
    signals never make a hard requirement."""
    for rid in c.source_requirement_ids:
        item = pool.get(rid)
        if (
            item
            and item.kind == "must_have"
            and (_NON_NEGOTIABLE.search(item.text) or _STRICT_CREDENTIAL.search(item.text))
        ):
            return True
    return False


# --- rule mapping ---------------------------------------------------------------------------
_CATEGORY_RULES = {
    "experience": ["REQ-03", "REQ-04"],
    "technical": ["REQ-02", "KEY-01"],
    "domain": ["REQ-02"],
    "education": ["REQ-05"],
    "certification": ["REQ-06"],
    "seniority": ["SEN-01", "SEN-02", "SEN-03"],
    "impact": ["IMP-01", "IMP-02"],
    "leadership": ["SEN-02"],
}


def map_rules(c: HiringCriterion, pool: dict[str, PoolItem]) -> list[str]:
    ids = ["REQ-01", "REQ-08", "REQ-11", "REC-01", "HM-01", "HM-02", "ADV-03"]
    ids += _CATEGORY_RULES.get(c.category, [])
    texts = [pool[r].text for r in c.source_requirement_ids if r in pool]
    if any(pool[r].kind == "must_have" for r in c.source_requirement_ids if r in pool):
        ids.append("REQ-09")
    if any(re.search(r"\d+\s*\+?\s*years?", t, re.I) for t in texts):
        ids += ["REQ-03", "REQ-04"]
    if any(re.search(r"\bor\b", t) for t in texts):
        ids.append("REQ-07")
    if any(re.search(r"degree|bachelor|master|mba|phd", t, re.I) for t in texts):
        ids.append("REQ-05")
    if any(re.search(r"certif|licen", t, re.I) for t in texts):
        ids.append("REQ-06")
    if c.evaluation_owner in ("recruiter", "both"):
        ids += ["REC-02", "REC-03"]
    if c.is_hard_requirement:
        ids.append("ADV-01")
    if not c.is_explicit:
        ids.append("ADV-04")
    return [r for r in dict.fromkeys(ids) if r in BY_ID]


# --- default rubric ---------------------------------------------------------------------------
def default_rubric(name: str) -> Rubric:
    n = name.lower()
    return Rubric(
        level_5=f"Directly owned {n} with clear scope and results in recent roles.",
        level_4=f"Substantial {n} experience, with narrower scope or fewer results shown.",
        level_3=f"Moderate or transferable experience relevant to {n}.",
        level_2=f"Limited evidence of {n}: mentioned, with little detail on scope or results.",
        level_1=f"Only a passing mention of, or adjacent exposure to, {n}.",
    )


# --- consolidation --------------------------------------------------------------------------
def _merge(a: HiringCriterion, b: HiringCriterion) -> HiringCriterion:
    keep, other = (a, b) if _RANK[a.importance] >= _RANK[b.importance] else (b, a)
    sources = list(dict.fromkeys([*keep.source_requirement_ids, *other.source_requirement_ids]))
    owner = keep.evaluation_owner if keep.evaluation_owner == other.evaluation_owner else "both"
    return keep.model_copy(update={"source_requirement_ids": sources, "evaluation_owner": owner})


def overlapping(a: HiringCriterion, b: HiringCriterion) -> bool:
    sa, sb = set(a.source_requirement_ids), set(b.source_requirement_ids)
    if sa and sb and (sa <= sb or sb <= sa or _jaccard(sa, sb) >= 0.5):
        return True
    return _jaccard(tokens(a.name), tokens(b.name)) >= 0.6


def consolidate(criteria: list[HiringCriterion]) -> tuple[list[HiringCriterion], int]:
    out: list[HiringCriterion] = []
    merged = 0
    for c in criteria:
        for i, existing in enumerate(out):
            if overlapping(existing, c):
                out[i] = _merge(existing, c)
                merged += 1
                break
        else:
            out.append(c)
    return out, merged


def _affinity(c: HiringCriterion, item: PoolItem, pool: dict[str, PoolItem]) -> float:
    words = tokens(
        " ".join(
            [c.name, c.description, *(pool[r].text for r in c.source_requirement_ids if r in pool)]
        )
    )
    t = tokens(item.text)
    score = len(words & t) / len(t) if t else 0.0
    return score + (0.15 if c.category == item.category else 0.0)


_CATEGORY_NAMES = {
    "technical": "Technical skills",
    "domain": "Domain experience",
    "leadership": "Leadership",
    "product": "Product management",
    "education": "Education",
    "certification": "Certifications",
    "experience": "Relevant experience",
    "stakeholder": "Stakeholder management",
    "customer": "Customer focus",
    "other": "Other qualifications",
}


_LEAD_IN = re.compile(
    r"^(\d+\s*\+?\s*years? of\s+)?((strong|proven|solid|demonstrated|hands-on|deep)\s+)?"
    r"(experience|background|track record|proficiency|ability|knowledge|familiarity)"
    r"(\s+(with|in|of|to|working with|using|building|managing|leading))?\s+",
    re.I,
)


def requirement_name(text: str) -> str:
    """Short criterion name from a requirement's own words (never a generic category label)."""
    core = _LEAD_IN.sub("", text.strip()).split(";")[0].strip(" .")
    if len(core) > 60:
        core = core[:60].rsplit(" ", 1)[0]
    core = core or text.strip(" .")[:60]
    return core[0].upper() + core[1:]


def criterion_from_requirement(item: PoolItem, cid: str) -> HiringCriterion:
    name = requirement_name(item.text)
    return HiringCriterion(
        id=cid,
        name=name[0].upper() + name[1:],
        description=item.text,
        category=item.category if item.category in _CATEGORY_NAMES else "other",  # type: ignore[arg-type]
        source_requirement_ids=[item.id],
        importance="high" if item.kind == "must_have" else "medium",
        evaluation_owner="both",
        rubric=default_rubric(name),
        is_explicit=item.kind != "inferred",
        rationale=f"The job states: “{item.text[:140]}”.",
    )


def ensure_coverage(
    criteria: list[HiringCriterion], pool: dict[str, PoolItem]
) -> tuple[list[HiringCriterion], list[str]]:
    """Attach uncovered explicit requirements to the closest criterion, or add a criterion."""
    covered = {r for c in criteria for r in c.source_requirement_ids}
    actions: list[str] = []
    for item in pool.values():
        if item.kind not in ("must_have", "preferred") or item.id in covered:
            continue
        best = max(criteria, key=lambda c: _affinity(c, item, pool), default=None)
        if best is not None and (
            _affinity(best, item, pool) >= 0.3 or len(criteria) >= MAX_CRITERIA
        ):
            idx = criteria.index(best)
            criteria[idx] = best.model_copy(
                update={"source_requirement_ids": [*best.source_requirement_ids, item.id]}
            )
            actions.append(f"{item.id} → {best.name}")
        else:
            criteria.append(criterion_from_requirement(item, f"N{len(criteria) + 1}"))
            actions.append(f"{item.id} → new criterion")
        covered.add(item.id)
    return criteria, actions


def _merge_most_similar(
    criteria: list[HiringCriterion], pool: dict[str, PoolItem]
) -> list[HiringCriterion]:
    best = None
    for i in range(len(criteria)):
        for j in range(i + 1, len(criteria)):
            a, b = criteria[i], criteria[j]
            sim = _jaccard(
                tokens(a.name + " " + a.description), tokens(b.name + " " + b.description)
            )
            sim += 0.3 if a.category == b.category else 0.0
            if best is None or sim > best[0]:
                best = (sim, i, j)
    assert best is not None
    _, i, j = best
    merged = _merge(criteria[i], criteria[j])
    return [c for k, c in enumerate(criteria) if k not in (i, j)] + [merged]


# --- main ---------------------------------------------------------------------------------------
def repair(
    criteria: list[HiringCriterion], pool: dict[str, PoolItem], *, merge: bool = True
) -> tuple[list[HiringCriterion], list[ValidationCheck]]:
    """Structural fixes before rubrics and weights are written."""
    checks: list[ValidationCheck] = []

    # supported: keep only real requirement ids; drop criteria with none
    kept = []
    dropped = []
    for c in criteria:
        ids = [r for r in dict.fromkeys(c.source_requirement_ids) if r in pool]
        if ids:
            kept.append(c.model_copy(update={"source_requirement_ids": ids}))
        else:
            dropped.append(c.name)
    checks.append(
        ValidationCheck(
            name="supported",
            passed=not dropped,
            fixed=bool(dropped),
            detail=f"Dropped criteria with no job requirement behind them: {', '.join(dropped)}."
            if dropped
            else "Every criterion traces to job requirements.",
        )
    )

    # protected characteristics
    clean: list[HiringCriterion] = []
    flagged: list[str] = []
    for c in kept:
        terms = protected_terms(c)
        if terms:
            flagged.append(f"{c.name} ({', '.join(terms)})")
        else:
            clean.append(c)
    checks.append(
        ValidationCheck(
            name="protected",
            passed=not flagged,
            fixed=bool(flagged),
            detail=f"Removed: {'; '.join(map(str, flagged))}."
            if flagged
            else "No criterion relies on protected characteristics.",
        )
    )
    criteria = clean

    # consolidation
    # merge=False after a deliberate split, so split criteria aren't merged straight back.
    criteria, merged = consolidate(criteria) if merge else (criteria, 0)
    checks.append(
        ValidationCheck(
            name="consolidated",
            passed=True,
            fixed=merged > 0,
            detail=f"Merged {merged} overlapping criteria."
            if merged
            else "No overlapping criteria.",
        )
    )

    # coverage of explicit requirements
    criteria, actions = ensure_coverage(criteria, pool)
    checks.append(
        ValidationCheck(
            name="coverage",
            passed=True,
            fixed=bool(actions),
            detail=("Added coverage: " + "; ".join(actions))
            if actions
            else "All explicit requirements are covered.",
        )
    )

    # count
    merges = 0
    while len(criteria) > MAX_CRITERIA:
        criteria = _merge_most_similar(criteria, pool)
        merges += 1
    explicit = sum(
        1 for p in pool.values() if p.kind in ("must_have", "preferred", "responsibility")
    )
    few = len(criteria) < MIN_CRITERIA
    detail = f"{len(criteria)} criteria."
    if merges:
        detail += f" Merged {merges} to stay within {MAX_CRITERIA}."
    if few:
        detail += f" The job states {explicit} requirements, so fewer than {MIN_CRITERIA} criteria rather than invented ones."
    checks.append(
        ValidationCheck(
            name="count", passed=not few or explicit < MIN_CRITERIA, fixed=merges > 0, detail=detail
        )
    )

    # labels, importance, hard requirements
    fixes: list[str] = []
    out = []
    for c in criteria:
        kinds = {pool[r].kind for r in c.source_requirement_ids}
        explicit_c = bool(kinds - {"inferred"})
        importance = c.importance
        if not explicit_c and _RANK[importance] > _RANK["medium"]:
            importance = "medium"
            fixes.append(f"{c.name}: inferred-only, capped at medium")
        if "must_have" in kinds and _RANK[importance] < _RANK["high"]:
            importance = "high"
            fixes.append(f"{c.name}: backed by a must-have, raised to high")
        if kinds <= {"preferred", "inferred"} and _RANK[importance] > _RANK["medium"]:
            importance = "medium"
            fixes.append(f"{c.name}: preferred-only, capped at medium")
        hard = explicit_c and is_hard(c, pool)
        out.append(
            c.model_copy(
                update={
                    "is_explicit": explicit_c,
                    "importance": importance,
                    "is_hard_requirement": hard,
                    "source_requirement_texts": [pool[r].text for r in c.source_requirement_ids],
                }
            )
        )
    checks.append(
        ValidationCheck(
            name="labels",
            passed=not fixes,
            fixed=bool(fixes),
            detail="; ".join(fixes)
            if fixes
            else "Importance and explicit/inferred labels are consistent.",
        )
    )
    hard_names = [c.name for c in out if c.is_hard_requirement]
    checks.append(
        ValidationCheck(
            name="hard",
            passed=True,
            detail=f"Hard requirements: {', '.join(hard_names)}."
            if hard_names
            else "No non-negotiable requirements (license, clearance, required certification).",
        )
    )
    return out, checks


def finalize(content: ScorecardContent, pool: dict[str, PoolItem]) -> ScorecardContent:
    """Final checks after rubrics and weights: rubric completeness, rule mapping, weights, ids."""
    criteria = []
    missing_rubric = []
    for i, c in enumerate(sorted(content.criteria, key=lambda c: -c.weight), start=1):
        rubric = c.rubric
        if not all(
            [rubric.level_5, rubric.level_4, rubric.level_3, rubric.level_2, rubric.level_1]
        ):
            missing_rubric.append(c.name)
            rubric = default_rubric(c.name)
        c = c.model_copy(update={"id": f"C{i}", "rubric": rubric})
        c = c.model_copy(
            update={
                "source_rule_ids": map_rules(c, pool),
                "strong_evidence_definition": rubric.level_5,
                "moderate_evidence_definition": rubric.level_3,
                "weak_evidence_definition": rubric.level_1,
                "evaluation_guidance": c.evaluation_guidance or c.description,
            }
        )
        criteria.append(c)
    total = round(sum(c.weight for c in criteria), 6)
    unmapped = [c.name for c in criteria if not c.source_rule_ids]
    checks = [
        ValidationCheck(
            name="rubric",
            passed=not missing_rubric,
            fixed=bool(missing_rubric),
            detail=f"Default rubric used for: {', '.join(missing_rubric)}."
            if missing_rubric
            else "Every criterion has a full rubric.",
        ),
        ValidationCheck(
            name="rules",
            passed=not unmapped,
            detail="Every criterion maps to registered rules."
            if not unmapped
            else f"Unmapped: {', '.join(unmapped)}.",
        ),
        ValidationCheck(
            name="weights", passed=abs(total - 100) < 1e-6, detail=f"Weights sum to {total:g}%."
        ),
        ValidationCheck(
            name="independent",
            passed=content.generated_without_resume,
            detail="Generated from the job description only; no resume was read.",
        ),
    ]
    return content.model_copy(
        update={"criteria": criteria, "validation": [*content.validation, *checks]}
    )


def is_valid(content: ScorecardContent) -> bool:
    must_pass = {"supported", "rubric", "rules", "weights", "independent"}
    # A check that failed but was repaired automatically counts as passing.
    repaired = all(v.passed or v.fixed for v in content.validation if v.name in must_pass)
    return repaired and bool(content.criteria)


def validate(content: ScorecardContent, pool: dict[str, PoolItem]) -> ScorecardContent:
    """Full validation pass on an existing scorecard (repair + finalize)."""
    criteria, checks = repair(content.criteria, pool)
    content = content.model_copy(update={"criteria": criteria, "validation": checks})
    from app.scorecards.weighting import assign_weights

    kinds = {p.id: p.kind for p in pool.values()}
    content = content.model_copy(update={"criteria": assign_weights(content.criteria, kinds)})
    return finalize(content, pool)
