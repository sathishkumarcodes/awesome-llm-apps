"""Deterministic criterion weights.

The model rates each criterion's importance; code turns that into weights so the same
scorecard always produces the same numbers. Rules:
  * importance sets the base (critical > high > medium > low);
  * criteria backed by explicit must-haves outrank responsibilities, which outrank
    preferred-only and inferred-only criteria;
  * preferred-only criteria share at most 25% of the total, inferred-only at most 15%,
    and no single criterion exceeds 25%;
  * weights are percentages rounded to 0.1 that sum to exactly 100.
"""

from __future__ import annotations

from app.scorecards.schemas import HiringCriterion

BASE = {"critical": 10.0, "high": 7.0, "medium": 4.0, "low": 2.0}
BASIS_MULT = {"must_have": 1.0, "responsibility": 0.85, "preferred": 0.6, "inferred": 0.5}
CAPS = {"preferred": 25.0, "inferred": 15.0}
MAX_SINGLE = 25.0

CONFIG = {
    "base": BASE,
    "basis_multiplier": BASIS_MULT,
    "group_caps": CAPS,
    "max_single": MAX_SINGLE,
}


def basis(c: HiringCriterion, kinds: dict[str, str]) -> str:
    """The strongest kind of requirement behind a criterion."""
    ks = {kinds.get(rid, "inferred") for rid in c.source_requirement_ids}
    for k in ("must_have", "responsibility", "preferred"):
        if k in ks:
            return k
    return "inferred"


def raw_weight(c: HiringCriterion, kinds: dict[str, str]) -> float:
    breadth = 1 + 0.05 * min(max(len(c.source_requirement_ids) - 1, 0), 4)
    return BASE[c.importance] * BASIS_MULT[basis(c, kinds)] * breadth


def _apply_caps(shares: list[float], groups: list[str]) -> list[float]:
    """Enforce group caps strictly, then the single-criterion cap where there is room.

    Excess from a capped group goes to criteria outside every capped group; excess from an
    oversized criterion goes to criteria that are under the cap and not in a full group. When
    nowhere can absorb it (very few explicit criteria), the single cap gives way."""
    total = sum(shares) or 1.0
    shares = [100 * s / total for s in shares]
    capped_groups = set(CAPS)
    for _ in range(50):
        changed = False
        for group, cap in CAPS.items():
            idx = [i for i, g in enumerate(groups) if g == group]
            g_total = sum(shares[i] for i in idx)
            free = [i for i, g in enumerate(groups) if g not in capped_groups]
            if idx and free and g_total > cap + 1e-9:
                excess = g_total - cap
                for i in idx:
                    shares[i] *= cap / g_total
                f_total = sum(shares[i] for i in free) or 1.0
                for i in free:
                    shares[i] += excess * shares[i] / f_total
                changed = True
        full = {
            g
            for g, cap in CAPS.items()
            if sum(shares[i] for i, x in enumerate(groups) if x == g) >= cap - 1e-9
        }
        over = [i for i, s in enumerate(shares) if s > MAX_SINGLE + 1e-9]
        room = [i for i, s in enumerate(shares) if s < MAX_SINGLE - 1e-9 and groups[i] not in full]
        if over and room:
            excess = sum(shares[i] - MAX_SINGLE for i in over)
            for i in over:
                shares[i] = MAX_SINGLE
            r_total = sum(shares[i] for i in room) or 1.0
            for i in room:
                shares[i] += excess * shares[i] / r_total
            changed = True
        if not changed:
            break
    return shares


def _round_to_100(shares: list[float]) -> list[float]:
    """Round to 0.1 so the result sums to exactly 100.0 (largest-remainder method)."""
    tenths = [s * 10 for s in shares]
    floors = [int(t) for t in tenths]
    remainder = 1000 - sum(floors)
    order = sorted(range(len(shares)), key=lambda i: tenths[i] - floors[i], reverse=True)
    for i in order[:remainder]:
        floors[i] += 1
    return [f / 10 for f in floors]


def assign_weights(criteria: list[HiringCriterion], kinds: dict[str, str]) -> list[HiringCriterion]:
    """Return criteria with ``weight`` set (percent, summing to 100) and the basis explained."""
    if not criteria:
        return []
    raws = [raw_weight(c, kinds) for c in criteria]
    groups = [basis(c, kinds) for c in criteria]
    total = sum(raws)
    shares = _apply_caps([100 * r / total for r in raws], groups)
    weights = _round_to_100(shares)
    out = []
    label = {
        "must_have": "explicit required",
        "responsibility": "core responsibility",
        "preferred": "preferred",
        "inferred": "inferred",
    }
    for c, w, g in zip(criteria, weights, groups, strict=True):
        note = f"Weight {w:g}%: {c.importance} importance, based on {label[g]} requirements."
        rationale = c.rationale.split(" Weight ")[0].strip()
        out.append(c.model_copy(update={"weight": w, "rationale": f"{rationale} {note}".strip()}))
    return out
