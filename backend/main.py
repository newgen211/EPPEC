# File: backend/main.py
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from test_detector import run_detection

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
    """
    Test PPE detection on an uploaded image.
    
    Args:
        file: Image file
        model_type: 'construction' or 'medical'
    
    Returns:
        Detection results with boxes and confidence scores
    """
    if model_type not in ["construction", "medical"]:
        return {"error": f"Invalid model_type: {model_type}. Must be 'construction' or 'medical'"}
    
    try:
        image_bytes = await file.read()
        result = run_detection(image_bytes, model_type)
        return result
    except Exception as e:
        return {"error": str(e)}
