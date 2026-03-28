"""
Lightweight PPE model testing module.
Loads and runs YOLOv8 models for construction and medical PPE detection.
"""

from ultralytics import YOLO
from PIL import Image
import io
import time
from pathlib import Path

# Model cache to avoid reloading
_model_cache = {}
MODELS_DIR = Path(__file__).parent.parent / "models"

def load_model(model_type: str):
    """
    Load a model from cache or disk.
    Args:
        model_type: 'construction' or 'medical'
    Returns:
        Loaded YOLO model
    """
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
    """
    Run PPE detection on an image.
    Args:
        image_bytes: Image data in bytes
        model_type: 'construction' or 'medical'
    Returns:
        dict with detections, confidences, and performance metrics
    """
    start_time = time.time()
    
    # Load image
    image = Image.open(io.BytesIO(image_bytes))
    
    # Load model
    model = load_model(model_type)
    
    # Run inference
    results = model.predict(image, conf=0.3)
    
    # Parse results
    detections = []
    if results and len(results) > 0:
        result = results[0]
        if result.boxes is not None:
            for box in result.boxes:
                detection = {
                    "class": result.names[int(box.cls)],
                    "confidence": float(box.conf),
                    "bbox": {
                        "x1": float(box.xyxy[0][0]),
                        "y1": float(box.xyxy[0][1]),
                        "x2": float(box.xyxy[0][2]),
                        "y2": float(box.xyxy[0][3])
                    }
                }
                detections.append(detection)
    
    elapsed_time = time.time() - start_time
    
    return {
        "model_type": model_type,
        "detections": detections,
        "num_detections": len(detections),
        "elapsed_time": round(elapsed_time, 3),
        "image_size": image.size
    }
