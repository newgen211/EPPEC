# File: backend/scenarios.py

from typing import TypedDict

# ── Types ────────────────────────────────────────────────

class Scenario(TypedDict):
    id: int
    text: str
    category: str

# ── Scenario bank ────────────────────────────────────────

SCENARIOS: list[Scenario] = [
    {
        "id": 1,
        "text": "Routine blood draw on a stable patient.",
        "category": "Standard",
    },
    {
        "id": 2,
        "text": "Patient presenting with fever and productive cough — suspected influenza.",
        "category": "Droplet",
    },
    {
        "id": 3,
        "text": "Entering an isolation room for a patient with C. diff infection.",
        "category": "Contact",
    },
    {
        "id": 4,
        "text": "Suspected tuberculosis — patient has persistent cough and night sweats.",
        "category": "Airborne",
    },
    {
        "id": 5,
        "text": "Emergency intubation on an unknown-status patient with high aerosolization risk.",
        "category": "High-Risk",
    },
]

# Pinned for the live demo — avoids randomness during presentation
DEMO_SCENARIO = SCENARIOS[3]

def get_all() -> list[Scenario]:
    return SCENARIOS

def get_by_id(scenario_id: int) -> Scenario | None:
    return next((s for s in SCENARIOS if s["id"] == scenario_id), None)