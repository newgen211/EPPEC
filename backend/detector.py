# File: backend/detector.py

import io
import os
import time
from pathlib import Path

from PIL import Image
from ultralytics import YOLO

MODELS_DIR = Path(__file__).parent.parent / "models"
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.25))

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
    model = load_model(model_type)

    results = model.predict(image, conf=CONFIDENCE_THRESHOLD, verbose=False)

    detections = []
    low_confidence = []

    if results and len(results) > 0:
        result = results[0]
        if result.boxes is not None:
            for box in result.boxes:
                label      = result.names[int(box.cls)]
                confidence = round(float(box.conf), 3)

                detections.append({
                    "label":      label,
                    "confidence": confidence,
                    "bbox": {
                        "x1": round(float(box.xyxy[0][0]), 1),
                        "y1": round(float(box.xyxy[0][1]), 1),
                        "x2": round(float(box.xyxy[0][2]), 1),
                        "y2": round(float(box.xyxy[0][3]), 1),
                    }
                })

                if confidence < CONFIDENCE_THRESHOLD:
                    low_confidence.append(label)

    return {
        "model_type":      model_type,
        "detections":      detections,
        "low_confidence":  low_confidence,   # items needing manual confirm
        "num_detections":  len(detections),
        "elapsed_time":    round(time.time() - start_time, 3),
        "image_size":      image.size,
    }