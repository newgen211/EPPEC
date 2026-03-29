# File: backend/main.py

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import base64

from test_detector import run_detection as test_run_detection
from pydantic import BaseModel
from classifier import classify, warm_cache, generate_scenario
from scenarios import get_all, get_by_id
from ppe_rules import grade


@asynccontextmanager
async def lifespan(app: FastAPI):
    warm_cache()   # pre-classify all hardcoded scenarios on startup
    yield


app = FastAPI(title="EPPEC API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"ok": True, "message": "EPPEC backend running"}

@app.post("/test-detect")
async def test_detect(file: UploadFile = File(...), model_type: str = Form(...)):
    if model_type not in ["construction", "medical"]:
        return {
            "error": f"Invalid model_type: {model_type}. Must be 'construction' or 'medical'"
        }

    try:
        image_bytes = await file.read()
        result = test_run_detection(image_bytes, model_type)
        return result
    except Exception as e:
        return {"error": str(e)}

@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()

            message_type = data.get("type")
            if message_type != "frame":
                await websocket.send_json({
                    "type": "error",
                    "error": f"Unsupported message type: {message_type}"
                })
                continue

            frame_id = data.get("frame_id")
            model_type = data.get("model_type")
            image_b64 = data.get("image")

            if model_type not in ["construction", "medical"]:
                await websocket.send_json({
                    "type": "error",
                    "frame_id": frame_id,
                    "error": f"Invalid model_type: {model_type}"
                })
                continue

            try:
                image_bytes = base64.b64decode(image_b64)
                result = test_run_detection(image_bytes, model_type)
                result["type"] = "detection_result"
                result["frame_id"] = frame_id
                await websocket.send_json(result)
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "frame_id": frame_id,
                    "error": str(e)
                })

    except WebSocketDisconnect:
        print("[WS] Client disconnected")

class ClassifyRequest(BaseModel):
    text: str

class SubmitRequest(BaseModel):
    scenario_text: str
    selected: list[str]

# ── Routes ────────────────────────────────────────────────

@app.get("/scenarios")
def scenarios():
    return get_all()


@app.get("/scenarios/generate")        # must be above /{scenario_id}
def generate():
    return generate_scenario()


@app.get("/scenarios/{scenario_id}")
def scenario_by_id(scenario_id: int):
    scenario = get_by_id(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@app.post("/classify")
def classify_scenario(body: ClassifyRequest):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    return classify(body.text)


@app.post("/submit")
def submit(body: SubmitRequest):
    if not body.scenario_text.strip():
        raise HTTPException(status_code=400, detail="scenario_text cannot be empty")
    if not body.selected:
        raise HTTPException(status_code=400, detail="selected cannot be empty")

    classification = classify(body.scenario_text)
    result = grade(classification["required"], body.selected)

    return {
        "scenario":    body.scenario_text,
        "category":    classification["category"],
        "required":    classification["required"],
        "selected":    body.selected,
        "outcome":     result["outcome"],
        "correct":     result["correct"],
        "missing":     result["missing"],
        "extra":       result["extra"],
        "explanation": classification["explanation"],
    }

# ── File collection utility ─────────────────────────────────

@app.post("/detect/upload")
async def detect_upload(
    file: UploadFile = File(...),
    model_type: str = "medical"
):
    image_bytes = await file.read()
    return test_run_detection(image_bytes, model_type)
    
# ── Combined detection and grading route ────────────────────────────────
@app.post("/detect-and-grade")
async def detect_and_grade(
    scenario_text: str,
    file: UploadFile = File(...),
    model_type: str = "medical"
):
    if not scenario_text.strip():
        raise HTTPException(status_code=400, detail="scenario_text cannot be empty")

    image_bytes    = await file.read()
    detection      = test_run_detection(image_bytes, model_type)
    classification = classify(scenario_text)
    detected_labels = [d["label"] for d in detection["detections"]]
    result         = grade(classification["required"], detected_labels)

    return {
        "scenario":       scenario_text,
        "category":       classification["category"],
        "required":       classification["required"],
        "explanation":    classification["explanation"],
        "detections":     detection["detections"],
        "low_confidence": detection["low_confidence"],
        "num_detections": detection["num_detections"],
        "elapsed_time":   detection["elapsed_time"],
        "outcome":        result["outcome"],
        "correct":        result["correct"],
        "missing":        result["missing"],
        "extra":          result["extra"],
    }