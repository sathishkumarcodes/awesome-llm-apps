"""Turn one of your analyses into an eval case you can label.

Usage (from backend/, with the backend running):
    .venv/bin/python -m tests.eval.make_case <match_id> [--api http://127.0.0.1:8000/api]

Writes tests/eval/cases/local/<name>/ with your resume, the job text, and case.json whose labels
are pre-filled with the app's current verdicts. Edit each "expect" to what YOU judge correct
(list several values when more than one is acceptable, or ["logistics"] for conditions a resume
can't show), delete the "current" hints, then run:
    .venv/bin/python -m tests.eval.run_eval --cases tests/eval/cases/local/<name>

The local/ folder is git-ignored: it contains your personal resume.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent


def get(url: str):
    with urllib.request.urlopen(url) as f:
        return json.load(f)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("match_id")
    ap.add_argument("--api", default="http://127.0.0.1:8000/api")
    args = ap.parse_args()

    m = get(f"{args.api}/matches/{args.match_id}")
    if not m.get("result"):
        raise SystemExit("That analysis has no result yet.")
    job = get(f"{args.api}/jobs/{m['job_id']}")
    resume = get(f"{args.api}/resumes/{m['resume_id']}")
    slug = re.sub(r"[^a-z0-9]+", "-", f"{job['title']} {job['company']}".lower()).strip("-")[:60]
    folder = HERE / "cases" / "local" / slug
    folder.mkdir(parents=True, exist_ok=True)

    resume_name = f"resume.{resume['file_type']}"
    with (
        urllib.request.urlopen(f"{args.api}/resumes/{m['resume_id']}/file") as f,
        open(folder / resume_name, "wb") as out,
    ):
        shutil.copyfileobj(f, out)
    (folder / "job.txt").write_text(job["description"])

    labels = []
    for a in m["result"]["requirements"]:
        if a["kind"] == "inferred":
            continue
        labels.append(
            {
                "match": a["text"][:60],
                "expect": [a["status"]],
                "current": f"{a['status']} — {a['rationale'][:120]}",
            }
        )
    labels += [
        {"match": t[:60], "expect": ["logistics"], "current": "logistics"}
        for t in m["result"].get("logistics", [])
    ]
    case = {
        "name": f"{resume['filename']} × {job['title']}",
        "resume": resume_name,
        "job": "job.txt",
        "job_title": job["title"],
        "company": job["company"],
        "expect_job": {"seniority_level": job["profile"]["seniority_level"]},
        "labels": labels,
    }
    (folder / "case.json").write_text(json.dumps(case, indent=2))
    print(
        f"Wrote {folder / 'case.json'} with {len(labels)} labels. Edit the 'expect' values, then run:"
    )
    print(
        f"  .venv/bin/python -m tests.eval.run_eval --cases {folder.relative_to(HERE.parent.parent)}"
    )


if __name__ == "__main__":
    main()
