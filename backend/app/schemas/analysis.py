"""Match analysis output: evaluator results, evidence, recommendation."""

from typing import Literal

from pydantic import BaseModel, Field

EvidenceStrength = Literal["strong", "moderate", "weak"]
SupportLevel = Literal["confirmed", "potentially_transferable", "inferred", "not_demonstrated"]
RequirementStatus = Literal["demonstrated", "partial", "not_demonstrated"]
Severity = Literal["high", "medium", "low"]
Decision = Literal["APPLY", "APPLY_TAILOR_FIRST", "BORDERLINE", "PROBABLY_SKIP"]

DECISION_LABELS: dict[str, str] = {
    "APPLY": "APPLY",
    "APPLY_TAILOR_FIRST": "APPLY — TAILOR FIRST",
    "BORDERLINE": "BORDERLINE",
    "PROBABLY_SKIP": "PROBABLY SKIP",
}

NOT_DEMONSTRATED = "Not demonstrated in the resume."


class Evidence(BaseModel):
    """A judgment backed by verbatim resume text. ``evidence`` is never LLM-written."""

    claim: str
    evidence: str
    line_id: str
    source_section: str
    source_location: str
    strength: EvidenceStrength = "moderate"


class Insight(BaseModel):
    title: str
    detail: str = ""
    support: SupportLevel = "confirmed"
    evidence: list[Evidence] = Field(default_factory=list)


class Risk(BaseModel):
    title: str
    detail: str = ""
    severity: Severity = "medium"
    evidence: list[Evidence] = Field(default_factory=list)


class RequirementAssessment(BaseModel):
    requirement_id: str
    text: str
    kind: str
    category: str
    status: RequirementStatus
    support: SupportLevel
    rationale: str
    evidence: list[Evidence] = Field(default_factory=list)
    semantic_score: float = 0.0
    deterministic: dict[str, object] = Field(default_factory=dict)


class CategoryScore(BaseModel):
    key: str
    label: str
    weight: float  # max points
    rating: float  # 0-100 blended rating
    points: float  # rating * weight / 100
    rationale: str = ""
    components: dict[str, float] = Field(default_factory=dict)
    evidence: list[Evidence] = Field(default_factory=list)


class EvaluatorResult(BaseModel):
    role: Literal["recruiter", "hiring_manager"]
    question: str
    score: float
    headline: str
    categories: list[CategoryScore]
    strengths: list[Insight] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    # recruiter-specific lists (empty for HM) / HM-specific lists (empty for recruiter)
    missing_requirements: list[str] = Field(default_factory=list)
    resume_concerns: list[Risk] = Field(default_factory=list)
    trajectory_concerns: list[Risk] = Field(default_factory=list)
    seniority_concerns: list[Risk] = Field(default_factory=list)


class SeniorityDimension(BaseModel):
    dimension: str
    level: str
    evidence: list[Evidence] = Field(default_factory=list)
    note: str = ""


class SeniorityAssessment(BaseModel):
    role_level: str
    title_level: str
    demonstrated_low: str
    demonstrated_high: str
    explanation: str
    dimensions: list[SeniorityDimension] = Field(default_factory=list)


class Improvement(BaseModel):
    action: str
    rationale: str
    impact: Severity = "medium"
    evidence: list[Evidence] = Field(default_factory=list)


class Recommendation(BaseModel):
    decision: Decision
    label: str
    headline: str
    why: str
    deciding_factors: list[str] = Field(default_factory=list)


class MatchResult(BaseModel):
    recommendation: Recommendation
    overall_score: float
    recruiter: EvaluatorResult
    hiring_manager: EvaluatorResult
    requirements: list[RequirementAssessment]
    why_match: list[Insight]
    rejection_risks: list[Risk]
    hiring_manager_concerns: list[Risk]
    improvements: list[Improvement]
    seniority: SeniorityAssessment
    inferred_signals: list[RequirementAssessment]
    gaps: list[str]
    top_issue: str = ""
    disclaimer: str = (
        "Likely assessment based only on the evidence in your resume. It is not a prediction "
        "of what any specific recruiter or hiring manager will decide."
    )
