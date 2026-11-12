import pytest

from app.scorecards.perspectives import EvidenceContext, bound_level, recruiter_level
from app.scorecards.schemas import CriterionResult, HiringCriterion, Rubric
from app.scorecards.scoring import compute

R = Rubric(level_5="a", level_4="b", level_3="c", level_2="d", level_1="e")


def C(cid, weight, owner="both", importance="high"):
    return HiringCriterion(id=cid, name=cid, description="", source_requirement_ids=["R1"], importance=importance, evaluation_owner=owner, weight=weight, rubric=R)  # fmt: skip


def Res(cid, level, classification="directly_demonstrated", rec=None, hm=None):
    return CriterionResult(criterion_id=cid, classification=classification, level=level, recruiter_level=rec if rec is not None else level, hiring_manager_level=hm if hm is not None else level)  # fmt: skip


def test_weighted_score_formula():
    crit = [C("a", 60), C("b", 40)]
    s = compute(crit, [Res("a", "5"), Res("b", "2", "transferable")], ats_readiness=80)
    assert s.overall_fit == pytest.approx(100 * (60 * 1.0 + 40 * 0.4) / 100)


def test_unknown_is_excluded_not_zero():
    crit = [C("a", 50), C("b", 50)]
    s = compute(crit, [Res("a", "4", "strong_equivalent"), Res("b", "unknown", "unknown")], 0)
    assert s.overall_fit == 80.0
    assert s.evidence_completeness == 50.0
    assert s.provisional


def test_not_demonstrated_scores_zero_but_is_not_confirmed():
    crit = [C("a", 50), C("b", 50)]
    s = compute(crit, [Res("a", "5"), Res("b", "0", "not_demonstrated")], 0)
    assert s.overall_fit == 50.0
    assert s.evidence_completeness == 50.0


def test_perspectives_use_their_own_criteria_once():
    crit = [C("a", 40, "recruiter"), C("b", 40, "hiring_manager"), C("c", 20, "both")]
    res = [Res("a", "5"), Res("b", "1", "weakly_demonstrated"), Res("c", "3", "transferable", rec="2", hm="3")]  # fmt: skip
    s = compute(crit, res, 0)
    assert s.recruiter == pytest.approx(100 * (40 * 1.0 + 20 * 0.4) / 60, abs=0.1)
    assert s.hiring_manager == pytest.approx(100 * (40 * 0.2 + 20 * 0.6) / 60, abs=0.1)
    assert s.overall_fit == pytest.approx(40 * 1.0 + 40 * 0.2 + 20 * 0.6, abs=0.1)


def test_same_results_same_scores():
    crit = [C("a", 70), C("b", 30)]
    res = [Res("a", "3", "transferable"), Res("b", "4", "strong_equivalent")]
    assert compute(crit, res, 50) == compute(crit, res, 50)


def test_bound_level_keeps_within_one_step():
    assert bound_level("3", "5") == ("4", True)
    assert bound_level("3", "1") == ("2", True)
    assert bound_level("3", "4") == ("4", False)
    assert bound_level("unknown", "4")[0] == "unknown"


def test_recruiter_reads_skills_list_and_stale_evidence_lower():
    ctx = EvidenceContext(section={"L1": "skills", "L2": "experience"}, end_year={"L2": 2010})
    assert recruiter_level("4", ["L1"], ctx)[0] == "3"  # skills list only
    assert recruiter_level("4", ["L2"], ctx)[0] == "3"  # role ended long ago
    ctx.end_year["L3"] = 2026
    ctx.section["L3"] = "experience"
    assert recruiter_level("4", ["L3"], ctx) == ("4", [])
