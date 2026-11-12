"""CandidateProfile: structured facts extracted from a resume.

Every fact keeps a SourceRef that points at the exact ResumeDocument line it came from.
Facts are always copied from the document text (never generated), so the profile cannot
contain claims the resume does not make.
"""

from pydantic import BaseModel, Field


class SourceRef(BaseModel):
    line_id: str
    document: str
    section: str
    company: str | None = None
    page: int | None = None

    @property
    def location(self) -> str:
        parts = [self.section.title()]
        if self.company:
            parts.append(self.company)
        label = " — ".join(parts)
        return f"{label}, page {self.page}" if self.page else label


class Claim(BaseModel):
    claim: str
    source: SourceRef


class ExperienceEntry(BaseModel):
    company: str = ""
    title: str = ""
    location: str = ""
    start_date: str | None = None  # ISO yyyy-mm
    end_date: str | None = None  # ISO yyyy-mm, None if current
    is_current: bool = False
    dates_text: str = ""
    months: int | None = None
    header_line_ids: list[str] = Field(default_factory=list)
    bullets: list[Claim] = Field(default_factory=list)


class EducationEntry(BaseModel):
    institution: str = ""
    degree: str = ""
    field: str = ""
    year: str = ""
    source: SourceRef


class SkillItem(BaseModel):
    name: str
    source: SourceRef


class CandidateInfo(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    links: list[str] = Field(default_factory=list)
    summary: str = ""
    summary_line_ids: list[str] = Field(default_factory=list)


class CandidateProfile(BaseModel):
    candidate: CandidateInfo = Field(default_factory=CandidateInfo)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    skills: list[SkillItem] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)
    certifications: list[Claim] = Field(default_factory=list)
    projects: list[Claim] = Field(default_factory=list)
    awards: list[Claim] = Field(default_factory=list)
    other: list[Claim] = Field(default_factory=list)
    total_experience_months: int | None = None
    llm_enriched: bool = False
    warnings: list[str] = Field(default_factory=list)

    @property
    def total_years(self) -> float | None:
        if self.total_experience_months is None:
            return None
        return round(self.total_experience_months / 12, 1)
