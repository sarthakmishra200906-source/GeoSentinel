# GeoSentinel / Resq-AI

Resq-AI is an AI-powered disaster management system with a React frontend,
Express/MongoDB backend, and FastAPI machine-learning service.

## Current status

The local baseline, weather map, non-operational flood model, admin
verification flow, rescue-center APIs, and approved-document retrieval
foundation are implemented. The flood model is not an operational alert model,
and the retrieval foundation does not call an LLM until a provider and
document-review process are configured.

## Completed backend work

- Added production-oriented User, Household, and SOS incident schemas.
- Added JWT registration, login, and protected current-user authentication.
- Added bcrypt password hashing and role-based responder/admin authorization.
- Added protected AI chat endpoint with rolling `memorySummary` updates.
- Added guest SOS reporting without creating guest user accounts.
- Added SOS emergency types, location/contact validation, and incident status handling.
- Added automatic deletion of resolved SOS incidents 24 hours after resolution using
  a MongoDB TTL index.
- Added authenticated and guest help reports with required contact details, location,
  optional image uploads, and user ownership for signed-in reports.
- Added local image storage with file-size/type limits, JPEG compression, and MongoDB
  image path metadata so binary files are not stored in documents.
- Added server-side OpenWeather tile proxying, regional weather point readings, and
  optional cyclone track configuration.

## Frontend features

- Responsive navigation: compact mobile menu and full tablet/desktop navigation.
- Scrollable responsive cards for guidelines, help requests, login, registration, and
  the authenticated AI assistant.
- Weather map controls with temperature, rain, wind, cloud, and cyclone layers.
- Current-location map control and editable location fields in the Help box.

## Environment configuration

Copy `Backend\server\.env.example` to `Backend\server\.env` and set your own values.
Never commit real API keys or secrets. The OpenWeather key belongs only in the backend:

```env
OPENWEATHER_API_KEY=your-openweather-api-key
```

The optional `WEATHER_STORM_TRACKS_JSON` value accepts an array such as:

```env
WEATHER_STORM_TRACKS_JSON=[{"id":"storm-1","name":"Example","coordinates":[[20,85],[21,86]]}]
```

Local help-request images are written to `Backend\server\uploads` during development.
Only the generated file path and metadata are stored in MongoDB. For production,
replace this local adapter with a cloud object-storage adapter.

## Project layout

- `Frontend/Resq-AI`: React + Vite frontend
- `Backend/server`: Express API and MongoDB models
- `Backend/ml_service`: FastAPI inference service scaffold

## Run locally

### Frontend

```powershell
cd Frontend\Resq-AI
npm install
npm run dev
```

### Backend

```powershell
cd Backend\server
npm install
Copy-Item .env.example .env
npm start
```

Set `MONGO_URI` in `Backend\server\.env` before using report endpoints. The API
health check is available at `http://localhost:5000/api/health`. Set a long
random `JWT_SECRET` in the same file before using `/api/auth/register` or
`/api/auth/login`.

Authentication endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` with a `Bearer` token
- `POST /api/chat/message` with a `Bearer` token and `{ "message": "..." }`
- `POST /api/sos/guest` for guest emergency reports
- `PATCH /api/sos/:id/resolve` for authenticated admins/responders
- `POST /api/reports` for guest or authenticated multipart help reports
- `GET /api/weather/points` for regional weather readings
- `GET /api/weather/tiles/:layer/:z/:x/:y.png` for proxied weather tiles
- `GET /api/weather/storms` for configured cyclone tracks

### ML service

```powershell
cd Backend\ml_service
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Train the local, non-operational baseline from the verified Kaggle archive:

```powershell
python Backend\ml_service\training\train_model.py
```

The model artifact is generated under `Backend\ml_service\model` and is
ignored by git. It uses only the dataset's 20 validated features; live weather
is intentionally not converted into those features.

### Start all local services

From the repository root, run:

```powershell
python scripts\start_local.py
```

This starts the Express backend, FastAPI service, and Vite frontend together.
Press `Ctrl+C` once to stop all three processes. Validate the Kaggle archive
before training with:

```powershell
python scripts\validate_dataset.py
```

With the services running, run local smoke checks:

```powershell
python scripts\smoke_local.py
```
