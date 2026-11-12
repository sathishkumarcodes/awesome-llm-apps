"""SQLAlchemy ORM models."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(UTC)


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(8))  # "pdf" | "docx"
    file_path: Mapped[str] = mapped_column(String(1024))
    raw_text: Mapped[str] = mapped_column(Text)
    # ResumeDocument (layout-level lines with source locations)
    document: Mapped[dict[str, Any]] = mapped_column(JSON)
    # CandidateProfile (structured facts, each linked to document lines)
    parsed_profile: Mapped[dict[str, Any]] = mapped_column(JSON)
    prompt_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    versions: Mapped[list["ResumeVersion"]] = relationship(back_populates="original_resume")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    company: Mapped[str] = mapped_column(String(255), default="")
    title: Mapped[str] = mapped_column(String(255), default="")
    description: Mapped[str] = mapped_column(Text)
    parsed_profile: Mapped[dict[str, Any]] = mapped_column(JSON)
    prompt_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MatchAnalysis(Base):
    __tablename__ = "match_analyses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    resume_id: Mapped[str] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"))
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    # pending | running | complete | failed
    status: Mapped[str] = mapped_column(String(16), default="pending")
    progress: Mapped[str] = mapped_column(String(128), default="Queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    recruiter_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    hiring_manager_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(32), nullable=True)

    recruiter_analysis: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    hiring_manager_analysis: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    gaps: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    risks: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    evidence: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    # Full MatchResult payload (requirements, seniority, recommendation, etc.)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    prompt_versions: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    resume: Mapped[Resume] = relationship()
    job: Mapped[Job] = relationship()


class Scorecard(Base):
    """Job-specific hiring criteria, generated from the job description only. Versioned:
    regenerating creates a new version; evaluations keep pointing at the version they used."""

    __tablename__ = "scorecards"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    progress: Mapped[str] = mapped_column(String(128), default="Queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_versions: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    job: Mapped[Job] = relationship()


class ScorecardEvaluation(Base):
    """One resume evaluated against one scorecard version."""

    __tablename__ = "scorecard_evaluations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    scorecard_id: Mapped[str] = mapped_column(ForeignKey("scorecards.id", ondelete="CASCADE"))
    resume_id: Mapped[str] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"))
    match_id: Mapped[str | None] = mapped_column(
        ForeignKey("match_analyses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="pending")
    progress: Mapped[str] = mapped_column(String(128), default="Queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    overall_fit: Mapped[float | None] = mapped_column(Float, nullable=True)
    recruiter_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    hiring_manager_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ats_readiness: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_versions: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    scorecard: Mapped[Scorecard] = relationship()
    resume: Mapped[Resume] = relationship()


class Clarification(Base):
    """A candidate's answer to a clarification question. Kept apart from the resume: it is
    shown and scored as candidate-provided information, never written into the resume."""

    __tablename__ = "clarifications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    resume_id: Mapped[str] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"))
    scorecard_id: Mapped[str] = mapped_column(ForeignKey("scorecards.id", ondelete="CASCADE"))
    criterion_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    constraint_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    answer_kind: Mapped[str] = mapped_column(String(8))  # yes | no | detail
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ResumeVersion(Base):
    __tablename__ = "resume_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    original_resume_id: Mapped[str] = mapped_column(ForeignKey("resumes.id", ondelete="CASCADE"))
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    match_id: Mapped[str | None] = mapped_column(
        ForeignKey("match_analyses.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), default="")
    tailoring_mode: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    progress: Mapped[str] = mapped_column(String(128), default="Queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Tailored content: {"lines": {line_id: text}, "orders": {...}}
    content: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    changes: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    factuality_report: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    exported_file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    export_notes: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)
    prompt_versions: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    original_resume: Mapped[Resume] = relationship(back_populates="versions")
    job: Mapped[Job] = relationship()
