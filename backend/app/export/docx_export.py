"""DOCX export: apply accepted changes to a copy of the user's original document.

The original file is the template. Only the text of changed paragraphs is replaced (the
first run's formatting is kept), and reordered bullets are moved as whole paragraph
elements, so styles, numbering, spacing, tables, headers/footers and page setup are untouched.
"""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

from app.parsing.docx_parser import iter_paragraphs, paragraph_text
from app.schemas.document import ResumeDocument
from app.schemas.tailoring import Change

_CLEAR_TAGS = (qn("w:t"), qn("w:tab"), qn("w:br"), qn("w:cr"))


def _text_runs(p: Paragraph):
    return [r for r in p._p.iter(qn("w:r")) if r.find(qn("w:t")) is not None]


def _set_run_text(r_elm, text: str) -> None:
    for child in list(r_elm):
        if child.tag in _CLEAR_TAGS:
            r_elm.remove(child)
    t = r_elm.makeelement(qn("w:t"), {})
    t.text = text
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    r_elm.append(t)


def _run_text(r_elm) -> str:
    return "".join(t.text or "" for t in r_elm.iter(qn("w:t")))


def set_paragraph_text(p: Paragraph, new_text: str) -> None:
    runs = _text_runs(p)
    if not runs:
        p.add_run(new_text)
        return
    first_text = _run_text(runs[0]).strip()
    # Preserve a leading label run ("Skills: ") when the new text keeps that label.
    if len(runs) > 1 and first_text.endswith(":") and new_text.startswith(first_text):
        _set_run_text(runs[0], _run_text(runs[0]))
        rest = new_text[len(first_text) :].lstrip()
        _set_run_text(runs[1], (" " if not _run_text(runs[0]).endswith(" ") else "") + rest)
        for r in runs[2:]:
            _set_run_text(r, "")
        return
    _set_run_text(runs[0], new_text)
    for r in runs[1:]:
        _set_run_text(r, "")


def reorder_elements(elements: list, new_elements: list) -> None:
    """Place new_elements into the document slots currently held by elements."""
    placeholders = []
    for el in elements:
        ph = el.makeelement(qn("w:p"), {})
        el.addprevious(ph)
        placeholders.append(ph)
    detached = {id(el): el for el in elements}
    for el in elements:
        el.getparent().remove(el)
    for ph, el in zip(placeholders, new_elements, strict=True):
        ph.addprevious(detached[id(el)])
        ph.getparent().remove(ph)


def export_docx(original: Path, doc: ResumeDocument, changes: list[Change], out: Path) -> list[str]:
    d = Document(str(original))
    paragraphs = [p for p, _ in iter_paragraphs(d)]
    line_map = doc.line_map()
    notes: list[str] = []
    accepted = [c for c in changes if c.decision == "accepted"]

    for c in accepted:
        if c.type == "reorder":
            continue
        ln = line_map.get(c.target_line_ids[0])
        if not ln or not ln.docx or ln.docx.ordinal >= len(paragraphs):
            notes.append(f"{c.id}: could not locate the original paragraph; change not applied.")
            continue
        p = paragraphs[ln.docx.ordinal]
        if paragraph_text(p).strip() and ln.text not in paragraph_text(p):
            notes.append(f"{c.id}: original paragraph text did not match; change not applied.")
            continue
        set_paragraph_text(p, f"{ln.bullet_prefix}{c.proposed}")

    for c in accepted:
        if c.type != "reorder":
            continue
        try:
            els = [paragraphs[line_map[i].docx.ordinal]._p for i in c.target_line_ids]  # type: ignore[union-attr]
            by_id = dict(zip(c.target_line_ids, els, strict=True))
            reorder_elements(els, [by_id[i] for i in c.new_order])
        except (KeyError, AttributeError, ValueError):
            notes.append(f"{c.id}: bullet reordering could not be applied.")

    d.save(str(out))
    return notes


def build_docx_from_content(content: dict, out: Path) -> None:
    """Fallback DOCX built from tailored content (used for PDF originals)."""
    d = Document()
    for item in content.get("lines", []):
        kind, text = item.get("kind"), item.get("text", "")
        if kind == "heading":
            d.add_heading(text.title() if text.isupper() else text, level=2)
        elif kind == "bullet":
            d.add_paragraph(text, style="List Bullet")
        else:
            d.add_paragraph(text)
    d.save(str(out))
