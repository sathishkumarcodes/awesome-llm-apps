"""Recruiter and hiring manager evaluators.

Each evaluator asks the LLM for category ratings with cited lines, then blends those
ratings with deterministic components (coverage, years, level fit, metric density) so the
final score is explainable: every category exposes its components and evidence.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.llm.outputs import (
    HiringManagerOut,
    PointOut,
    RatingOut,
    RecruiterOut,
    RiskOut,
    SupportedPointOut,
)
from app.llm.structured import call_structured
from app.schemas.analysis import (
    CategoryScore,
    EvaluatorResult,
    Insight,
    RequirementAssessment,
    Risk,
    SeniorityAssessment,
)
from app.schemas.job import JobProfile
from app.scoring.deterministic import DeterministicFacts
from app.scoring.evidence import EvidenceBuilder
from app.scoring.requirements import coverage
from app.scoring.seniority import level_fit
from app.scoring.weights import hiring_manager_weights, recruiter_weights

RECRUITER_PROMPT = "recruiter_evaluation_v1"
HM_PROMPT = "hiring_manager_evaluation_v1"

MUST_PREF = ("must_have", "preferred")


def blend(components: dict[str, tuple[float | None, float]]) -> tuple[float, dict[str, float]]:
    """Weighted average of present components. components: name -> (value, weight)."""
    present = {k: (v, w) for k, (v, w) in components.items() if v is not None}
    total_w = sum(w for _, w in present.values()) or 1.0
    rating = sum(v * w for v, w in present.values()) / total_w
    return round(rating, 1), {k: round(v, 1) for k, (v, _) in present.items()}


def _category(
    key: str,
    weights: dict[str, tuple[str, float]],
    rating_out: RatingOut | None,
    components: dict[str, tuple[float | None, float]],
    evb: EvidenceBuilder,
) -> CategoryScore:
    label, weight = weights[key]
    rating, comps = blend(components)
    evidence = evb.build(rating_out.line_ids, label, "moderate") if rating_out else []
    rationale = rating_out.rationale if rating_out else "Model rating unavailable."
    return CategoryScore(
        key=key,
        label=label,
        weight=weight,
        rating=rating,
        points=round(rating * weight / 100, 1),
        rationale=rationale,
        components=comps,
        evidence=evidence,
    )


def _insights(
    points: Sequence[PointOut], evb: EvidenceBuilder, require_evidence: bool
) -> list[Insight]:
    out = []
    for p in points:
        ev = evb.build(p.line_ids, p.title, "moderate")
        if require_evidence and not ev:
            continue  # a strength without evidence is not a demonstrated strength
        support = p.support if isinstance(p, SupportedPointOut) else "confirmed"
        out.append(Insight(title=p.title, detail=p.detail, support=support, evidence=ev))
    return out


def _risks(points: list[RiskOut], evb: EvidenceBuilder) -> list[Risk]:
    return [
        Risk(
            title=p.title,
            detail=p.detail,
            severity=p.severity,
            evidence=evb.build(p.line_ids, p.title),
        )
        for p in points
        if p.title.strip()
    ]


def _ratings(ratings: list[RatingOut]) -> dict[str, RatingOut]:
    return {r.key.strip().lower(): r for r in ratings}


def format_assessments(assessments: list[RequirementAssessment]) -> str:
    rows = []
    for a in assessments:
        ev = ",".join(e.line_id for e in a.evidence) or "-"
        rows.append(
            f"{a.requirement_id} [{a.kind}/{a.category}] {a.status}: {a.text} (evidence {ev})"
        )
    return "\n".join(rows)


def job_summary(job: JobProfile) -> str:
    musts = "; ".join(r.text for r in job.by_kind("must_have")[:8])
    return (
        f"{job.title} at {job.company or 'unknown company'}; level {job.seniority_level or 'unspecified'}; "
        f"{job.work_mode}; location {job.location or 'unspecified'}; must-haves: {musts}"
    )


def recruiter(
    job: JobProfile,
    candidate: str,
    lines_text: str,
    assessments: list[RequirementAssessment],
    facts: DeterministicFacts,
    seniority: SeniorityAssessment,
    evb: EvidenceBuilder,
) -> EvaluatorResult:
    out, _ = call_structured(
        RECRUITER_PROMPT,
        RecruiterOut,
        job=job_summary(job),
        candidate=candidate,
        lines=lines_text,
        assessments=format_assessments(assessments),
    )
    r = _ratings(out.ratings)
    w = recruiter_weights()

    def llm(key: str) -> float | None:
        return r[key].rating if key in r else None

    edu_required = facts.education_required_level > 0 or bool(facts.certifications_required)
    edu_det = 100.0
    if edu_required:
        edu_ok = facts.education_candidate_level >= facts.education_required_level
        certs_ok = len(facts.certifications_found) >= len(facts.certifications_required)
        edu_det = (60.0 if edu_ok else 25.0) + (40.0 if certs_ok else 0.0)
    loc_det = {"remote": 100.0, "match": 100.0, "unknown": 75.0, "mismatch": 40.0}[
        facts.location_status
    ]
    fit = level_fit(seniority.role_level, seniority.demonstrated_low, seniority.demonstrated_high)

    spec: dict[str, dict[str, tuple[float | None, float]]] = {
        "required_experience": {
            "llm_rating": (llm("required_experience"), 0.5),
            "must_have_coverage": (coverage(assessments, kinds=("must_have",)), 0.3),
            "years_vs_required": (
                facts.years_ratio * 100 if facts.years_ratio is not None else None,
                0.2,
            ),
        },
        "required_skills": {
            "llm_rating": (llm("required_skills"), 0.5),
            "technical_requirement_coverage": (
                coverage(assessments, kinds=MUST_PREF, categories=("technical",)),
                0.5,
            ),
        },
        "domain_alignment": {
            "llm_rating": (llm("domain_alignment"), 0.6),
            "domain_requirement_coverage": (
                coverage(assessments, kinds=MUST_PREF, categories=("domain",)),
                0.4,
            ),
        },
        "seniority": {"llm_rating": (llm("seniority"), 0.5), "level_fit": (fit, 0.5)},
        "career_trajectory": {"llm_rating": (llm("career_trajectory"), 1.0)},
        "education_certifications": {
            "llm_rating": (llm("education_certifications"), 0.5 if edu_required else 0.3),
            "deterministic_check": (edu_det, 0.5 if edu_required else 0.7),
        },
        "location_authorization": {
            "llm_rating": (llm("location_authorization"), 0.3),
            "deterministic_check": (loc_det, 0.7),
        },
        "resume_alignment": {"llm_rating": (llm("resume_alignment"), 1.0)},
    }
    categories = [_category(k, w, r.get(k), spec[k], evb) for k in w]
    for c in categories:
        if c.key == "location_authorization":
            c.rationale = f"{c.rationale} ({facts.location_note})".strip()
    missing = [
        a.text for a in assessments if a.kind == "must_have" and a.status == "not_demonstrated"
    ]
    seniority_concerns = []
    if fit is not None and fit < 100:
        seniority_concerns.append(
            Risk(
                title="Seniority/scope may read below the role's level"
                if fit < 85
                else "Demonstrated level may exceed the role's level",
                detail=(
                    f"Role level: {seniority.role_level}. Demonstrated range based on the resume: "
                    f"{seniority.demonstrated_low} → {seniority.demonstrated_high}."
                ),
                severity="high" if fit <= 30 else "medium" if fit < 85 else "low",
            )
        )
    return EvaluatorResult(
        role="recruiter",
        question="If I were the recruiter reviewing this candidate, would I move them forward?",
        score=round(sum(c.points for c in categories), 0),
        headline=out.headline,
        categories=categories,
        strengths=_insights(out.strengths, evb, require_evidence=True),
        risks=_risks(out.risks, evb),
        missing_requirements=missing,
        resume_concerns=_risks(out.resume_concerns, evb),
        trajectory_concerns=_risks(out.trajectory_concerns, evb),
        seniority_concerns=seniority_concerns,
    )


def hiring_manager(
    job: JobProfile,
    candidate: str,
    lines_text: str,
    assessments: list[RequirementAssessment],
    facts: DeterministicFacts,
    seniority: SeniorityAssessment,
    evb: EvidenceBuilder,
) -> EvaluatorResult:
    out, _ = call_structured(
        HM_PROMPT,
        HiringManagerOut,
        job=job_summary(job),
        candidate=candidate,
        lines=lines_text,
        assessments=format_assessments(assessments),
    )
    r = _ratings(out.ratings)
    w = hiring_manager_weights()

    def llm(key: str) -> float | None:
        return r[key].rating if key in r else None

    fit = level_fit(seniority.role_level, seniority.demonstrated_low, seniority.demonstrated_high)
    metrics = min(1.0, facts.metric_bullet_ratio / 0.4) * 100
    spec: dict[str, dict[str, tuple[float | None, float]]] = {
        "direct_relevant_experience": {
            "llm_rating": (llm("direct_relevant_experience"), 0.6),
            "responsibility_coverage": (coverage(assessments, kinds=("responsibility",)), 0.4),
        },
        "problem_domain_experience": {
            "llm_rating": (llm("problem_domain_experience"), 0.6),
            "domain_requirement_coverage": (coverage(assessments, categories=("domain",)), 0.4),
        },
        "technical_depth": {
            "llm_rating": (llm("technical_depth"), 0.6),
            "technical_requirement_coverage": (
                coverage(assessments, categories=("technical",)),
                0.4,
            ),
        },
        "product_leadership": {
            "llm_rating": (llm("product_leadership"), 0.6),
            "leadership_requirement_coverage": (
                coverage(assessments, categories=("leadership", "product", "stakeholder")),
                0.4,
            ),
        },
        "scope_complexity": {"llm_rating": (llm("scope_complexity"), 0.7), "level_fit": (fit, 0.3)},
        "demonstrated_impact": {
            "llm_rating": (llm("demonstrated_impact"), 0.7),
            "quantified_bullet_density": (metrics, 0.3),
        },
        "strategic_thinking": {"llm_rating": (llm("strategic_thinking"), 1.0)},
    }
    categories = [_category(k, w, r.get(k), spec[k], evb) for k in w]
    return EvaluatorResult(
        role="hiring_manager",
        question="Could this candidate actually succeed in this role?",
        score=round(sum(c.points for c in categories), 0),
        headline=out.headline,
        categories=categories,
        strengths=_insights(out.strengths, evb, require_evidence=True),
        risks=_risks(out.concerns, evb),
    )
