# GeoSentinel / Resq-AI

Resq-AI is an AI-powered disaster management system with a React frontend,
Express/MongoDB backend, and FastAPI machine-learning service.

## Current status

The app provides public map, safety, help-report, notification, and AI-assistant
features. Sign-in is reserved for administrators. Weather and flood-risk
indicators are decision-support data, not official emergency alerts. The live
cyclone panel shows provider-reported events and local telemetry; it does not
predict landfall or cyclone impacts.

Do not treat synthetic simulation data as live weather or an official forecast.
Keep live provider data separate from admin-only synthetic simulations.

## Completed backend work

- Added production-oriented User, Household, and SOS incident schemas.
- Added JWT authentication for administrator access and protected admin APIs.
- Added bcrypt password hashing and role-based responder/admin authorization.
- Added public AI chat with optional signed-in admin context and request limiting.
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
- Cyclone overlays use GDACS tropical-cyclone events for the India region,
  including events ended within the last 14 days. The shared user/admin Windy
  map labels active, upcoming, and recent events separately and includes a
  live-analysis panel for provider status and current local weather/flood-risk
  proxy telemetry at a selected reported position. It does not claim that
  proxy telemetry is a cyclone-impact forecast. Provider failure is distinct
  from an available feed with no current or recent events.
- Admin simulation supports custom 2–20 waypoint global routes with
  date-line-aware interpolation. Only the track is global: impacts remain
  Odisha-district synthetic proxies plus synthetic state context.
- Completed simulation runs automatically archive a server-generated PDF in
  MongoDB, with a SHA-256 digest and inline preview/download endpoints. MongoDB
  document storage is capped at 12 MiB per PDF; this is not object storage or
  a digital signature.
- Added Express-to-FastAPI flood prediction proxying with Open-Meteo weather and
  Global Flood telemetry, explicit dry-run simulation mode, cached basic safety
  answers, admin health checks, and user notifications.

## Frontend features

- Responsive navigation: compact mobile menu and full tablet/desktop navigation.
- Scrollable responsive cards for guidelines, help requests, admin sign-in,
  notifications, and the public AI assistant.
- Browser speech recognition for voice questions and speech synthesis for
  reading assistant answers when supported.
- Notification close controls that dismiss notices for signed-in administrators
  and remember dismissals on public guest browsers.
- Weather map controls with temperature, rain, wind, cloud, and cyclone layers.
- An admin Live cyclone map navigation item that uses the same live map
  component as the user view; simulated tracks are never injected into it.
- Admin Operations includes a paged Help requests inbox; simulation runs do
  not create citizen reports or mutate rescue-center records.
- Simulation restores the last selected run when returning from another
  admin view. Its synthetic clock advances only when an admin presses **Step**.
- Starting a new simulation preserves prior runs. Owner-scoped run history is
  paged; each loaded run can be viewed, downloaded as a complete synthetic
  evidence JSON (including all persisted hours), or individually deleted with
  its timesteps and archived PDFs. Audit events are retained.
- Simulation maps can show reference-only open/limited rescue-center records
  from the live registry; an empty registry is shown as empty, not filled with
  demo records.
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

The public assistant answers cached questions without a provider. Other general
questions are sent to the configured LLM; answers are labeled as general AI
unless grounded in an approved document. If no provider is configured or it
fails, the assistant explains why it could not answer. To enable grounded
answers from an approved document, set
`GOOGLE_GEMINI_API_KEY` (or `GEMINI_API_KEY` /
`GOOGLE_API_KEY`) and optionally `GOOGLE_GEMINI_MODEL`. A legacy `LLM_API_KEY`
is treated as a Gemini key only when `LLM_API_URL` is empty.
When Gemini is configured, the grounded-chat service tries the configured model
first and then its supported fallback model list. Successful chat responses
identify the provider and model without exposing credentials.
Common emergency questions are answered by the in-process FAQ cache before
approved documents are retrieved. Cache matches use normalized word boundaries
to avoid accidental substring matches. Chat requests are limited to 30 per
client per 15 minutes.
Alternatively, set `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`,
`LLM_TIMEOUT_MS`, and `LLM_MAX_TOKENS` in the backend environment. The backend sends
only redacted, approved chunks to that endpoint and returns an explicit provider
status when it is unavailable.

### Administrator authentication

Set these **server-only** variables in `Backend\server\.env` for local testing
and in Render for production:

```env
NODE_ENV=production
BOOTSTRAP_ADMIN_EMAIL=your-admin-email
BOOTSTRAP_ADMIN_PASSWORD=use-a-new-random-secret-of-at-least-16-characters
```

For the first production startup, set `BOOTSTRAP_ADMIN_EMAIL` to the intended
initial administrator and set `BOOTSTRAP_ADMIN_PASSWORD` to a new random
password. The backend hashes it and creates or promotes that account as
approved. After the first successful startup, remove both bootstrap variables
from Render; the bootstrap marker prevents later restarts from resetting the
password. Do not expose the admin password in Vercel, frontend variables,
source, or screenshots. Only existing admins can sign in; public users do not
need accounts for normal application features.

Password registration remains disabled in production. The legacy registration
and phone-verification APIs are not part of the public user experience.

The frontend needs:

```env
VITE_API_URL=https://your-backend-host/api
```

On Render, set `CORS_ORIGINS` to the exact Vercel origin (for example
`https://geo-sentinel-rust.vercel.app`) plus any origins that must remain
allowed. Keep the `/api` suffix in `VITE_API_URL`.

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

## Frontend deployment paths

Vite uses `/GeoSentinel/` for local development and GitHub Pages. On Vercel,
where `VERCEL=1` is set during the build, it uses `/` so asset URLs resolve
from the deployment domain root. Configure the Vercel project root directory
as `Frontend/Resq-AI`, with `npm run build` and `dist` as the output directory.
Set `VITE_API_URL` to the deployed Express API and allow the Vercel origin in
the backend CORS configuration; the local default points to `localhost` and
cannot serve a public deployment.

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
random `JWT_SECRET` in the same file before using administrator sign-in.

Authentication endpoints:

- `POST /api/auth/login` for approved administrators only
- `POST /api/auth/google` for existing administrators only
- `POST /api/auth/register` is disabled unless explicitly enabled in development
- `POST /api/auth/phone/send-otp` with a short-lived phone-verification token
- `POST /api/auth/phone/verify-otp` with a short-lived phone-verification token
- `GET /api/auth/me` with a `Bearer` token
- `GET /api/admin/users` and `PATCH /api/admin/users/:id/approval` for admins
- `GET /api/admin/verifications` and `PATCH /api/admin/verifications/:id` for admins
- `POST /api/chat/message` with `{ "message": "..." }` (optional admin bearer token)
- `POST /api/sos/guest` for guest emergency reports
- `PATCH /api/sos/:id/resolve` for authenticated admins/responders
- `POST /api/reports` for guest or authenticated multipart help reports
- `GET /api/weather/points` for regional weather readings
- `GET /api/weather/dashboard` for live India and monitored-city telemetry
- `GET /api/weather/states` for state danger summaries and coverage status
- `GET /api/weather/trends?state=Odisha` for 12-month weather and discharge trends
- `GET /api/weather/tiles/:layer/:z/:x/:y.png` for proxied weather tiles
- `GET /api/weather/storms` for current GDACS cyclone events; inspect `status`
  and `available` to distinguish no events from a provider outage
- `POST /api/prediction` with `{ "latitude": 28.6, "longitude": 77.2 }`;
  responses separate rain outlook from active flood risk and identify proxy
  calibration, source, timestamp, and warnings
- `POST /api/prediction/simulate` for admins; always returns `SIMULATED`
- `GET /api/notifications` for authenticated users
- `POST /api/notifications` for admins
- `GET /api/reports?limit=50` for the first admin help-report page; pass the
  returned `nextCursor` as `cursor` to load the next page
- `GET /api/reports/:id/image` for an authorized admin image preview
- `POST /api/simulation/scenarios` for admins
- `GET /api/simulation/scenarios` for admins
- `POST /api/simulation/runs` for admins
- `GET /api/simulation/runs` for admins
- `GET /api/simulation/runs/:id` for admins
- `GET /api/simulation/runs/:id/report` for admins
- `DELETE /api/simulation/runs/:id` for the owning admin; removes the run,
  timesteps, archived PDFs, and its scenario only when no other run uses it
- `GET /api/simulation/runs/:id/reports` to list archived PDF metadata
- `POST /api/simulation/runs/:id/reports` to store a PDF from recorded hours
- `DELETE /api/simulation/runs/:id/reports/:reportId` for the owning admin to
  delete one archived PDF without deleting its run or timesteps
- `GET /api/simulation/runs/:id/reports/:reportId/pdf` to preview a stored PDF;
  pass `?download=1` for attachment disposition
- `POST /api/simulation/runs/:id/step` for admins
- `POST /api/simulation/runs/:id/pause` for admins
- `POST /api/simulation/runs/:id/heartbeat` for admins

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

The local launcher verifies the GeoSentinel backend and frontend before reusing
them. If another app occupies the default ports, it selects free local ports
and points the launched frontend at the selected GeoSentinel API.

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
