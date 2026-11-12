import pytest

from app.scorecards.schemas import HiringCriterion, Rubric
from app.scorecards.weighting import CAPS, MAX_SINGLE, assign_weights

R = Rubric(level_5="a", level_4="b", level_3="c", level_2="d", level_1="e")


def C(cid, importance, sources):
    return HiringCriterion(id=cid, name=cid, description="", source_requirement_ids=sources, importance=importance, evaluation_owner="both", rubric=R)  # fmt: skip


KINDS = {**{f"M{i}": "must_have" for i in range(10)}, **{f"P{i}": "preferred" for i in range(10)},
         **{f"T{i}": "responsibility" for i in range(10)}, **{f"S{i}": "inferred" for i in range(10)}}  # fmt: skip


def realistic():
    return [C("a", "critical", ["M0", "M1"]), C("b", "high", ["M2"]), C("c", "high", ["T0", "T1"]),
            C("d", "medium", ["M3"]), C("e", "critical", ["M4"]), C("f", "high", ["P0"]),
            C("g", "medium", ["P1", "P2"]), C("h", "high", ["S0"]), C("i", "low", ["T2"])]  # fmt: skip


def test_weights_sum_to_exactly_100():
    w = assign_weights(realistic(), KINDS)
    assert sum(c.weight for c in w) == pytest.approx(100.0, abs=1e-9)
    assert all(round(c.weight, 1) == c.weight for c in w)


def test_group_caps_hold():
    many_pref = realistic() + [C(f"p{i}", "high", [f"P{i + 3}"]) for i in range(4)]
    w = assign_weights(many_pref, KINDS)
    pref = sum(
        c.weight for c in w if all(KINDS[s] == "preferred" for s in c.source_requirement_ids)
    )
    inferred = sum(
        c.weight for c in w if all(KINDS[s] == "inferred" for s in c.source_requirement_ids)
    )
    assert pref <= CAPS["preferred"] + 0.1
    assert inferred <= CAPS["inferred"] + 0.1


def test_no_single_criterion_dominates_when_feasible():
    w = assign_weights(realistic(), KINDS)
    assert max(c.weight for c in w) <= MAX_SINGLE + 0.1


def test_required_outweighs_preferred_at_same_importance():
    w = {c.id: c.weight for c in assign_weights([C("req", "high", ["M0"]), C("pref", "high", ["P0"]), C("x", "high", ["M1"])], KINDS)}  # fmt: skip
    assert w["req"] > w["pref"]


def test_deterministic():
    a = [c.weight for c in assign_weights(realistic(), KINDS)]
    b = [c.weight for c in assign_weights(realistic(), KINDS)]
    assert a == b


def test_rationale_explains_weight():
    w = assign_weights(realistic(), KINDS)
    assert all(f"Weight {c.weight:g}%" in c.rationale for c in w)
