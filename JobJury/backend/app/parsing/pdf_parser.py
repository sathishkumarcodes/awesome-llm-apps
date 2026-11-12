"""PDF resume parsing with PyMuPDF.

Physical text lines are grouped into logical lines (a heading, a bullet including its
wrapped continuation lines, or a paragraph). Each logical line keeps the bounding boxes and
font information of its physical lines so the PDF exporter can replace text in place.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

from app.parsing.sections import classify_heading, split_bullet
from app.schemas.document import DocLine, PdfSpan, ResumeDocument

BOLD_FLAG = 16


@dataclass
class _Phys:
    page: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    font: str
    size: float
    flags: int
    color: int
    bullet_prefix: str = ""
    text_x0: float = 0.0  # x where text starts (after a bullet glyph)


@dataclass
class _Logical:
    kind: str
    lines: list[_Phys] = field(default_factory=list)
    prefix: str = ""


def _is_bold(p: _Phys) -> bool:
    return bool(p.flags & BOLD_FLAG) or "bold" in p.font.lower()


def _physical_lines(doc: pymupdf.Document) -> list[_Phys]:
    out: list[_Phys] = []
    for pno in range(doc.page_count):
        page = doc[pno]
        data = page.get_text("dict", sort=True, flags=pymupdf.TEXTFLAGS_TEXT)
        for block in data.get("blocks", []):
            for line in block.get("lines", []):
                spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
                if not spans:
                    continue
                text = "".join(s["text"] for s in line["spans"]).strip()
                if not text:
                    continue
                # Primary formatting comes from the first non-bullet span.
                bullet_prefix, _ = split_bullet(text)
                main = spans[0]
                text_x0 = line["bbox"][0]
                if bullet_prefix:
                    if spans[0]["text"].strip() in bullet_prefix and len(spans) > 1:
                        main = spans[1]
                        text_x0 = spans[1]["bbox"][0]
                    else:
                        text_x0 = spans[0]["bbox"][0] + pymupdf.get_text_length(
                            bullet_prefix, fontname="helv", fontsize=spans[0]["size"]
                        )
                x0, y0, x1, y1 = line["bbox"]
                out.append(
                    _Phys(
                        page=pno,
                        x0=x0,
                        y0=y0,
                        x1=x1,
                        y1=y1,
                        text=" ".join(text.split()),
                        font=main.get("font", ""),
                        size=round(main.get("size", 10.0), 2),
                        flags=main.get("flags", 0),
                        color=main.get("color", 0),
                        bullet_prefix=bullet_prefix,
                        text_x0=text_x0,
                    )
                )
    return _merge_same_baseline(out)


def _merge_same_baseline(lines: list[_Phys]) -> list[_Phys]:
    """PyMuPDF sometimes splits one visual line into several (e.g. tab-separated dates).
    Merge lines on the same page whose vertical extent overlaps strongly."""
    merged: list[_Phys] = []
    for ln in sorted(lines, key=lambda p: (p.page, round(p.y0, 0), p.x0)):
        prev = merged[-1] if merged else None
        if (
            prev
            and prev.page == ln.page
            and abs(prev.y0 - ln.y0) < 0.5 * max(prev.size, ln.size)
            and ln.x0 >= prev.x1 - 1
        ):
            if prev.bullet_prefix and not split_bullet(prev.text)[1]:
                # The bullet glyph was a separate text object: text starts at this line.
                prev.text_x0 = ln.x0
                prev.font, prev.size, prev.flags, prev.color = ln.font, ln.size, ln.flags, ln.color
                prev.text = f"{prev.text} {ln.text}"
            else:
                prev.text = f"{prev.text}  {ln.text}"
            prev.x1 = max(prev.x1, ln.x1)
            prev.y1 = max(prev.y1, ln.y1)
            continue
        merged.append(ln)
    return merged


def _group(lines: list[_Phys], right_edges: dict[int, float]) -> list[_Logical]:
    groups: list[_Logical] = []
    for ln in lines:
        prev_group = groups[-1] if groups else None
        prev = prev_group.lines[-1] if prev_group else None
        is_heading = bool(classify_heading(ln.text)) and (
            _is_bold(ln) or ln.text.isupper() or len(ln.text.split()) <= 3
        )
        if is_heading:
            groups.append(_Logical("heading", [ln]))
            continue
        if ln.bullet_prefix:
            groups.append(_Logical("bullet", [ln], prefix=ln.bullet_prefix))
            continue
        if prev and prev_group and prev_group.kind != "heading" and prev.page == ln.page:
            gap = ln.y0 - prev.y1
            same_style = abs(prev.size - ln.size) < 0.6 and _is_bold(prev) == _is_bold(ln)
            prev_wrapped = prev.x1 >= right_edges[prev.page] - 0.18 * (right_edges[prev.page] - 36)
            indent_ok = (
                abs(ln.x0 - prev_group.lines[0].text_x0) < 6
                if prev_group.kind == "bullet"
                else abs(ln.x0 - prev_group.lines[0].x0) < 6
            )
            if gap < 0.6 * ln.size and same_style and prev_wrapped and indent_ok:
                prev_group.lines.append(ln)
                continue
        groups.append(_Logical("text", [ln]))
    return groups


def parse_pdf(path: Path, filename: str) -> ResumeDocument:
    doc = pymupdf.open(str(path))
    try:
        if doc.needs_pass:
            raise ValueError("PDF is password-protected")
        phys = _physical_lines(doc)
        page_count = doc.page_count
    finally:
        doc.close()

    right_edges: dict[int, float] = {}
    for p in phys:
        right_edges[p.page] = max(right_edges.get(p.page, 0.0), p.x1)

    lines: list[DocLine] = []
    section, section_title = "header", ""
    for group in _group(phys, right_edges):
        text = " ".join(p.text for p in group.lines)
        prefix = ""
        if group.kind == "bullet":
            prefix, text = split_bullet(text)
        elif group.kind == "heading":
            section_title = text
            section = classify_heading(text) or "other"
        spans = [
            PdfSpan(
                page=p.page,
                bbox=(p.text_x0 if i == 0 and group.kind == "bullet" else p.x0, p.y0, p.x1, p.y1),
                text=p.text,
                font=p.font,
                size=p.size,
                flags=p.flags,
                color=p.color,
            )
            for i, p in enumerate(group.lines)
        ]
        lines.append(
            DocLine(
                id=f"L{len(lines) + 1:04d}",
                text=text,
                kind=group.kind,  # type: ignore[arg-type]
                section=section,
                section_title=section_title,
                page=group.lines[0].page + 1,
                bullet_prefix=prefix,
                pdf_spans=spans,
            )
        )
    return ResumeDocument(
        filename=filename,
        file_type="pdf",
        page_count=page_count,
        lines=lines,
        has_text_layer=bool(lines),
    )
