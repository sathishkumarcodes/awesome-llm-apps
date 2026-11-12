"""Final application recommendation.

The decision is computed deterministically from scores and must-have coverage so it is
consistent and testable; the LLM only explains it and proposes truthful improvements.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.errors import AppError
from app.llm.outputs import RecommendationOut
from app.llm.structured import call_structured
from app.schemas.analysis import (
    DECISION_LABELS,
    EvaluatorResult,
    Improvement,
    Recommendation,
    RequirementAssessment,
)
from app.scoring.evidence import EvidenceBuilder

PROMPT = "recommendation_v1"
RECRUITER_WEIGHT = 0.45
HM_WEIGHT = 0.55


@dataclass
class DecisionInputs:
    recruiter_score: float
    hm_score: float
    must_missing: int
    must_partial: int
    must_total: int
    resume_alignment: float | None  # recruiter "resume_alignment" rating 0-100
    transferable_partials: int


def overall(recruiter_score: float, hm_score: float) -> float:
    return round(RECRUITER_WEIGHT * recruiter_score + HM_WEIGHT * hm_score, 0)


def decide(d: DecisionInputs) -> tuple[str, list[str]]:
    score = overall(d.recruiter_score, d.hm_score)
    factors = [
        f"Overall fit {score:.0f}/100 (recruiter {d.recruiter_score:.0f}, hiring manager {d.hm_score:.0f})."
    ]
    if d.must_total:
        factors.append(
            f"{d.must_total - d.must_missing - d.must_partial} of {d.must_total} must-have requirements "
            f"demonstrated, {d.must_partial} partially, {d.must_missing} not demonstrated."
        )
    if d.must_missing >= 2 or (d.must_missing == 1 and score < 65) or score < 50:
        factors.append("One or more critical requirements are not demonstrated in the resume.")
        return "PROBABLY_SKIP", factors
    if d.must_missing == 1 or score < 68:
        factors.append("There is meaningful alignment, but significant gaps remain.")
        return "BORDERLINE", factors
    undersold = (
        d.resume_alignment is not None and d.resume_alignment < 75
    ) or d.transferable_partials > 0
    if score >= 80 and not undersold:
        factors.append(
            "Strong fit with manageable gaps; the resume already surfaces the relevant experience."
        )
        return "APPLY", factors
    factors.append(
        "Good fit, but the resume undersells relevant experience; tailoring could improve positioning."
    )
    return "APPLY_TAILOR_FIRST", factors


def decision_inputs(
    recruiter: EvaluatorResult, hm: EvaluatorResult, assessments: list[RequirementAssessment]
) -> DecisionInputs:
    musts = [a for a in assessments if a.kind == "must_have"]
    align = next((c.rating for c in recruiter.categories if c.key == "resume_alignment"), None)
    return DecisionInputs(
        recruiter_score=recruiter.score,
        hm_score=hm.score,
        must_missing=sum(a.status == "not_demonstrated" for a in musts),
        must_partial=sum(a.status == "partial" for a in musts),
        must_total=len(musts),
        resume_alignment=align,
        transferable_partials=sum(
            a.status == "partial" and a.support == "potentially_transferable"
            for a in assessments
            if a.kind in ("must_have", "preferred")
        ),
    )


def explain(
    decision: str,
    factors: list[str],
    job_text: str,
    findings: str,
    lines_text: str,
    evb: EvidenceBuilder,
) -> tuple[Recommendation, list[Improvement]]:
    label = DECISION_LABELS[decision]
    try:
        out, _ = call_structured(
            PROMPT,
            RecommendationOut,
            decision=label,
            job=job_text,
            findings=findings + "\n" + "\n".join(factors),
            lines=lines_text,
            temperature=0.2,
        )
    except AppError:
        rec = Recommendation(
            decision=decision,  # type: ignore[arg-type]
            label=label,
            headline=factors[-1],
            why=" ".join(factors),
            deciding_factors=factors,
        )
        return rec, []
    improvements = []
    for imp in out.improvements[:6]:
        ev = evb.build(imp.line_ids, imp.action, "moderate", limit=2)
        if not ev:
            continue  # only suggest changes anchored in existing experience
        improvements.append(
            Improvement(action=imp.action, rationale=imp.rationale, impact=imp.impact, evidence=ev)
        )
    rec = Recommendation(
        decision=decision,  # type: ignore[arg-type]
        label=label,
        headline=out.headline,
        why=out.why,
        deciding_factors=factors,
    )
    return rec, improvements
