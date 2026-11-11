"""Change report (Markdown): original, new text, reason, evidence, factuality status."""

from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.tailoring import Change

STATUS_LABEL = {
    "SUPPORTED": "✓ Supported by resume evidence",
    "PARTIALLY_SUPPORTED": "⚠ Partially supported — reviewed by you",
    "UNSUPPORTED": "✕ Unsupported — rejected",
}


def build_report(
    version_name: str,
    original_filename: str,
    job_label: str,
    mode: str,
    changes: list[Change],
    line_texts: dict[str, str],
    notes: list[str],
) -> str:
    out = [
        f"# Change report — {version_name}",
        "",
        f"- Original resume: {original_filename}",
        f"- Target job: {job_label}",
        f"- Tailoring mode: {mode}",
        f"- Generated: {datetime.now(UTC):%Y-%m-%d %H:%M UTC}",
        "",
        "Every change below was checked against the original resume. Only changes marked "
        "**Included** are in the exported file.",
        "",
    ]
    if notes:
        out += ["## Export notes", "", *[f"- {n}" for n in notes], ""]
    for c in changes:
        fact = c.factuality
        status = STATUS_LABEL.get(fact.status if fact else "UNSUPPORTED", "")
        included = (
            "Included"
            if c.decision == "accepted"
            else (
                "Not included (rejected)"
                if c.decision == "rejected"
                else "Not included (pending review)"
            )
        )
        out += [
            f"## {c.id} · {c.type} · {c.section} — {included}",
            "",
            "**Original**",
            "",
            *[f"> {line}" for line in c.original.splitlines()],
            "",
            "**Tailored**" + (" (edited by you)" if c.user_edited else ""),
            "",
            *[f"> {line}" for line in c.proposed.splitlines()],
            "",
            f"**Reason:** {c.reason or '—'}",
            "",
            f"**Factuality:** {status}",
        ]
        if fact and fact.llm_explanation:
            out.append(f"  - Validator: {fact.llm_explanation}")
        for issue in fact.issues if fact else []:
            out.append(f"  - {issue.detail}")
        evidence = [line_texts[i] for i in c.supporting_line_ids if i in line_texts]
        if evidence:
            out += [
                "",
                "**Evidence from your original resume:**",
                *[f"- {e}" for e in evidence[:5]],
            ]
        out.append("")
    return "\n".join(out)
