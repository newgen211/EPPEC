# File: backend/ppe_rules.py

from typing import TypedDict

# ── Types ────────────────────────────────────────────────

class PPERule(TypedDict):
    required: list[str]
    explanation: str

# ── Rules ────────────────────────────────────────────────

PPE_RULES: dict[str, PPERule] = {
    "Standard": {
        "required": ["Gloves"],
        "explanation": (
            "Standard precautions apply — gloves protect against bloodborne "
            "pathogen exposure during routine procedures."
        ),
    },
    "Droplet": {
        "required": ["Gloves", "Gown", "Surgical Mask", "Eye Protection"],
        "explanation": (
            "Droplet precautions required — this pathogen spreads via respiratory "
            "droplets within 3 feet. Mask and eye protection prevent mucosal exposure."
        ),
    },
    "Contact": {
        "required": ["Gloves", "Gown"],
        "explanation": (
            "Contact precautions required — gown and gloves prevent direct "
            "transmission via skin or contaminated surfaces."
        ),
    },
    "Airborne": {
        "required": ["Gloves", "Gown", "N95", "Eye Protection"],
        "explanation": (
            "Airborne precautions required — N95 is mandatory because this pathogen "
            "spreads via small airborne particles that remain suspended in the air."
        ),
    },
    "High-Risk": {
        "required": ["Gloves", "Gown", "N95", "Face Shield", "Eye Protection"],
        "explanation": (
            "Highest level of protection required — full PPE including face shield "
            "prevents splash and aerosol exposure in an emergency high-risk setting."
        ),
    },
}

CATEGORIES = list(PPE_RULES.keys())

# ── Helpers ───────────────────────────────────────────────

def get_required(category: str) -> list[str]:
    return PPE_RULES[category]["required"]

def get_explanation(category: str) -> str:
    return PPE_RULES[category]["explanation"]

# ── Grader ────────────────────────────────────────────────

def grade(required: list[str], selected: list[str]) -> dict:
    required_set = set(required)
    selected_set = set(selected)

    correct = list(required_set & selected_set)   # in both
    missing = list(required_set - selected_set)   # needed but not selected
    extra   = list(selected_set - required_set)   # selected but not needed

    if not missing and not extra:
        outcome = "correct"
    elif not missing and extra:
        outcome = "over-protected"
    elif missing and not extra:
        outcome = "incomplete"
    else:
        outcome = "incorrect"

    return {
        "outcome": outcome,
        "correct": correct,
        "missing": missing,
        "extra":   extra,
    }