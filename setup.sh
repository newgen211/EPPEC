
# ── DIRECTORIES ──────────────────────────────────────────

mkdir -p frontend/src/screens
mkdir -p frontend/src/components
mkdir -p frontend/src/types
mkdir -p backend
mkdir -p models
mkdir -p data

# ═════════════════════════════════════════════════════════
# FRONTEND CONFIG
# ═════════════════════════════════════════════════════════

cat > frontend/package.json << 'EOF'
{
  "name": "eppec-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev":     "vite",
    "build":   "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react":     "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react":         "^18.2.0",
    "@types/react-dom":     "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript":           "^5.3.0",
    "vite":                 "^5.1.0"
  }
}
EOF

cat > frontend/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
EOF

cat > frontend/tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF

cat > frontend/vite.config.ts << 'EOF'
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
EOF

cat > frontend/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EPPEC</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

cat > frontend/src/styles.css << 'EOF'
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
}
EOF

cat > frontend/src/main.tsx << 'EOF'
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
EOF

cat > frontend/src/App.tsx << 'EOF'
// File: frontend/src/App.tsx
export default function App() {
  return <div>EPPEC</div>
}
EOF

# ── EMPTY STUBS ───────────────────────────────────────────

touch frontend/src/types/index.ts
touch frontend/src/api.ts
touch frontend/src/screens/ScenarioScreen.tsx
touch frontend/src/screens/TimerScreen.tsx
touch frontend/src/screens/ResultScreen.tsx
touch frontend/src/components/CameraFeed.tsx
touch frontend/src/components/PPEChecklist.tsx
touch frontend/src/components/ConfidenceBar.tsx

# ═════════════════════════════════════════════════════════
# BACKEND
# ═════════════════════════════════════════════════════════

cat > backend/requirements.txt << 'EOF'
fastapi
uvicorn
ultralytics
openai
python-dotenv
python-multipart
Pillow
numpy
EOF

cat > backend/main.py << 'EOF'
# File: backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
EOF

touch backend/classifier.py
touch backend/detector.py
touch backend/ppe_rules.py
touch backend/scenarios.py

# ═════════════════════════════════════════════════════════
# DATA
# ═════════════════════════════════════════════════════════

echo "[]" > data/scenarios.json
echo "# Drop ppe_best.pt here" > models/README.md

# ═════════════════════════════════════════════════════════
# ROOT
# ═════════════════════════════════════════════════════════

cat > .env.example << 'EOF'
OPENAI_API_KEY=your-key-here
CONFIDENCE_THRESHOLD=0.6
VITE_API_URL=http://localhost:8000
EOF

cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
.venv/
venv/

# Node
frontend/node_modules/
frontend/dist/

# YOLO weights
models/*.pt

# Env
.env

# OS
.DS_Store
Thumbs.db
EOF

cat > README.md << 'EOF'
# EPPEC — PPE Scenario Classifier

## Setup

### 1. Environment
```bash
cp .env.example .env
# then fill in your OPENAI_API_KEY
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
EOF

# ── PUSH ─────────────────────────────────────────────────

git add .
git commit -m "scaffold: runnable backend stub, React scaffold, .env.example"
git push

echo ""
echo "✅ Done."
echo ""
echo "  1. cp .env.example .env  →  fill in your keys"
echo "  2. Backend  → cd backend  && pip install -r requirements.txt && uvicorn main:app --reload"
echo "  3. Frontend → cd frontend && npm install && npm run dev"