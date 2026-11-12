"""Deterministic scores from structured criterion results.

    points(criterion) = weight × level / 5            (unknown criteria are left out)
    score             = Σ points / Σ weight of assessed criteria × 100

* Overall fit uses every criterion once, at its evidence level.
* Recruiter uses criteria owned by recruiter or both, at the recruiter level.
* Hiring manager uses criteria owned by hiring_manager or both, at the hiring-manager level.
  Each view counts a criterion once, so shared criteria aren't double-counted.
* Evidence completeness is the share of weight with any resume evidence (not "not
  demonstrated" or "unknown").
* Scores are provisional when critical/high criteria without evidence carry ≥ 20% of the weight.

The same results and config always produce the same numbers (see tests).
"""

from __future__ import annotations

from collections.abc import Callable

from app.scorecards.schemas import CriterionResult, HiringCriterion, Scores

SCORING_VERSION = "scorecard-scoring-v1"
PROVISIONAL_SHARE = 20.0
CONFIG = {"version": SCORING_VERSION, "provisional_share": PROVISIONAL_SHARE}

NO_EVIDENCE = {"not_demonstrated", "unknown"}


def level_value(level: str | None) -> float | None:
    if level is None or level == "unknown":
        return None
    return int(level) / 5


def weighted(
    pairs: list[tuple[HiringCriterion, CriterionResult]],
    level_of: Callable[[CriterionResult], str | None],
    include: Callable[[HiringCriterion], bool] = lambda _c: True,
) -> float | None:
    total = earned = 0.0
    for c, r in pairs:
        if not include(c):
            continue
        v = level_value(level_of(r))
        if v is None:
            continue
        total += c.weight
        earned += c.weight * v
    return round(100 * earned / total, 1) if total else None


def compute(
    criteria: list[HiringCriterion], results: list[CriterionResult], ats_readiness: float
) -> Scores:
    by_id = {r.criterion_id: r for r in results}
    pairs = [(c, by_id[c.id]) for c in criteria if c.id in by_id]
    total_weight = sum(c.weight for c, _ in pairs) or 1.0
    with_evidence = sum(c.weight for c, r in pairs if r.classification not in NO_EVIDENCE)
    missing_important = sum(
        c.weight
        for c, r in pairs
        if r.classification in NO_EVIDENCE and c.importance in ("critical", "high")
    )
    clarified = any(r.clarified_level is not None for _, r in pairs)
    return Scores(
        overall_fit=weighted(pairs, lambda r: r.level),
        recruiter=weighted(
            pairs,
            lambda r: r.recruiter_level,
            lambda c: c.evaluation_owner in ("recruiter", "both"),
        ),
        hiring_manager=weighted(
            pairs,
            lambda r: r.hiring_manager_level,
            lambda c: c.evaluation_owner in ("hiring_manager", "both"),
        ),
        ats_readiness=ats_readiness,
        evidence_completeness=round(100 * with_evidence / total_weight, 1),
        provisional=missing_important >= PROVISIONAL_SHARE,
        fit_with_clarifications=(
            weighted(
                pairs, lambda r: r.clarified_level if r.clarified_level is not None else r.level
            )
            if clarified
            else None
        ),
    )


def fit_with_levels(
    criteria: list[HiringCriterion], results: list[CriterionResult], override: dict[str, str]
) -> float | None:
    """Overall fit if some criteria had different levels (used for what-if analysis)."""
    by_id = {r.criterion_id: r for r in results}
    pairs = [(c, by_id[c.id]) for c in criteria if c.id in by_id]
    return weighted(pairs, lambda r: override.get(r.criterion_id, r.level))
