"""Rule registry: every evaluation rule the app applies, with a stable id.

Each rule names the code that implements it (``implemented_in``), what it feeds
(``contributes_to``), and how it decides (``method``). Scorecard criteria reference rules by id;
diagnostics and tailoring checks report results by id. A test asserts every rule's
``implemented_in`` target exists, so ids can't drift from the code.

Families: REQ requirement checks · KEY keyword coverage · SEN seniority · REC recruiter
perspective · HM hiring-manager perspective · IMP impact · ATS parse/readability ·
WRT writing quality · ADV recommendation/advice · TR truthful tailoring.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Method = Literal["deterministic", "model", "model+guardrail"]
Contribution = Literal[
    "job_fit", "ats_readiness", "resume_quality", "recommendation", "tailoring_safety", "evidence"
]


@dataclass(frozen=True)
class Rule:
    id: str
    family: str
    name: str
    description: str
    method: Method
    contributes_to: Contribution
    implemented_in: str  # "module:attribute"


_R = Rule
RULES: tuple[Rule, ...] = (
    # --- requirement checks (feed criterion evidence) -----------------------------------
    _R("REQ-01", "REQ", "Evidence must be cited", "A requirement or criterion can only be credited when a real resume line is cited; uncited judgments become not demonstrated.", "deterministic", "evidence", "app.scoring.requirements:_apply_guardrails"),
    _R("REQ-02", "REQ", "Named skills present", "Tools/skills named in a requirement are searched for in the resume text.", "deterministic", "evidence", "app.scoring.deterministic:check_requirement"),
    _R("REQ-03", "REQ", "Total years vs required", "Total years from resume dates compared with the years a requirement states.", "deterministic", "evidence", "app.scoring.deterministic:check_requirement"),
    _R("REQ-04", "REQ", "Years in the named area", "Years in roles matching the area a requirement names (e.g. product management), from role titles and dates.", "deterministic", "evidence", "app.scoring.deterministic:area_years"),
    _R("REQ-05", "REQ", "Degree level", "Highest degree listed compared with the degree level a requirement states.", "deterministic", "evidence", "app.scoring.requirements:fact_verdicts"),
    _R("REQ-06", "REQ", "Certification listed", "Certifications named in a requirement (e.g. 'PMP or CSPO') are matched against the resume.", "deterministic", "evidence", "app.scoring.requirements:fact_verdicts"),
    _R("REQ-07", "REQ", "Any-of vs all-of lists", "'A, B, or C' is satisfied by any one item; 'A and B' needs all, otherwise partial.", "model+guardrail", "evidence", "app.scoring.requirements:fact_verdicts"),
    _R("REQ-08", "REQ", "Hybrid evidence retrieval", "Resume lines are retrieved per requirement clause by embedding similarity plus keyword overlap.", "deterministic", "evidence", "app.scoring.requirements:candidate_lines"),
    _R("REQ-09", "REQ", "Must-have coverage", "Share of must-have requirements demonstrated (must-haves count double).", "deterministic", "job_fit", "app.scoring.requirements:coverage"),
    _R("REQ-10", "REQ", "Logistics are not scored", "Travel, office days and work authorization can't be shown by a resume; they are set aside as eligibility constraints.", "deterministic", "evidence", "app.parsing.job_parser:is_logistics"),
    _R("REQ-11", "REQ", "Per-requirement judgment", "Each requirement is judged on its own against its candidate lines.", "model+guardrail", "evidence", "app.scoring.requirements:_assess_one"),
    # --- keyword coverage ------------------------------------------------------------------
    _R("KEY-01", "KEY", "JD skill keyword coverage", "Share of skills the job names that appear anywhere in the resume.", "deterministic", "ats_readiness", "app.rules.engine:key_skill_coverage"),
    _R("KEY-02", "KEY", "Skills shown in experience", "Named skills that appear only in a skills list, not in any experience bullet.", "deterministic", "resume_quality", "app.rules.engine:key_skills_in_context"),
    # --- seniority -------------------------------------------------------------------------
    _R("SEN-01", "SEN", "Role level from title", "The job's level is read from its title (Senior, Staff, Principal...).", "deterministic", "job_fit", "app.parsing.job_parser:level_from_title"),
    _R("SEN-02", "SEN", "Demonstrated level", "The level the resume evidence supports, from scope, ownership and influence.", "model+guardrail", "job_fit", "app.scoring.seniority:assess"),
    _R("SEN-03", "SEN", "Level fit", "Distance between the role level and the demonstrated range.", "deterministic", "job_fit", "app.scoring.seniority:level_fit"),
    # --- recruiter perspective -------------------------------------------------------------
    _R("REC-01", "REC", "Recruiter rubric level", "Recruiter view of a criterion: is it clearly visible as a qualification on the resume?", "model+guardrail", "job_fit", "app.scorecards.evaluator:evaluate_criterion"),
    _R("REC-02", "REC", "Skills-list-only visibility", "Evidence that appears only in a skills list reads weaker to a screener (recruiter level -1).", "deterministic", "job_fit", "app.scorecards.perspectives:recruiter_level"),
    _R("REC-03", "REC", "Recency", "Evidence only from roles that ended over 6 years ago reads weaker to a screener (recruiter level -1).", "deterministic", "job_fit", "app.scorecards.perspectives:recruiter_level"),
    _R("REC-04", "REC", "Location / work mode", "Candidate location compared with the job location and work mode.", "deterministic", "job_fit", "app.scoring.deterministic:run"),
    # --- hiring manager perspective --------------------------------------------------------
    _R("HM-01", "HM", "Hiring-manager rubric level", "Hiring-manager view of a criterion: depth of ownership, scope and outcomes behind the evidence.", "model+guardrail", "job_fit", "app.scorecards.evaluator:evaluate_criterion"),
    _R("HM-02", "HM", "Bounded perspective", "A perspective level may differ from the evidence level by at most one step.", "deterministic", "job_fit", "app.scorecards.perspectives:bound_level"),
    # --- impact ----------------------------------------------------------------------------
    _R("IMP-01", "IMP", "Quantified bullets", "Share of experience bullets with a number (scale, %, $, counts).", "deterministic", "resume_quality", "app.rules.engine:imp_quantified"),
    _R("IMP-02", "IMP", "Outcome language", "Share of bullets stating a result (increased, reduced, launched, grew...).", "deterministic", "resume_quality", "app.rules.engine:imp_outcomes"),
    # --- ATS / parsing ---------------------------------------------------------------------
    _R("ATS-01", "ATS", "Text is extractable", "The file yields enough machine-readable text (not a scanned image).", "deterministic", "ats_readiness", "app.rules.engine:ats_text"),
    _R("ATS-02", "ATS", "Standard sections", "Experience, Education and Skills sections are recognizable.", "deterministic", "ats_readiness", "app.rules.engine:ats_sections"),
    _R("ATS-03", "ATS", "Contact details", "Email and phone are present in the header.", "deterministic", "ats_readiness", "app.rules.engine:ats_contact"),
    _R("ATS-04", "ATS", "Role dates parse", "Every role has dates a parser can read.", "deterministic", "ats_readiness", "app.rules.engine:ats_dates"),
    _R("ATS-05", "ATS", "Job titles found", "Every role has an identifiable job title.", "deterministic", "ats_readiness", "app.rules.engine:ats_titles"),
    _R("ATS-06", "ATS", "Bulleted experience", "Experience is written as bullets rather than paragraphs.", "deterministic", "ats_readiness", "app.rules.engine:ats_bullets"),
    _R("ATS-07", "ATS", "Length", "Roughly 250–1,200 words.", "deterministic", "ats_readiness", "app.rules.engine:ats_length"),
    _R("ATS-08", "ATS", "Target title terms", "Words from the job title appear in the resume.", "deterministic", "ats_readiness", "app.rules.engine:ats_title_terms"),
    # --- writing ---------------------------------------------------------------------------
    _R("WRT-01", "WRT", "Bullet length", "Bullets of roughly 8–35 words.", "deterministic", "resume_quality", "app.rules.engine:wrt_length"),
    _R("WRT-02", "WRT", "Action-verb openings", "Bullets start with an action verb.", "deterministic", "resume_quality", "app.rules.engine:wrt_action_verbs"),
    _R("WRT-03", "WRT", "No first person", "Bullets avoid I / my / me.", "deterministic", "resume_quality", "app.rules.engine:wrt_first_person"),
    _R("WRT-04", "WRT", "Weak phrasing", "Avoid 'responsible for', 'worked on', 'helped', 'involved in'.", "deterministic", "resume_quality", "app.rules.engine:wrt_weak_phrases"),
    # --- recommendation / advice -----------------------------------------------------------
    _R("ADV-01", "ADV", "Hard-requirement gate", "A confirmed unmet non-negotiable requirement overrides the score-based recommendation.", "deterministic", "recommendation", "app.scorecards.recommendations:blockers"),
    _R("ADV-02", "ADV", "Needs clarification", "When unknown important criteria could change the decision, ask before recommending.", "deterministic", "recommendation", "app.scorecards.recommendations:decide"),
    _R("ADV-03", "ADV", "Gap classification", "Low criteria are classified as qualification, evidence, positioning or ATS gaps.", "model+guardrail", "recommendation", "app.scorecards.evaluator:classify_gap"),
    _R("ADV-04", "ADV", "Inferred never blocks", "Criteria resting only on inferred signals can't be hard requirements.", "deterministic", "recommendation", "app.scorecards.validator:validate"),
    # --- truthful tailoring ----------------------------------------------------------------
    _R("TR-01", "TR", "No new numbers", "A rewrite may not introduce numbers absent from its source lines.", "deterministic", "tailoring_safety", "app.services.factuality:deterministic_issues"),
    _R("TR-02", "TR", "No new skills", "A rewrite may not introduce skills absent from the resume.", "deterministic", "tailoring_safety", "app.services.factuality:deterministic_issues"),
    _R("TR-03", "TR", "No new terms", "Domain terms in a rewrite must come from the resume (job wording is checked).", "deterministic", "tailoring_safety", "app.services.factuality:deterministic_issues"),
    _R("TR-04", "TR", "No new proper nouns", "Companies, products and names must come from the resume.", "deterministic", "tailoring_safety", "app.services.factuality:deterministic_issues"),
    _R("TR-05", "TR", "No scope inflation", "Ownership/scope words (led, owned, managed) can't be upgraded beyond the source.", "deterministic", "tailoring_safety", "app.services.factuality:deterministic_issues"),
    _R("TR-06", "TR", "Model fact check", "A second model pass flags claims the source lines don't support.", "model+guardrail", "tailoring_safety", "app.services.factuality:validate"),
    _R("TR-07", "TR", "Unsupported can't be accepted", "Changes judged unsupported are rejected and can't be accepted without editing.", "deterministic", "tailoring_safety", "app.services.tailoring_service:set_decision"),
    _R("TR-08", "TR", "Edits are re-checked", "User edits to a change are fact-checked again before acceptance.", "deterministic", "tailoring_safety", "app.services.tailoring_service:edit_change"),
)  # fmt: skip

BY_ID: dict[str, Rule] = {r.id: r for r in RULES}

# Factuality issue kind -> rule id (TR family)
FACTUALITY_RULE = {
    "new_number": "TR-01",
    "new_skill": "TR-02",
    "new_term": "TR-03",
    "new_proper_noun": "TR-04",
    "scope_inflation": "TR-05",
    "llm_flag": "TR-06",
    "empty": "TR-06",
}


def get(rule_id: str) -> Rule:
    return BY_ID[rule_id]


def by_family(family: str) -> list[Rule]:
    return [r for r in RULES if r.family == family]
