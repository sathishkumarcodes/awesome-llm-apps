"""Match analysis orchestration: deterministic → semantic → LLM → recommendation."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.llm.parallel import run_both
from app.llm.provider import get_provider
from app.models import MatchAnalysis
from app.schemas.analysis import (
    Insight,
    MatchResult,
    RequirementAssessment,
    Risk,
)
from app.schemas.document import ResumeDocument
from app.schemas.profile import CandidateProfile
from app.scoring import deterministic, evaluators, recommendation, requirements, seniority
from app.scoring.evidence import EvidenceBuilder
from app.scoring.semantic import SemanticIndex
from app.services import job_service, resume_service, scorecard_service, tasks

log = get_logger("match")

PROMPT_VERSIONS = {
    "requirements": requirements.PROMPT,
    "seniority": seniority.PROMPT,
    "recruiter": evaluators.RECRUITER_PROMPT,
    "hiring_manager": evaluators.HM_PROMPT,
    "recommendation": recommendation.PROMPT,
}
SEV_ORDER = {"high": 0, "medium": 1, "low": 2}


def resume_lines_text(doc: ResumeDocument) -> str:
    return "\n".join(
        f"{ln.id} [{ln.section}]: {ln.text}"
        for ln in doc.lines
        if ln.kind != "heading" and ln.section != "header"
    )


def candidate_text(profile: CandidateProfile) -> str:
    roles = "; ".join(
        f"{e.title or '?'} at {e.company or '?'} ({e.dates_text or 'dates unknown'})"
        for e in profile.experience
    )
    years = f"{profile.total_years} years" if profile.total_years is not None else "unknown"
    return f"Roles: {roles}. Total experience from resume dates: {years}."


def _dedupe_risks(risks: list[Risk], limit: int) -> list[Risk]:
    seen, out = set(), []
    for r in sorted(risks, key=lambda r: SEV_ORDER[r.severity]):
        key = r.title.lower().strip()[:60]
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out[:limit]


def run_analysis(
    doc: ResumeDocument, profile: CandidateProfile, job, progress=lambda _msg: None
) -> MatchResult:
    """Compute a full MatchResult. ``job`` is a JobProfile."""
    evb = EvidenceBuilder(doc, profile)
    lines_text = resume_lines_text(doc)
    cand = candidate_text(profile)

    progress("Running deterministic checks")
    facts = deterministic.run(doc, profile, job)

    progress("Building semantic index")
    index = SemanticIndex(doc.lines)

    progress("Assessing requirements and seniority")
    # Seniority doesn't depend on the requirement verdicts, so both run together.
    (assessments, logistics), sen = run_both(
        lambda: requirements.assess(job, index, evb, facts),
        lambda: seniority.assess(job, profile, lines_text, evb),
    )
    explicit = [a for a in assessments if a.kind != "inferred"]
    inferred = [a for a in assessments if a.kind == "inferred"]

    progress("Simulating recruiter and hiring manager reviews")
    rec_eval, hm_eval = run_both(
        lambda: evaluators.recruiter(job, cand, lines_text, explicit, facts, sen, evb),
        lambda: evaluators.hiring_manager(job, cand, lines_text, explicit, facts, sen, evb),
    )

    progress("Forming recommendation")
    inputs = recommendation.decision_inputs(rec_eval, hm_eval, explicit)
    decision, factors = recommendation.decide(inputs)

    must_gaps = [a for a in explicit if a.kind == "must_have" and a.status == "not_demonstrated"]
    rejection_risks = _dedupe_risks(
        [
            *[
                Risk(
                    title=f"Required: {a.text}",
                    detail=f"Not demonstrated in the resume. {a.rationale}".strip(),
                    severity="high",
                )
                for a in must_gaps
            ],
            *rec_eval.risks,
            *rec_eval.seniority_concerns,
            *rec_eval.resume_concerns,
            *rec_eval.trajectory_concerns,
        ],
        limit=5,
    )
    hm_concerns = _dedupe_risks(hm_eval.risks, limit=5)

    why_match: list[Insight] = []
    seen_titles: set[str] = set()
    for ins in [*rec_eval.strengths, *hm_eval.strengths]:
        key = ins.title.lower()[:50]
        if key not in seen_titles:
            seen_titles.add(key)
            why_match.append(ins)
    for a in explicit:
        if len(why_match) >= 3:
            break
        if a.kind == "must_have" and a.status == "demonstrated" and a.evidence:
            why_match.append(Insight(title=a.text, detail=a.rationale, evidence=a.evidence))
    why_match = why_match[:5]

    findings = "\n".join(
        [
            f"Recruiter: {rec_eval.headline}",
            f"Hiring manager: {hm_eval.headline}",
            "Strengths: " + "; ".join(i.title for i in why_match),
            "Risks: " + "; ".join(f"{r.title} ({r.severity})" for r in rejection_risks),
            "HM concerns: " + "; ".join(r.title for r in hm_concerns),
            "Partially demonstrated: "
            + "; ".join(a.text for a in explicit if a.status == "partial"),
            f"Seniority: {sen.explanation}",
        ]
    )
    rec, improvements = recommendation.explain(
        decision, factors, evaluators.job_summary(job), findings, lines_text, evb
    )
    gaps = [
        a.text
        for a in explicit
        if a.kind in ("must_have", "preferred") and a.status == "not_demonstrated"
    ]
    top_issue = (
        rejection_risks[0].title
        if rejection_risks
        else (hm_concerns[0].title if hm_concerns else "")
    )
    return MatchResult(
        recommendation=rec,
        overall_score=recommendation.overall(rec_eval.score, hm_eval.score),
        recruiter=rec_eval,
        hiring_manager=hm_eval,
        requirements=explicit,
        why_match=why_match,
        rejection_risks=rejection_risks,
        hiring_manager_concerns=hm_concerns,
        improvements=improvements,
        seniority=sen,
        inferred_signals=inferred,
        gaps=gaps,
        logistics=logistics,
        top_issue=top_issue,
    )


def _execute(match_id: str) -> None:
    db = SessionLocal()
    try:
        m = db.get(MatchAnalysis, match_id)
        if m is None:
            return
        m.status, m.progress = "running", "Starting"
        db.commit()

        def progress(msg: str) -> None:
            m.progress = msg
            db.commit()

        doc = resume_service.load_document(m.resume)
        profile = resume_service.load_profile(m.resume)
        job = job_service.load_job_profile(m.job)
        # The hiring scorecard comes from the job alone and is settled before the resume is read.
        scorecard = None
        try:
            progress("Building the hiring scorecard from the job")
            scorecard = scorecard_service.ensure_scorecard(db, m.job, progress)
        except AppError as exc:
            log.warning("scorecard unavailable for match %s: %s", match_id, exc.message[:120])
        try:
            result = run_analysis(doc, profile, job, progress)
        except AppError as exc:
            m.status, m.error, m.progress = "failed", exc.message, "Failed"
            db.commit()
            return
        except Exception as exc:
            log.exception("analysis failed id=%s", match_id)
            m.status, m.progress = "failed", "Failed"
            m.error = f"Unexpected error during analysis ({type(exc).__name__})."
            db.commit()
            return
        m.recruiter_score = result.recruiter.score
        m.hiring_manager_score = result.hiring_manager.score
        m.overall_score = result.overall_score
        m.recommendation = result.recommendation.decision
        m.recruiter_analysis = result.recruiter.model_dump(mode="json")
        m.hiring_manager_analysis = result.hiring_manager.model_dump(mode="json")
        m.gaps = result.gaps
        m.risks = [r.model_dump(mode="json") for r in result.rejection_risks]
        m.evidence = [e.model_dump(mode="json") for i in result.why_match for e in i.evidence]
        m.result = result.model_dump(mode="json")
        if scorecard is not None:
            try:
                progress("Scoring against the hiring scorecard")
                ev = scorecard_service.evaluate_now(
                    db,
                    scorecard,
                    m.resume,
                    match_id=m.id,
                    assessments=result.requirements,
                    progress=progress,
                )
                # The scorecard evaluation is the headline result; the original analysis stays
                # available as the detailed evaluation.
                m.recommendation = ev.recommendation
                m.overall_score = ev.overall_fit
                m.recruiter_score = ev.recruiter_score
                m.hiring_manager_score = ev.hiring_manager_score
            except AppError as exc:
                log.warning("scorecard evaluation failed for match %s: %s", match_id, exc.message[:120])  # fmt: skip
        m.status, m.progress = "complete", "Complete"
        db.commit()
        log.info("analysis complete id=%s decision=%s", match_id, m.recommendation)
    finally:
        db.close()


def create_match(db: Session, resume_id: str, job_id: str) -> MatchAnalysis:
    resume_service.get_resume(db, resume_id)
    job_service.get_job(db, job_id)
    m = MatchAnalysis(
        resume_id=resume_id,
        job_id=job_id,
        prompt_versions=PROMPT_VERSIONS,
        model_name=get_provider().model,
    )
    db.add(m)
    db.commit()
    tasks.submit(_execute, m.id)
    return m


def rerun_match(db: Session, match_id: str) -> MatchAnalysis:
    """Queue a failed analysis again, on the model that is active now."""
    m = get_match(db, match_id)
    if m.status != "failed":
        raise AppError("Only failed analyses can be rerun.")
    m.status, m.progress, m.error = "pending", "Queued", None
    m.model_name = get_provider().model
    db.commit()
    tasks.submit(_execute, m.id)
    return m


def get_match(db: Session, match_id: str) -> MatchAnalysis:
    m = db.get(MatchAnalysis, match_id)
    if not m:
        raise NotFoundError("Analysis not found.")
    return m


def list_matches(db: Session) -> list[MatchAnalysis]:
    return list(db.scalars(select(MatchAnalysis).order_by(MatchAnalysis.created_at.desc())))


def load_result(m: MatchAnalysis) -> MatchResult | None:
    return MatchResult.model_validate(m.result) if m.result else None


def requirement_by_id(result: MatchResult) -> dict[str, RequirementAssessment]:
    return {a.requirement_id: a for a in result.requirements}


def mark_interrupted(db: Session) -> None:
    """On startup, analyses left running by a previous process cannot resume."""
    for model in (MatchAnalysis,):
        for row in db.scalars(select(model).where(model.status.in_(("pending", "running")))):
            row.status, row.progress = "failed", "Failed"
            row.error = "Interrupted by a server restart. Run the analysis again."
    db.commit()
