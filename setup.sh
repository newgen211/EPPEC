#!/bin/bash

# ── BACKEND ──────────────────────────────────────────────

mkdir -p backend

cat > backend/main.py << 'EOF'
# File: backend/main.py
# FastAPI app — defines all API routes (/classify, /detect, /scenarios)

from fastapi import FastAPI

app = FastAPI()
EOF

cat > backend/classifier.py << 'EOF'
# File: backend/classifier.py
# GPT call + pre-classification cache logic
# Runs all scenarios through GPT on startup and writes ppe_cache.json
EOF

cat > backend/detector.py << 'EOF'
# File: backend/detector.py
# YOLO inference wrapper using ultralytics
# Accepts a base64 frame, returns list of {label, confidence}
EOF

cat > backend/ppe_rules.py << 'EOF'
# File: backend/ppe_rules.py
# Single source of truth: PPE category → required items

PPE_RULES = {
    "Standard":  {"Gloves"},
    "Droplet":   {"Gloves", "Gown", "Surgical Mask", "Eye Protection"},
    "Contact":   {"Gloves", "Gown"},
    "Airborne":  {"Gloves", "Gown", "N95", "Eye Protection"},
    "High-Risk": {"Gloves", "Gown", "N95", "Face Shield", "Eye Protection"},
}
EOF

cat > backend/scenarios.py << 'EOF'
# File: backend/scenarios.py
# Pre-written clinical scenario bank with correct category tags

SCENARIOS = [
    {"id": 1, "text": "Routine blood draw on a stable patient.", "category": "Standard"},
    {"id": 2, "text": "Patient presenting with fever and cough — suspected influenza.", "category": "Droplet"},
    {"id": 3, "text": "Entering an isolation room for a patient with a contact-spread infection.", "category": "Contact"},
    {"id": 4, "text": "Suspected tuberculosis — patient has persistent cough and night sweats.", "category": "Airborne"},
    {"id": 5, "text": "Emergency high-exposure procedure with aerosolization risk.", "category": "High-Risk"},
]

# Demo scenario — use this for the live presentation
DEMO_SCENARIO = SCENARIOS[3]
EOF

cat > backend/requirements.txt << 'EOF'
# File: backend/requirements.txt
fastapi
uvicorn
ultralytics
openai
python-dotenv
python-multipart
EOF

# ── FRONTEND ─────────────────────────────────────────────

mkdir -p frontend/src/screens
mkdir -p frontend/src/components

cat > frontend/src/screens/ScenarioScreen.jsx << 'EOF'
// File: frontend/src/screens/ScenarioScreen.jsx
// Displays the clinical scenario, triggers TTS, fires classify request on load

export default function ScenarioScreen({ scenario, onStart }) {
  return <div>{/* scenario text + speak button + start timer */}</div>
}
EOF

cat > frontend/src/screens/TimerScreen.jsx << 'EOF'
// File: frontend/src/screens/TimerScreen.jsx
// 30-second countdown with live camera feed — polls /detect every 1-2s

export default function TimerScreen({ scenario, onComplete }) {
  return <div>{/* countdown timer + CameraFeed + live detection preview */}</div>
}
EOF

cat > frontend/src/screens/ResultScreen.jsx << 'EOF'
// File: frontend/src/screens/ResultScreen.jsx
// Shows outcome: required vs detected, missing items, extra items, medical explanation

export default function ResultScreen({ required, detected, explanation }) {
  return <div>{/* PPEChecklist + ConfidenceBar + explanation text */}</div>
}
EOF

cat > frontend/src/components/CameraFeed.jsx << 'EOF'
// File: frontend/src/components/CameraFeed.jsx
// Handles getUserMedia, captures frames, and sends base64 frames to /detect

export default function CameraFeed({ onDetection }) {
  return <video>{/* webcam stream */}</video>
}
EOF

cat > frontend/src/components/PPEChecklist.jsx << 'EOF'
// File: frontend/src/components/PPEChecklist.jsx
// Three-column comparison: required / detected / missing with green/red indicators

export default function PPEChecklist({ required, detected }) {
  return <div>{/* checklist rows */}</div>
}
EOF

cat > frontend/src/components/ConfidenceBar.jsx << 'EOF'
// File: frontend/src/components/ConfidenceBar.jsx
// Displays per-item YOLO confidence score as a visual bar
// Items below the threshold trigger a manual confirm prompt

export default function ConfidenceBar({ label, confidence, threshold = 0.6 }) {
  return <div>{/* label + bar + low-confidence warning */}</div>
}
EOF

cat > frontend/src/api.js << 'EOF'
// File: frontend/src/api.js
// All fetch() calls to the backend in one place

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export const classifyScenario = (text) =>
  fetch(`${BASE_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then((r) => r.json())

export const detectPPE = (frameBase64) =>
  fetch(`${BASE_URL}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame: frameBase64 }),
  }).then((r) => r.json())

export const getScenarios = () =>
  fetch(`${BASE_URL}/scenarios`).then((r) => r.json())
EOF

cat > frontend/src/App.jsx << 'EOF'
// File: frontend/src/App.jsx
// Screen router — manages state machine: Scenario → Timer → Result

import { useState } from "react"
import ScenarioScreen from "./screens/ScenarioScreen"
import TimerScreen from "./screens/TimerScreen"
import ResultScreen from "./screens/ResultScreen"

export default function App() {
  const [screen, setScreen] = useState("scenario")
  const [result, setResult] = useState(null)

  return (
    <>
      {screen === "scenario" && <ScenarioScreen onStart={() => setScreen("timer")} />}
      {screen === "timer"    && <TimerScreen onComplete={(r) => { setResult(r); setScreen("result") }} />}
      {screen === "result"   && <ResultScreen {...result} onReset={() => setScreen("scenario")} />}
    </>
  )
}
EOF

cat > frontend/src/main.jsx << 'EOF'
// File: frontend/src/main.jsx
// React entry point

import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
EOF

# ── MODELS & DATA ─────────────────────────────────────────

mkdir -p models
mkdir -p data

cat > models/ppe_best.yaml << 'EOF'
# File: models/ppe_best.yaml
# YOLO class label config — maps model output indices to PPE item names

nc: 6  # number of classes
names:
  0: Gloves
  1: Gown
  2: Surgical Mask
  3: N95
  4: Face Shield
  5: Eye Protection
EOF

echo "# Place your YOLO weights file (ppe_best.pt) here" > models/ppe_best.pt

cat > data/scenarios.json << 'EOF'
[
  { "id": 1, "text": "Routine blood draw on a stable patient.", "category": "Standard" },
  { "id": 2, "text": "Patient presenting with fever and cough — suspected influenza.", "category": "Droplet" },
  { "id": 3, "text": "Entering an isolation room for a patient with a contact-spread infection.", "category": "Contact" },
  { "id": 4, "text": "Suspected tuberculosis — patient has persistent cough and night sweats.", "category": "Airborne" },
  { "id": 5, "text": "Emergency high-exposure procedure with aerosolization risk.", "category": "High-Risk" }
]
EOF

cat > data/ppe_cache.json << 'EOF'
{}
EOF

# ── ROOT FILES ────────────────────────────────────────────

cat > .env << 'EOF'
# File: .env
OPENAI_API_KEY=your-key-here
CONFIDENCE_THRESHOLD=0.6
VITE_API_URL=http://localhost:8000
EOF

# Push everything to GitHub
git add .
git commit -m "scaffold: add full project structure with starter files"
git push

echo "✅ EPPEC scaffolded and pushed to GitHub"