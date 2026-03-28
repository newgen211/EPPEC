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
    prompt = (
        "You are a medical training scenario generator. "
        "Generate a single realistic clinical scenario that requires a specific PPE level. "
        f"The scenario must clearly map to one of these categories: {', '.join(CATEGORIES)}.\n\n"
        "Respond with JSON only in this exact format, no markdown, no extra text:\n"
        '{"text": "the scenario here", "category": "the category here"}'
    )

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )

    raw = response.text.strip()

    try:
        data = json.loads(raw)
        category = data["category"]
        if category not in PPE_RULES:
            category = "Standard"
        return {
            "id": 0,  # 0 = AI generated
            "text": data["text"],
            "category": category,
            "required": get_required(category),
            "explanation": get_explanation(category),
            "generated": True,
        }
    except Exception as e:
        print(f"[warning] failed to parse generated scenario: {e}")
        # fallback to demo scenario if generation fails
        return {
            "id": 0,
            "text": "A patient under airborne isolation precautions requires assessment.",
            "category": "Airborne",
            "required": get_required("Airborne"),
            "explanation": get_explanation("Airborne"),
            "generated": True,
        }

# ── Warm cache on startup ─────────────────────────────────

def warm_cache() -> None:
    print("Warming classification cache...")
    for scenario in SCENARIOS:
        classify(scenario["text"])
    print(f"Cache ready — {len(SCENARIOS)} scenarios pre-classified.")