"""PDF export: best-effort in-place text replacement with PyMuPDF.

For each accepted text change we redact the original glyphs of that line and write the new
text into the same box using the closest standard font (PDF resume fonts are usually
embedded subsets that lack the glyphs needed for new text). If the new text can't fit in the
original space (even at up to 12% smaller size) the change is NOT applied and is reported —
we never silently produce an overflowing or overlapping layout.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pymupdf

from app.schemas.document import DocLine, PdfSpan, ResumeDocument
from app.schemas.tailoring import Change

BEST_EFFORT_NOTE = (
    "Best-effort formatting preservation: changed lines are re-typeset in the closest standard "
    "font (Helvetica, Times or Courier) at the original size and position. Unchanged content is "
    "byte-for-byte untouched."
)
SCALES = (1.0, 0.96, 0.92, 0.88)


def base14(span: PdfSpan) -> str:
    name = span.font.lower()
    bold = bool(span.flags & 16) or any(k in name for k in ("bold", "black", "semibold", "heavy"))
    italic = bool(span.flags & 2) or "italic" in name or "oblique" in name
    if span.flags & 8 or "courier" in name or "mono" in name:
        family = ("cour", "cobo", "coit", "cobi")
    elif span.flags & 4 or any(
        k in name for k in ("times", "serif", "georgia", "garamond", "cambria", "book")
    ):
        family = ("tiro", "tibo", "tiit", "tibi")
    else:
        family = ("helv", "hebo", "heit", "hebi")
    return family[(2 if italic else 0) + (1 if bold else 0)]


def rgb(color: int) -> tuple[float, float, float]:
    return ((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255


@dataclass
class Plan:
    change: Change
    line: DocLine
    rect: pymupdf.Rect
    font: str
    size: float
    lineheight: float
    color: tuple[float, float, float]


def _fits(rect: pymupdf.Rect, text: str, font: str, size: float, lineheight: float) -> bool:
    scratch = pymupdf.open()
    page = scratch.new_page(width=rect.x1 + 10, height=rect.y1 + 10)
    rc = page.insert_textbox(rect, text, fontname=font, fontsize=size, lineheight=lineheight)
    scratch.close()
    return rc >= 0


def export_pdf(original: Path, doc: ResumeDocument, changes: list[Change], out: Path) -> list[str]:
    pdf = pymupdf.open(str(original))
    notes = [BEST_EFFORT_NOTE]
    right_edge: dict[int, float] = {}
    for ln in doc.lines:
        for s in ln.pdf_spans:
            right_edge[s.page] = max(right_edge.get(s.page, 0.0), s.bbox[2])
    line_map = doc.line_map()
    ordered = [ln for ln in doc.lines if ln.pdf_spans]

    def next_top(ln: DocLine) -> float | None:
        last = ln.pdf_spans[-1]
        candidates = [
            o.pdf_spans[0].bbox[1]
            for o in ordered
            if o.id != ln.id
            and o.pdf_spans[0].page == last.page
            and o.pdf_spans[0].bbox[1] >= last.bbox[3] - 0.5
            and o.pdf_spans[0].bbox[0] < right_edge[last.page]
            and o.pdf_spans[0].bbox[2] > ln.pdf_spans[0].bbox[0]
        ]
        return min(candidates) if candidates else None

    plans: list[Plan] = []
    for c in changes:
        if c.decision != "accepted":
            continue
        if c.type == "reorder":
            notes.append(
                f"{c.id}: bullet reordering is not applied to PDF exports (the layout cannot be "
                "rearranged safely). Use the DOCX export to include it."
            )
            continue
        target = line_map.get(c.target_line_ids[0])
        if not target or not target.pdf_spans:
            notes.append(f"{c.id}: original text location unknown; change not applied.")
            continue
        spans = target.pdf_spans
        if len({s.page for s in spans}) > 1:
            notes.append(f"{c.id}: line spans two pages; change not applied to the PDF.")
            continue
        first = spans[0]
        x0 = min(s.bbox[0] for s in spans)
        y0 = min(s.bbox[1] for s in spans)
        y1 = max(s.bbox[3] for s in spans)
        bottom = next_top(target)
        avail_bottom = max(y1, (bottom - 0.5) if bottom else y1 + 2)
        rect = pymupdf.Rect(x0, y0, right_edge[first.page] + 1, avail_bottom + 1)
        base_lh = (spans[1].bbox[1] - spans[0].bbox[1]) / first.size if len(spans) > 1 else 1.2
        font = base14(first)
        chosen = None
        for scale in SCALES:
            size = round(first.size * scale, 2)
            if _fits(rect, c.proposed, font, size, base_lh):
                chosen = size
                break
        if chosen is None:
            notes.append(
                f"{c.id}: the tailored text is longer than the space available in the original PDF "
                "layout, so it was not applied to the PDF. Shorten it, or use the DOCX export."
            )
            continue
        plans.append(Plan(c, target, rect, font, chosen, base_lh, rgb(first.color)))

    by_page: dict[int, list[Plan]] = {}
    for p in plans:
        by_page.setdefault(p.line.pdf_spans[0].page, []).append(p)
    for pno, page_plans in by_page.items():
        page = pdf[pno]
        for p in page_plans:
            for s in p.line.pdf_spans:
                x0, y0, x1, y1 = s.bbox
                h = y1 - y0
                page.add_redact_annot(pymupdf.Rect(x0, y0 + 0.2 * h, x1 + 0.5, y1 - 0.2 * h))
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_NONE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
        )
        for p in page_plans:
            rc = page.insert_textbox(
                p.rect,
                p.change.proposed,
                fontname=p.font,
                fontsize=p.size,
                lineheight=p.lineheight,
                color=p.color,
            )
            if rc < 0:  # should not happen after the fit check
                notes.append(f"{p.change.id}: text could not be placed; review the PDF.")
    pdf.save(str(out), garbage=3, deflate=True)
    pdf.close()
    applied = len(plans)
    notes.insert(1, f"{applied} text change(s) applied in place.")
    return notes
