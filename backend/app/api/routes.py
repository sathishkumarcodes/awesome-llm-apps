"""HTTP API."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.db.session import get_db
from app.llm.provider import get_provider
from app.models import Job, MatchAnalysis, Resume, ResumeVersion
from app.schemas import api
from app.schemas.analysis import DECISION_LABELS, EvaluatorResult, MatchResult
from app.schemas.document import ResumeDocument
from app.schemas.job import JobProfile
from app.schemas.profile import CandidateProfile
from app.schemas.tailoring import Change
from app.services import (
    export_service,
    job_service,
    match_service,
    resume_service,
    tailoring_service,
)

router = APIRouter(prefix="/api")


# --- serializers -------------------------------------------------------------
def resume_summary(r: Resume) -> api.ResumeSummary:
    p = r.parsed_profile or {}
    return api.ResumeSummary(
        id=r.id,
        filename=r.filename,
        file_type=r.file_type,
        candidate_name=(p.get("candidate") or {}).get("name", ""),
        roles=len(p.get("experience") or []),
        llm_enriched=bool(p.get("llm_enriched")),
        version_count=len(r.versions),
        created_at=r.created_at,
    )


def job_summary(j: Job) -> api.JobSummary:
    return api.JobSummary(
        id=j.id,
        company=j.company,
        title=j.title,
        created_at=j.created_at,
        requirement_count=len((j.parsed_profile or {}).get("requirements") or []),
    )


def match_summary(m: MatchAnalysis) -> dict:
    return dict(
        id=m.id,
        resume_id=m.resume_id,
        job_id=m.job_id,
        status=m.status,
        progress=m.progress,
        error=m.error,
        recruiter_score=m.recruiter_score,
        hiring_manager_score=m.hiring_manager_score,
        overall_score=m.overall_score,
        recommendation=m.recommendation,
        recommendation_label=DECISION_LABELS.get(m.recommendation) if m.recommendation else None,
        top_issue=(m.result or {}).get("top_issue", ""),
        job_title=m.job.title,
        company=m.job.company,
        resume_filename=m.resume.filename,
        created_at=m.created_at,
    )


def version_summary(v: ResumeVersion) -> dict:
    return dict(
        id=v.id,
        name=v.name,
        original_resume_id=v.original_resume_id,
        original_filename=v.original_resume.filename,
        file_type=v.original_resume.file_type,
        job_id=v.job_id,
        match_id=v.match_id,
        job_title=v.job.title,
        company=v.job.company,
        tailoring_mode=v.tailoring_mode,
        status=v.status,
        progress=v.progress,
        error=v.error,
        factuality_report=v.factuality_report,
        exported=bool(v.exported_file_path and Path(v.exported_file_path).exists()),
        created_at=v.created_at,
    )


def version_detail(v: ResumeVersion) -> api.VersionDetail:
    return api.VersionDetail(
        **version_summary(v),
        changes=[Change.model_validate(c) for c in (v.changes or [])],
        content=v.content,
        export_notes=v.export_notes,
    )


# --- health ------------------------------------------------------------------
@router.get("/health")
def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "llm": get_provider().health(),
        "embedding_model": s.embedding_model,
        "max_upload_mb": s.max_upload_mb,
    }


# --- resumes -----------------------------------------------------------------
@router.post("/resumes", response_model=api.ResumeDetail, status_code=201)
async def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db)):
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    r = resume_service.ingest_resume(db, file.filename or "resume", data)
    return get_resume(r.id, db)


@router.get("/resumes", response_model=list[api.ResumeSummary])
def list_resumes(db: Session = Depends(get_db)):
    return [resume_summary(r) for r in resume_service.list_resumes(db)]


@router.get("/resumes/{resume_id}", response_model=api.ResumeDetail)
def get_resume(resume_id: str, db: Session = Depends(get_db)):
    r = resume_service.get_resume(db, resume_id)
    return api.ResumeDetail(
        **resume_summary(r).model_dump(),
        profile=CandidateProfile.model_validate(r.parsed_profile),
        document=ResumeDocument.model_validate(r.document),
        prompt_version=r.prompt_version,
    )


@router.get("/resumes/{resume_id}/file")
def download_original(resume_id: str, db: Session = Depends(get_db)):
    r = resume_service.get_resume(db, resume_id)
    return FileResponse(r.file_path, filename=r.filename)


@router.post("/resumes/{resume_id}/tailor", response_model=api.VersionDetail, status_code=202)
def tailor_resume(resume_id: str, body: api.TailorRequest, db: Session = Depends(get_db)):
    v = tailoring_service.create_version(db, resume_id, body.match_id, body.mode)
    return version_detail(v)


# --- jobs --------------------------------------------------------------------
def _job_detail(j: Job) -> api.JobDetail:
    return api.JobDetail(
        **job_summary(j).model_dump(),
        description=j.description,
        profile=JobProfile.model_validate(j.parsed_profile),
        prompt_version=j.prompt_version,
    )


@router.post("/jobs", response_model=api.JobDetail, status_code=201)
def create_job(body: api.JobCreate, db: Session = Depends(get_db)):
    return _job_detail(job_service.create_job(db, body.description, body.company, body.title))


@router.post("/jobs/upload", response_model=api.JobDetail, status_code=201)
async def upload_job(
    file: UploadFile = File(...),
    company: str = Form(""),
    title: str = Form(""),
    db: Session = Depends(get_db),
):
    data = await file.read(get_settings().max_upload_mb * 1024 * 1024 + 1)
    from app.parsing.files import check_size

    check_size(data, get_settings().max_upload_mb)
    text = job_service.extract_job_text(file.filename or "job.txt", data)
    return _job_detail(job_service.create_job(db, text, company, title))


@router.get("/jobs", response_model=list[api.JobSummary])
def list_jobs(db: Session = Depends(get_db)):
    return [job_summary(j) for j in job_service.list_jobs(db)]


@router.get("/jobs/{job_id}", response_model=api.JobDetail)
def get_job(job_id: str, db: Session = Depends(get_db)):
    return _job_detail(job_service.get_job(db, job_id))


# --- matches -----------------------------------------------------------------
@router.post("/matches", response_model=api.MatchDetail, status_code=202)
def create_match(body: api.MatchCreate, db: Session = Depends(get_db)):
    m = match_service.create_match(db, body.resume_id, body.job_id)
    return get_match(m.id, db)


@router.get("/matches", response_model=list[api.MatchSummary])
def list_matches(db: Session = Depends(get_db)):
    return [api.MatchSummary(**match_summary(m)) for m in match_service.list_matches(db)]


@router.get("/matches/{match_id}", response_model=api.MatchDetail)
def get_match(match_id: str, db: Session = Depends(get_db)):
    m = match_service.get_match(db, match_id)
    return api.MatchDetail(
        **match_summary(m),
        result=MatchResult.model_validate(m.result) if m.result else None,
        model_name=m.model_name,
        prompt_versions=m.prompt_versions,
    )


def _evaluator(match_id: str, key: str, db: Session) -> api.EvaluatorOut:
    m = match_service.get_match(db, match_id)
    data = m.recruiter_analysis if key == "recruiter" else m.hiring_manager_analysis
    if not data:
        raise AppError("Analysis has not completed.")
    return api.EvaluatorOut(match_id=m.id, evaluator=EvaluatorResult.model_validate(data))


@router.get("/matches/{match_id}/recruiter", response_model=api.EvaluatorOut)
def get_recruiter(match_id: str, db: Session = Depends(get_db)):
    return _evaluator(match_id, "recruiter", db)


@router.get("/matches/{match_id}/hiring-manager", response_model=api.EvaluatorOut)
def get_hiring_manager(match_id: str, db: Session = Depends(get_db)):
    return _evaluator(match_id, "hiring_manager", db)


# --- resume versions ----------------------------------------------------------
@router.get("/resume-versions", response_model=list[api.VersionSummary])
def list_versions(db: Session = Depends(get_db)):
    return [api.VersionSummary(**version_summary(v)) for v in tailoring_service.list_versions(db)]


@router.get("/resume-versions/{version_id}", response_model=api.VersionDetail)
def get_version(version_id: str, db: Session = Depends(get_db)):
    return version_detail(tailoring_service.get_version(db, version_id))


@router.patch("/resume-versions/{version_id}/changes/{change_id}", response_model=api.VersionDetail)
def update_change(
    version_id: str, change_id: str, body: api.ChangeUpdate, db: Session = Depends(get_db)
):
    if body.proposed is not None:
        v = tailoring_service.edit_change(db, version_id, change_id, body.proposed)
    elif body.decision is not None:
        v = tailoring_service.set_decision(db, version_id, change_id, body.decision)
    else:
        raise AppError("Provide a decision or edited text.")
    return version_detail(v)


@router.post("/resume-versions/{version_id}/validate", response_model=api.VersionDetail)
def validate_version(version_id: str, body: api.ValidateRequest, db: Session = Depends(get_db)):
    return version_detail(tailoring_service.revalidate(db, version_id, body.change_ids))


@router.post("/resume-versions/{version_id}/export", response_model=api.VersionDetail)
def export_version(version_id: str, body: api.ExportRequest, db: Session = Depends(get_db)):
    return version_detail(export_service.export_version(db, version_id, body.format))


@router.get("/resume-versions/{version_id}/download")
def download_version(version_id: str, db: Session = Depends(get_db)):
    v = tailoring_service.get_version(db, version_id)
    if not v.exported_file_path or not Path(v.exported_file_path).exists():
        raise NotFoundError("Export the version first.")
    return FileResponse(v.exported_file_path, filename=Path(v.exported_file_path).name)


@router.get("/resume-versions/{version_id}/report")
def download_report(version_id: str, db: Session = Depends(get_db)):
    v = tailoring_service.get_version(db, version_id)
    path = export_service.report_path(v)
    if not path.exists():
        raise NotFoundError("Export the version first to generate the change report.")
    return FileResponse(path, filename=path.name, media_type="text/markdown")
