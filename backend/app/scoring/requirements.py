"""Per-requirement assessment combining all three layers.

Layer 2 (semantic search) selects candidate resume lines for each requirement, Layer 1
(deterministic checks) adds hard facts, and Layer 3 (LLM) judges whether the lines
demonstrate it. Deterministic guardrails then downgrade any judgment the evidence can't back.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.errors import LLMOutputError
from app.core.logging import get_logger
from app.llm.outputs import AssessmentBatchOut, AssessmentOut
from app.llm.structured import call_structured
from app.schemas.analysis import NOT_DEMONSTRATED, RequirementAssessment
from app.schemas.job import JobProfile
from app.scoring.deterministic import DeterministicFacts
from app.scoring.evidence import EvidenceBuilder
from app.scoring.semantic import Hit, SemanticIndex

log = get_logger("requirements")
PROMPT = "requirement_assessment_v1"
BATCH = 6
MAX_RESPONSIBILITIES = 8


@dataclass
class Item:
    id: str
    text: str
    kind: str  # must_have | preferred | responsibility | inferred
    category: str
    search_text: str


def collect_items(job: JobProfile) -> list[Item]:
    items = [
        Item(r.id, r.text, r.kind, r.category, r.text)
        for r in job.requirements
        if r.kind in ("must_have", "preferred")
    ]
    items += [
        Item(r.id, r.text, r.kind, r.category, r.text)
        for r in job.by_kind("responsibility")[:MAX_RESPONSIBILITIES]
    ]
    for i, s in enumerate(job.inferred_signals, start=1):
        items.append(Item(f"S{i}", s.signal, "inferred", "other", f"{s.signal}. {s.rationale}"))
    return items


def _format_item(
    item: Item, hits: list[Hit], evb: EvidenceBuilder, facts: DeterministicFacts
) -> str:
    cands = "\n".join(f"    {h.line_id}: {evb.text(h.line_id)}" for h in hits)
    det = ""
    chk = facts.checks.get(item.id)
    if chk:
        if chk.skills_missing:
            det += f" Named skills NOT found anywhere in resume: {chk.skills_missing}."
        if chk.skills_found:
            det += f" Named skills found in resume: {chk.skills_found}."
        if chk.years_required:
            det += (
                f" Requires {chk.years_required:g} years; resume dates show "
                f"{chk.years_candidate if chk.years_candidate is not None else 'unknown'} years total."
            )
    label = "INFERRED signal" if item.kind == "inferred" else item.kind
    return f"{item.id} ({label}): {item.text}\n  deterministic:{det or ' none'}\n  candidate lines:\n{cands}"


def _apply_guardrails(
    item: Item,
    out: AssessmentOut,
    hits: list[Hit],
    evb: EvidenceBuilder,
    facts: DeterministicFacts,
) -> RequirementAssessment:
    status, support, rationale = out.status, out.support, out.rationale.strip()
    strength_by_id = {e.line_id: e.strength for e in out.evidence}
    ids = evb.valid([e.line_id for e in out.evidence])
    notes: list[str] = []

    if status != "not_demonstrated" and not ids:
        status, support = "not_demonstrated", "not_demonstrated"
        notes.append("No resume line was cited as evidence.")
    chk = facts.checks.get(item.id)
    if chk and chk.skills_missing and not chk.skills_found and status == "demonstrated":
        status = "partial"
        support = "potentially_transferable"
        notes.append(f"Named skill(s) {', '.join(chk.skills_missing)} do not appear in the resume.")
    if chk and chk.years_met is False and status == "demonstrated":
        status = "partial"
        notes.append(
            f"Resume dates show {chk.years_candidate:g} years vs {chk.years_required:g} required."
        )
    if status == "not_demonstrated":
        support = "not_demonstrated"
        ids = []
    if support == "confirmed" and status == "partial":
        support = "potentially_transferable"
    if status == "demonstrated":
        support = "confirmed"

    claim = item.text
    evidence = []
    for lid in ids[:3]:
        evidence += evb.build([lid], claim, strength_by_id.get(lid, "moderate"))
    if notes:
        rationale = f"{rationale} {' '.join(notes)}".strip()
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


def _semantic_fallback(item: Item, hits: list[Hit], evb: EvidenceBuilder) -> RequirementAssessment:
    """Used only if the model fails for a batch. Conservative: never 'demonstrated'."""
    top = hits[0] if hits else None
    related = top is not None and top.score >= 0.5
    return RequirementAssessment(
        requirement_id=item.id,
        text=item.text,
        kind=item.kind,
        category=item.category,
        status="partial" if related else "not_demonstrated",
        support="potentially_transferable" if related else "not_demonstrated",
        rationale=(
            "AI assessment unavailable for this item; shown from semantic similarity only. "
            + ("A related resume line exists — review it." if related else NOT_DEMONSTRATED)
        ),
        evidence=evb.build([top.line_id], item.text, "weak") if related and top else [],
        semantic_score=round(top.score, 3) if top else 0.0,
    )


def assess(
    job: JobProfile,
    index: SemanticIndex,
    evb: EvidenceBuilder,
    facts: DeterministicFacts,
) -> list[RequirementAssessment]:
    items = collect_items(job)
    all_hits = index.search_many([it.search_text for it in items], k=4)
    results: dict[str, RequirementAssessment] = {}
    facts_text = facts.summary()
    for start in range(0, len(items), BATCH):
        batch = list(
            zip(items[start : start + BATCH], all_hits[start : start + BATCH], strict=True)
        )
        prompt_items = "\n\n".join(_format_item(it, h, evb, facts) for it, h in batch)
        try:
            out, _ = call_structured(
                PROMPT, AssessmentBatchOut, facts=facts_text, items=prompt_items
            )
            by_id = {a.id.strip(): a for a in out.assessments}
        except LLMOutputError:
            log.warning("assessment batch failed; using semantic fallback")
            by_id = {}
        for it, hits in batch:
            a = by_id.get(it.id)
            results[it.id] = (
                _apply_guardrails(it, a, hits, evb, facts)
                if a
                else _semantic_fallback(it, hits, evb)
            )
    return [results[it.id] for it in items]


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
