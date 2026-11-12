"""Evaluate a resume against a saved scorecard, one criterion at a time.

For each criterion: gather evidence (the per-requirement verdicts for its source requirements
plus a hybrid search for the criterion itself), have the model pick a rubric level and cite
lines, then apply deterministic guardrails:
  REQ-01  credit needs a cited, real resume line;
  consistency with the per-requirement layer (a criterion can't be "direct" when none of its
          requirements are shown, and can't be "not demonstrated" when one plainly is);
  levels must match the classification's allowed range;
  confirmed_absent only from the candidate's own answer;
  REC-02/03 and HM-02 perspective rules;
  ADV-03 gap classification.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.errors import AppError
from app.core.logging import get_logger
from app.llm.outputs import CriterionEvalOut
from app.llm.structured import call_structured
from app.schemas.analysis import RequirementAssessment
from app.schemas.job import JobProfile
from app.scorecards.perspectives import EvidenceContext, bound_level, recruiter_level
from app.scorecards.schemas import (
    CLASSIFICATION_LEVELS,
    CriterionEvidence,
    CriterionResult,
    HiringCriterion,
    RuleOutcome,
)
from app.scoring.evidence import EvidenceBuilder
from app.scoring.requirements import Item, candidate_lines, cited_ids
from app.scoring.semantic import SemanticIndex

log = get_logger("scorecard.eval")
PROMPT = "criterion_evaluation_v1"
POSITIVE = {"directly_demonstrated", "strong_equivalent", "transferable", "weakly_demonstrated"}
MATCH_TYPE = {
    "directly_demonstrated": "direct",
    "strong_equivalent": "equivalent",
    "transferable": "transferable",
    "weakly_demonstrated": "weak",
    "not_demonstrated": "none",
    "confirmed_absent": "none",
    "unknown": "unknown",
}
_IMPORTANT = {"critical", "high", "medium"}


@dataclass
class Answer:
    """A candidate's clarification answer for one criterion."""

    id: str
    kind: str  # yes | no | detail
    text: str
    question: str = ""


@dataclass
class EvalInputs:
    job: JobProfile
    evb: EvidenceBuilder
    index: SemanticIndex
    ctx: EvidenceContext
    assessments: dict[str, RequirementAssessment]
    diagnostics: list[RuleOutcome]
    answers: dict[str, Answer] = field(default_factory=dict)  # criterion id -> answer


def _requirement_lines(c: HiringCriterion, inp: EvalInputs) -> tuple[str, list[str]]:
    rows, ids = [], []
    for rid, text in zip(
        c.source_requirement_ids,
        c.source_requirement_texts or [""] * len(c.source_requirement_ids),
        strict=False,
    ):
        a = inp.assessments.get(rid)
        if a is None:
            rows.append(f"- {rid}: {text} → not assessed")
            continue
        ev = [e.line_id for e in a.evidence]
        ids += ev
        rows.append(
            f"- {rid} ({a.kind}): {a.text} → {a.status}: {a.rationale[:160]}"
            + (f" [lines {', '.join(ev)}]" if ev else "")
        )
    return "\n".join(rows) or "(none)", ids


def _snap(level: str, classification: str) -> str:
    allowed = CLASSIFICATION_LEVELS[classification]
    if level in allowed:
        return level
    if level == "unknown" or allowed == ("unknown",):
        return allowed[0]
    return min(allowed, key=lambda a: abs(int(a) - int(level)))


def _call(
    c: HiringCriterion, inp: EvalInputs, lines: str, reqs: str, clarification: str
) -> CriterionEvalOut:
    r = c.rubric
    out, _ = call_structured(
        PROMPT,
        CriterionEvalOut,
        title=inp.job.title or "the role",
        name=c.name,
        importance=c.importance,
        description=c.description or c.name,
        level_5=r.level_5,
        level_4=r.level_4,
        level_3=r.level_3,
        level_2=r.level_2,
        level_1=r.level_1,
        recruiter_guidance=c.recruiter_guidance or "visible, relevant qualifications",
        hm_guidance=c.hiring_manager_guidance or "depth, ownership and outcomes",
        requirements=reqs,
        lines=lines or "(no relevant lines found)",
        clarification=clarification,
        temperature=0.0,
    )
    return out


def classify_gap(
    c: HiringCriterion,
    classification: str,
    level: str,
    model_gap: str,
    evidence_ids: list[str],
    rec_notes: list[str],
    inp: EvalInputs,
) -> str:
    """ADV-03: qualification / evidence / positioning / ats gap, or none."""
    if level == "5":
        return "positioning" if rec_notes else "none"
    if level == "4":
        # Strong evidence; still worth surfacing if it's hidden or the model says it's understated.
        return "positioning" if rec_notes or model_gap == "positioning" else "none"
    if classification == "confirmed_absent":
        return "qualification"
    if classification in ("not_demonstrated", "unknown") or not evidence_ids:
        return "evidence"
    if rec_notes:
        return "positioning"
    ats_failing = {
        o.rule_id for o in inp.diagnostics if o.status == "fail" and o.rule_id.startswith("ATS")
    }
    if model_gap == "ats" and ats_failing:
        return "ats"
    if model_gap in ("positioning", "qualification", "evidence"):
        return model_gap
    return "qualification" if level in ("1", "2") else "positioning"


def _question(c: HiringCriterion, model_q: str) -> str:
    if model_q.strip() and model_q.strip().endswith("?"):
        return model_q.strip()
    first = (c.source_requirement_texts or [c.description])[0].rstrip(".")
    return f"The job asks for “{first}”, which your resume doesn't show. Do you have this experience, and if so, what did you do?"


def evaluate_criterion(c: HiringCriterion, inp: EvalInputs) -> CriterionResult:
    reqs_text, req_ids = _requirement_lines(c, inp)
    item = Item(
        c.id, f"{c.name}. {c.description}", "criterion", c.category, f"{c.name}. {c.description}"
    )
    hits = [h.line_id for h in candidate_lines(item, inp.index)[:6]]
    shown = list(dict.fromkeys([*req_ids, *hits]))[:12]
    lines = "\n".join(f"{lid} [{inp.ctx.describe(lid)}]: {inp.evb.text(lid)}" for lid in shown)
    answer = inp.answers.get(c.id)
    rules: dict[str, str] = {}

    if answer and answer.kind == "no":
        # The candidate says they don't have it: a confirmed gap, no model call needed.
        return CriterionResult(
            criterion_id=c.id,
            classification="confirmed_absent",
            level="0",
            recruiter_level="0" if c.evaluation_owner != "hiring_manager" else None,
            hiring_manager_level="0" if c.evaluation_owner != "recruiter" else None,
            match_type="none",
            evidence=[
                CriterionEvidence(
                    line_id=f"clarification:{answer.id}",
                    source="clarification",
                    original_text=f"You answered: {answer.text}",
                )
            ],
            reasoning="You confirmed you don't have this experience.",
            gap_type="qualification",
            improvement="This is a real gap; rewriting the resume can't close it.",
            used_clarification=True,
            clarified_level="0",
            rule_results={"ADV-03": "qualification gap (confirmed by you)"},
        )

    try:
        out = _call(c, inp, lines, reqs_text, "")
    except AppError as exc:
        log.warning("criterion %s evaluation failed: %s", c.id, exc.message[:80])
        return _fallback(c, inp, req_ids)

    classification = out.classification
    evidence_ids = inp.evb.valid([e.line_id for e in out.evidence])
    strength = {e.line_id: e.strength for e in out.evidence}
    notes: list[str] = []

    if classification == "confirmed_absent":
        classification = "not_demonstrated"
        notes.append("Not demonstrated in the resume (that alone doesn't confirm a gap).")
        rules["ADV-03"] = "confirmed_absent needs your answer; treated as not demonstrated"
    if classification in POSITIVE and not evidence_ids:
        # Accept line ids named in the reasoning, but only lines the model was shown.
        evidence_ids = [i for i in inp.evb.valid(cited_ids(out.reasoning)) if i in shown]
    if classification in POSITIVE and not evidence_ids:
        classification = "not_demonstrated"
        rules["REQ-01"] = "no real line cited; not credited"
    if classification == "unknown" and c.is_explicit:
        classification = "not_demonstrated"
    # Consistency with the per-requirement layer.
    explicit = [
        inp.assessments[r]
        for r in c.source_requirement_ids
        if r in inp.assessments and inp.assessments[r].kind != "inferred"
    ]
    shown_reqs = [a for a in explicit if a.status == "demonstrated" and a.evidence]
    if shown_reqs and classification in ("not_demonstrated", "unknown"):
        classification = "weakly_demonstrated"
        evidence_ids = list(dict.fromkeys([e.line_id for a in shown_reqs for e in a.evidence]))[:3]
        notes.append(f"Requirement “{shown_reqs[0].text[:80]}” is shown in the resume.")
        rules["REQ-11"] = "raised: a source requirement is demonstrated"
    if (
        explicit
        and not any(a.status != "not_demonstrated" for a in explicit)
        and classification == "directly_demonstrated"
    ):
        classification = "transferable"
        rules["REQ-11"] = "capped: none of the source requirements is demonstrated"

    level = _snap(out.level, classification)
    if level != out.level:
        rules.setdefault("level", f"model level {out.level} → {level} to match {classification}")

    rec_level, rec_notes = recruiter_level(level, evidence_ids, inp.ctx)
    for n in rec_notes:
        rules[n[:6]] = n[8:]
    hm_level, bounded = bound_level(
        level, out.hiring_manager_level if out.hiring_manager_level != "unknown" else level
    )
    if bounded:
        rules["HM-02"] = f"hiring-manager level bounded to {hm_level}"
    gap = classify_gap(c, classification, level, out.gap_type, evidence_ids, rec_notes, inp)
    rules["ADV-03"] = f"{gap} gap" if gap != "none" else "no gap"
    question = (
        _question(c, out.clarification_question)
        if gap == "evidence" and c.importance in _IMPORTANT
        else ""
    )

    evidence = []
    for b in inp.evb.build(evidence_ids, c.name, "moderate", limit=4):
        evidence.append(
            CriterionEvidence(
                line_id=b.line_id,
                source_section=b.source_section,
                source_location=b.source_location,
                original_text=b.evidence,
                evidence_strength=strength.get(b.line_id, b.strength),
            )
        )  # type: ignore[arg-type]
    reasoning = " ".join([out.reasoning.strip(), *notes]).strip()
    result = CriterionResult(
        criterion_id=c.id,
        classification=classification,  # type: ignore[arg-type]
        level=level,  # type: ignore[arg-type]
        recruiter_level=rec_level if c.evaluation_owner != "hiring_manager" else None,  # type: ignore[arg-type]
        hiring_manager_level=hm_level if c.evaluation_owner != "recruiter" else None,  # type: ignore[arg-type]
        match_type=MATCH_TYPE[classification],  # type: ignore[arg-type]
        evidence=evidence,
        gaps=[g.strip() for g in out.gaps if g.strip()][:4],
        reasoning=reasoning,
        recruiter_note=" ".join([out.recruiter_note.strip(), *rec_notes]).strip(),
        hiring_manager_note=out.hiring_manager_note.strip(),
        recruiter_adjustments=rec_notes,
        gap_type=gap,  # type: ignore[arg-type]
        improvement=_improvement(gap, out.improvement),
        tailoring_can_fix=gap == "positioning",
        clarification_question=question,
        rule_results=rules,
    )
    if answer and answer.kind in ("yes", "detail"):
        result = _with_clarification(c, inp, result, lines, reqs_text, answer)
    return result


def _improvement(gap: str, model_text: str) -> str:
    text = model_text.strip()
    default = {
        "qualification": "A genuine gap: describe related experience honestly, or build this skill; rewording won't close it.",
        "evidence": "If you have this experience, add it to the resume in your own words with specifics.",
        "positioning": "The evidence exists but is easy to miss; move it into a role bullet with scope and results.",
        "ats": "Fix the formatting so parsers can read this part of the resume.",
        "none": "",
    }[gap]
    return text or default


def _with_clarification(
    c: HiringCriterion,
    inp: EvalInputs,
    result: CriterionResult,
    lines: str,
    reqs_text: str,
    answer: Answer,
) -> CriterionResult:
    """Re-judge with the candidate's answer, kept separate from resume-based levels."""
    block = (
        "\nCANDIDATE-PROVIDED INFORMATION (not on the resume; the candidate answered a question):\n"
        f"Q: {answer.question}\nA: {answer.text}\n"
    )
    try:
        out = _call(c, inp, lines, reqs_text, block)
    except AppError:
        return result
    classification = (
        out.classification if out.classification != "unknown" else result.classification
    )
    clarified = _snap(out.level, classification)
    ev = CriterionEvidence(
        line_id=f"clarification:{answer.id}", source="clarification", original_text=answer.text
    )
    return result.model_copy(
        update={
            "used_clarification": True,
            "clarified_level": clarified,
            "evidence": [*result.evidence, ev],
            "clarification_question": "",
        }
    )


def _fallback(c: HiringCriterion, inp: EvalInputs, req_ids: list[str]) -> CriterionResult:
    """Model unavailable for this criterion: derive the level from the requirement verdicts."""
    explicit = [inp.assessments[r] for r in c.source_requirement_ids if r in inp.assessments]
    value = {"demonstrated": 4, "partial": 2, "not_demonstrated": 0}
    if not explicit:
        level, classification = "unknown", "unknown"
    else:
        avg = sum(value[a.status] for a in explicit) / len(explicit)
        level = str(round(avg))
        classification = {
            "4": "strong_equivalent",
            "3": "transferable",
            "2": "transferable",
            "1": "weakly_demonstrated",
            "0": "not_demonstrated",
        }[level]
        level = _snap(level, classification)
    evidence_ids = list(dict.fromkeys(req_ids))[:3] if classification != "not_demonstrated" else []
    rec_level, rec_notes = recruiter_level(level, evidence_ids, inp.ctx)
    gap = classify_gap(c, classification, level, "none", evidence_ids, rec_notes, inp)
    evidence = [
        CriterionEvidence(
            line_id=b.line_id,
            source_section=b.source_section,
            source_location=b.source_location,
            original_text=b.evidence,
        )
        for b in inp.evb.build(evidence_ids, c.name)
    ]
    return CriterionResult(
        criterion_id=c.id,
        classification=classification,  # type: ignore[arg-type]
        level=level,  # type: ignore[arg-type]
        recruiter_level=rec_level if c.evaluation_owner != "hiring_manager" else None,  # type: ignore[arg-type]
        hiring_manager_level=level if c.evaluation_owner != "recruiter" else None,  # type: ignore[arg-type]
        match_type=MATCH_TYPE[classification],  # type: ignore[arg-type]
        evidence=evidence,
        reasoning="AI evaluation unavailable for this criterion; level derived from the per-requirement checks.",
        recruiter_adjustments=rec_notes,
        gap_type=gap,  # type: ignore[arg-type]
        improvement=_improvement(gap, ""),
        tailoring_can_fix=gap == "positioning",
        clarification_question=_question(c, "")
        if gap == "evidence" and c.importance in _IMPORTANT
        else "",
        rule_results={"fallback": "derived from requirement verdicts"},
    )
