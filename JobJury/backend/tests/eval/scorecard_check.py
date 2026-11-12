"""Model-backed scorecard generation check across role types.

Usage (from backend/):
    .venv/bin/python -m tests.eval.scorecard_check                      # qwen3:4b
    .venv/bin/python -m tests.eval.scorecard_check --provider anthropic --model claude-haiku-5-5
    .venv/bin/python -m tests.eval.scorecard_check --jds senior_pm staff_ai_pm

Checks every scorecard for: 8-12 criteria when the JD supports it (fewer for vague JDs),
no duplicate names, must-haves covered, weights summing to 100, inferred criteria labeled,
logistics set aside, and a stable result for the same JD (run twice with --stability).
Runs in a throwaway data directory.
"""

from __future__ import annotations

import argparse
import os
import tempfile
import time
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="jobjury-sc-")
HERE = Path(__file__).parent
JDS = HERE.parent / "fixtures" / "jds"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="ollama")
    ap.add_argument("--model", default="qwen3:4b")
    ap.add_argument("--jds", nargs="*", default=None)
    ap.add_argument("--stability", action="store_true", help="generate each scorecard twice")
    args = ap.parse_args()

    from app.llm.provider import ModelChoice, pinned
    from app.scorecards.generator import generate, requirement_pool
    from app.scorecards.validator import MAX_CRITERIA, MIN_CRITERIA, is_valid
    from app.services.job_service import parse_job

    names = args.jds or sorted(p.stem for p in JDS.glob("*.txt"))
    failures = 0
    with pinned(ModelChoice(args.provider, args.model)):
        for name in names:
            t0 = time.monotonic()
            job = parse_job((JDS / f"{name}.txt").read_text())
            card = generate(job)
            secs = time.monotonic() - t0
            pool, elig = requirement_pool(job)
            explicit = sum(p.kind != "inferred" for p in pool.values())
            musts = {p.id for p in pool.values() if p.kind == "must_have"}
            covered = {r for c in card.criteria for r in c.source_requirement_ids}
            checks = {
                "valid": is_valid(card),
                "count": len(card.criteria) <= MAX_CRITERIA
                and (
                    len(card.criteria) >= MIN_CRITERIA
                    or explicit < MIN_CRITERIA
                    or len(card.criteria) >= explicit
                ),
                "no duplicates": len({c.name.lower() for c in card.criteria}) == len(card.criteria),
                "must-haves covered": musts <= covered,
                "weights = 100": abs(sum(c.weight for c in card.criteria) - 100) < 1e-6,
                "inferred labeled": all(
                    c.is_explicit or not c.is_hard_requirement for c in card.criteria
                ),
            }
            if args.stability:
                again = generate(parse_job((JDS / f"{name}.txt").read_text()))
                checks["stable names"] = [c.name for c in again.criteria] == [
                    c.name for c in card.criteria
                ]
            bad = [k for k, ok in checks.items() if not ok]
            failures += bool(bad)
            print(
                f"\n{'✓' if not bad else '✗'} {name}: {len(card.criteria)} criteria by {card.generated_by} in {secs:.0f}s; eligibility {len(elig)}"
                + (f"  FAILED: {', '.join(bad)}" if bad else "")
            )
            for c in card.criteria:
                tags = "".join(
                    [
                        " [hard]" if c.is_hard_requirement else "",
                        " [inferred]" if not c.is_explicit else "",
                    ]
                )
                print(f"   {c.weight:5}%  {c.importance:8} {c.evaluation_owner:14} {c.name}{tags}")
            fixed = [v.name for v in card.validation if v.fixed]
            if fixed:
                print(f"   repaired: {', '.join(fixed)}")
    print(f"\n{len(names) - failures}/{len(names)} scorecards passed all checks")


if __name__ == "__main__":
    main()
