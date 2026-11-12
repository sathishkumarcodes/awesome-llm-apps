"""Layer 1: deterministic checks (years, skills, certifications, education, location)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.schemas.document import ResumeDocument
from app.schemas.job import JobProfile, Requirement
from app.schemas.profile import CandidateProfile
from app.services.text_utils import contains_term, skill_present

DEGREE_LEVELS = [
    (4, r"\b(ph\.?d|doctorate|doctor of)\b"),
    (3, r"\b(m\.?b\.?a|master'?s?|m\.?s\.?c?|m\.?a\.?|m\.?tech|m\.?eng|advanced degree)\b"),
    (2, r"\b(bachelor'?s?|b\.?s\.?c?|b\.?a\.?|b\.?tech|b\.?e\.?|b\.?eng|undergraduate degree)\b"),
    (1, r"\b(associate'?s?)\b"),
]


def degree_level(text: str) -> int:
    t = text.lower()
    for level, pat in DEGREE_LEVELS:
        if re.search(pat, t):
            return level
    return 0


@dataclass
class RequirementCheck:
    requirement_id: str
    skills_found: list[str] = field(default_factory=list)
    skills_missing: list[str] = field(default_factory=list)
    years_required: float | None = None
    years_candidate: float | None = None
    years_met: bool | None = None
    degree_required: int | None = None
    degree_candidate: int | None = None
    # Years in the area the requirement names (e.g. product management), from role titles.
    area: str | None = None
    area_years: float | None = None
    area_years_met: bool | None = None
    area_line_ids: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {k: v for k, v in self.__dict__.items() if v not in (None, [])}


@dataclass
class DeterministicFacts:
    candidate_years: float | None
    required_years: float | None
    years_ratio: float | None
    checks: dict[str, RequirementCheck]
    certifications_required: list[str]
    certifications_found: list[str]
    education_required_level: int
    education_candidate_level: int
    location_status: str  # match | remote | unknown | mismatch
    location_note: str
    metric_bullet_ratio: float

    def summary(self) -> str:
        parts = []
        if self.candidate_years is not None:
            parts.append(
                f"candidate total experience from resume dates: {self.candidate_years} years"
            )
        if self.required_years:
            parts.append(f"job minimum years: {self.required_years}")
        if self.certifications_required:
            parts.append(
                f"certifications required: {self.certifications_required}; "
                f"found: {self.certifications_found or 'none'}"
            )
        parts.append(f"location: {self.location_note}")
        return "; ".join(parts)


# Requirement wording → role-title pattern that counts toward years in that area.
_AREAS: list[tuple[str, re.Pattern[str], re.Pattern[str]]] = [
    (
        "product management",
        re.compile(r"\bproduct (management|manager|leadership|owner)\b", re.I),
        re.compile(r"\bproduct\b", re.I),
    ),
    (
        "engineering",
        re.compile(
            r"\b(software|engineering) (experience|development)\b|\bas an? (software )?engineer",
            re.I,
        ),
        re.compile(r"\b(engineer|developer)\b", re.I),
    ),
]


def area_years(
    req_text: str, profile: CandidateProfile | None
) -> tuple[str | None, float | None, list[str]]:
    """Years spent in roles matching the area a years-requirement names."""
    if profile is None:
        return None, None, []
    for area, req_pat, title_pat in _AREAS:
        if req_pat.search(req_text):
            roles = [e for e in profile.experience if e.months and title_pat.search(e.title or "")]
            if not roles:
                return area, 0.0, []
            ids = [i for e in roles for i in e.header_line_ids][:3]
            return area, round(sum(e.months or 0 for e in roles) / 12, 1), ids
    return None, None, []


def check_requirement(
    req: Requirement,
    resume_text: str,
    cand_years: float | None,
    cand_degree: int,
    profile: CandidateProfile | None = None,
) -> RequirementCheck:
    chk = RequirementCheck(requirement_id=req.id)
    for skill in req.skills:
        (chk.skills_found if skill_present(resume_text, skill) else chk.skills_missing).append(
            skill
        )
    if req.years:
        chk.years_required = req.years
        chk.years_candidate = cand_years
        chk.years_met = None if cand_years is None else cand_years >= req.years
        chk.area, chk.area_years, chk.area_line_ids = area_years(req.text, profile)
        if chk.area_years is not None:
            chk.area_years_met = chk.area_years >= req.years
    if req.category == "education" or degree_level(req.text):
        chk.degree_required = degree_level(req.text) or None
        chk.degree_candidate = cand_degree
    return chk


def run(doc: ResumeDocument, profile: CandidateProfile, job: JobProfile) -> DeterministicFacts:
    text = doc.text
    cand_years = profile.total_years
    cand_degree = max(
        [degree_level(f"{e.degree} {e.institution}") for e in profile.education] or [0]
    )
    checks = {
        r.id: check_requirement(r, text, cand_years, cand_degree, profile) for r in job.requirements
    }
    certs_found = [c for c in job.certifications if contains_term(text, c)]
    edu_req = max([degree_level(e) for e in job.education] or [0])

    cand_loc = profile.candidate.location or _header_location(doc)
    if job.work_mode == "remote":
        loc_status, loc_note = "remote", "role is remote"
    elif not job.location:
        loc_status, loc_note = "unknown", "job location not stated"
    elif cand_loc and any(
        part.strip().lower() in cand_loc.lower()
        for part in re.split(r"[,/;()]", job.location)
        if len(part.strip()) > 2
    ):
        loc_status, loc_note = "match", f"candidate location appears to match {job.location}"
    elif cand_loc:
        loc_status, loc_note = "mismatch", f"job in {job.location}; resume lists {cand_loc}"
    else:
        loc_status, loc_note = "unknown", "candidate location not stated in the resume"

    bullets = [ln for ln in doc.lines if ln.kind == "bullet" and ln.section == "experience"]
    with_metrics = [b for b in bullets if re.search(r"\d", b.text)]
    ratio = len(with_metrics) / len(bullets) if bullets else 0.0

    return DeterministicFacts(
        candidate_years=cand_years,
        required_years=job.min_years,
        years_ratio=(
            min(1.0, cand_years / job.min_years) if cand_years and job.min_years else None
        ),
        checks=checks,
        certifications_required=list(job.certifications),
        certifications_found=certs_found,
        education_required_level=edu_req,
        education_candidate_level=cand_degree,
        location_status=loc_status,
        location_note=loc_note,
        metric_bullet_ratio=round(ratio, 2),
    )


_CITY_STATE = re.compile(r"\b([A-Z][a-zA-Z .]+,\s*[A-Z]{2})\b")


def _header_location(doc: ResumeDocument) -> str:
    for ln in doc.lines[:4]:
        if ln.section == "header" and (m := _CITY_STATE.search(ln.text)):
            return m.group(1)
    return ""
