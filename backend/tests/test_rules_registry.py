import importlib

from app.rules.registry import BY_ID, FACTUALITY_RULE, RULES


def test_rule_ids_are_unique_and_well_formed():
    ids = [r.id for r in RULES]
    assert len(ids) == len(set(ids))
    for r in RULES:
        assert r.id.startswith(r.family + "-")
        assert r.name and r.description


def test_every_rule_points_at_real_code():
    for r in RULES:
        module, attr = r.implemented_in.split(":")
        mod = importlib.import_module(module)
        assert hasattr(mod, attr), f"{r.id}: {r.implemented_in} does not exist"


def test_factuality_issue_kinds_map_to_tr_rules():
    from typing import get_args

    from app.schemas.tailoring import FactualityIssue

    kinds = get_args(FactualityIssue.model_fields["kind"].annotation)
    for k in kinds:
        assert FACTUALITY_RULE[k] in BY_ID
