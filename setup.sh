
# ── DIRECTORIES ──────────────────────────────────────────

mkdir -p frontend/src/screens
mkdir -p frontend/src/components
mkdir -p frontend/src/types
mkdir -p backend
mkdir -p models
mkdir -p data

# ═════════════════════════════════════════════════════════
# FRONTEND CONFIG (needed to actually run)
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

# Minimum needed for React to mount — empty beyond this
cat > frontend/src/main.tsx << 'EOF'
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

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

# ── EMPTY FILES ───────────────────────────────────────────

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

touch backend/main.py
touch backend/classifier.py
touch backend/detector.py
touch backend/ppe_rules.py
touch backend/scenarios.py

# ═════════════════════════════════════════════════════════
# DATA
# ═════════════════════════════════════════════════════════

echo "{}" > data/ppe_cache.json
echo "[]" > data/scenarios.json
echo "# Drop ppe_best.pt here" > models/README.md

# ═════════════════════════════════════════════════════════
# ROOT
# ═════════════════════════════════════════════════════════

cat > .env << 'EOF'
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

# Cache
data/ppe_cache.json

# OS
.DS_Store
Thumbs.db
EOF

# ── PUSH ─────────────────────────────────────────────────

git add .
git commit -m "scaffold: project structure, config files, empty stubs"
git push

echo ""
echo "✅ Done."
echo ""
echo "  Frontend → cd frontend && npm install && npm run dev"
echo "  Backend  → cd backend && pip install -r requirements.txt && uvicorn main:app --reload"