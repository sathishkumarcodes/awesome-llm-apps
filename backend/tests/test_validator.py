from app.scorecards.schemas import HiringCriterion, ScorecardContent
from app.scorecards.validator import (
    MAX_CRITERIA,
    PoolItem,
    default_rubric,
    is_valid,
    repair,
    validate,
)


def pool(*items):
    return {i.id: i for i in items}


P = pool(
    PoolItem("R1", "must_have", "experience", "5+ years of product management experience."),
    PoolItem("R2", "must_have", "technical", "Experience with SQL and Python."),
    PoolItem("R3", "preferred", "domain", "Experience in fintech."),
    PoolItem("R4", "responsibility", "product", "Own the roadmap for the platform."),
    PoolItem("R5", "must_have", "certification", "Must hold an active PMP certification."),
    PoolItem("S1", "inferred", "other", "Comfort with ambiguity in a fast-growing team."),
)


def C(cid, name, sources, importance="medium", category="other", description=""):
    return HiringCriterion(id=cid, name=name, description=description or name, category=category, source_requirement_ids=sources, importance=importance, evaluation_owner="both", rubric=default_rubric(name))  # fmt: skip


def test_drops_criteria_without_real_requirements():
    out, checks = repair([C("a", "Roadmap", ["R4"]), C("b", "Made up", ["R99"])], P)
    assert [c.name for c in out if c.name == "Made up"] == []
    assert next(v for v in checks if v.name == "supported").fixed


def test_removes_protected_characteristic_criteria():
    out, checks = repair([C("a", "Roadmap", ["R4"]), C("b", "Young, energetic digital native", ["R1"])], P)  # fmt: skip
    assert all("digital native" not in c.name.lower() for c in out)
    assert next(v for v in checks if v.name == "protected").fixed


def test_merges_overlapping_criteria():
    out, _ = repair([C("a", "Product strategy and roadmap", ["R4"]), C("b", "Roadmap ownership", ["R4"])], P)  # fmt: skip
    roadmap = [c for c in out if "R4" in c.source_requirement_ids]
    assert len(roadmap) == 1


def test_covers_every_explicit_requirement():
    out, _ = repair([C("a", "Roadmap", ["R4"])], P)
    covered = {r for c in out for r in c.source_requirement_ids}
    assert {"R1", "R2", "R3", "R5"} <= covered


def test_inferred_only_is_labeled_and_never_hard():
    out, _ = repair([C("a", "Ambiguity", ["S1"], importance="critical")], P)
    amb = next(c for c in out if c.source_requirement_ids == ["S1"])
    assert not amb.is_explicit and amb.importance == "medium" and not amb.is_hard_requirement


def test_must_have_criteria_are_at_least_high_and_preferred_at_most_medium():
    out, _ = repair([C("a", "Years", ["R1"], importance="low"), C("b", "Fintech", ["R3"], importance="critical")], P)  # fmt: skip
    by = {c.source_requirement_ids[0]: c for c in out}
    assert by["R1"].importance == "high"
    assert by["R3"].importance == "medium"


def test_only_non_negotiable_must_haves_are_hard():
    out, _ = repair([C("a", "PMP", ["R5"], category="certification"), C("b", "SQL", ["R2"])], P)
    by = {c.source_requirement_ids[0]: c for c in out}
    assert by["R5"].is_hard_requirement
    assert not by["R2"].is_hard_requirement


def test_caps_criteria_count():
    many = {f"R{i}": PoolItem(f"R{i}", "must_have", "technical", f"Skill number {i} required") for i in range(20)}  # fmt: skip
    crits = [C(f"c{i}", f"Distinct capability {i}", [f"R{i}"]) for i in range(20)]
    out, _ = repair(crits, many)
    assert len(out) <= MAX_CRITERIA


def test_full_validation_produces_valid_scorecard():
    card = ScorecardContent(criteria=[C("a", "Roadmap", ["R4"]), C("b", "Experience", ["R1"], category="experience")])  # fmt: skip
    out = validate(card, P)
    assert is_valid(out)
    assert abs(sum(c.weight for c in out.criteria) - 100) < 1e-6
    assert all(c.source_rule_ids for c in out.criteria)
    assert [c.id for c in out.criteria] == [f"C{i}" for i in range(1, len(out.criteria) + 1)]
