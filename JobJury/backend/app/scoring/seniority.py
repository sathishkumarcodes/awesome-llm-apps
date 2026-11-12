"""Seniority calibration: demonstrated level from evidence, not title."""

from __future__ import annotations

from app.llm.outputs import SeniorityOut
from app.llm.structured import call_structured
from app.schemas.analysis import SeniorityAssessment, SeniorityDimension
from app.schemas.job import SENIORITY_LADDER, JobProfile
from app.schemas.profile import CandidateProfile
from app.scoring.evidence import EvidenceBuilder

PROMPT = "seniority_evaluation_v1"
ND = "Not demonstrated"


def level_index(level: str) -> int:
    return SENIORITY_LADDER.index(level) if level in SENIORITY_LADDER else -1


def title_level(title: str) -> str:
    t = title.lower()
    if any(k in t for k in ("director", "head of", "vp", "vice president")):
        return "Director"
    if "principal" in t:
        return "Principal PM"
    if "staff" in t or "group product" in t or "lead product" in t:
        return "Staff PM"
    if "senior" in t or "sr." in t or "sr " in t:
        return "Senior PM"
    if "product" in t:
        return "PM"
    return ND


def level_fit(role_level: str, low: str, high: str) -> float | None:
    """0-100 fit between the role's level and the demonstrated range."""
    r = level_index(role_level)
    if r < 0:
        return None
    hi, lo = level_index(high), level_index(low)
    if hi < 0:
        return 30.0
    if lo <= r <= hi or (lo < 0 and r <= hi):
        return 100.0
    if hi < r:
        return max(10.0, 100.0 - 35.0 * (r - hi))
    return 85.0  # demonstrated above the role's level


def apply_guardrails(out: SeniorityOut, evb: EvidenceBuilder) -> SeniorityAssessment:
    dims: list[SeniorityDimension] = []
    evidenced_levels: list[int] = []
    for d in out.dimensions:
        ids = evb.valid(d.line_ids)
        level = d.level if ids else ND
        if level != ND:
            evidenced_levels.append(level_index(level))
        dims.append(
            SeniorityDimension(
                dimension=d.dimension.replace("_", " ").capitalize(),
                level=level,
                note=d.note if ids else "Not demonstrated in the resume.",
                evidence=evb.build(ids, f"{d.dimension}: {level}", "moderate", limit=2),
            )
        )
    high: str = out.demonstrated_high
    low: str = out.demonstrated_low
    # The upper bound cannot exceed the highest level any evidenced dimension supports.
    cap = max(evidenced_levels) if evidenced_levels else -1
    if level_index(high) > cap:
        high = SENIORITY_LADDER[cap] if cap >= 0 else ND
    if level_index(low) > level_index(high):
        low = high
    if low == ND and high != ND:
        low = high
    return SeniorityAssessment(
        role_level="",
        title_level=out.title_level,
        demonstrated_low=low,
        demonstrated_high=high,
        explanation=out.explanation,
        dimensions=dims,
    )


def assess(job: JobProfile, profile: CandidateProfile, lines_text: str, evb: EvidenceBuilder):
    titles = "; ".join(f"{e.title} at {e.company} ({e.dates_text})" for e in profile.experience)
    role_level = job.seniority_level or "unspecified"
    out, _ = call_structured(
        PROMPT,
        SeniorityOut,
        role_level=role_level,
        job_title=job.title or "unknown title",
        titles=titles or "none listed",
        lines=lines_text,
    )
    result = apply_guardrails(out, evb)
    result.role_level = job.seniority_level or "Unspecified"
    current = profile.experience[0].title if profile.experience else ""
    if current:
        result.title_level = title_level(current)
    return result
