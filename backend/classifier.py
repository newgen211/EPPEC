# File: backend/classifier.py

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai

from ppe_rules import PPE_RULES, CATEGORIES, get_required, get_explanation
from scenarios import SCENARIOS

load_dotenv()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

CACHE_PATH = Path(__file__).parent.parent / "data" / "ppe_cache.json"

# ── Cache ─────────────────────────────────────────────────

def _load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text())
    return {}

def _save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=2))

# ── Classify ──────────────────────────────────────────────

def classify(text: str) -> dict:
    cache = _load_cache()

    if text in cache:
        print(f"[cache hit] {text[:50]}...")
        return cache[text]

    print(f"[Gemini] classifying: {text[:50]}...")

    prompt = (
        f"You are a medical PPE classifier. "
        f"Given the clinical scenario below, respond with ONLY one of these "
        f"exact categories: {', '.join(CATEGORIES)}.\n\n"
        f"Scenario: {text}"
    )

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )

    category = response.text.strip()

    if category not in PPE_RULES:
        print(f"[warning] unexpected category '{category}', defaulting to Standard")
        category = "Standard"

    result = {
        "category": category,
        "required": get_required(category),
        "explanation": get_explanation(category),
    }

    cache[text] = result
    _save_cache(cache)

    return result

# ──Generate new scenario with Gemini─────────────────────────────────
def generate_scenario() -> dict:
    import random
    prompt = (
    "You are a medical training scenario generator for healthcare professionals. "
    "Generate a single, realistic, and clinically accurate scenario that a nurse or doctor might encounter. "
    "The scenario must clearly require a specific level of PPE based on infection control guidelines.\n\n"
    f"You must assign it to exactly one of these categories: {', '.join(CATEGORIES)}.\n\n"
    "Guidelines per category:\n"
    "- Standard: routine, low-risk procedures with no infection concern\n"
    "- Droplet: pathogens spread via respiratory droplets (flu, COVID, pertussis)\n"
    "- Contact: pathogens spread via direct skin or surface contact (C. diff, MRSA)\n"
    "- Airborne: pathogens spread via airborne particles (TB, measles, chickenpox)\n"
    "- High-Risk: emergency procedures with high aerosolization or splash risk\n\n"
    "Rules:\n"
    "- The scenario must be 1-2 sentences, written as a clinical briefing\n"
    "- Do not mention PPE in the scenario text\n"
    "- Do not repeat these example scenarios: routine blood draw, suspected flu, C. diff, TB, emergency intubation\n"
    "- Vary the setting: ER, ICU, clinic, ambulance, isolation ward, operating room\n\n"
    "Respond with JSON only. No markdown, no extra text, no explanation:\n"
    '{"text": "scenario here", "category": "category here"}'
)
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        data = json.loads(response.text.strip())
        category = data["category"] if data["category"] in PPE_RULES else "Standard"
        return {
            "id":          0,
            "text":        data["text"],
            "category":    category,
            "required":    get_required(category),
            "explanation": get_explanation(category),
            "generated":   True,
        }
    except Exception as e:
        print(f"[warning] Gemini generation failed: {e}")
        print("[fallback] returning random hardcoded scenario")
        scenario = random.choice(SCENARIOS)
        category = scenario["category"]
        return {
            "id":          scenario["id"],
            "text":        scenario["text"],
            "category":    category,
            "required":    get_required(category),
            "explanation": get_explanation(category),
            "generated":   False,
        }

# ── Warm cache on startup ─────────────────────────────────

def warm_cache() -> None:
    print("Warming classification cache...")
    for scenario in SCENARIOS:
        classify(scenario["text"])
    print(f"Cache ready — {len(SCENARIOS)} scenarios pre-classified.")