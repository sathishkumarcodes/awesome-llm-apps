"""Raw LLM output schemas.

These are passed to Ollama as JSON schemas (constrained decoding) and validated with Pydantic.
They contain line-id references, never free-form "evidence" text: evidence shown to users
is always looked up verbatim from the resume document.
"""

from typing import Literal

from pydantic import BaseModel, Field

Strength = Literal["strong", "moderate", "weak"]
Sev = Literal["high", "medium", "low"]


# Resume extraction
class RoleLabel(BaseModel):
    group: int
    company: str = ""
    title: str = ""
    location: str = ""


class SkillMention(BaseModel):
    skill: str
    line_id: str


class ResumeExtractionOut(BaseModel):
    roles: list[RoleLabel] = Field(default_factory=list)
    skills_mentioned: list[SkillMention] = Field(default_factory=list)


# Job extraction
class JobLineOut(BaseModel):
    n: int
    kind: Literal["must_have", "preferred", "responsibility", "nice_to_have", "ignore"]
    category: Literal[
        "technical",
        "domain",
        "leadership",
        "product",
        "education",
        "certification",
        "experience",
        "stakeholder",
        "customer",
        "other",
    ] = "other"
    years: float | None = None
    skills: list[str] = Field(default_factory=list)


class JobExtractionOut(BaseModel):
    company: str = ""
    title: str = ""
    department: str = ""
    location: str = ""
    work_mode: Literal["remote", "hybrid", "onsite", "unknown"] = "unknown"
    seniority: str = ""
    seniority_level: Literal["PM", "Senior PM", "Staff PM", "Principal PM", "Director", ""] = ""
    education: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    lines: list[JobLineOut] = Field(default_factory=list)


class SignalOut(BaseModel):
    signal: str
    rationale: str
    derived_from: list[str] = Field(default_factory=list)


class HiddenRequirementsOut(BaseModel):
    signals: list[SignalOut] = Field(default_factory=list)


# Matching
class EvidenceRef(BaseModel):
    line_id: str
    strength: Strength = "moderate"


class AssessmentOut(BaseModel):
    id: str
    status: Literal["demonstrated", "partial", "not_demonstrated"]
    support: Literal["confirmed", "potentially_transferable", "not_demonstrated"]
    rationale: str
    evidence: list[EvidenceRef] = Field(default_factory=list)


class AssessmentBatchOut(BaseModel):
    assessments: list[AssessmentOut] = Field(default_factory=list)


class RatingOut(BaseModel):
    key: str
    rating: float = Field(ge=0, le=100)
    rationale: str = ""
    line_ids: list[str] = Field(default_factory=list)


class PointOut(BaseModel):
    title: str
    detail: str = ""
    line_ids: list[str] = Field(default_factory=list)


class SupportedPointOut(PointOut):
    support: Literal["confirmed", "potentially_transferable"] = "confirmed"


class RiskOut(PointOut):
    severity: Sev = "medium"


class RecruiterOut(BaseModel):
    headline: str
    ratings: list[RatingOut]
    strengths: list[PointOut] = Field(default_factory=list)
    risks: list[RiskOut] = Field(default_factory=list)
    resume_concerns: list[RiskOut] = Field(default_factory=list)
    trajectory_concerns: list[RiskOut] = Field(default_factory=list)


class HiringManagerOut(BaseModel):
    headline: str
    ratings: list[RatingOut]
    strengths: list[SupportedPointOut] = Field(default_factory=list)
    concerns: list[RiskOut] = Field(default_factory=list)


Level = Literal["PM", "Senior PM", "Staff PM", "Principal PM", "Director", "Not demonstrated"]


class SeniorityDimOut(BaseModel):
    dimension: str
    level: Level
    note: str = ""
    line_ids: list[str] = Field(default_factory=list)


class SeniorityOut(BaseModel):
    title_level: Level
    demonstrated_low: Level
    demonstrated_high: Level
    explanation: str
    dimensions: list[SeniorityDimOut] = Field(default_factory=list)


class ImprovementOut(BaseModel):
    action: str
    rationale: str
    impact: Sev = "medium"
    line_ids: list[str] = Field(default_factory=list)


class RecommendationOut(BaseModel):
    headline: str
    why: str
    improvements: list[ImprovementOut] = Field(default_factory=list)


# Tailoring
class RewriteOut(BaseModel):
    line_id: str
    new_text: str
    reason: str = ""
    supporting_line_ids: list[str] = Field(default_factory=list)


class TailoringOut(BaseModel):
    rewrites: list[RewriteOut] = Field(default_factory=list)


class FactualityOut(BaseModel):
    status: Literal["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED"]
    unsupported_claims: list[str] = Field(default_factory=list)
    explanation: str = ""
