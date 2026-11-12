"""Export a tailored version in the original format (DOCX→DOCX, PDF→PDF) plus a change report."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.export.docx_export import build_docx_from_content, export_docx
from app.export.pdf_export import export_pdf
from app.export.report import build_report
from app.models import ResumeVersion
from app.schemas.tailoring import Change
from app.services import job_service, resume_service, tailoring_service

log = get_logger("export")


def _paths(v: ResumeVersion, ext: str) -> Path:
    d = get_settings().export_dir / v.id
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{v.name}.{ext}"


def export_version(db: Session, version_id: str, fmt: str = "original") -> ResumeVersion:
    v = tailoring_service.get_version(db, version_id)
    if v.status != "complete":
        raise AppError("Tailoring has not finished yet.")
    changes = [Change.model_validate(c) for c in (v.changes or [])]
    pending = [c.id for c in changes if c.decision == "pending"]
    if pending:
        raise AppError(f"Review the changes that need your decision first ({', '.join(pending)}).")
    resume = v.original_resume
    doc = resume_service.load_document(resume)
    original = Path(resume.file_path)
    target_ext = resume.file_type if fmt == "original" else fmt
    if target_ext not in ("pdf", "docx"):
        raise AppError("Export format must be 'original', 'pdf', or 'docx'.")
    if target_ext == "pdf" and resume.file_type != "pdf":
        raise AppError("PDF export is available for PDF originals; this resume is DOCX.")
    out = _paths(v, target_ext)

    if target_ext == resume.file_type == "docx":
        notes = export_docx(original, doc, changes, out)
    elif target_ext == resume.file_type == "pdf":
        notes = export_pdf(original, doc, changes, out)
    else:  # PDF original → DOCX fallback with tailored content
        build_docx_from_content(v.content or {}, out)
        notes = [
            "DOCX fallback: built from your tailored content in a simple layout. It does not "
            "reproduce the original PDF's design."
        ]

    job = job_service.load_job_profile(v.job)
    report = build_report(
        v.name,
        resume.filename,
        f"{job.title} — {job.company}".strip(" —"),
        v.tailoring_mode,
        changes,
        {ln.id: ln.text for ln in doc.lines},
        notes,
    )
    _paths(v, "md").write_text(report, encoding="utf-8")
    v.exported_file_path = str(out)
    v.export_notes = notes
    db.commit()
    log.info("exported version id=%s format=%s", v.id, target_ext)
    return v


def report_path(v: ResumeVersion) -> Path:
    return _paths(v, "md")
