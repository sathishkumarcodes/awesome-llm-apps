"""Matching-quality eval: compare requirement verdicts against hand labels.

Usage (from backend/):
    .venv/bin/python -m tests.eval.run_eval                       # qwen3:4b via Ollama
    .venv/bin/python -m tests.eval.run_eval --provider anthropic --model claude-haiku-5-5
    .venv/bin/python -m tests.eval.run_eval --cases tests/eval/cases/local   # your own cases

Each case is a JSON file (see cases/*.json): a resume, a job description, and labels. A label
names a phrase that identifies one job requirement and the verdict(s) that count as correct.
"expect": ["partial", "demonstrated"] means partial is ideal and demonstrated is acceptable.
"expect": ["logistics"] means the item can't be judged from a resume and should not be scored.

Runs in-process against a throwaway data directory; your app data is not touched.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="jobmatch-eval-")

RANK = {"not_demonstrated": 0, "partial": 1, "demonstrated": 2}
HERE = Path(__file__).parent


def load_case(path: Path) -> dict:
    case = json.loads(path.read_text())
    case["_path"] = path
    case["resume"] = str((path.parent / case["resume"]).resolve())
    case["job"] = str((path.parent / case["job"]).resolve())
    return case


def run_case(case: dict, with_scorecard: bool = False) -> dict:
    from app.parsing.profile_builder import build_profile
    from app.services import job_service, match_service, resume_service

    resume = Path(case["resume"])
    started = time.monotonic()
    doc = resume_service.parse_file(resume, resume.name, resume.suffix.lstrip(".").lower())
    profile = build_profile(doc)
    try:
        profile = resume_service.enrich_profile(doc, profile)
    except Exception as exc:  # enrichment is optional
        print(f"  resume enrichment skipped: {exc}")
    job = job_service.parse_job(
        Path(case["job"]).read_text(), case.get("company", ""), case.get("job_title", "")
    )
    parse_s = time.monotonic() - started
    result = match_service.run_analysis(doc, profile, job, lambda m: print(f"  · {m}", flush=True))
    run = {"job": job, "result": result, "parse_s": parse_s}
    if with_scorecard:
        from app.scorecards.generator import generate
        from app.services.scorecard_service import build_evaluation

        t0 = time.monotonic()
        card = generate(job, progress=lambda m: print(f"  · {m}", flush=True))
        ev = build_evaluation(card, doc, profile, job, result.requirements)
        run["scorecard"], run["evaluation"] = card, ev
        run["scorecard_s"] = time.monotonic() - t0
    run["total_s"] = time.monotonic() - started
    return run


def score_case(case: dict, run: dict) -> dict:
    job, result = run["job"], run["result"]
    reqs = [a for a in result.requirements if a.kind != "inferred"]
    logistics = list(getattr(result, "logistics", []) or [])
    rows = []
    for label in case["labels"]:
        phrase = label["match"].lower()
        expect = label["expect"]
        hits = [a for a in reqs if phrase in a.text.lower()]
        in_logistics = any(phrase in t.lower() for t in logistics)
        if expect == ["logistics"]:
            got = "logistics" if in_logistics else (hits[0].status if hits else "missing")
            ok = got == "logistics"
            direction = "" if ok else "scored"
        elif not hits:
            got, ok, direction = ("logistics" if in_logistics else "missing"), False, "missing"
        else:
            a = hits[0]
            got = a.status
            ok = got in expect
            best = max(RANK[e] for e in expect)
            direction = "" if ok else ("overclaim" if RANK[got] > best else "underclaim")
        fallback = bool(hits) and hits[0].rationale.startswith("AI assessment unavailable")
        rows.append(
            {
                "match": label["match"],
                "expect": expect,
                "got": got,
                "ok": ok,
                "direction": direction,
                "fallback": fallback,
                "rationale": hits[0].rationale[:160] if hits else "",
            }
        )
    job_checks = []
    for key, want in (case.get("expect_job") or {}).items():
        have = getattr(job, key, None)
        job_checks.append({"field": key, "want": want, "got": have, "ok": have == want})
    sc = None
    if "evaluation" in run:
        card, ev = run["scorecard"], run["evaluation"]
        by_id = {r.criterion_id: r for r in ev.results}
        sc = {
            "decision": ev.recommendation.decision,
            "scores": ev.scores.model_dump(),
            "generated_by": card.generated_by,
            "seconds": round(run["scorecard_s"], 1),
            "criteria": [
                {
                    "name": c.name,
                    "weight": c.weight,
                    "level": by_id[c.id].level,
                    "classification": by_id[c.id].classification,
                    "gap": by_id[c.id].gap_type,
                    "evidence": [e.original_text[:70] for e in by_id[c.id].evidence[:2]],
                }
                for c in card.criteria
            ],
        }
    return {
        "name": case["name"],
        "scorecard": sc,
        "rows": rows,
        "job_checks": job_checks,
        "fallbacks": sum(
            a.rationale.startswith("AI assessment unavailable") for a in result.requirements
        ),
        "assessed": len(result.requirements),
        "overall": result.overall_score,
        "recruiter": result.recruiter.score,
        "hiring_manager": result.hiring_manager.score,
        "decision": result.recommendation.decision,
        "parse_s": round(run["parse_s"], 1),
        "total_s": round(run["total_s"], 1),
    }


def print_report(scores: list[dict], label: str) -> dict:
    tot = {"labels": 0, "correct": 0, "overclaim": 0, "underclaim": 0, "missing": 0, "scored": 0}
    print(f"\n{'=' * 78}\n{label}\n{'=' * 78}")
    for s in scores:
        print(
            f"\n{s['name']}  —  {s['decision']} overall={s['overall']} "
            f"(R {s['recruiter']} / HM {s['hiring_manager']})  "
            f"fallbacks={s['fallbacks']}/{s['assessed']}  time={s['total_s']}s"
        )
        for r in s["rows"]:
            mark = "✓" if r["ok"] else "✗"
            exp = "|".join(r["expect"])
            note = f"  [{r['direction']}]" if r["direction"] else ""
            fb = " (fallback)" if r["fallback"] else ""
            print(f"  {mark} {r['match'][:44]:44} expect {exp:28} got {r['got']}{fb}{note}")
            tot["labels"] += 1
            tot["correct"] += r["ok"]
            if r["direction"]:
                tot[r["direction"]] += 1
        if s.get("scorecard"):
            sc = s["scorecard"]
            sco = sc["scores"]
            print(
                f"  SCORECARD ({sc['generated_by']}, {sc['seconds']}s): {sc['decision']}  "
                f"fit {sco['overall_fit']}  R {sco['recruiter']}  HM {sco['hiring_manager']}  "
                f"ATS {sco['ats_readiness']}  evidence {sco['evidence_completeness']}%"
            )
            for c in sc["criteria"]:
                print(
                    f"    {c['weight']:5}% {c['level']:>7}  {c['classification']:22} {c['gap']:13} {c['name'][:48]}"
                )
        for c in s["job_checks"]:
            mark = "✓" if c["ok"] else "✗"
            print(f"  {mark} job.{c['field']}: want {c['want']!r}, got {c['got']!r}")
    acc = 100 * tot["correct"] / tot["labels"] if tot["labels"] else 0
    print(
        f"\nTOTAL  correct {tot['correct']}/{tot['labels']} ({acc:.0f}%)  "
        f"overclaims {tot['overclaim']}  underclaims {tot['underclaim']}  "
        f"logistics scored {tot['scored']}  unmatched labels {tot['missing']}  "
        f"fallbacks {sum(s['fallbacks'] for s in scores)}  "
        f"time {sum(s['total_s'] for s in scores):.0f}s"
    )
    return {**tot, "accuracy": round(acc, 1)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--provider", default="ollama")
    ap.add_argument("--model", default="qwen3:4b")
    ap.add_argument("--cases", default=str(HERE / "cases"))
    ap.add_argument("--out", default=str(HERE / "results"))
    ap.add_argument("--tag", default="", help="label for this run, e.g. 'baseline'")
    ap.add_argument(
        "--scorecard", action="store_true", help="also build and evaluate the hiring scorecard"
    )
    args = ap.parse_args()

    from app.llm.provider import ModelChoice, pinned

    root = Path(args.cases)
    case_paths = sorted(root.glob("*.json")) or sorted(root.glob("*/case.json"))
    if not case_paths:
        sys.exit(f"No case files in {args.cases}")
    scores = []
    with pinned(ModelChoice(args.provider, args.model)):
        for path in case_paths:
            case = load_case(path)
            print(f"\n▶ {case['name']} ({args.provider}/{args.model})", flush=True)
            scores.append(score_case(case, run_case(case, args.scorecard)))
    title = f"{args.tag or 'run'} · {args.provider}/{args.model}"
    totals = print_report(scores, title)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    name = f"{stamp}-{args.tag or 'run'}-{args.model.replace(':', '_').replace('/', '_')}.json"
    (out / name).write_text(
        json.dumps({"title": title, "totals": totals, "cases": scores}, indent=2, default=str)
    )
    print(f"\nSaved {out / name}")


if __name__ == "__main__":
    main()
