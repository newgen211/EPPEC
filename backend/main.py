from fastapi import FastAPI, File, UploadFile, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from test_detector import run_detection
import base64

app = FastAPI(title="EPPEC API")

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
        return {"error": f"Invalid model_type: {model_type}. Must be 'construction' or 'medical'"}

    try:
        image_bytes = await file.read()
        result = run_detection(image_bytes, model_type)
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
                result = run_detection(image_bytes, model_type)
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