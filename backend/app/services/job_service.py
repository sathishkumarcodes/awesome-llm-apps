"""Job description ingestion: deterministic structure + LLM classification + inferred signals."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, InvalidFileError, NotFoundError
from app.core.logging import get_logger
from app.llm.outputs import HiddenRequirementsOut, JobExtractionOut
from app.llm.structured import call_structured
from app.models import Job
from app.parsing.job_parser import (
    deterministic_location,
    deterministic_work_mode,
    deterministic_years,
    line_kind,
    split_lines,
)
from app.schemas.job import InferredSignal, JobProfile, Requirement
from app.services.text_utils import contains_term, substring_of

log = get_logger("job")
EXTRACT_PROMPT = "job_extraction_v1"
HIDDEN_PROMPT = "hidden_requirements_v1"
MAX_JD_CHARS = 20000


def parse_job(description: str, company: str = "", title: str = "") -> JobProfile:
    lines = split_lines(description)
    if not lines:
        raise InvalidFileError("The job description is empty.")
    numbered = "\n".join(f"{ln.n}. [{ln.heading or 'no heading'}] {ln.text}" for ln in lines)
    profile = JobProfile(
        company=company,
        title=title,
        work_mode=deterministic_work_mode(description),  # type: ignore[arg-type]
        location=deterministic_location(description),
    )
    llm: JobExtractionOut | None = None
    try:
        llm, _ = call_structured(EXTRACT_PROMPT, JobExtractionOut, lines=numbered)
        profile.llm_enriched = True
    except AppError as exc:
        profile.warnings.append(f"AI job extraction unavailable: {exc.message}")

    llm_lines = {ol.n: ol for ol in (llm.lines if llm else [])}
    reqs: list[Requirement] = []
    for ln in lines:
        det = line_kind(ln)
        ol = llm_lines.get(ln.n)
        kind = ol.kind if ol else det
        # Deterministic cues are trusted over the model for explicit wording/headings.
        if det == "preferred":
            kind = "preferred" if kind != "ignore" or ln.is_bullet else kind
        if kind == "ignore" and det in ("must_have", "responsibility") and ln.is_bullet:
            kind = det
        if kind in ("ignore", "unknown"):
            continue
        if kind == "nice_to_have":
            kind = "preferred"
        years = deterministic_years(ln.text)
        if years is None and ol and ol.years and 0 < ol.years <= 30:
            # Only trust a model-provided number if it appears in the line.
            if str(int(ol.years)) in ln.text:
                years = ol.years
        skills = [s for s in (ol.skills if ol else []) if s and contains_term(ln.text, s)]
        reqs.append(
            Requirement(
                id=f"R{len(reqs) + 1}",
                text=ln.text,
                kind=kind,  # type: ignore[arg-type]
                category=(ol.category if ol else ("experience" if years else "other")),
                years=years,
                skills=list(dict.fromkeys(skills)),
                source_heading=ln.heading,
            )
        )
    profile.requirements = reqs

    if llm:
        jd = description
        if not profile.company and llm.company and substring_of(llm.company, jd):
            profile.company = llm.company
        if not profile.title and llm.title and substring_of(llm.title, jd):
            profile.title = llm.title
        if llm.department and substring_of(llm.department, jd):
            profile.department = llm.department
        if not profile.location and llm.location and substring_of(llm.location, jd):
            profile.location = llm.location
        if profile.work_mode == "unknown":
            profile.work_mode = llm.work_mode
        profile.seniority = llm.seniority
        profile.seniority_level = llm.seniority_level
        profile.education = [e for e in llm.education if e][:5]
        profile.certifications = [c for c in llm.certifications if c and substring_of(c, jd)][:5]
    if not profile.seniority_level:
        profile.seniority_level = _level_from_title(profile.title)
    if not profile.title:
        first = lines[0].text
        profile.title = first if len(first) <= 80 else ""
    must_years = [r.years for r in reqs if r.years and r.kind == "must_have"]
    profile.min_years = max(must_years) if must_years else None

    if reqs:
        try:
            profile.inferred_signals = infer_signals(profile)
        except AppError as exc:
            profile.warnings.append(f"Inferred signals unavailable: {exc.message}")
    if not profile.by_kind("must_have", "preferred"):
        profile.warnings.append(
            "No explicit qualification section was detected; requirements may be incomplete."
        )
    return profile


def _level_from_title(title: str) -> str:
    t = title.lower()
    if "director" in t or "head of" in t or "vp" in t:
        return "Director"
    if "principal" in t:
        return "Principal PM"
    if "staff" in t or "lead" in t or "group" in t:
        return "Staff PM"
    if "senior" in t or "sr" in t:
        return "Senior PM"
    if "product manager" in t:
        return "PM"
    return ""


def infer_signals(profile: JobProfile) -> list[InferredSignal]:
    reqs = "\n".join(f"{r.id} ({r.kind}): {r.text}" for r in profile.requirements[:30])
    out, _ = call_structured(
        HIDDEN_PROMPT,
        HiddenRequirementsOut,
        title=profile.title or "Unknown role",
        company=profile.company or "Unknown company",
        seniority=profile.seniority_level or profile.seniority or "unspecified",
        requirements=reqs,
        temperature=0.2,
    )
    valid_ids = {r.id for r in profile.requirements}
    signals = []
    for s in out.signals[:6]:
        derived = [d for d in s.derived_from if d in valid_ids]
        if not derived or not s.signal.strip():
            continue  # ungrounded inference
        signals.append(
            InferredSignal(signal=s.signal.strip(), rationale=s.rationale, derived_from=derived)
        )
    return signals


def create_job(db: Session, description: str, company: str = "", title: str = "") -> Job:
    description = description.strip()
    if len(description) < 80:
        raise InvalidFileError("The job description is too short to analyze.")
    if len(description) > MAX_JD_CHARS:
        raise InvalidFileError(f"Job description exceeds {MAX_JD_CHARS} characters.")
    profile = parse_job(description, company.strip(), title.strip())
    job = Job(
        company=profile.company,
        title=profile.title,
        description=description,
        parsed_profile=profile.model_dump(mode="json"),
        prompt_version=f"{EXTRACT_PROMPT},{HIDDEN_PROMPT}" if profile.llm_enriched else None,
    )
    db.add(job)
    db.commit()
    log.info("job created id=%s requirements=%d", job.id, len(profile.requirements))
    return job


def get_job(db: Session, job_id: str) -> Job:
    job = db.get(Job, job_id)
    if not job:
        raise NotFoundError("Job not found.")
    return job


def list_jobs(db: Session) -> list[Job]:
    return list(db.scalars(select(Job).order_by(Job.created_at.desc())))


def load_job_profile(job: Job) -> JobProfile:
    return JobProfile.model_validate(job.parsed_profile)


def extract_job_text(filename: str, data: bytes) -> str:
    """Extract plain text from an uploaded JD file (PDF, DOCX, or TXT)."""
    import tempfile

    from app.parsing.files import detect_file_type

    name = filename.lower()
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace")
    ftype = detect_file_type(data, filename)
    with tempfile.NamedTemporaryFile(suffix=f".{ftype}", delete=True) as tmp:
        tmp.write(data)
        tmp.flush()
        if ftype == "pdf":
            import pymupdf

            with pymupdf.open(tmp.name) as doc:
                return "\n".join(page.get_text("text", sort=True) for page in doc)
        from docx import Document

        from app.parsing.docx_parser import iter_paragraphs

        d = Document(tmp.name)
        return "\n".join(p.text for p, _ in iter_paragraphs(d))
