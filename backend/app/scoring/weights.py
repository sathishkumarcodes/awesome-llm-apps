"""Configurable evaluator weights (points out of 100).

Override with env vars RECRUITER_WEIGHTS / HIRING_MANAGER_WEIGHTS as JSON, e.g.
RECRUITER_WEIGHTS='{"required_experience": 30, "required_skills": 15, ...}'.
Weights are normalized to sum to 100.
"""

from __future__ import annotations

import json
import os

RECRUITER_CATEGORIES: dict[str, tuple[str, float]] = {
    "required_experience": ("Required experience", 25),
    "required_skills": ("Required skills", 20),
    "domain_alignment": ("Domain alignment", 15),
    "seniority": ("Seniority", 15),
    "career_trajectory": ("Career trajectory", 10),
    "education_certifications": ("Education / certifications", 5),
    "location_authorization": ("Location / work authorization", 5),
    "resume_alignment": ("Resume alignment / clarity", 5),
}

HIRING_MANAGER_CATEGORIES: dict[str, tuple[str, float]] = {
    "direct_relevant_experience": ("Direct relevant experience", 25),
    "problem_domain_experience": ("Problem / domain experience", 20),
    "technical_depth": ("Technical depth", 15),
    "product_leadership": ("Product leadership", 15),
    "scope_complexity": ("Scope / complexity", 10),
    "demonstrated_impact": ("Demonstrated impact", 10),
    "strategic_thinking": ("Strategic thinking", 5),
}


def _load(env_name: str, defaults: dict[str, tuple[str, float]]) -> dict[str, tuple[str, float]]:
    raw = os.environ.get(env_name)
    weights = {k: w for k, (_, w) in defaults.items()}
    if raw:
        try:
            override = json.loads(raw)
            for k, v in override.items():
                if k in weights and float(v) >= 0:
                    weights[k] = float(v)
        except (ValueError, TypeError):
            pass
    total = sum(weights.values()) or 1.0
    return {k: (defaults[k][0], round(weights[k] * 100 / total, 2)) for k in defaults}


def recruiter_weights() -> dict[str, tuple[str, float]]:
    return _load("RECRUITER_WEIGHTS", RECRUITER_CATEGORIES)


def hiring_manager_weights() -> dict[str, tuple[str, float]]:
    return _load("HIRING_MANAGER_WEIGHTS", HIRING_MANAGER_CATEGORIES)
