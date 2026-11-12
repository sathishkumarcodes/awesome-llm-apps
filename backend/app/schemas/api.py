"""API request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.analysis import DECISION_LABELS, EvaluatorResult, MatchResult
from app.schemas.document import ResumeDocument
from app.schemas.job import JobProfile
from app.schemas.profile import CandidateProfile
from app.schemas.tailoring import Change, TailoringMode


class ResumeSummary(BaseModel):
    id: str
    filename: str
    file_type: str
    candidate_name: str
    roles: int
    llm_enriched: bool
    version_count: int
    created_at: datetime


class ResumeDetail(ResumeSummary):
    profile: CandidateProfile
    document: ResumeDocument
    prompt_version: str | None


class JobCreate(BaseModel):
    description: str = Field(min_length=1, max_length=20000)
    company: str = ""
    title: str = ""


class JobSummary(BaseModel):
    id: str
    company: str
    title: str
    created_at: datetime
    requirement_count: int


class JobDetail(JobSummary):
    description: str
    profile: JobProfile
    prompt_version: str | None


class MatchCreate(BaseModel):
    resume_id: str
    job_id: str


class MatchSummary(BaseModel):
    id: str
    resume_id: str
    job_id: str
    status: str
    progress: str
    error: str | None
    recruiter_score: float | None
    hiring_manager_score: float | None
    overall_score: float | None
    recommendation: str | None
    recommendation_label: str | None
    top_issue: str = ""
    job_title: str
    company: str
    resume_filename: str
    created_at: datetime

    @staticmethod
    def label(decision: str | None) -> str | None:
        return DECISION_LABELS.get(decision) if decision else None


class MatchDetail(MatchSummary):
    result: MatchResult | None
    model_name: str | None
    prompt_versions: dict | None


class EvaluatorOut(BaseModel):
    match_id: str
    evaluator: EvaluatorResult


class TailorRequest(BaseModel):
    match_id: str
    mode: TailoringMode = "recommended"


class VersionSummary(BaseModel):
    id: str
    name: str
    original_resume_id: str
    original_filename: str
    file_type: str
    job_id: str
    match_id: str | None
    job_title: str
    company: str
    tailoring_mode: str
    status: str
    progress: str
    error: str | None
    factuality_report: dict | None
    exported: bool
    created_at: datetime


class VersionDetail(VersionSummary):
    changes: list[Change]
    content: dict | None
    export_notes: list[str] | None


class ChangeUpdate(BaseModel):
    decision: Literal["accepted", "rejected", "pending"] | None = None
    proposed: str | None = Field(default=None, max_length=2000)


class ValidateRequest(BaseModel):
    change_ids: list[str] | None = None


class ModelSelect(BaseModel):
    provider: str = Field(min_length=1, max_length=32)
    model: str = Field(min_length=1, max_length=128)


class ExportRequest(BaseModel):
    format: Literal["original", "pdf", "docx"] = "original"
