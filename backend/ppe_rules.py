# File: backend/ppe_rules.py

from typing import TypedDict

# ── Types ────────────────────────────────────────────────

class PPERule(TypedDict):
    required: list[str]
    explanation: str

PPE_RULES: dict[str, PPERule] = {
    "Standard": {
        "required": ["Gloves"],
        "explanation": (
            "Standard precautions apply — gloves protect against bloodborne "
            "pathogen exposure during routine procedures."
        ),
    },
    "Droplet": {
        "required": ["Gloves", "Coverall", "Mask", "Eye Protection"],
        "explanation": (
            "Droplet precautions required — this pathogen spreads via respiratory "
            "droplets within 3 feet. A surgical mask and eye protection prevent mucosal exposure."
        ),
    },
    "Contact": {
        "required": ["Gloves", "Coverall"],
        "explanation": (
            "Contact precautions required — coverall and gloves prevent direct "
            "transmission via skin or contaminated surfaces."
        ),
    },
    "Airborne": {
        "required": ["Gloves", "Coverall", "Mask", "Eye Protection"],
        "explanation": (
            "Airborne precautions required — an N95 or higher-grade mask is mandatory "
            "because this pathogen spreads via small airborne particles that remain "
            "suspended in the air."
        ),
    },
    "High-Risk": {
        "required": ["Gloves", "Coverall", "Mask", "Face Shield", "Eye Protection"],
        "explanation": (
            "Highest level of protection required — full PPE including face shield "
            "prevents splash and aerosol exposure in an emergency high-risk setting."
        ),
    },
}

CATEGORIES = list(PPE_RULES.keys())

# ── Label normalizer ──────────────────────────────────────
# Maps normalized CV model output → PPE rule labels
# detector.py already lowercases and underscores, so we map from there

LABEL_MAP: dict[str, str] = {
    "mask":           "Mask",
    "gloves":         "Gloves",
    "coverall":       "Coverall",
    "face_shield":    "Face Shield",
    "goggles":        "Eye Protection",
    "eye_protection": "Eye Protection",   # detector normalises Goggles → eye_protection
}

def normalize_label(label: str) -> str:
    """Map a raw CV output label to its PPE rule label."""
    return LABEL_MAP.get(label, label)

def normalize_labels(labels: list[str]) -> list[str]:
    """Normalize and deduplicate a list of CV output labels."""
    return list({normalize_label(l) for l in labels})

# ── Helpers ───────────────────────────────────────────────

def get_required(category: str) -> list[str]:
    return PPE_RULES[category]["required"]

def get_explanation(category: str) -> str:
    return PPE_RULES[category]["explanation"]

# ── Grader ────────────────────────────────────────────────

def grade(required: list[str], selected: list[str]) -> dict:
    # normalize before grading so CV labels always match rule labels
    required_set = set(required)
    selected_set = set(normalize_labels(selected))

    correct = list(required_set & selected_set)
    missing = list(required_set - selected_set)
    extra   = list(selected_set - required_set)

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