"""Tailoring changes and factuality validation."""

from typing import Literal

from pydantic import BaseModel, Field, computed_field

TailoringMode = Literal["minimal", "recommended", "aggressive"]
FactualityStatus = Literal["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED"]
ChangeType = Literal["rewrite", "summary", "reorder", "skills"]
# accepted: will be exported; rejected: user/system rejected; pending: needs user decision
ChangeDecision = Literal["accepted", "rejected", "pending"]


class FactualityIssue(BaseModel):
    kind: Literal[
        "new_number",
        "new_skill",
        "new_term",
        "new_proper_noun",
        "scope_inflation",
        "llm_flag",
        "empty",
    ]
    detail: str
    hard: bool = False  # hard issues force UNSUPPORTED


class FactualityResult(BaseModel):
    status: FactualityStatus
    issues: list[FactualityIssue] = Field(default_factory=list)
    deterministic_status: FactualityStatus
    llm_status: FactualityStatus | None = None
    llm_explanation: str = ""
    supporting_evidence: list[str] = Field(default_factory=list)  # verbatim source lines


class Change(BaseModel):
    id: str
    type: ChangeType
    section: str
    target_line_ids: list[str]
    original: str
    proposed: str
    reason: str = ""
    supporting_line_ids: list[str] = Field(default_factory=list)
    factuality: FactualityResult | None = None
    decision: ChangeDecision = "pending"
    user_edited: bool = False
    # reorder only: the new order of line ids
    new_order: list[str] = Field(default_factory=list)
    # Scorecard criteria this change makes more visible (empty when there's no scorecard).
    target_criterion_ids: list[str] = Field(default_factory=list)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def requires_user_review(self) -> bool:
        return self.decision == "pending"
