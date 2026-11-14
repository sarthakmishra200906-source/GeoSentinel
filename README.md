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
- Added admin audit events for report, verification, guideline, and rescue-center
  mutations, including actor, status transition, reason, changes, and request ID.
- Added verified government-domain document ingestion for text, Markdown, and
  extractable PDFs with checksum deduplication and page-aware chunks.
- Added an optional OpenAI-compatible grounded-answer boundary. It fails explicitly
  when the provider is unavailable and never answers from unapproved context.
- Added rescue-center editing with optimistic version checks, duplicate detection,
  search, last-verified details, and directions links.
- Windy Map Forecast is the primary interactive weather map. OpenWeather is an
  optional backend enhancement for exact weather readings, regional markers,
  weather tiles, and ML feature enrichment; the map does not depend on it.
- Added server-side OpenWeather tile proxying and regional weather point readings.
- Cyclone overlays use current GDACS tropical-cyclone events only. If the live
  provider is unavailable or has no active/forming events, no cyclone is shown.
- Added Express-to-FastAPI flood prediction proxying with Open-Meteo weather and
  Global Flood telemetry, explicit dry-run simulation mode, cached basic safety
  answers, admin health checks, and user notifications.

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

The frontend uses Windy as the primary map provider. Set
`Frontend\Resq-AI\.env.local` from the frontend example and provide
`VITE_WINDY_MAP_FORECAST_KEY`. The optional
`VITE_WINDY_POINT_FORECAST_KEY` is reserved for point-forecast integrations.
OpenWeather may remain unset when only the Windy map is needed; weather-
dependent backend features will report unavailable instead of fabricating data.

Grounded chat is retrieval-only until an approved provider is configured. To enable
Google Gemini, set `GOOGLE_GEMINI_API_KEY` (or `GEMINI_API_KEY` /
`GOOGLE_API_KEY`) and optionally `GOOGLE_GEMINI_MODEL`. A legacy `LLM_API_KEY`
is treated as a Gemini key only when `LLM_API_URL` is empty.
When Gemini is configured, the grounded-chat service tries the configured model
first and then its supported fallback model list. Successful chat responses
identify the provider and model without exposing credentials.
Common emergency questions are answered by the in-process FAQ cache before the
controller loads the user or approved RAG documents from MongoDB. Cache matches
use normalized word boundaries to avoid accidental substring matches; unmatched
questions continue through authenticated user lookup, approved-document
retrieval, and Gemini grounding.
Alternatively, set `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`,
`LLM_TIMEOUT_MS`, and `LLM_MAX_TOKENS` in the backend environment. The backend sends
only redacted, approved chunks to that endpoint and returns an explicit provider
status when it is unavailable.

For local testing only, `ALLOW_ADMIN_REGISTRATION=true` grants accounts selecting
the admin account type immediate admin access. Set it to `false` before hosting;
production admin approval should be restored.

Local help-request images are written to `Backend\server\uploads` during development.
Only the generated file path and metadata are stored in MongoDB. For production,
replace this local adapter with a cloud object-storage adapter.

Guideline uploads are limited to government-domain sources and are held in `pending`
status until an admin approves them. PDF uploads use `pdf-parse` for text extraction;
scanned/image-only PDFs are rejected as having no extractable text. Production still
requires malware scanning and durable object storage before accepting untrusted files.

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
- `GET /api/weather/dashboard` for live India and monitored-city telemetry
- `GET /api/weather/states` for state danger summaries and coverage status
- `GET /api/weather/trends?state=Odisha` for 12-month weather and discharge trends
- `GET /api/weather/tiles/:layer/:z/:x/:y.png` for proxied weather tiles
- `GET /api/weather/storms` for live GDACS cyclone events (empty when unavailable)
- `POST /api/prediction` with `{ "latitude": 28.6, "longitude": 77.2 }`;
  responses separate rain outlook from active flood risk and identify proxy
  calibration, source, timestamp, and warnings
- `POST /api/prediction/simulate` for admins; always returns `SIMULATED`
- `GET /api/notifications` for authenticated users
- `POST /api/notifications` for admins

### ML service

```powershell
cd Backend\ml_service
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Train the local, non-operational baseline from the verified Kaggle archive
(`data\kaggle\playground-series-s4e5.zip`):

```powershell
python Backend\ml_service\training\train_model.py
```

The model artifact is generated under `Backend\ml_service\model`. The telemetry
artifact is calibrated from Open-Meteo historical rainfall and river-discharge
data and is used by FastAPI for live physical features. Its labels are proxy
thresholds until verified flood observations are added.

### Start all local services

From the repository root, run:

```powershell
python scripts\start_local.py
```

This starts the Express backend, FastAPI service, and Vite frontend together.
Press `Ctrl+C` once to stop all three processes. Validate the Kaggle archive
before training with:

If one of these services is already healthy on its configured local port,
`start_local.py` reuses it instead of starting a duplicate process. This avoids
Windows port `10048` errors when the script is run more than once.

```powershell
python scripts\validate_dataset.py
```

With the services running, run local smoke checks:

```powershell
python scripts\smoke_local.py
```

The smoke runner prints live JSON previews for the dashboard, state matrix,
selected-state monthly trends, and a real map prediction at Bhubaneswar. Use a
different monitored state with:

```powershell
python scripts\smoke_local.py --state Kerala
```

The command exits with code `0` only when the frontend, backend, ML service,
live analytics endpoints, and separated prediction signals pass.
