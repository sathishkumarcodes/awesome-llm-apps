"""DOCX resume parsing with python-docx."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.parsing.sections import classify_heading, split_bullet
from app.schemas.document import DocLine, DocxLocator, LineKind, ResumeDocument


def iter_paragraphs(doc: DocumentObject) -> Iterator[tuple[Paragraph, bool]]:
    """Yield (paragraph, in_table) for body paragraphs and table-cell paragraphs in document
    order. The export step relies on this exact ordering to locate paragraphs again."""

    def walk(parent_elm, parent_obj, in_table: bool):
        for child in parent_elm.iterchildren():
            if child.tag == qn("w:p"):
                yield Paragraph(child, parent_obj), in_table
            elif child.tag == qn("w:tbl"):
                table = Table(child, parent_obj)
                seen: set[int] = set()
                for row in table.rows:
                    for cell in row.cells:
                        if id(cell._tc) in seen:  # merged cells repeat
                            continue
                        seen.add(id(cell._tc))
                        yield from walk(cell._tc, cell, True)
            elif child.tag == qn("w:sdt"):
                content = child.find(qn("w:sdtContent"))
                if content is not None:
                    yield from walk(content, parent_obj, in_table)

    yield from walk(doc.element.body, doc, False)


def _is_list_paragraph(p: Paragraph) -> bool:
    ppr = p._p.pPr
    if ppr is not None and ppr.numPr is not None:
        return True
    style = (p.style.name if p.style is not None else "") or ""
    if "List" in style:
        return True
    # Numbering inherited from the paragraph style
    st = p.style
    while st is not None:
        sppr = st.element.pPr
        if sppr is not None and sppr.numPr is not None:
            return True
        st = st.base_style
    return False


def _looks_like_heading(p: Paragraph, text: str) -> bool:
    style = (p.style.name if p.style is not None else "") or ""
    if style.startswith("Heading") or style == "Title":
        return True
    if classify_heading(text):
        runs = [r for r in p.runs if r.text.strip()]
        bold = bool(runs) and all(r.bold or (p.style and p.style.font.bold) for r in runs)
        return bold or text.isupper() or len(text.split()) <= 3
    return False


def paragraph_text(p: Paragraph) -> str:
    # Paragraph.text includes hyperlink text in python-docx >= 1.0; normalize whitespace.
    return " ".join(p.text.replace("\t", " ").split())


def parse_docx(path: Path, filename: str) -> ResumeDocument:
    doc = Document(str(path))
    lines: list[DocLine] = []
    section, section_title = "header", ""
    for ordinal, (p, in_table) in enumerate(iter_paragraphs(doc)):
        raw = paragraph_text(p)
        if not raw:
            continue
        style = (p.style.name if p.style is not None else "") or ""
        heading_section = classify_heading(raw) if _looks_like_heading(p, raw) else None
        if heading_section:
            section, section_title = heading_section, raw
            kind: LineKind = "heading"
            text, prefix = raw, ""
        else:
            prefix, text = split_bullet(raw)
            kind = "bullet" if (prefix or _is_list_paragraph(p)) else "text"
        lines.append(
            DocLine(
                id=f"L{len(lines) + 1:04d}",
                text=text,
                kind=kind,
                section=section,
                section_title=section_title,
                bullet_prefix=prefix,
                docx=DocxLocator(ordinal=ordinal, in_table=in_table, style=style),
            )
        )
    return ResumeDocument(filename=filename, file_type="docx", page_count=1, lines=lines)
