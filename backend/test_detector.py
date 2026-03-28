from ultralytics import YOLO
from PIL import Image, ImageOps
import io
import time
from pathlib import Path

_model_cache = {}
MODELS_DIR = Path(__file__).parent.parent / "models"

MEDICAL_LABEL_MAP = {
    "Coverall": "coverall",
    "Coveralls": "coverall",
    "Face_Shield": "face_shield",
    "Face_Shields": "face_shield",
    "Gloves": "gloves",
    "Glovess": "gloves",
    "Goggles": "goggles",
    "Goggless": "goggles",
    "Mask": "mask",
    "Masks": "mask",
}

CONSTRUCTION_LABEL_MAP = {
    "hard_hat": "hard_hat",
    "gloves": "gloves",
    "safety_vest": "safety_vest",
    "eye_protection": "eye_protection",
}

def normalize_label(label: str, model_type: str) -> str:
    if model_type == "medical":
        return MEDICAL_LABEL_MAP.get(label, label.lower().replace(" ", "_"))
    elif model_type == "construction":
        return CONSTRUCTION_LABEL_MAP.get(label, label.lower().replace(" ", "_"))
    return label.lower().replace(" ", "_")


def load_model(model_type: str):
    if model_type not in _model_cache:
        if model_type == "construction":
            model_path = MODELS_DIR / "construction_ppe_detector_best.pt"
        elif model_type == "medical":
            model_path = MODELS_DIR / "medical_ppe_detector_best.pt"
        else:
            raise ValueError(f"Unknown model type: {model_type}")

        if not model_path.exists():
            raise FileNotFoundError(f"Model not found at {model_path}")

        _model_cache[model_type] = YOLO(str(model_path))

    return _model_cache[model_type]


def run_detection(image_bytes: bytes, model_type: str) -> dict:
    start_time = time.time()

    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image).convert("RGB")

    model = load_model(model_type)

    # Match Colab threshold first
    results = model.predict(image, conf=0.25, verbose=False)

    detections = []
    if results and len(results) > 0:
        result = results[0]
        if result.boxes is not None:
            for box in result.boxes:
                raw_class = result.names[int(box.cls.item())]
                normalized_class = normalize_label(raw_class, model_type)

                xyxy = box.xyxy[0].tolist()
                conf = float(box.conf.item())

                detections.append({
                    "class": normalized_class,
                    "raw_class": raw_class,
                    "confidence": round(conf, 4),
                    "bbox": {
                        "x1": round(float(xyxy[0]), 2),
                        "y1": round(float(xyxy[1]), 2),
                        "x2": round(float(xyxy[2]), 2),
                        "y2": round(float(xyxy[3]), 2),
                    }
                })

    elapsed_time = time.time() - start_time

    return {
        "model_type": model_type,
        "detections": detections,
        "num_detections": len(detections),
        "elapsed_time": round(elapsed_time, 3),
        "image_size": image.size
    }