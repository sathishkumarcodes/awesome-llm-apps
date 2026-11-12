import pytest

from app.scorecards.generator import generate, requirement_pool
from app.scorecards.validator import MAX_CRITERIA, MIN_CRITERIA, is_valid, tokens
from tests.conftest import FIXTURES, parse_job_without_llm

JDS = ["senior_pm", "staff_ai_pm", "software_engineer", "data_scientist", "sales_manager",
       "operations_manager", "short_vague", "contradictory"]  # fmt: skip


def job(name):
    return parse_job_without_llm((FIXTURES / "jds" / f"{name}.txt").read_text())


@pytest.mark.parametrize("name", JDS)
def test_scorecard_is_valid_for_every_role(name, no_llm):
    j = job(name)
    card = generate(j)  # model unavailable -> deterministic generator
    pool, _ = requirement_pool(j)
    assert is_valid(card), [v for v in card.validation if not v.passed]
    assert abs(sum(c.weight for c in card.criteria) - 100) < 1e-6
    explicit = [p for p in pool.values() if p.kind in ("must_have", "preferred", "responsibility")]
    assert len(card.criteria) <= MAX_CRITERIA
    assert len(card.criteria) >= min(MIN_CRITERIA, len(explicit)) or len(card.criteria) == len(explicit)  # fmt: skip
    covered = {r for c in card.criteria for r in c.source_requirement_ids}
    musts = {p.id for p in pool.values() if p.kind == "must_have"}
    assert musts <= covered, "every must-have is covered"
    assert len({c.name for c in card.criteria}) == len(card.criteria), "no duplicate criteria"
    assert all(c.rubric.level_5 and c.source_rule_ids for c in card.criteria)


def test_short_vague_jd_gets_fewer_criteria_not_padding(no_llm):
    card = generate(job("short_vague"))
    assert len(card.criteria) < MIN_CRITERIA
    assert any(v.name == "count" and "rather than invented" in v.detail for v in card.validation)


def test_logistics_become_eligibility_constraints(no_llm):
    card = generate(job("sales_manager"))
    texts = " ".join(e.text for e in card.eligibility)
    assert "travel" in texts.lower() and "license" in texts.lower()
    assert not any("travel" in t.lower() for c in card.criteria for t in c.source_requirement_texts)


def test_contradictory_jd_still_validates_and_flags_hard_credential(no_llm):
    card = generate(job("contradictory"))
    assert is_valid(card)
    assert any(c.is_hard_requirement for c in card.criteria), "active PMP certification is hard"


def test_same_jd_same_scorecard(no_llm):
    a = generate(job("staff_ai_pm"))
    b = generate(job("staff_ai_pm"))
    assert a.model_dump() == b.model_dump()


def test_scorecard_does_not_take_a_resume():
    import inspect

    assert "resume" not in " ".join(inspect.signature(generate).parameters)


def test_model_draft_is_repaired(fake_llm):
    """A sloppy model draft (duplicate criteria, a fake id, a protected term, missing
    must-haves) comes out consolidated, covered and clean."""
    j = job("staff_ai_pm")
    pool, _ = requirement_pool(j)
    ids = list(pool)

    def handler(system, user, schema):
        if "design a hiring scorecard" in system:
            return {"role_family": "Product", "summary": "AI PM", "criteria": [
                {"name": "AI product strategy", "source_requirement_ids": [ids[0]], "importance": "critical", "evaluation_owner": "both", "category": "product"},
                {"name": "AI product strategy and roadmap", "source_requirement_ids": [ids[0]], "importance": "high", "evaluation_owner": "hiring_manager", "category": "product"},
                {"name": "Invented thing", "source_requirement_ids": ["R999"], "importance": "high", "evaluation_owner": "both"},
                {"name": "Young digital native", "source_requirement_ids": [ids[1]], "importance": "medium", "evaluation_owner": "both"},
            ]}  # fmt: skip
        if "evaluation rubric" in system:
            return {"level_5": "five", "level_4": "four", "level_3": "three", "level_2": "two", "level_1": "one", "recruiter_guidance": "r", "hiring_manager_guidance": "h"}  # fmt: skip
        return None

    fake_llm.handler = handler
    card = generate(j)
    assert card.generated_by == "model"
    names = [c.name.lower() for c in card.criteria]
    assert not any("invented" in n or "digital native" in n for n in names)
    assert sum("ai product strategy" in n for n in names) == 1
    musts = {p.id for p in pool.values() if p.kind == "must_have"}
    assert musts <= {r for c in card.criteria for r in c.source_requirement_ids}
    assert any(c.rubric.level_5 == "five" for c in card.criteria)
    assert is_valid(card)


def test_tokens_helper():
    assert "roadmap" in tokens("Own the roadmap.")


def test_coarse_model_draft_is_split_to_minimum(fake_llm):
    """A model draft with too few, broad criteria is split (not padded) to 8 for a detailed JD."""
    j = job("staff_ai_pm")
    pool, _ = requirement_pool(j)
    explicit = [p.id for p in pool.values() if p.kind != "inferred"]

    def handler(system, user, schema):
        if "design a hiring scorecard" in system:
            half = len(explicit) // 2
            return {"criteria": [
                {"name": "AI product leadership", "source_requirement_ids": explicit[:half], "importance": "critical", "evaluation_owner": "both"},
                {"name": "Technical delivery", "source_requirement_ids": explicit[half:], "importance": "high", "evaluation_owner": "both"},
            ]}  # fmt: skip
        return None

    fake_llm.handler = handler
    card = generate(j)
    assert len(card.criteria) >= MIN_CRITERIA
    assert is_valid(card)
