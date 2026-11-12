"""Criterion evaluation guardrails, with a scripted model."""

import pytest

from app.scorecards.evaluator import Answer, EvalInputs, evaluate_criterion
from app.scorecards.perspectives import EvidenceContext
from app.scorecards.schemas import HiringCriterion
from app.scorecards.validator import default_rubric
from app.scoring.evidence import EvidenceBuilder
from app.scoring.semantic import SemanticIndex


@pytest.fixture
def inputs(sample_doc):
    from tests.conftest import FIXTURES, parse_job_without_llm

    doc, profile = sample_doc
    job = parse_job_without_llm((FIXTURES / "sample_job.txt").read_text())
    return EvalInputs(job=job, evb=EvidenceBuilder(doc, profile), index=SemanticIndex(doc.lines),
                      ctx=EvidenceContext.build(doc, profile), assessments={}, diagnostics=[])  # fmt: skip


def crit(owner="both", explicit=True, importance="high"):
    return HiringCriterion(id="C1", name="Payment integrity domain", description="Healthcare payment integrity experience", category="domain", source_requirement_ids=["R1"], source_requirement_texts=["Experience in payment integrity."], importance=importance, evaluation_owner=owner, rubric=default_rubric("payment integrity"), is_explicit=explicit)  # fmt: skip


def reply(**kw):
    base = {"classification": "directly_demonstrated", "level": "5", "hiring_manager_level": "5", "evidence": [], "gaps": [], "reasoning": "r", "recruiter_note": "", "hiring_manager_note": "", "gap_type": "none", "improvement": "", "clarification_question": ""}  # fmt: skip
    return {**base, **kw}


def script(fake, **kw):
    fake.handler = lambda s, u, schema: reply(**kw) if "ONE hiring criterion" in s else None


def test_credit_requires_a_cited_real_line(fake_llm, inputs):
    script(fake_llm, evidence=[{"line_id": "L9999", "strength": "strong"}])
    r = evaluate_criterion(crit(), inputs)
    assert r.classification == "not_demonstrated" and r.level == "0" and not r.evidence
    assert r.gap_type == "evidence" and r.clarification_question.endswith("?")


def test_cited_line_is_verbatim_resume_text(fake_llm, inputs):
    script(fake_llm, evidence=[{"line_id": "L0008", "strength": "strong"}])
    r = evaluate_criterion(crit(), inputs)
    assert r.classification == "directly_demonstrated" and r.level == "5"
    assert r.evidence[0].original_text == inputs.evb.text("L0008")


def test_level_snaps_to_classification(fake_llm, inputs):
    script(fake_llm, classification="transferable", level="5", evidence=[{"line_id": "L0008"}])
    r = evaluate_criterion(crit(), inputs)
    assert r.level == "3"


def test_confirmed_absent_needs_the_candidates_answer(fake_llm, inputs):
    script(fake_llm, classification="confirmed_absent", level="0")
    r = evaluate_criterion(crit(), inputs)
    assert r.classification == "not_demonstrated"


def test_no_answer_confirms_a_gap_without_calling_the_model(fake_llm, inputs):
    inputs.answers["C1"] = Answer("a1", "no", "No, I haven't.")
    r = evaluate_criterion(crit(), inputs)
    assert (
        r.classification == "confirmed_absent" and r.level == "0" and r.gap_type == "qualification"
    )
    assert not fake_llm.calls


def test_hiring_manager_level_is_bounded(fake_llm, inputs):
    script(fake_llm, classification="transferable", level="3", hiring_manager_level="5", evidence=[{"line_id": "L0008"}])  # fmt: skip
    r = evaluate_criterion(crit(), inputs)
    assert r.hiring_manager_level == "4"


def test_skills_list_only_reads_lower_to_recruiter_and_is_positioning(fake_llm, inputs):
    skills_line = next(ln.id for ln in inputs.evb.lines.values() if ln.section == "skills" and ln.kind != "heading")  # fmt: skip
    script(fake_llm, classification="strong_equivalent", level="4", evidence=[{"line_id": skills_line}])  # fmt: skip
    r = evaluate_criterion(crit(), inputs)
    assert r.level == "4" and r.recruiter_level == "3"
    assert r.gap_type == "positioning" and r.tailoring_can_fix


def test_owner_controls_which_perspective_levels_exist(fake_llm, inputs):
    script(fake_llm, evidence=[{"line_id": "L0008"}])
    assert evaluate_criterion(crit(owner="recruiter"), inputs).hiring_manager_level is None
    assert evaluate_criterion(crit(owner="hiring_manager"), inputs).recruiter_level is None


def test_clarification_answer_is_kept_separate(fake_llm, inputs):
    inputs.answers["C1"] = Answer("a2", "detail", "I ran claims audits at a payer for 2 years.", "Q?")  # fmt: skip
    calls = []

    def handler(s, u, schema):
        if "ONE hiring criterion" not in s:
            return None
        calls.append(u)
        if "CANDIDATE-PROVIDED" in u:
            return reply(classification="strong_equivalent", level="4")
        return reply(classification="not_demonstrated", level="0")

    fake_llm.handler = handler
    r = evaluate_criterion(crit(), inputs)
    assert r.level == "0", "resume-based level ignores the answer"
    assert r.clarified_level == "4" and r.used_clarification
    assert any(e.source == "clarification" for e in r.evidence)


def test_model_failure_falls_back_to_requirement_verdicts(no_llm, inputs):
    r = evaluate_criterion(crit(), inputs)
    assert r.rule_results.get("fallback")
