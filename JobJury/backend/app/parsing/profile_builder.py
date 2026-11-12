"""Deterministic construction of a CandidateProfile from a ResumeDocument.

All text in the profile is copied verbatim from document lines. The optional LLM enrichment
step (app.services.resume_service) only labels header lines (company/title) and finds
skills mentioned in bullets — and its output is verified against the source text.
"""

from __future__ import annotations

import re
from datetime import date

from app.parsing.sections import parse_date_range
from app.schemas.document import DocLine, ResumeDocument
from app.schemas.profile import (
    CandidateInfo,
    CandidateProfile,
    Claim,
    EducationEntry,
    ExperienceEntry,
    SkillItem,
    SourceRef,
)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")
LINK_RE = re.compile(r"(?:https?://)?(?:www\.)?(?:linkedin\.com|github\.com)/[\w/-]+|https?://\S+")
DEGREE_RE = re.compile(
    r"\b(Ph\.?D|Doctor|M\.?B\.?A|Master|M\.?S\.?c?|M\.?A\.?|M\.?Tech|M\.?Eng|M\.?E\.?|"
    r"Bachelor|B\.?S\.?c?|B\.?A\.?|B\.?Tech|B\.?E\.?|B\.?Eng|Associate)\b",
    re.IGNORECASE,
)
YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
SKILL_SPLIT_RE = re.compile(r"\s*[,;|•·]\s*|\s{2,}")


def today_tuple() -> tuple[int, int]:
    t = date.today()
    return t.year, t.month


def source_for(line: DocLine, filename: str, company: str | None = None) -> SourceRef:
    return SourceRef(
        line_id=line.id,
        document=filename,
        section=line.section,
        company=company,
        page=line.page,
    )


def split_skill_line(text: str) -> list[str]:
    """Split a skills line like 'Languages: Python, SQL | Tools: Jira' into items."""
    items: list[str] = []
    # Remove category labels ("Languages:") but keep their items.
    for chunk in re.split(r"(?:^|\s{2,}|\|)\s*[A-Z][\w &/-]{1,30}:\s*", text):
        for item in SKILL_SPLIT_RE.split(chunk):
            item = item.strip(" .:-")
            if 1 < len(item) <= 60 and len(item.split()) <= 6:
                items.append(item)
    return items


def group_experience(lines: list[DocLine]) -> list[tuple[list[DocLine], list[DocLine]]]:
    """Group experience-section lines into (header_lines, bullet_lines) per role.

    A role starts at a run of non-bullet lines following bullets. Long non-bullet lines
    (> 140 chars) are treated as content (paragraph-style descriptions)."""
    groups: list[tuple[list[DocLine], list[DocLine]]] = []
    headers: list[DocLine] = []
    bullets: list[DocLine] = []
    for ln in lines:
        is_content = ln.kind == "bullet" or len(ln.text) > 140
        if is_content:
            bullets.append(ln)
            continue
        if bullets:  # a header line after content starts a new role
            groups.append((headers, bullets))
            headers, bullets = [], []
        headers.append(ln)
    if headers or bullets:
        groups.append((headers, bullets))
    return groups


def build_profile(doc: ResumeDocument) -> CandidateProfile:
    fn = doc.filename
    today = today_tuple()
    by_section: dict[str, list[DocLine]] = {}
    for ln in doc.lines:
        if ln.kind == "heading":
            continue
        by_section.setdefault(ln.section, []).append(ln)

    info = CandidateInfo()
    header = by_section.get("header", [])
    header_text = " ".join(ln.text for ln in header)
    if m := EMAIL_RE.search(header_text):
        info.email = m.group(0)
    if m := PHONE_RE.search(header_text):
        info.phone = m.group(0).strip()
    info.links = list(dict.fromkeys(LINK_RE.findall(header_text)))
    for ln in header[:3]:
        t = ln.text.strip()
        if t and not any(c.isdigit() for c in t) and "@" not in t and len(t.split()) <= 5:
            info.name = t
            break

    summary_lines = list(by_section.get("summary", []))
    if not summary_lines:
        # Un-headed summary paragraph near the top of the resume.
        summary_lines = [ln for ln in header if len(ln.text) > 120]
    info.summary = " ".join(ln.text for ln in summary_lines)
    info.summary_line_ids = [ln.id for ln in summary_lines]

    profile = CandidateProfile(candidate=info)

    # Experience
    for headers, bullets in group_experience(by_section.get("experience", [])):
        entry = ExperienceEntry(header_line_ids=[h.id for h in headers])
        for h in headers:
            dr = parse_date_range(h.text, today)
            if dr:
                entry.start_date, entry.end_date = dr["start"], dr["end"]
                entry.is_current, entry.months = dr["is_current"], dr["months"]
                entry.dates_text = dr["text"]
                break
        # Deterministic fallback labels: first header line (minus dates) is the title/company.
        cleaned = [
            re.sub(r"\s{2,}", " ", h.text.replace(entry.dates_text, "")).strip(" |,-–—")
            for h in headers
        ]
        cleaned = [c for c in cleaned if c]
        if cleaned:
            entry.company = cleaned[0]
        if len(cleaned) > 1:
            entry.title = cleaned[1]
        entry.bullets = [Claim(claim=b.text, source=source_for(b, fn)) for b in bullets]
        profile.experience.append(entry)

    # Skills section
    seen: set[str] = set()
    for ln in by_section.get("skills", []):
        for item in split_skill_line(ln.text):
            key = item.lower()
            if key not in seen:
                seen.add(key)
                profile.skills.append(SkillItem(name=item, source=source_for(ln, fn)))

    # Education
    edu_lines = by_section.get("education", [])
    current: EducationEntry | None = None
    for ln in edu_lines:
        has_degree = bool(DEGREE_RE.search(ln.text))
        is_inst = bool(re.search(r"Universit|College|Institute|School|Academy", ln.text, re.I))
        if current is None or (has_degree and current.degree) or (is_inst and current.institution):
            current = EducationEntry(source=source_for(ln, fn))
            profile.education.append(current)
        if has_degree and not current.degree:
            current.degree = ln.text
        elif is_inst and not current.institution:
            current.institution = ln.text
        if (y := YEAR_RE.search(ln.text)) and not current.year:
            current.year = y.group(0)
        if not current.degree and not current.institution:
            current.institution = ln.text

    for section in ("certifications", "projects", "awards", "other"):
        claims = [
            Claim(claim=ln.text, source=source_for(ln, fn)) for ln in by_section.get(section, [])
        ]
        setattr(profile, section, claims)

    ranges = [(e.start_date, e.end_date) for e in profile.experience if e.start_date]
    if ranges:
        from app.parsing.sections import merged_months

        profile.total_experience_months = merged_months(ranges, today)

    if not profile.experience:
        profile.warnings.append("No experience section was detected.")
    if not doc.lines:
        profile.warnings.append("No text could be extracted (the file may be a scanned image).")
    return profile


def line_company_map(profile: CandidateProfile) -> dict[str, str]:
    """Map every experience line id (headers and bullets) to its company label."""
    out: dict[str, str] = {}
    for e in profile.experience:
        for lid in e.header_line_ids:
            out[lid] = e.company
        for b in e.bullets:
            out[b.source.line_id] = e.company
    return out
