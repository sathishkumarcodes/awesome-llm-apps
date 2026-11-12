"""Factuality validation for tailored resume text.

Two independent passes, combined worst-of:

1. Deterministic: catches new numbers/metrics, skills/tools/domains, proper nouns, titles,
   certifications (hard → UNSUPPORTED) and scope inflation or novel wording (soft →
   PARTIALLY_SUPPORTED, needs user review).
2. LLM fact-check against the source lines (factuality_validation_v1).

If the LLM pass cannot run, a deterministically clean change is downgraded to
PARTIALLY_SUPPORTED so nothing is auto-accepted without both checks.
"""

from __future__ import annotations

import re

from app.core.errors import AppError
from app.llm.outputs import FactualityOut
from app.llm.structured import call_structured
from app.schemas.tailoring import FactualityIssue, FactualityResult, FactualityStatus

PROMPT = "factuality_validation_v1"

# Skills, tools, technologies, domains, and credentials. Any of these appearing in a
# rewrite but nowhere in the original resume is a fabricated qualification.
SKILL_LEXICON = {
    # languages / frameworks
    "python",
    "java",
    "javascript",
    "typescript",
    "golang",
    "rust",
    "c++",
    "c#",
    "ruby",
    "scala",
    "kotlin",
    "swift",
    "sql",
    "nosql",
    "fastapi",
    "django",
    "flask",
    "react",
    "angular",
    "vue",
    "node.js",
    "nodejs",
    ".net",
    "graphql",
    "rest api",
    "rest apis",
    "grpc",
    # data / ML / AI
    "ai",
    "artificial intelligence",
    "ml",
    "machine learning",
    "deep learning",
    "llm",
    "llms",
    "genai",
    "generative ai",
    "nlp",
    "computer vision",
    "data science",
    "pytorch",
    "tensorflow",
    "spark",
    "hadoop",
    "kafka",
    "airflow",
    "dbt",
    "snowflake",
    "databricks",
    "tableau",
    "looker",
    "power bi",
    "pandas",
    "etl",
    "data warehouse",
    "rag",
    "embeddings",
    # cloud / infra
    "aws",
    "azure",
    "gcp",
    "google cloud",
    "kubernetes",
    "k8s",
    "docker",
    "terraform",
    "serverless",
    "lambda",
    "microservices",
    "ci/cd",
    "devops",
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    # product / business tools & methods
    "jira",
    "confluence",
    "figma",
    "amplitude",
    "mixpanel",
    "salesforce",
    "hubspot",
    "sap",
    "okrs",
    "a/b testing",
    "experimentation",
    "agile",
    "scrum",
    "kanban",
    "six sigma",
    "lean",
    "p&l",
    "pricing",
    "monetization",
    "go-to-market",
    "gtm",
    "plg",
    "product-led growth",
    # domains
    "healthcare",
    "fintech",
    "payments",
    "insurance",
    "banking",
    "ecommerce",
    "e-commerce",
    "edtech",
    "govtech",
    "cybersecurity",
    "security",
    "b2b",
    "b2c",
    "saas",
    "marketplace",
    "adtech",
    "logistics",
    "supply chain",
    "biotech",
    "pharma",
    "clinical",
    "hipaa",
    "hitrust",
    "soc 2",
    "gdpr",
    "pci",
    "fedramp",
    "regulated",
    "medicare",
    "medicaid",
    "payer",
    "ehr",
    "emr",
    "fhir",
    "hl7",
    "claims",
    "revenue cycle",
    # credentials
    "pmp",
    "cspo",
    "csm",
    "mba",
    "phd",
    "cpa",
    "cissp",
    "certified",
}

TITLE_WORDS = {
    "director",
    "vp",
    "vice president",
    "head of",
    "chief",
    "cto",
    "ceo",
    "cpo",
    "coo",
    "principal",
    "staff",
    "senior",
    "lead",
    "manager",
    "founder",
    "co-founder",
    "architect",
}

LEADERSHIP_WORDS = {
    "led",
    "lead",
    "leading",
    "owned",
    "own",
    "owning",
    "spearheaded",
    "directed",
    "headed",
    "oversaw",
    "managed",
    "managing",
    "architected",
    "drove",
    "drive",
    "driving",
    "championed",
    "orchestrated",
    "established",
    "founded",
    "mentored",
    "supervised",
    "launched",
    "built",
}

SCALE_WORDS = {
    "enterprise",
    "large-scale",
    "global",
    "company-wide",
    "organization-wide",
    "org-wide",
    "millions",
    "billions",
    "multi-million",
    "fortune",
    "executive",
    "c-suite",
    "cross-functional",
    "strategic",
    "strategy",
    "worldwide",
    "international",
    "national",
    "doubled",
    "tripled",
    "halved",
    "quadrupled",
    "record",
    "first-ever",
    "award-winning",
}

NUMBER_WORDS = {
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "fifteen": "15",
    "twenty": "20",
    "thirty": "30",
    "fifty": "50",
    "hundred": "100",
    "dozens": "dozens",
    "hundreds": "hundreds",
    "thousands": "thousands",
    "millions": "millions",
}

# Words a rewrite may introduce freely: connective/stylistic language that makes no new claim.
STYLE_WORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "for",
    "to",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "into",
    "across",
    "through",
    "via",
    "using",
    "use",
    "used",
    "including",
    "include",
    "while",
    "as",
    "that",
    "which",
    "who",
    "its",
    "their",
    "this",
    "these",
    "those",
    "within",
    "over",
    "under",
    "between",
    "both",
    "each",
    "all",
    "more",
    "than",
    "per",
    "end-to-end",
    "supporting",
    "support",
    "supported",
    "enabling",
    "enable",
    "enabled",
    "improving",
    "improve",
    "improved",
    "delivering",
    "deliver",
    "delivered",
    "partnering",
    "partnered",
    "collaborating",
    "collaborated",
    "working",
    "worked",
    "resulting",
    "result",
    "results",
    "ensuring",
    "ensure",
    "helping",
    "help",
    "helped",
    "creating",
    "create",
    "created",
    "developing",
    "develop",
    "developed",
    "designing",
    "design",
    "designed",
    "implementing",
    "implement",
    "implemented",
    "defining",
    "define",
    "defined",
    "shaping",
    "shape",
    "shaped",
    "streamlined",
    "streamlining",
    "accelerating",
    "accelerated",
    "reducing",
    "reduced",
    "increasing",
    "increased",
    "translating",
    "translated",
    "aligning",
    "aligned",
    "prioritizing",
    "prioritized",
    "communicating",
    "communicated",
    "key",
    "core",
    "new",
    "related",
    "relevant",
    "multiple",
    "several",
    "various",
    "overall",
    "successfully",
    "effectively",
    "closely",
    "directly",
    "teams",
    "team",
    "work",
    "efforts",
    "initiatives",
    "initiative",
    "outcomes",
    "outcome",
    "impact",
    "experience",
    "responsible",
    "responsibility",
}

STOPWORDS = {
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "has",
    "have",
    "had",
    "it",
    "our",
    "we",
    "i",
    "my",
    "me",
    "your",
    "so",
    "not",
    "no",
    "but",
    "if",
    "then",
    "also",
    "such",
}

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#./&'-]*")
_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def stem(word: str) -> str:
    w = word.lower().strip(".,;:'\"()-")
    for suffix in (
        "ations",
        "ation",
        "ments",
        "ment",
        "ings",
        "ing",
        "ies",
        "ers",
        "er",
        "ed",
        "es",
        "ly",
        "s",
    ):
        if len(w) > len(suffix) + 3 and w.endswith(suffix):
            return w[: -len(suffix)]
    return w


def tokens(text: str) -> list[str]:
    return [t.strip(".,;:'\"()").lower() for t in _TOKEN_RE.findall(text)]


def numbers(text: str) -> set[str]:
    nums = {n.replace(",", "").rstrip(".") for n in _NUM_RE.findall(text)}
    for t in tokens(text):
        if t in NUMBER_WORDS:
            nums.add(NUMBER_WORDS[t])
    return nums


def has_term(text: str, term: str) -> bool:
    return re.search(r"(?<![\w])" + re.escape(term) + r"(?![\w])", text.lower()) is not None


def _vocab(text: str) -> set[str]:
    return {stem(t) for t in tokens(text)} | {t for t in tokens(text)}


def deterministic_issues(
    proposed: str, sources: list[str], resume_text: str, job_text: str = ""
) -> list[FactualityIssue]:
    issues: list[FactualityIssue] = []
    if not proposed.strip():
        return [FactualityIssue(kind="empty", detail="Proposed text is empty.", hard=True)]
    source_text = " ".join(sources)
    resume_lower = resume_text.lower()

    # 1. Numbers and metrics must come from the cited source lines.
    src_nums, resume_nums = numbers(source_text), numbers(resume_text)
    for n in sorted(numbers(proposed) - src_nums):
        if n in resume_nums:
            issues.append(
                FactualityIssue(
                    kind="new_number",
                    detail=f"“{n}” appears elsewhere in the resume but not in the source line — verify it applies here.",
                )
            )
        else:
            issues.append(
                FactualityIssue(
                    kind="new_number",
                    detail=f"Number/metric “{n}” is not in the original resume.",
                    hard=True,
                )
            )
    if "%" in proposed and "%" not in source_text and "percent" not in source_text.lower():
        issues.append(
            FactualityIssue(
                kind="new_number", detail="Adds a percentage not in the source.", hard=True
            )
        )

    # 2. Skills, tools, domains, credentials.
    for term in sorted(SKILL_LEXICON):
        if has_term(proposed, term) and not has_term(source_text, term):
            if has_term(resume_lower, term):
                issues.append(
                    FactualityIssue(
                        kind="new_skill",
                        detail=f"“{term}” is in your resume but not in this source line — confirm it applies to this work.",
                    )
                )
            else:
                issues.append(
                    FactualityIssue(
                        kind="new_skill",
                        detail=f"“{term}” does not appear anywhere in your resume.",
                        hard=True,
                    )
                )

    # 3. Titles.
    for term in sorted(TITLE_WORDS):
        if has_term(proposed, term) and not has_term(resume_lower, term):
            issues.append(
                FactualityIssue(
                    kind="new_proper_noun",
                    detail=f"Title word “{term}” is not in your resume.",
                    hard=True,
                )
            )

    # 4. Proper nouns / acronyms (companies, products, certifications) not in the resume.
    words = _TOKEN_RE.findall(proposed)
    for i, w in enumerate(words):
        clean = w.strip(".,;:'\"()")
        if len(clean) < 2 or i == 0:
            continue
        is_acronym = sum(c.isupper() for c in clean) >= 2
        is_capital = clean[0].isupper() and not words[i - 1].endswith((".", ":"))
        if (is_acronym or is_capital) and not has_term(resume_lower, clean.lower()):
            if clean.lower() in SKILL_LEXICON or clean.lower() in TITLE_WORDS:
                continue  # already reported
            issues.append(
                FactualityIssue(
                    kind="new_proper_noun",
                    detail=f"“{clean}” does not appear in your resume.",
                    hard=True,
                )
            )

    # 5. Scope inflation: leadership claims where the source shows none.
    src_vocab = _vocab(source_text)
    prop_tokens = tokens(proposed)
    lead_src = any(stem(w) in src_vocab or w in src_vocab for w in LEADERSHIP_WORDS)
    new_lead = [
        t
        for t in prop_tokens
        if t in LEADERSHIP_WORDS and t not in src_vocab and stem(t) not in src_vocab
    ]
    if new_lead and not lead_src:
        issues.append(
            FactualityIssue(
                kind="scope_inflation",
                detail=f"“{new_lead[0]}” implies leadership/ownership the source line does not state.",
            )
        )
    resume_vocab = _vocab(resume_text)
    for t in prop_tokens:
        if t in SCALE_WORDS and stem(t) not in resume_vocab and t not in resume_vocab:
            issues.append(
                FactualityIssue(
                    kind="scope_inflation",
                    detail=f"“{t}” characterizes scale/scope not stated in your resume.",
                )
            )

    # 6. Any other new content words (soft): flag wording not grounded in the resume.
    job_vocab = _vocab(job_text) if job_text else set()
    reported = {i.detail for i in issues}
    novel = []
    for t in prop_tokens:
        if (
            len(t) < 3
            or t in STYLE_WORDS
            or t in STOPWORDS
            or t in LEADERSHIP_WORDS
            or t in SCALE_WORDS
            or t in SKILL_LEXICON
            or t in resume_vocab
            or stem(t) in resume_vocab
        ):
            continue
        if any(f"“{t}”" in d.lower() for d in reported):
            continue
        novel.append(t)
    if novel:
        uniq = list(dict.fromkeys(novel))
        from_jd = [t for t in uniq if t in job_vocab or stem(t) in job_vocab]
        detail = f"New wording not found in your resume: {', '.join(uniq[:6])}."
        if from_jd:
            detail += f" ({', '.join(from_jd[:4])} come from the job description — confirm your experience supports them.)"
        issues.append(FactualityIssue(kind="new_term", detail=detail))
    return issues


def status_from_issues(issues: list[FactualityIssue]) -> FactualityStatus:
    if any(i.hard for i in issues):
        return "UNSUPPORTED"
    if issues:
        return "PARTIALLY_SUPPORTED"
    return "SUPPORTED"


_RANK = {"SUPPORTED": 0, "PARTIALLY_SUPPORTED": 1, "UNSUPPORTED": 2}


def worst(a: FactualityStatus, b: FactualityStatus) -> FactualityStatus:
    return a if _RANK[a] >= _RANK[b] else b


def validate(
    proposed: str,
    original: str,
    sources: list[str],
    resume_text: str,
    job_text: str = "",
    use_llm: bool = True,
) -> FactualityResult:
    issues = deterministic_issues(proposed, sources, resume_text, job_text)
    det_status = status_from_issues(issues)
    result = FactualityResult(
        status=det_status,
        issues=issues,
        deterministic_status=det_status,
        supporting_evidence=sources,
    )
    if det_status == "UNSUPPORTED" or not use_llm:
        if not use_llm and det_status == "SUPPORTED":
            result.status = "PARTIALLY_SUPPORTED"
            result.llm_explanation = "Second-pass AI validation was not run; review this change."
        return result
    try:
        out, _ = call_structured(
            PROMPT,
            FactualityOut,
            sources="\n".join(f"- {s}" for s in sources),
            original=original,
            proposed=proposed,
        )
    except AppError as exc:
        result.llm_explanation = (
            f"Second-pass AI validation could not run ({exc.message}); review this change."
        )
        result.status = worst(det_status, "PARTIALLY_SUPPORTED")
        return result
    result.llm_status = out.status
    result.llm_explanation = out.explanation
    for claim in out.unsupported_claims[:4] if out.status != "SUPPORTED" else []:
        if claim.strip():
            result.issues.append(FactualityIssue(kind="llm_flag", detail=claim.strip()))
    result.status = worst(det_status, out.status)
    return result
