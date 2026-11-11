# GeoSentinel / Resq-AI Delivery Work Plan

This document is the source of truth for completing the disaster-management
platform safely. Work is intentionally split into small, testable phases.
Do not skip a phase gate to meet a demo deadline: an incorrect flood alert or
an invented emergency instruction is more harmful than a feature being absent.

## 1. Current baseline

### Already present

- React/Vite frontend with an India-centered Leaflet weather map.
- Express API with MongoDB connection, JWT authentication, user roles,
  reports, SOS incidents, weather tiles/points, and cyclone-track support.
- FastAPI ML service with a deterministic, explicitly non-operational
  flood-risk baseline and typed unavailable/stale/simulated responses.
- Authenticated grounded-chat endpoint with approved-document retrieval,
  citations, refusal states, and an optional provider boundary.
- Verified Kaggle Playground Series S4E5 archive at
  `data/kaggle/playground-series-s4e5.zip`; generated reports and model
  artifacts remain ignored.

### Important constraints

- Never place API keys, JWT secrets, database passwords, model credentials, or
  uploaded documents in git.
- Never present a fallback or simulated prediction as a live prediction.
- Every prediction must identify its data timestamp, source, model version, and
  whether it is live, simulated, stale, or unavailable.
- RAG answers must cite the source document and must refuse when the retrieved
  official context does not support an answer.
- Emergency advice is informational. The UI must direct users to local
  emergency services for immediate danger.

## 2. Target separation of responsibilities

```text
GeoSentinel/
  data/
    kaggle/                 # immutable source archives and dataset notes
    processed/              # generated, validated training tables (ignored)
  Backend/
    server/                 # Express API, auth, MongoDB, admin/user APIs
    ml_service/
      model/                # versioned model artifacts and metadata (ignored)
      training/              # reproducible training/evaluation scripts
    rag_service/            # document ingestion, retrieval, LLM grounding
      documents/             # local development only; production uses storage
      index/                 # local development only; production uses a
                              # managed/vector-capable store
  Frontend/
    Resq-AI/                # user and admin web application
```

MongoDB Atlas is the production system of record for users, reports, SOS
incidents, rescue centers, document metadata, audit events, and prediction
records. Uploaded binary files should use durable object storage in production;
MongoDB stores metadata, a checksum, ownership, status, and storage key.
Embeddings must be stored in a persistent vector index with a documented
backup/rebuild procedure, not only in a local container filesystem.

## 3. Ordered work packages

### Phase 0 - Baseline, safety, and reproducibility

**Goal:** make the current system measurable before adding behavior.

Tasks:

1. Record the current frontend, Express API, and FastAPI health behavior.
2. Add a single documented local configuration for API URLs, Atlas, weather,
   LLM, object storage, and model/RAG service URLs.
3. Ensure production CORS uses an allowlist instead of `*`.
4. Add request IDs, structured error responses, and health/readiness checks.
5. Add `.gitignore` coverage for datasets, model binaries, RAG indexes,
   uploads, and local environment files.
6. Add smoke tests for health, auth, protected routes, weather failure, and
   invalid uploads.

**Gate:** existing user flows still work, secrets are absent from git, and the
health endpoint distinguishes process health from dependency readiness.

### Phase 1 - Dataset and flood-risk model

**Goal:** build a defensible model contract; do not claim accuracy before
evaluation.

Tasks:

1. Inspect the Kaggle archive and document its license/source, columns,
   missing values, target distribution, units, and leakage risks.
2. Store the immutable source archive under `data/kaggle/` and keep generated
   tables outside git.
3. Define a versioned feature schema. Never silently fill a missing real-time
   feature with a made-up value.
4. Create a reproducible training script with fixed seed, train/validation/test
   split, preprocessing, baseline comparison, and saved metadata.
5. Evaluate regression/classification behavior appropriate to the actual target:
   MAE/RMSE/R2 for a continuous probability target and calibration/error by
   risk tier. Do not copy a model type or feature order until the dataset
   confirms it.
6. Save the artifact and metadata separately, including feature names, units,
   training data hash, code version, metrics, and model version.
7. Expose a typed inference contract returning:
   `probability`, `risk_tier`, `model_version`, `feature_timestamp`,
   `input_status`, and `warnings`.
8. Add bounds and schema validation. Out-of-range or incomplete inputs return
   an explicit unavailable response, not a confident score.

**Gate:** a held-out evaluation report exists, inference uses exactly the
training feature schema, and tests cover missing, stale, extreme, and valid
inputs.

### Phase 2 - Real-time weather and risk API

**Goal:** safely combine live weather telemetry with model inputs.

Tasks:

1. Keep the existing Express weather proxy as the browser-facing boundary.
2. Normalize provider responses into one internal weather schema with units,
   provider timestamp, retrieval timestamp, and stale-data status.
3. Define which model features are actually available from live sources.
   Features unavailable in real time must be collected from a trusted source,
   requested from the operator, or mark the prediction unavailable.
4. Add a server-to-server ML inference client with timeout, bounded retries,
   circuit-breaker behavior, and clear dependency errors.
5. Store prediction events needed for audit and trend views with retention
   limits; do not store unnecessary personal data.
6. Add rate limits and caching for weather requests so 10,000 users do not
   multiply provider traffic without control.

**Gate:** live, stale, simulated, and unavailable states are distinguishable
in API responses and the UI; provider outages do not produce false safe states.

### Phase 3 - Grounded government-guideline RAG

**Goal:** answer only from approved, traceable documents.

Tasks:

1. Start with a source registry: title, issuing authority, publication date,
   jurisdiction, official URL, downloaded checksum, effective status, and
   review/expiry date.
2. Verify each document from an official government domain before indexing.
   The copied guideline text in the original notes is not authoritative until
   every statement is checked against its source.
3. Support PDF/text ingestion with file-size/type limits, malware scanning,
   extraction error reporting, page/section metadata, and checksum-based
   deduplication.
4. Chunk by headings/sections where possible, retaining document ID, page,
   section, authority, and version metadata.
5. Reuse the linked RAG project's retrieval ideas only after reviewing its
   code and dependencies; do not copy a local Chroma directory as production
   state.
6. Add retrieval evaluation with a small approved question set. Record
   retrieved document IDs and similarity/relevance information.
7. Use a strict answer policy: cite sources, separate facts from uncertainty,
   refuse unsupported questions, and never invent evacuation orders,
   capacities, dates, phone numbers, or legal requirements.
8. Put the LLM behind a service boundary with timeouts, token limits, prompt
   versioning, provider error handling, and redaction of sensitive user data.
9. Add prompt-injection tests using uploaded documents and user questions.

**Gate:** every answer has citations or an explicit refusal; retrieval and LLM
failures are visible to the user; no document becomes active without an
admin-approved source record.

### Phase 4 - Admin operations

**Goal:** give authorized operators useful controls without creating unsafe
unreviewed authority.

Minimum dashboard sections:

- Dependency health: API, MongoDB Atlas, weather provider, ML service, RAG
  index, LLM provider, and last successful check.
- Risk overview: active regions, risk tiers, timestamp/source, stale data,
  model version, and confidence/calibration warning.
- SOS/report queue: filter, assign, acknowledge, resolve, and audit status
  changes.
- Rescue centers: create/edit/archive, map coordinates, name/address,
  capacity, current occupancy, accessibility, water/medical/power status,
  contact, operating status, and last verification time.
- Guideline registry: upload metadata, secure file upload, extraction result,
  review/approve/reject, re-index, deactivate, checksum, and citation preview.
- Simulation: isolated dry-run inputs with a prominent `SIMULATED` label;
  simulation must never change public alerts or operational records.
- Audit log: actor, action, target, old/new status, reason, timestamp, and
  request ID.

Required safeguards:

- Backend role checks on every admin mutation; hiding a button is not
  authorization.
- Coordinate validation, capacity/occupancy bounds, duplicate detection, and
  optimistic concurrency for rescue-center edits.
- Two-person approval or an explicit confirmation for public emergency
  broadcasts.
- No destructive delete for incident, guideline, or audit history; use status
  transitions and retention policies.

**Gate:** an admin cannot mutate data without authorization and every mutation
is auditable and covered by an API test.

### Phase 5 - User experience and accessibility

**Goal:** expose reliable status, not just attractive cards.

Tasks:

1. Add user risk cards with consistent low/moderate/high/critical styling and
   accessible text labels; color must never be the only signal.
2. Show weather timestamp, provider, stale/unavailable warning, and model
   version near predictions.
3. Add rescue-center search, route/link-out behavior, capacity status, and
   last-verified time.
4. Add grounded chat with citations, refusal messaging, emergency disclaimer,
   loading/error/retry states, and no fabricated fallback answer.
5. Add admin route separation and role-aware navigation.
6. Test mobile layout, keyboard access, screen-reader labels, and degraded
   network behavior.

**Gate:** the UI cannot display a green/safe state for an unavailable result,
and critical warnings remain understandable without color.

### Phase 6 - Cloud deployment and load readiness

**Goal:** deploy repeatably and prove the system can fail safely.

Tasks:

1. Use MongoDB Atlas with least-privilege database credentials, network
   restrictions, backups, indexes, and TTL/retention policies.
2. Deploy Express, ML, and RAG/LLM boundaries independently or as explicitly
   versioned services. Pin dependency versions and build from a clean checkout.
3. Use managed object storage for uploads and a persistent managed vector
   solution or a documented rebuildable index.
4. Configure HTTPS, CORS allowlist, secrets manager/environment variables,
   log redaction, request IDs, uptime/readiness probes, and alerting.
5. Load test the actual critical paths at the expected concurrency, including
   weather caching, auth, chat, prediction, and admin reads.
6. Test provider outages, Atlas outage, ML timeout, RAG no-match, bad file,
   expired document, and rollback.
7. Deploy staging first; run smoke tests; then promote a tagged release.
8. Publish only verified URLs and a rollback procedure.

**Gate:** staging passes smoke/load/failure tests, backups are verified, and a
rollback has been rehearsed before production traffic is enabled.

## 4. API contracts to settle before implementation

### Risk prediction

```json
{
  "probability": 0.0,
  "riskTier": "LOW",
  "status": "LIVE",
  "modelVersion": "flood-risk-2026-01",
  "weatherObservedAt": "2026-01-01T00:00:00Z",
  "generatedAt": "2026-01-01T00:01:00Z",
  "warnings": []
}
```

`status` must be one of `LIVE`, `STALE`, `SIMULATED`, or `UNAVAILABLE`.
`UNAVAILABLE` has no probability and must not be converted to a low-risk tier.

### Grounded chat

```json
{
  "answer": "Answer supported by the approved context.",
  "grounded": true,
  "sources": [
    { "documentId": "guideline-123", "title": "Verified source", "page": 4 }
  ],
  "status": "GROUNDED",
  "warnings": []
}
```

Unsupported answers return `grounded: false`, `status: "NO_SUPPORT"`, and a
clear refusal. Provider failures return an error status rather than an invented
answer.

## 5. Definition of done

The project is ready for real users only when:

- Auth, roles, admin mutations, reports, SOS, weather, prediction, and chat
  have automated API tests.
- Model and RAG evaluation reports are stored with versioned artifacts.
- Live/stale/simulated/unavailable states are tested end to end.
- Official guideline sources are verified, cited, reviewable, and reversible.
- Atlas backups, indexes, retention, object storage, and restore steps are
  documented and tested.
- Staging has passed load and dependency-failure tests.
- Production has monitoring, alerts, rate limits, rollback, and an incident
  owner.

## 6. Immediate next step

### Local execution status

The following checks have passed locally:

- Backend JavaScript syntax check.
- Frontend lint (`Frontend\Resq-AI`: `npm run lint`).
- Frontend production build (`Frontend\Resq-AI`: `npm run build`).
- Backend startup with the local MongoDB connection.

The backend smoke requests were rerun with all three local services active and
passed. A successful process start alone is still not sufficient evidence for
hosting; the smoke suite must remain green after future changes.

### Phase 0 checklist

- [x] Add repository ignores for local secrets, datasets, uploads, model
  artifacts, RAG indexes, dependencies, and build output.
- [x] Add configurable local CORS origins.
- [x] Add request IDs to responses and error logs.
- [x] Add separate `/api/health` and `/api/ready` endpoints.
- [x] Run `/api/health` and verify the response and `x-request-id` header.
- [x] Run `/api/ready` and verify its status matches MongoDB/JWT configuration.
- [x] Add automated smoke tests for health, readiness, auth, protected routes,
  weather failure, and invalid uploads.
- [x] Inspect and validate the Kaggle Playground Series S4E5 archive without
  deploying.
- [x] Review the linked RAG repository and choose the retrieval/index boundary.
- [x] Add a local launcher for the Express, FastAPI, and Vite services.
- [x] Add a dependency-free first-pass dataset report generator.
- [x] Add dependency-free local smoke checks for the running services.
- [x] Train a deterministic local flood-risk baseline with a held-out split
  and versioned metadata.

### Commands from the repository root

Run each command from its owning project directory:

```powershell
# Backend syntax and startup
cd Backend\server
node --check server.js
node --check middleware\errorHandler.js
npm start

# Frontend checks
cd Frontend\Resq-AI
npm run lint
npm run build
```

For the first local pass, use `Backend\server\.env.example` as the template.
Keep `MONGO_URI` pointed at the local MongoDB instance, set a non-placeholder
`JWT_SECRET`, and set `CORS_ORIGINS=http://localhost:5173`. Do not copy real
production credentials into this file.

### RAG boundary decision

The linked `rag_app_building` repository contains a learning directory and a
local `db/chroma_db` directory, but no verified production ingestion/API
contract. It is therefore treated as reference material only. GeoSentinel will
keep RAG behind a separate service boundary with approved-document metadata in
MongoDB Atlas, durable document storage, and a rebuildable persistent vector
index. No copied index is active in the application.

### Dataset compression decision

`data/kaggle/playground-series-s4e5.zip` is a valid ZIP/DEFLATE archive with
`train.csv`, `test.csv`, and `sample_submission.csv`. The archive contains
approximately 104.2 MB uncompressed and is approximately 29.3 MB compressed,
giving a measured 71.86% reduction. Its SHA-256 is
`d2fe3fd91b2602474023da907ef2722d89595b0cd05b71b79c60802ba66c42f8`.
The archive is ignored and remains the local reproducible source of truth.

### Phase 0 gate status

Phase 0 is **complete for the current local baseline**. Configuration,
ignores, service launcher, dataset inspection, compression verification, RAG
boundary selection, and the expanded local smoke checks are complete. Phase 1
has a reproducible non-operational baseline trained from the verified archive;
public risk scoring remains blocked until calibration and domain review pass.

### Phase 1 progress

The verified archive contains 1,117,957 training rows and 745,305 test rows,
with 20 numeric features, no missing values, and no duplicate IDs. The target
`FloodProbability` ranges from `0.285` to `0.725`; feature values are
dataset scores rather than documented physical units. The deterministic
ordinary-least-squares baseline uses 894,365 training rows and 223,592
held-out rows, reporting RMSE `0.02007` and MAE `0.01581`. Its artifact is
ignored at `Backend\ml_service\model\flood-risk-baseline.json` and records the
verified archive hash, source, feature bounds, and metrics.

The FastAPI service accepts the exact 20-feature schema and returns typed
probability/tier/version/status metadata. The model remains explicitly
non-operational; calibration, provenance, leakage analysis, and domain
validation are still required before public risk scoring.

### User map interaction implementation

The local frontend now has:

- Satellite imagery as the default base map, with a street-map toggle.
- Live weather markers colored by observed weather intensity; these are
  weather-status colors, not ML flood predictions.
- Detailed marker popups with coordinates, temperature, feels-like temperature,
  rain, cloud cover, humidity, pressure, wind, visibility, condition, and
  observation time.
- Animated rain and heat overlays that activate when the corresponding layer
  buttons are tapped.
- A visible live/unavailable weather status and updated timestamp.

The frontend lint/build and backend weather-route syntax checks pass after this
change. Live marker values require a valid backend `OPENWEATHER_API_KEY`; when
it is absent, the UI correctly reports that live weather is unavailable rather
than showing fabricated data.

### Admin, RAG, and rescue-center implementation

The local implementation now includes:

- Admin account requests with a government-ID reference and `pending` review
  state. Registration never grants admin privileges directly.
- Admin-only approval/rejection endpoints for verification requests.
- MongoDB schemas for admin verification, rescue centers, and guideline
  documents.
- Admin-only guideline upload/review endpoints. Approved text, Markdown, and
  extractable PDF files are chunked with checksum, page, authority, official
  URL, jurisdiction, review, expiry, and approval metadata. Unapproved or
  expired documents are never used by chat.
- Grounded chat over approved MongoDB chunks. Responses include citations,
  explicit `NO_SUPPORT` refusals, provider timeouts/errors, and an optional
  OpenAI-compatible LLM boundary that receives only redacted approved context.
- Admin dashboard upload/review, admin-verification, audit-log, and
  rescue-center controls.
- Automated backend role-guard and rescue-center optimistic-concurrency tests.
- Rescue-center create/update/archive-by-status API with coordinate,
  capacity/occupancy bounds, duplicate detection, optimistic concurrency,
  audit events, verification fields, public search, and directions links.
- Public rescue-center map markers and popup details.
- Nationwide weather coverage using 22 India-wide city/region points, cached
  provider readings, partial-provider failure handling, temperature colors,
  rainfall/cloud/wind overlays, and detailed weather popups.
- Local admin registration can grant immediate admin access through the explicit
  `ALLOW_ADMIN_REGISTRATION=true` switch; this is not production-safe.
- Weather API now returns 22 nationwide India readings with temperature,
  feels-like, min/max, rain (1h/3h), humidity, pressure, wind, clouds,
  visibility, condition, sunrise, sunset, caching, and partial failure counts.
- Google Gemini is supported through `GOOGLE_GEMINI_API_KEY` and
  `GOOGLE_GEMINI_MODEL`; keys remain environment-only and are never committed.
- Precipitation is now shown without the old rain animation: the map uses
  precipitation tiles plus low-to-high intensity colors and legends.
- Clicking any map location requests exact weather for that coordinate and shows
  temperature, precipitation, wind speed, and condition. Browser geolocation
  displays a standard blue user marker with an accuracy circle.

The local upload path rejects invalid or empty PDFs and does not claim malware
scanning. MongoDB Atlas, durable object storage, and production hosting remain
outside the local phase.

### Remaining blockers before hosting

1. Complete model calibration and domain review; the current model remains a
   non-operational baseline and cannot drive public alerts.
2. Confirm the Kaggle competition license/terms and document provenance before
   distributing or deploying any derived artifact.
3. Add a production malware scanner and durable object-storage adapter for
   guideline and report uploads; local PDF extraction now rejects invalid or
   empty documents but is not a production scanning boundary.
4. Configure and validate an approved LLM provider, including provider-side
   quotas and monitoring. Without it, chat returns an explicit provider status.
5. Configure Atlas, secrets management, staging, load testing, monitoring,
   backups, and rollback only after local gates pass.
6. Disable `ALLOW_ADMIN_REGISTRATION` and restore reviewed admin approval before
   any public deployment.

### Local integrated test status

The local Express, FastAPI, and Vite services are integrated and were started
with `python scripts\start_local.py`. The verified local endpoints are:

- Frontend: `http://127.0.0.1:5173`
- Express API health: `http://127.0.0.1:5000/api/health`
- FastAPI health: `http://127.0.0.1:8000/health`

The dependency-free smoke suite passes `15/15`, including protected routes,
admin mutation rejection without authentication, ML prediction typing, and
authenticated ordinary-user rejection for admin routes, ML prediction typing,
and invalid weather/report handling. Backend `npm test` passes all six role and
optimistic-concurrency tests. Frontend lint and production build also pass
(lint reports one existing `react(set-state-in-effect)` warning in the admin
data-loading effect).

The live local weather endpoint returned 22 points, and immediate local admin
registration was verified with `role: admin` and `adminVerification:
approved-local`. The current local `.env` has `ALLOW_ADMIN_REGISTRATION=true`;
the example configuration leaves the Google key empty until it is supplied
locally.

The exact-location weather endpoint was verified at Delhi coordinates and
returned a live temperature, precipitation value, wind speed, and condition.

### Next implementation step after the checklist

Run the backend and frontend checks, then run `python scripts\smoke_local.py`
with all local services active. Do not enable hosting or claim production RAG
until the remaining blockers above are addressed.

After the Phase 0 gate passes, proceed to Phase 1. Do not add a public risk
score or public grounded-chat claim before its corresponding phase gate passes.

## 7. Latest local UI and assistant update

### Completed

- Windy Map Forecast is configured as the primary frontend weather map through
  the local-only `Frontend\Resq-AI\.env.local` file.
- OpenWeather remains a secondary optional backend enhancement and is disabled
  in the frontend local configuration.
- The Leaflet map remains available as a fallback when Windy is not configured.
- The user Help entry is red, animated, keyboard-accessible, and clearly marked
  for emergencies.
- Removed the direct phone-call button from the Help panel; users are directed
  to contact local emergency services without an in-app number.
- Added cached general disaster-safety answers for earthquake, cyclone,
  heatwave, floodwater, evacuation, basic safety, and assistant capability
  questions. These answers avoid database and LLM calls.
- Added the local starter FAQ document at
  `Backend\server\rag_documents\basic-safety-faq.md`.

### Still left before moving to the admin-side work

1. Verify the Windy key's localhost restriction and confirm the map loads in
   the browser.
2. Replace any invalid OpenWeather key only if exact-weather readings or
   weather-derived ML predictions are needed; Windy remains the primary map.
3. Configure and test a real Gemini/LLM provider locally for questions that
   are not covered by the cached FAQ.
4. Add frontend tests for Windy fallback, emergency Help interaction, and
   cached assistant responses.
5. After user-side verification, finish the admin risk overview, dependency
   health display, simulation audit, and notification review.

### Latest browser verification

- The frontend is available locally at `http://127.0.0.1:5173/GeoSentinel/`.
- The Windy Map Forecast loader now uses the required `libBoot.js` loader and
  Leaflet 1.4.x in an isolated iframe, avoiding the fallback app's Leaflet
  version conflict.
- The supplied keys are configured locally only: the Map Forecast key is
  assigned to `VITE_WINDY_MAP_FORECAST_KEY` and the Point Forecast key is
  assigned to `VITE_WINDY_POINT_FORECAST_KEY`.
- Browser verification reached Windy successfully, but Windy returned HTTP 403
  because the first implementation used a `srcDoc` iframe with a `null` origin.
  The viewer now runs from the same-origin Vite-served
  `Frontend\Resq-AI\public\windy.html` page, so Windy can match the authorized
  `localhost` domain.
- The red `Help now` button opens the emergency report form successfully and
  no phone-call button is present.

## 8. Documentation and handoff status

### Completed

- Added workspace custom agent guidance at
  `.github\agents\geosentinel-maintainer.agent.md`.
- Added safety and security rules at `precaution.md`.
- Added local setup, troubleshooting, user verification, and improvement
  guidance at `help.md`.
- Documented the verified Windy same-origin viewer, required Leaflet version,
  key-type assignment, exact local URL, and OpenWeather's optional status.
- Documented current user-side behavior, validation commands, known warnings,
  and production blockers.

### Current verified website state

- Windy Map Forecast renders successfully at
  `http://localhost:5173/GeoSentinel/`.
- Windy displays the India map, wind layer, forecast timeline, duration
  controls, legend, and zoom controls.
- Windy is the primary map provider.
- OpenWeather is optional and is not required for the Windy map.
- The red `Help now` action opens the emergency report form.
- Windy picker interaction now sends clicked coordinates to the parent user UI.
  The user forecast card shows the selected coordinates, Windy picker values,
  optional daily forecast, and nearby configured storm-track status.
- A `Use my current location` control opens the Windy picker at the browser's
  current coordinates.

### Forecast feature limitations

- Daily forecast cards require the optional OpenWeather key. Windy remains the
  primary visual map and picker source when OpenWeather is unavailable.
- Cyclone status uses configured backend storm tracks; no storm track is
  invented when none is configured.
- The daily forecast route is wired and reachable locally; the current
  OpenWeather credential returned HTTP 429 during verification, so the UI
  correctly keeps the daily forecast marked optional/unavailable rather than
  fabricating values.
- The direct phone-call button is removed.
- Cached general safety questions work without a database or LLM call.
- Frontend lint and production build pass.
- Backend syntax, backend tests, and local smoke checks passed in the current
  local baseline.

### Work still to be done

1. Add automated browser tests for Windy success, unauthorized-domain failure,
   Leaflet fallback, Help interaction, and cached assistant answers.
2. Finish the user-side AI provider test for non-cached approved-document
   questions and explicit unsupported refusals.
3. Implement the admin risk overview, prediction history, simulation audit,
   dependency health details, and notification review.
4. Calibrate and domain-review the flood model before operational alerts.
5. Add production malware scanning, durable upload storage, Atlas hardening,
   monitoring, backups, load tests, staging, and rollback.
6. Disable `ALLOW_ADMIN_REGISTRATION=true` before any public deployment.

- Final browser test: Windy map rendered through localhost same-origin viewer with wind timeline and controls; Help now opened the emergency form successfully.
