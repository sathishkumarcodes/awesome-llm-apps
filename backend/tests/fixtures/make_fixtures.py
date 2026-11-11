"""Generate synthetic resume fixtures (DOCX + PDF) with the same content.

Run: uv run python tests/fixtures/make_fixtures.py
The person and companies are fictional.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor

HERE = Path(__file__).parent

NAME = "Jordan Rivera"
CONTACT = "jordan.rivera@example.com | (555) 123-4567 | Austin, TX | linkedin.com/in/jordanrivera"
SUMMARY = (
    "Product leader with 9 years of experience building healthcare technology products, "
    "leading cross-functional engineering teams, and shipping data-intensive platforms."
)
EXPERIENCE = [
    (
        "Meridian Health Analytics",
        "Senior Product Manager",
        "Jan 2020 – Present",
        [
            "Managed product roadmap for the payment integrity audit platform used by 40 health plan clients.",
            "Led roadmap and architecture decisions across 4 engineering teams for the claims audit platform.",
            "Worked on migration of the audit platform to AWS, reducing processing time from more than 20 hours to single-digit hours.",
            "Built Python/FastAPI APIs for healthcare data workflows with the data engineering team.",
            "Partnered with sales and executive stakeholders to define the 2023 product strategy.",
        ],
    ),
    (
        "Brightline Software",
        "Product Manager",
        "Jun 2016 – Dec 2019",
        [
            "Launched a self-service reporting module adopted by 1,200 customers in the first year.",
            "Ran customer discovery interviews with 30 hospital administrators to prioritize features.",
            "Wrote product requirements and user stories for a team of 8 engineers.",
        ],
    ),
]
SKILLS = "Product Strategy, Roadmapping, SQL, Python, AWS, Jira, A/B Testing, Healthcare Claims"
EDUCATION = [("M.S. Information Systems", "University of Texas at Austin, 2016")]
CERTS = ["Certified Scrum Product Owner (CSPO)"]


def make_docx(path: Path) -> None:
    doc = Document()
    for s in doc.sections:
        s.left_margin = s.right_margin = Pt(54)
    title = doc.add_paragraph()
    run = title.add_run(NAME)
    run.bold = True
    run.font.size = Pt(18)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    contact = doc.add_paragraph(CONTACT)
    contact.alignment = WD_ALIGN_PARAGRAPH.CENTER

    def heading(text: str) -> None:
        p = doc.add_paragraph()
        r = p.add_run(text.upper())
        r.bold = True
        r.font.size = Pt(12)
        r.font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F)

    heading("Summary")
    doc.add_paragraph(SUMMARY)
    heading("Experience")
    for company, title_text, dates, bullets in EXPERIENCE:
        p = doc.add_paragraph()
        p.add_run(company).bold = True
        p.add_run(f"\t{dates}")
        it = doc.add_paragraph()
        it.add_run(title_text).italic = True
        for b in bullets:
            doc.add_paragraph(b, style="List Bullet")
    heading("Skills")
    sp = doc.add_paragraph()
    sp.add_run("Skills: ").bold = True
    sp.add_run(SKILLS)
    heading("Education")
    for degree, school in EDUCATION:
        doc.add_paragraph(degree)
        doc.add_paragraph(school)
    heading("Certifications")
    for c in CERTS:
        doc.add_paragraph(c, style="List Bullet")
    doc.save(str(path))


def make_pdf(path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    y = 60.0
    left, right = 54.0, 558.0

    def line(text: str, size=10.0, font="helv", x=left, gap=4.0):
        nonlocal y
        page.insert_text((x, y), text, fontsize=size, fontname=font)
        y += size + gap

    def wrapped(text: str, x: float, size=10.0, font="helv", prefix: str = ""):
        nonlocal y
        words = text.split()
        cur = ""
        first = True
        width = right - x
        for w in words:
            trial = f"{cur} {w}".strip()
            if pymupdf.get_text_length(trial, fontname=font, fontsize=size) > width:
                if first and prefix:
                    page.insert_text((x - 12, y), prefix, fontsize=size, fontname=font)
                page.insert_text((x, y), cur, fontsize=size, fontname=font)
                y += size + 3
                cur, first = w, False
            else:
                cur = trial
        if cur:
            if first and prefix:
                page.insert_text((x - 12, y), prefix, fontsize=size, fontname=font)
            page.insert_text((x, y), cur, fontsize=size, fontname=font)
            y += size + 5

    line(NAME, size=18, font="hebo", gap=8)
    line(CONTACT, size=9.5, gap=12)
    line("SUMMARY", size=12, font="hebo", gap=6)
    wrapped(SUMMARY, left)
    y += 6
    line("EXPERIENCE", size=12, font="hebo", gap=6)
    for company, title_text, dates, bullets in EXPERIENCE:
        page.insert_text((left, y), company, fontsize=10.5, fontname="hebo")
        page.insert_text((470, y), dates.replace("–", "-"), fontsize=10, fontname="helv")
        y += 14
        line(title_text, size=10, font="heit", gap=5)
        for b in bullets:
            wrapped(b, left + 14, prefix="•")
        y += 4
    line("SKILLS", size=12, font="hebo", gap=6)
    wrapped(SKILLS, left)
    y += 6
    line("EDUCATION", size=12, font="hebo", gap=6)
    for degree, school in EDUCATION:
        line(degree, gap=3)
        line(school, gap=5)
    y += 6
    line("CERTIFICATIONS", size=12, font="hebo", gap=6)
    for c in CERTS:
        wrapped(c, left + 14, prefix="•")
    doc.save(str(path))


if __name__ == "__main__":
    make_docx(HERE / "sample_resume.docx")
    make_pdf(HERE / "sample_resume.pdf")
    print("fixtures written")
