"""Layout-level representation of an uploaded resume.

A ResumeDocument is a flat, ordered list of logical lines (a heading, a bullet, a paragraph).
Every line has a stable id (``L0001``) and a source location that lets us (a) cite it as
evidence and (b) find it again in the original file when exporting a tailored version.
"""

from typing import Literal

from pydantic import BaseModel, Field

LineKind = Literal["heading", "bullet", "text"]

CANONICAL_SECTIONS = (
    "header",
    "summary",
    "experience",
    "skills",
    "education",
    "certifications",
    "projects",
    "awards",
    "other",
)


class PdfSpan(BaseModel):
    """One physical text line in a PDF that belongs to a logical line."""

    page: int  # 0-based page index
    bbox: tuple[float, float, float, float]
    text: str
    font: str = ""
    size: float = 10.0
    flags: int = 0
    color: int = 0


class DocxLocator(BaseModel):
    """Ordinal of the paragraph in app.parsing.docx_parser.iter_paragraphs order."""

    ordinal: int
    in_table: bool = False
    style: str = ""


class DocLine(BaseModel):
    id: str
    text: str
    kind: LineKind = "text"
    section: str = "other"
    section_title: str = ""
    page: int | None = None  # 1-based, PDF only
    bullet_prefix: str = ""  # e.g. "• " stripped from text for PDFs
    pdf_spans: list[PdfSpan] = Field(default_factory=list)
    docx: DocxLocator | None = None


class ResumeDocument(BaseModel):
    filename: str
    file_type: Literal["pdf", "docx"]
    page_count: int = 1
    lines: list[DocLine]
    # PDF only: whether text is extractable (False for scanned/image PDFs)
    has_text_layer: bool = True

    def line(self, line_id: str) -> DocLine | None:
        for ln in self.lines:
            if ln.id == line_id:
                return ln
        return None

    def line_map(self) -> dict[str, DocLine]:
        return {ln.id: ln for ln in self.lines}

    @property
    def text(self) -> str:
        return "\n".join(ln.text for ln in self.lines)
