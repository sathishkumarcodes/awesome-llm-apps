"""Dynamic hiring scorecard: criteria generated from a job description, and evaluations of
resumes against them.

A scorecard is generated from the job alone (never from a resume), validated, weighted
deterministically, and saved with a version so every candidate is judged on the same criteria.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Importance = Literal["critical", "high", "medium", "low"]
Owner = Literal["recruiter", "hiring_manager", "both"]
CriterionCategory = Literal[
    "experience",
    "technical",
    "domain",
    "leadership",
    "product",
    "customer",
    "stakeholder",
    "impact",
    "education",
    "certification",
    "seniority",
    "other",
]
# Rubric levels the model may choose; numeric points are computed in code.
Level = Literal["5", "4", "3", "2", "1", "0", "unknown"]
Classification = Literal[
    "directly_demonstrated",
    "strong_equivalent",
    "transferable",
    "weakly_demonstrated",
    "not_demonstrated",
    "confirmed_absent",
    "unknown",
]
GapType = Literal["none", "qualification", "evidence", "positioning", "ats"]
Decision = Literal[
    "APPLY", "APPLY_TAILOR_FIRST", "BORDERLINE", "PROBABLY_SKIP", "NEEDS_CLARIFICATION"
]

CLASSIFICATION_LABELS: dict[str, str] = {
    "directly_demonstrated": "Directly demonstrated",
    "strong_equivalent": "Strong equivalent",
    "transferable": "Transferable",
    "weakly_demonstrated": "Weakly demonstrated",
    "not_demonstrated": "Not demonstrated in resume",
    "confirmed_absent": "Confirmed absent",
    "unknown": "Unknown",
}
# Levels a classification may take. Keeps the label and the number consistent.
CLASSIFICATION_LEVELS: dict[str, tuple[str, ...]] = {
    "directly_demonstrated": ("5", "4"),
    "strong_equivalent": ("4", "3"),
    "transferable": ("3", "2"),
    "weakly_demonstrated": ("2", "1"),
    # Scores 0 points (the resume doesn't show it) but is NOT a confirmed gap: the label stays
    # "not demonstrated" and it triggers a clarification question instead.
    "not_demonstrated": ("0",),
    "confirmed_absent": ("0",),
    "unknown": ("unknown",),
}
DECISION_LABELS: dict[str, str] = {
    "APPLY": "APPLY",
    "APPLY_TAILOR_FIRST": "APPLY — TAILOR FIRST",
    "BORDERLINE": "BORDERLINE",
    "PROBABLY_SKIP": "PROBABLY SKIP",
    "NEEDS_CLARIFICATION": "NEEDS CLARIFICATION",
}


class Rubric(BaseModel):
    """What each level means for this criterion. 0 is reserved for a confirmed gap."""

    level_5: str
    level_4: str
    level_3: str
    level_2: str
    level_1: str
    level_0: str = "Confirmed lack of this capability (e.g. the candidate said they don't have it)."
    unknown: str = "The resume does not give enough information to judge this."

    def anchor(self, level: str) -> str:
        return getattr(self, "unknown" if level == "unknown" else f"level_{level}")


class HiringCriterion(BaseModel):
    id: str
    name: str
    description: str
    category: CriterionCategory = "other"
    source_requirement_ids: list[str]
    source_requirement_texts: list[str] = Field(default_factory=list)
    source_rule_ids: list[str] = Field(default_factory=list)
    importance: Importance
    evaluation_owner: Owner
    weight: float = 0.0  # percent of the overall score; weights sum to 100
    evaluation_guidance: str = ""
    recruiter_guidance: str = ""
    hiring_manager_guidance: str = ""
    strong_evidence_definition: str = ""
    moderate_evidence_definition: str = ""
    weak_evidence_definition: str = ""
    rubric: Rubric
    is_explicit: bool = True  # False when the criterion rests only on inferred signals
    is_hard_requirement: bool = False
    rationale: str = ""  # why this matters for the job / why this weight


class EligibilityConstraint(BaseModel):
    """A stated condition a resume can't show (travel, office days, work authorization).

    Never scored. It only blocks when the candidate confirms they can't meet it."""

    id: str
    requirement_id: str
    text: str
    is_hard_requirement: bool = True


class ValidationCheck(BaseModel):
    name: str
    passed: bool
    detail: str = ""
    fixed: bool = False


class ScorecardContent(BaseModel):
    role_family: str = ""
    seniority: str = ""
    summary: str = ""
    criteria: list[HiringCriterion]
    eligibility: list[EligibilityConstraint] = Field(default_factory=list)
    validation: list[ValidationCheck] = Field(default_factory=list)
    generated_by: Literal["model", "deterministic"] = "model"
    generated_without_resume: bool = True


# --- evaluation ---------------------------------------------------------------------------
class CriterionEvidence(BaseModel):
    """Verbatim resume text (or a clarification answer) behind a criterion judgment."""

    line_id: str  # resume line id, or "clarification:<id>"
    source: Literal["resume", "clarification"] = "resume"
    source_section: str = ""
    source_location: str = ""
    original_text: str
    evidence_strength: Literal["strong", "moderate", "weak"] = "moderate"


class CriterionResult(BaseModel):
    criterion_id: str
    classification: Classification
    level: Level
    recruiter_level: Level | None = None
    hiring_manager_level: Level | None = None
    match_type: Literal["direct", "equivalent", "transferable", "weak", "none", "unknown"] = "none"
    evidence: list[CriterionEvidence] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    reasoning: str = ""
    recruiter_note: str = ""
    hiring_manager_note: str = ""
    recruiter_adjustments: list[str] = Field(default_factory=list)  # deterministic visibility rules
    gap_type: GapType = "none"
    improvement: str = ""
    tailoring_can_fix: bool = False
    clarification_question: str = ""
    used_clarification: bool = False
    # Level with the candidate's clarification answers taken into account. Resume-based scores
    # never use it; it only feeds "fit with your clarifications".
    clarified_level: Level | None = None
    rule_results: dict[str, str] = Field(default_factory=dict)  # rule id -> short outcome


class Blocker(BaseModel):
    criterion_id: str | None = None
    constraint_id: str | None = None
    requirement_text: str
    candidate_evidence: str
    explanation: str


class ClarificationQuestion(BaseModel):
    id: str
    criterion_id: str | None = None
    constraint_id: str | None = None
    question: str
    why: str = ""
    answer: str | None = None


class Improvement(BaseModel):
    criterion_id: str
    criterion_name: str
    weight: float
    gap_type: GapType
    summary: str
    action: str
    tailoring_can_fix: bool


class RuleOutcome(BaseModel):
    rule_id: str
    name: str
    status: Literal["pass", "warn", "fail", "info"]
    detail: str = ""


class Scores(BaseModel):
    overall_fit: float | None
    recruiter: float | None
    hiring_manager: float | None
    ats_readiness: float
    evidence_completeness: float  # % of weight that has a judgment other than unknown
    provisional: bool  # True when important criteria are unknown
    fit_with_clarifications: float | None = None


class Recommendation(BaseModel):
    decision: Decision
    label: str
    headline: str
    why: list[str]


class EvaluationContent(BaseModel):
    results: list[CriterionResult]
    scores: Scores
    recommendation: Recommendation
    blockers: list[Blocker] = Field(default_factory=list)
    clarifications: list[ClarificationQuestion] = Field(default_factory=list)
    improvements: list[Improvement] = Field(default_factory=list)
    diagnostics: list[RuleOutcome] = Field(default_factory=list)  # ATS / writing / impact rules
    scoring_config: dict = Field(default_factory=dict)
