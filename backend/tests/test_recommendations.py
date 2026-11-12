from app.scorecards.recommendations import blockers, clarification_questions, decide
from app.scorecards.schemas import (
    CriterionEvidence,
    CriterionResult,
    EligibilityConstraint,
    HiringCriterion,
    Rubric,
)
from app.scorecards.scoring import compute

R = Rubric(level_5="a", level_4="b", level_3="c", level_2="d", level_1="e")


def C(cid, weight, importance="high", hard=False, explicit=True, owner="both"):
    return HiringCriterion(id=cid, name=f"Criterion {cid}", description="", source_requirement_ids=["R1"], source_requirement_texts=[f"req {cid}"], importance=importance, evaluation_owner=owner, weight=weight, rubric=R, is_hard_requirement=hard, is_explicit=explicit)  # fmt: skip


def Res(cid, level, classification, gap="none", question="", rec=None):
    return CriterionResult(criterion_id=cid, classification=classification, level=level, recruiter_level=rec or level, hiring_manager_level=level, gap_type=gap, clarification_question=question, tailoring_can_fix=gap == "positioning")  # fmt: skip


def run(crit, res, elig=(), answers=None):
    scores = compute(crit, res, 90)
    b = blockers(crit, res, list(elig), answers or {})
    return decide(crit, res, scores, b), b


def test_strong_candidate_applies():
    crit = [C("a", 50), C("b", 50)]
    rec, _ = run(crit, [Res("a", "5", "directly_demonstrated"), Res("b", "4", "directly_demonstrated")])  # fmt: skip
    assert rec.decision == "APPLY"


def test_confirmed_unmet_hard_requirement_overrides_high_score():
    crit = [C("a", 80), C("lic", 20, hard=True)]
    absent = Res("lic", "0", "confirmed_absent", "qualification")
    absent.evidence.append(CriterionEvidence(line_id="clarification:x", source="clarification", original_text="You answered: no"))  # fmt: skip
    rec, b = run(crit, [Res("a", "5", "directly_demonstrated"), absent])
    assert rec.decision == "PROBABLY_SKIP" and b and b[0].requirement_text == "req lic"


def test_missing_evidence_on_hard_requirement_does_not_block():
    crit = [C("a", 80), C("lic", 20, hard=True)]
    rec, b = run(crit, [Res("a", "5", "directly_demonstrated"), Res("lic", "0", "not_demonstrated", "evidence")])  # fmt: skip
    assert not b and rec.decision != "PROBABLY_SKIP"


def test_inferred_criteria_never_block():
    crit = [C("a", 80), C("inf", 20, hard=True, explicit=False)]
    _, b = run(crit, [Res("a", "5", "directly_demonstrated"), Res("inf", "0", "confirmed_absent", "qualification")])  # fmt: skip
    assert not b


def test_unknown_work_authorization_is_not_ineligibility():
    elig = [EligibilityConstraint(id="E1", requirement_id="R9", text="Must be authorized to work in the US")]  # fmt: skip
    crit = [C("a", 100)]
    rec, b = run(crit, [Res("a", "5", "directly_demonstrated")], elig, {})
    assert not b and rec.decision == "APPLY"
    rec2, b2 = run(crit, [Res("a", "5", "directly_demonstrated")], elig, {"E1": "no"})
    assert b2 and rec2.decision == "PROBABLY_SKIP"


def test_needs_clarification_when_answers_could_change_the_decision():
    crit = [C("a", 50), C("b", 50, importance="critical")]
    rec, _ = run(crit, [Res("a", "4", "directly_demonstrated"), Res("b", "0", "not_demonstrated", "evidence", "Have you done B?")])  # fmt: skip
    assert rec.decision == "NEEDS_CLARIFICATION"


def test_weak_candidate_with_keywords_only_does_not_apply():
    # Keywords appear only in a skills list: low levels, recruiter reads them even lower.
    crit = [C(x, 25) for x in "abcd"]
    res = [Res(x, "1", "weakly_demonstrated", "qualification", rec="1") for x in "abcd"]
    rec, _ = run(crit, res)
    assert rec.decision == "PROBABLY_SKIP"


def test_strong_candidate_with_poorly_written_resume_is_told_to_tailor():
    crit = [C(x, 25) for x in "abcd"]
    res = [Res(x, "4", "directly_demonstrated", "positioning", rec="3") for x in "abcd"]
    rec, _ = run(crit, res)
    assert rec.decision == "APPLY_TAILOR_FIRST"


def test_eligibility_questions_are_offered_but_not_scored():
    elig = [EligibilityConstraint(id="E1", requirement_id="R9", text="Travel 40%")]
    qs = clarification_questions([C("a", 100)], [Res("a", "5", "directly_demonstrated")], elig, {}, {})  # fmt: skip
    assert any(q.constraint_id == "E1" for q in qs)
