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
