"""JobProfile: structured representation of a job description."""

from typing import Literal

from pydantic import BaseModel, Field

RequirementKind = Literal["must_have", "preferred", "responsibility", "nice_to_have"]
RequirementCategory = Literal[
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
]
WorkMode = Literal["remote", "hybrid", "onsite", "unknown"]

SENIORITY_LADDER = ("PM", "Senior PM", "Staff PM", "Principal PM", "Director")


class Requirement(BaseModel):
    id: str
    text: str
    kind: RequirementKind
    category: RequirementCategory = "other"
    years: float | None = None
    skills: list[str] = Field(default_factory=list)
    source_heading: str = ""


class InferredSignal(BaseModel):
    signal: str
    rationale: str
    derived_from: list[str] = Field(default_factory=list)  # requirement ids
    label: Literal["Inferred"] = "Inferred"


class JobProfile(BaseModel):
    company: str = ""
    title: str = ""
    department: str = ""
    location: str = ""
    work_mode: WorkMode = "unknown"
    seniority: str = ""  # free text from the JD, e.g. "Staff"
    seniority_level: str = ""  # one of SENIORITY_LADDER when it can be mapped
    min_years: float | None = None
    education: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    requirements: list[Requirement] = Field(default_factory=list)
    inferred_signals: list[InferredSignal] = Field(default_factory=list)
    llm_enriched: bool = False
    warnings: list[str] = Field(default_factory=list)

    def by_kind(self, *kinds: RequirementKind) -> list[Requirement]:
        return [r for r in self.requirements if r.kind in kinds]
