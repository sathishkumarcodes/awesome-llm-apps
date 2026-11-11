"""Resume ingestion: validate, store, parse, and (optionally) LLM-enrich."""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, InvalidFileError, NotFoundError
from app.core.logging import get_logger
from app.llm.outputs import ResumeExtractionOut
from app.llm.structured import call_structured
from app.models import Resume
from app.parsing.docx_parser import parse_docx
from app.parsing.files import check_size, detect_file_type, sanitize_filename
from app.parsing.pdf_parser import parse_pdf
from app.parsing.profile_builder import build_profile, group_experience, source_for
from app.parsing.sections import DATE_RANGE_RE
from app.schemas.document import ResumeDocument
from app.schemas.profile import CandidateProfile, SkillItem
from app.services.text_utils import contains_term, substring_of

log = get_logger("resume")
PROMPT = "resume_extraction_v1"


def parse_file(path: Path, filename: str, file_type: str) -> ResumeDocument:
    try:
        if file_type == "pdf":
            return parse_pdf(path, filename)
        return parse_docx(path, filename)
    except Exception as exc:
        log.warning("resume parse failed type=%s error=%s", file_type, type(exc).__name__)
        raise InvalidFileError(
            f"Could not read this {file_type.upper()} file. It may be corrupted or protected."
        ) from exc


def enrich_profile(doc: ResumeDocument, profile: CandidateProfile) -> CandidateProfile:
    """Use the LLM to label role headers and find skills mentioned in bullets.

    Every LLM value is verified against the source text; unverifiable values are dropped."""
    exp_lines = [ln for ln in doc.lines if ln.section == "experience" and ln.kind != "heading"]
    groups = group_experience(exp_lines)
    role_groups = "\n".join(
        f"Group {i + 1}: " + " / ".join(f"[{h.id}] {h.text}" for h in headers)
        for i, (headers, _) in enumerate(groups)
    )
    content_lines = [
        ln for ln in doc.lines if ln.kind != "heading" and ln.section not in ("header",)
    ]
    lines_text = "\n".join(f"{ln.id}: {ln.text}" for ln in content_lines)
    out, _ = call_structured(
        PROMPT, ResumeExtractionOut, role_groups=role_groups or "(none)", lines=lines_text
    )
    line_map = doc.line_map()

    # Role labels: accept only values that literally appear in that group's header text.
    for label in out.roles:
        idx = label.group - 1
        if not (0 <= idx < len(profile.experience)) or idx >= len(groups):
            continue
        header_text = " ".join(h.text for h in groups[idx][0])
        header_text_no_dates = DATE_RANGE_RE.sub(" ", header_text)
        entry = profile.experience[idx]
        if label.company and substring_of(label.company, header_text_no_dates):
            entry.company = label.company.strip()
        if label.title and substring_of(label.title, header_text_no_dates):
            entry.title = label.title.strip()
        if label.location and substring_of(label.location, header_text_no_dates):
            entry.location = label.location.strip()
    # Propagate company names onto bullet sources.
    for entry in profile.experience:
        for b in entry.bullets:
            b.source.company = entry.company or None

    # Skills mentioned in bullets: keep only if literally present in the cited line.
    known = {s.name.lower() for s in profile.skills}
    for mention in out.skills_mentioned:
        ln = line_map.get(mention.line_id)
        name = mention.skill.strip()
        if not ln or not name or len(name) > 60 or name.lower() in known:
            continue
        if contains_term(ln.text, name):
            known.add(name.lower())
            profile.skills.append(SkillItem(name=name, source=source_for(ln, doc.filename)))
    profile.llm_enriched = True
    return profile


def ingest_resume(db: Session, filename: str, data: bytes) -> Resume:
    settings = get_settings()
    check_size(data, settings.max_upload_mb)
    safe_name = sanitize_filename(filename)
    file_type = detect_file_type(data, safe_name)
    stored = settings.upload_dir / f"{uuid.uuid4().hex}.{file_type}"
    stored.write_bytes(data)

    doc = parse_file(stored, safe_name, file_type)
    if not doc.lines:
        stored.unlink(missing_ok=True)
        raise InvalidFileError(
            "No text could be extracted. Scanned/image-only resumes are not supported; "
            "upload a text-based PDF or DOCX."
        )
    profile = build_profile(doc)
    prompt_version = None
    try:
        profile = enrich_profile(doc, profile)
        prompt_version = PROMPT
    except AppError as exc:
        # Deterministic profile is still valid; record that enrichment did not run.
        profile.warnings.append(f"AI enrichment skipped: {exc.message}")

    resume = Resume(
        filename=safe_name,
        file_type=file_type,
        file_path=str(stored),
        raw_text=doc.text,
        document=doc.model_dump(mode="json"),
        parsed_profile=profile.model_dump(mode="json"),
        prompt_version=prompt_version,
    )
    db.add(resume)
    db.commit()
    log.info("resume ingested id=%s type=%s lines=%d", resume.id, file_type, len(doc.lines))
    return resume


def get_resume(db: Session, resume_id: str) -> Resume:
    resume = db.get(Resume, resume_id)
    if not resume:
        raise NotFoundError("Resume not found.")
    return resume


def list_resumes(db: Session) -> list[Resume]:
    return list(db.scalars(select(Resume).order_by(Resume.created_at.desc())))


def load_document(resume: Resume) -> ResumeDocument:
    return ResumeDocument.model_validate(resume.document)


def load_profile(resume: Resume) -> CandidateProfile:
    return CandidateProfile.model_validate(resume.parsed_profile)
