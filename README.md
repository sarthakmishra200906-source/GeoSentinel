# GeoSentinel / Resq-AI

Resq-AI is an AI-powered disaster management system with a React frontend,
Express/MongoDB backend, and FastAPI machine-learning service.

## Project layout

- `Frontend/Resq-AI`: React + Vite frontend
- `server`: Express API and MongoDB models
- `ml_service`: FastAPI inference service scaffold

## Run locally

### Frontend

```powershell
cd Frontend\Resq-AI
npm install
npm run dev
```

### Backend

```powershell
cd server
npm install
Copy-Item .env.example .env
npm start
```

Set `MONGO_URI` in `server\.env` before using report endpoints. The API
health check is available at `http://localhost:5000/api/health`.

### ML service

```powershell
cd ml_service
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
