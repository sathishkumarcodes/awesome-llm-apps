"""Scorecards: generate (from the job only), store with versions, evaluate resumes against them.

A job's latest complete scorecard is reused for every resume, so candidates are judged on the
same criteria. Regenerating creates a new version; old evaluations keep their version.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.llm.parallel import pmap
from app.llm.provider import get_provider
from app.models import Clarification, Job, Resume, Scorecard, ScorecardEvaluation
from app.rules.engine import ats_readiness, run_diagnostics
from app.schemas.analysis import RequirementAssessment
from app.schemas.document import ResumeDocument
from app.schemas.job import JobProfile
from app.schemas.profile import CandidateProfile
from app.scorecards import evaluator, generator, recommendations, scoring, weighting
from app.scorecards.evaluator import Answer, EvalInputs
from app.scorecards.perspectives import EvidenceContext
from app.scorecards.schemas import EvaluationContent, ScorecardContent
from app.scoring import deterministic, requirements
from app.scoring.evidence import EvidenceBuilder
from app.scoring.semantic import SemanticIndex
from app.services import job_service, resume_service, tasks

log = get_logger("scorecards")


# --- scorecards ---------------------------------------------------------------------------------
def latest_scorecard(db: Session, job_id: str, *, complete_only: bool = True) -> Scorecard | None:
    q = select(Scorecard).where(Scorecard.job_id == job_id)
    if complete_only:
        q = q.where(Scorecard.status == "complete")
    return db.scalars(q.order_by(Scorecard.version.desc())).first()


def get_scorecard(db: Session, scorecard_id: str) -> Scorecard:
    sc = db.get(Scorecard, scorecard_id)
    if not sc:
        raise NotFoundError("Scorecard not found.")
    return sc


def _new_version(db: Session, job: Job) -> Scorecard:
    prev = latest_scorecard(db, job.id, complete_only=False)
    sc = Scorecard(
        job_id=job.id,
        version=(prev.version + 1) if prev else 1,
        model_name=get_provider().model,
        prompt_versions=generator.PROMPT_VERSIONS,
    )
    db.add(sc)
    db.commit()
    return sc


def _generate_into(db: Session, sc: Scorecard, job: JobProfile, progress=lambda _m: None) -> None:
    sc.status, sc.progress = "running", "Starting"
    db.commit()

    def step(msg: str) -> None:
        sc.progress = msg
        db.commit()
        progress(msg)

    try:
        content = generator.generate(job, progress=step)
    except AppError as exc:
        sc.status, sc.error, sc.progress = "failed", exc.message, "Failed"
        db.commit()
        raise
    sc.content = content.model_dump(mode="json")
    sc.status, sc.progress = "complete", "Complete"
    db.commit()
    log.info(
        "scorecard v%d job=%s criteria=%d by=%s",
        sc.version,
        sc.job_id,
        len(content.criteria),
        content.generated_by,
    )


def _execute_generate(scorecard_id: str) -> None:
    db = SessionLocal()
    try:
        sc = db.get(Scorecard, scorecard_id)
        if sc is None:
            return
        try:
            _generate_into(db, sc, job_service.load_job_profile(sc.job))
        except AppError:
            pass
        except Exception as exc:
            log.exception("scorecard generation crashed id=%s", scorecard_id)
            sc.status, sc.progress = "failed", "Failed"
            sc.error = f"Unexpected error ({type(exc).__name__})."
            db.commit()
    finally:
        db.close()


def request_generation(db: Session, job_id: str) -> Scorecard:
    """Create a new scorecard version for a job (background)."""
    job = job_service.get_job(db, job_id)
    sc = _new_version(db, job)
    tasks.submit(_execute_generate, sc.id)
    return sc


def ensure_scorecard(db: Session, job: Job, progress=lambda _m: None) -> Scorecard:
    """Return the job's saved scorecard, generating one first if there is none.

    Called before any resume is read, so the criteria can't depend on the candidate."""
    sc = latest_scorecard(db, job.id)
    if sc:
        return sc
    sc = _new_version(db, job)
    _generate_into(db, sc, job_service.load_job_profile(job), progress)
    return sc


def load_content(sc: Scorecard) -> ScorecardContent:
    if not sc.content:
        raise AppError("This scorecard hasn't finished generating.")
    return ScorecardContent.model_validate(sc.content)


# --- evaluation ----------------------------------------------------------------------------------
def _answers(
    db: Session, resume_id: str, scorecard_id: str
) -> tuple[dict[str, Answer], dict[str, str]]:
    rows = db.scalars(
        select(Clarification)
        .where(Clarification.resume_id == resume_id, Clarification.scorecard_id == scorecard_id)
        .order_by(Clarification.created_at)
    ).all()
    criteria: dict[str, Answer] = {}
    eligibility: dict[str, str] = {}
    for r in rows:  # later answers replace earlier ones
        if r.criterion_id:
            criteria[r.criterion_id] = Answer(r.id, r.answer_kind, r.answer, r.question)
        if r.constraint_id:
            eligibility[r.constraint_id] = r.answer_kind
    return criteria, eligibility


def build_evaluation(
    card: ScorecardContent,
    doc: ResumeDocument,
    profile: CandidateProfile,
    job: JobProfile,
    assessments: list[RequirementAssessment] | None = None,
    answers: dict[str, Answer] | None = None,
    eligibility_answers: dict[str, str] | None = None,
    progress=lambda _m: None,
) -> EvaluationContent:
    """Evaluate one resume against a scorecard. Pure (no database); used by the app and evals."""
    evb = EvidenceBuilder(doc, profile)
    index = SemanticIndex(doc.lines)
    if assessments is None:
        progress("Checking each requirement")
        facts = deterministic.run(doc, profile, job)
        assessments, _ = requirements.assess(job, index, evb, facts)
    diagnostics = run_diagnostics(doc, profile, job)
    inp = EvalInputs(
        job=job,
        evb=evb,
        index=index,
        ctx=EvidenceContext.build(doc, profile),
        assessments={a.requirement_id: a for a in assessments},
        diagnostics=diagnostics,
        answers=answers or {},
    )
    progress("Evaluating each scorecard criterion")
    results = pmap(lambda c: evaluator.evaluate_criterion(c, inp), card.criteria)
    ats = ats_readiness(diagnostics)
    scores = scoring.compute(card.criteria, results, ats)
    elig = eligibility_answers or {}
    blocking = recommendations.blockers(card.criteria, results, card.eligibility, elig)
    rec = recommendations.decide(card.criteria, results, scores, blocking)
    answered = {cid: a.text for cid, a in (answers or {}).items()}
    return EvaluationContent(
        results=results,
        scores=scores,
        recommendation=rec,
        blockers=blocking,
        clarifications=recommendations.clarification_questions(
            card.criteria, results, card.eligibility, elig, answered
        ),
        improvements=recommendations.improvements(card.criteria, results),
        diagnostics=diagnostics,
        scoring_config={
            "scoring": scoring.CONFIG,
            "recommendation": recommendations.CONFIG,
            "weighting": weighting.CONFIG,
        },
    )


def _store(ev: ScorecardEvaluation, content: EvaluationContent) -> None:
    ev.content = content.model_dump(mode="json")
    ev.overall_fit = content.scores.overall_fit
    ev.recruiter_score = content.scores.recruiter
    ev.hiring_manager_score = content.scores.hiring_manager
    ev.ats_readiness = content.scores.ats_readiness
    ev.recommendation = content.recommendation.decision
    ev.status, ev.progress = "complete", "Complete"


def evaluate_now(
    db: Session,
    sc: Scorecard,
    resume: Resume,
    *,
    match_id: str | None = None,
    assessments: list[RequirementAssessment] | None = None,
    progress=lambda _m: None,
    ev: ScorecardEvaluation | None = None,
) -> ScorecardEvaluation:
    if ev is None:
        ev = ScorecardEvaluation(scorecard_id=sc.id, resume_id=resume.id, match_id=match_id)
        db.add(ev)
    ev.status, ev.progress, ev.error = "running", "Starting", None
    ev.model_name = get_provider().model
    ev.prompt_versions = {"criterion": evaluator.PROMPT, "requirements": requirements.PROMPT}
    db.commit()

    def step(msg: str) -> None:
        ev.progress = msg
        db.commit()
        progress(msg)

    answers, elig = _answers(db, resume.id, sc.id)
    content = build_evaluation(
        load_content(sc),
        resume_service.load_document(resume),
        resume_service.load_profile(resume),
        job_service.load_job_profile(sc.job),
        assessments,
        answers,
        elig,
        step,
    )
    _store(ev, content)
    db.commit()
    log.info(
        "evaluation %s scorecard=%s decision=%s fit=%s",
        ev.id,
        sc.id,
        ev.recommendation,
        ev.overall_fit,
    )
    return ev


def _execute_evaluate(evaluation_id: str) -> None:
    db = SessionLocal()
    try:
        ev = db.get(ScorecardEvaluation, evaluation_id)
        if ev is None:
            return
        try:
            evaluate_now(db, ev.scorecard, ev.resume, ev=ev)
            _sync_match(db, ev)
        except AppError as exc:
            ev.status, ev.error, ev.progress = "failed", exc.message, "Failed"
            db.commit()
        except Exception as exc:
            log.exception("evaluation crashed id=%s", evaluation_id)
            ev.status, ev.progress = "failed", "Failed"
            ev.error = f"Unexpected error ({type(exc).__name__})."
            db.commit()
    finally:
        db.close()


def _sync_match(db: Session, ev: ScorecardEvaluation) -> None:
    """Keep the analysis list in step with its newest scorecard evaluation."""
    if not ev.match_id or ev.status != "complete":
        return
    from app.models import MatchAnalysis

    m = db.get(MatchAnalysis, ev.match_id)
    if m:
        m.recommendation = ev.recommendation
        m.overall_score = ev.overall_fit
        m.recruiter_score = ev.recruiter_score
        m.hiring_manager_score = ev.hiring_manager_score
        db.commit()


def request_evaluation(
    db: Session, scorecard_id: str, resume_id: str, match_id: str | None = None
) -> ScorecardEvaluation:
    sc = get_scorecard(db, scorecard_id)
    if sc.status != "complete":
        raise AppError("This scorecard hasn't finished generating.")
    resume_service.get_resume(db, resume_id)
    ev = ScorecardEvaluation(scorecard_id=sc.id, resume_id=resume_id, match_id=match_id)
    db.add(ev)
    db.commit()
    tasks.submit(_execute_evaluate, ev.id)
    return ev


def get_evaluation(db: Session, evaluation_id: str) -> ScorecardEvaluation:
    ev = db.get(ScorecardEvaluation, evaluation_id)
    if not ev:
        raise NotFoundError("Evaluation not found.")
    return ev


def evaluation_for_match(db: Session, match_id: str) -> ScorecardEvaluation | None:
    return db.scalars(
        select(ScorecardEvaluation)
        .where(ScorecardEvaluation.match_id == match_id)
        .order_by(ScorecardEvaluation.created_at.desc())
    ).first()


def answer(
    db: Session, evaluation_id: str, question_id: str, kind: str, text: str
) -> Clarification:
    """Store a candidate's answer. It is kept apart from the resume and only used when
    re-evaluating, labeled as candidate-provided information."""
    ev = get_evaluation(db, evaluation_id)
    if not ev.content:
        raise AppError("This evaluation hasn't finished.")
    content = EvaluationContent.model_validate(ev.content)
    q = next((q for q in content.clarifications if q.id == question_id), None)
    if q is None:
        raise NotFoundError("Question not found.")
    if kind not in ("yes", "no", "detail"):
        raise AppError("Answer must be yes, no, or detail.")
    if kind == "detail" and len(text.strip()) < 3:
        raise AppError("Describe your experience in a few words.")
    row = Clarification(
        resume_id=ev.resume_id,
        scorecard_id=ev.scorecard_id,
        criterion_id=q.criterion_id,
        constraint_id=q.constraint_id,
        question=q.question,
        answer=text.strip() or kind,
        answer_kind=kind,
    )
    db.add(row)
    db.commit()
    return row


def reevaluate(db: Session, evaluation_id: str) -> ScorecardEvaluation:
    ev = get_evaluation(db, evaluation_id)
    return request_evaluation(db, ev.scorecard_id, ev.resume_id, ev.match_id)


def mark_interrupted(db: Session) -> None:
    rows: list[Scorecard | ScorecardEvaluation] = [
        *db.scalars(select(Scorecard).where(Scorecard.status.in_(("pending", "running")))),
        *db.scalars(
            select(ScorecardEvaluation).where(
                ScorecardEvaluation.status.in_(("pending", "running"))
            )
        ),
    ]
    for row in rows:
        row.status, row.progress = "failed", "Failed"
        row.error = "Interrupted by a server restart. Run it again."
    db.commit()
