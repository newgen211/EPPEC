# File: backend/detector.py

import io
import os
import time
from pathlib import Path

from PIL import Image, ImageOps
from ultralytics import YOLO

MODELS_DIR = Path(__file__).parent.parent / "models"
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.25))

# ── Label maps ────────────────────────────────────────────

MEDICAL_LABEL_MAP: dict[str, str] = {
    "Coverall":   "coverall",
    "Coveralls":  "coverall",
    "Face_Shield": "face_shield",
    "Face_Shields": "face_shield",
    "Gloves":     "gloves",
    "Glovess":    "gloves",
    "Goggles":    "goggles",
    "Goggless":   "goggles",
    "Mask":       "mask",
    "Masks":      "mask",
}

CONSTRUCTION_LABEL_MAP: dict[str, str] = {
    "hard_hat":       "hard_hat",
    "gloves":         "gloves",
    "safety_vest":    "safety_vest",
    "eye_protection": "eye_protection",
}

# ── Helpers ───────────────────────────────────────────────

def normalize_label(label: str, model_type: str) -> str:
    if model_type == "medical":
        return MEDICAL_LABEL_MAP.get(label, label.lower().replace(" ", "_"))
    elif model_type == "construction":
        return CONSTRUCTION_LABEL_MAP.get(label, label.lower().replace(" ", "_"))
    return label.lower().replace(" ", "_")

# ── Model cache ───────────────────────────────────────────

_model_cache: dict = {}

def load_model(model_type: str) -> YOLO:
    if model_type not in _model_cache:
        if model_type == "construction":
            model_path = MODELS_DIR / "construction_ppe_detector_best.pt"
        elif model_type == "medical":
            model_path = MODELS_DIR / "medical_ppe_detector_best.pt"
        else:
            raise ValueError(f"Unknown model type: {model_type}")

        if not model_path.exists():
            raise FileNotFoundError(f"Model not found at {model_path}")

        print(f"[YOLO] loading {model_type} model from {model_path}")
        _model_cache[model_type] = YOLO(str(model_path))

    return _model_cache[model_type]

# ── Detection ─────────────────────────────────────────────

def run_detection(image_bytes: bytes, model_type: str = "medical") -> dict:
    start_time = time.time()

    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image).convert("RGB")

    model = load_model(model_type)
    results = model.predict(image, conf=CONFIDENCE_THRESHOLD, verbose=False)

    detections = []
    low_confidence = []

    if results and len(results) > 0:
        result = results[0]
        if result.boxes is not None:
            for box in result.boxes:
                raw_class        = result.names[int(box.cls.item())]
                normalized_class = normalize_label(raw_class, model_type)
                confidence       = round(float(box.conf.item()), 4)
                xyxy             = box.xyxy[0].tolist()

                detections.append({
                    "label":      normalized_class,   # what grader uses
                    "raw_class":  raw_class,           # what model actually returned
                    "confidence": confidence,
                    "bbox": {
                        "x1": round(float(xyxy[0]), 2),
                        "y1": round(float(xyxy[1]), 2),
                        "x2": round(float(xyxy[2]), 2),
                        "y2": round(float(xyxy[3]), 2),
                    }
                })

                if confidence < CONFIDENCE_THRESHOLD:
                    low_confidence.append(normalized_class)

    return {
        "model_type":     model_type,
        "detections":     detections,
        "low_confidence": low_confidence,
        "num_detections": len(detections),
        "elapsed_time":   round(time.time() - start_time, 3),
        "image_size":     image.size,
    }