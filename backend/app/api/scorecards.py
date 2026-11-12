"""Scorecard API: generate per job, evaluate resumes, answer clarification questions."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models import Scorecard, ScorecardEvaluation
from app.rules.registry import RULES
from app.scorecards.schemas import (
    CriterionResult,
    EvaluationContent,
    HiringCriterion,
    Improvement,
    ScorecardContent,
)
from app.services import scorecard_service as svc

router = APIRouter(prefix="/api")


class ScorecardOut(BaseModel):
    id: str
    job_id: str
    version: int
    status: str
    progress: str
    error: str | None
    content: ScorecardContent | None
    model_name: str | None
    prompt_versions: dict | None
    created_at: datetime


class EvaluationOut(BaseModel):
    id: str
    scorecard_id: str
    resume_id: str
    match_id: str | None
    status: str
    progress: str
    error: str | None
    content: EvaluationContent | None
    scorecard: ScorecardOut
    model_name: str | None
    created_at: datetime


class EvaluateRequest(BaseModel):
    resume_id: str


class AnswerRequest(BaseModel):
    question_id: str = Field(min_length=1, max_length=40)
    kind: Literal["yes", "no", "detail"]
    answer: str = Field(default="", max_length=2000)


class PerspectiveRow(BaseModel):
    criterion: HiringCriterion
    level: str | None
    note: str
    result: CriterionResult


class PerspectiveOut(BaseModel):
    evaluation_id: str
    perspective: Literal["recruiter", "hiring_manager"]
    question: str
    score: float | None
    criteria: list[PerspectiveRow]


def scorecard_out(sc: Scorecard) -> ScorecardOut:
    return ScorecardOut(
        id=sc.id,
        job_id=sc.job_id,
        version=sc.version,
        status=sc.status,
        progress=sc.progress,
        error=sc.error,
        content=ScorecardContent.model_validate(sc.content) if sc.content else None,
        model_name=sc.model_name,
        prompt_versions=sc.prompt_versions,
        created_at=sc.created_at,
    )


def evaluation_out(ev: ScorecardEvaluation) -> EvaluationOut:
    return EvaluationOut(
        id=ev.id,
        scorecard_id=ev.scorecard_id,
        resume_id=ev.resume_id,
        match_id=ev.match_id,
        status=ev.status,
        progress=ev.progress,
        error=ev.error,
        content=EvaluationContent.model_validate(ev.content) if ev.content else None,
        scorecard=scorecard_out(ev.scorecard),
        model_name=ev.model_name,
        created_at=ev.created_at,
    )


# --- scorecards ---------------------------------------------------------------------------------
@router.post("/jobs/{job_id}/scorecard/generate", response_model=ScorecardOut, status_code=202)
def generate_scorecard(job_id: str, db: Session = Depends(get_db)):
    return scorecard_out(svc.request_generation(db, job_id))


@router.get("/jobs/{job_id}/scorecard", response_model=ScorecardOut)
def job_scorecard(job_id: str, db: Session = Depends(get_db)):
    sc = svc.latest_scorecard(db, job_id) or svc.latest_scorecard(db, job_id, complete_only=False)
    if not sc:
        raise NotFoundError("No scorecard for this job yet.")
    return scorecard_out(sc)


@router.get("/scorecards/{scorecard_id}", response_model=ScorecardOut)
def get_scorecard(scorecard_id: str, db: Session = Depends(get_db)):
    return scorecard_out(svc.get_scorecard(db, scorecard_id))


@router.post("/scorecards/{scorecard_id}/evaluate", response_model=EvaluationOut, status_code=202)
def evaluate(scorecard_id: str, body: EvaluateRequest, db: Session = Depends(get_db)):
    return evaluation_out(svc.request_evaluation(db, scorecard_id, body.resume_id))


@router.get("/scorecards/{scorecard_id}/evaluations/{evaluation_id}", response_model=EvaluationOut)
def scorecard_evaluation(scorecard_id: str, evaluation_id: str, db: Session = Depends(get_db)):
    ev = svc.get_evaluation(db, evaluation_id)
    if ev.scorecard_id != scorecard_id:
        raise NotFoundError("Evaluation not found for this scorecard.")
    return evaluation_out(ev)


# --- evaluations ---------------------------------------------------------------------------------
@router.get("/evaluations/{evaluation_id}", response_model=EvaluationOut)
def get_evaluation(evaluation_id: str, db: Session = Depends(get_db)):
    return evaluation_out(svc.get_evaluation(db, evaluation_id))


@router.get("/matches/{match_id}/evaluation", response_model=EvaluationOut)
def match_evaluation(match_id: str, db: Session = Depends(get_db)):
    ev = svc.evaluation_for_match(db, match_id)
    if not ev:
        raise NotFoundError("No scorecard evaluation for this analysis.")
    return evaluation_out(ev)


def _perspective(ev: ScorecardEvaluation, which: Literal["recruiter", "hiring_manager"]) -> PerspectiveOut:  # fmt: skip
    if not ev.content:
        raise NotFoundError("This evaluation hasn't finished.")
    content = EvaluationContent.model_validate(ev.content)
    card = ScorecardContent.model_validate(ev.scorecard.content)
    by_id = {r.criterion_id: r for r in content.results}
    rows = []
    for c in card.criteria:
        r = by_id.get(c.id)
        if r is None or c.evaluation_owner not in (which, "both"):
            continue
        level = r.recruiter_level if which == "recruiter" else r.hiring_manager_level
        note = r.recruiter_note if which == "recruiter" else r.hiring_manager_note
        rows.append(PerspectiveRow(criterion=c, level=level, note=note, result=r))
    question = (
        "Would this candidate appear qualified and relevant enough to advance to a hiring manager?"
        if which == "recruiter"
        else "Does the candidate demonstrate the capability to succeed in the role?"
    )
    score = content.scores.recruiter if which == "recruiter" else content.scores.hiring_manager
    return PerspectiveOut(evaluation_id=ev.id, perspective=which, question=question, score=score, criteria=rows)  # fmt: skip


@router.get("/evaluations/{evaluation_id}/recruiter", response_model=PerspectiveOut)
def recruiter_view(evaluation_id: str, db: Session = Depends(get_db)):
    return _perspective(svc.get_evaluation(db, evaluation_id), "recruiter")


@router.get("/evaluations/{evaluation_id}/hiring-manager", response_model=PerspectiveOut)
def hiring_manager_view(evaluation_id: str, db: Session = Depends(get_db)):
    return _perspective(svc.get_evaluation(db, evaluation_id), "hiring_manager")


@router.get("/evaluations/{evaluation_id}/improvements", response_model=list[Improvement])
def improvements(evaluation_id: str, db: Session = Depends(get_db)):
    ev = svc.get_evaluation(db, evaluation_id)
    if not ev.content:
        raise NotFoundError("This evaluation hasn't finished.")
    return EvaluationContent.model_validate(ev.content).improvements


@router.post("/evaluations/{evaluation_id}/clarifications", response_model=EvaluationOut)
def answer_question(evaluation_id: str, body: AnswerRequest, db: Session = Depends(get_db)):
    svc.answer(db, evaluation_id, body.question_id, body.kind, body.answer)
    return evaluation_out(svc.get_evaluation(db, evaluation_id))


@router.post("/evaluations/{evaluation_id}/reevaluate", response_model=EvaluationOut, status_code=202)  # fmt: skip
def reevaluate(evaluation_id: str, db: Session = Depends(get_db)):
    return evaluation_out(svc.reevaluate(db, evaluation_id))


@router.get("/rules")
def list_rules() -> list[dict]:
    return [r.__dict__ for r in RULES]
