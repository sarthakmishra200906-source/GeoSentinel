# GeoSentinel Test Result 2

**Test date:** 2026-11-15  
**Test scope:** Local admin cyclone/flood rehearsal and dashboard usability  
**Geography:** Odisha synthetic test scope  
**Latest commit tested:** `f1d6a0a`  
**Environment:** Local Vite frontend, local Express backend, local MongoDB

## 1. Executive result

The local admin rehearsal is working for its intended bounded scope:

- An admin can create a synthetic Odisha cyclone scenario.
- The admin can configure a cyclone start point, target point, wind, rainfall,
  duration, exposed institutions, and shelters.
- The admin can create a run and advance it one synthetic hour at a time.
- The run generated data through synthetic hour 12.
- The map displayed the synthetic track and current cyclone position.
- The timeline moved backward for replay without changing server truth.
- The dashboard displayed 30 Odisha district result cards.
- The hourly insight chart rendered.
- The audit panel was searchable, filterable, paginated, and scrollable.
- The backend health endpoint returned HTTP 200.
- No live notification or SOS record was created by the simulation.

This is a **rehearsal and decision-support feature**, not proof of an official
forecast, hydrodynamic flood model, production dispatch system, or cloud-scale
concurrent cyclone platform.

## 2. Commands and automated results

Commands were run from each package's owning directory:

```powershell
cd Backend\server
npm test
```

Result: **13 passed, 0 failed**.

The passing tests covered:

- Admin role protection.
- Rescue-center optimistic-concurrency behavior.
- FAQ cache behavior and invalid input handling.
- Simulation parameter defaults and bounds.
- Required scenario name validation.
- Deterministic simulation-engine progression.

```powershell
cd Frontend\Resq-AI
npm run build
```

Result: **Build passed**. Vite transformed 70 modules and produced the
production bundle. Vite reported a bundle-size warning for a chunk larger than
500 kB; this is a performance follow-up, not a build failure.

```powershell
Invoke-WebRequest http://localhost:5000/api/health
```

Result: **HTTP 200**.

## 3. Browser rehearsal result

The browser rehearsal used the Admin Dashboard and Simulation section:

1. Reloaded the application.
2. Opened Admin Dashboard.
3. Opened the Simulation section.
4. Created a test run.
5. Advanced the run 12 times with `Step +1 hour`.
6. Confirmed the run showed `RUNNING` and synthetic hour 12.
7. Moved the replay timeline backward.
8. Confirmed the map and chart remained rendered.
9. Confirmed 30 district result cards were present.

Observed result:

```text
RUNNING · synthetic hour 12
Map rendered: yes
Hourly chart rendered: yes
District cards: 30
Timeline slider: rendered and moved backward
```

The timeline is a display replay. Moving backward does not delete timesteps or
rewind the server run. This prevents an admin's visual review from corrupting
the authoritative run sequence.

## 4. Backend and simulation work completed

### Simulation API

The admin-only simulation API now supports:

- `POST /api/simulation/scenarios`
- `GET /api/simulation/scenarios`
- `POST /api/simulation/runs`
- `GET /api/simulation/runs/:id`
- `POST /api/simulation/runs/:id/step`
- `POST /api/simulation/runs/:id/pause`
- `POST /api/simulation/runs/:id/heartbeat`

The earlier step-route failure was fixed by moving the step, pause, heartbeat,
and run-detail routes to router scope. The step action records an audit event.

### Rule-matrix engine

The current engine calculates bounded synthetic values for:

- Cyclone approach progress.
- Wind signal.
- Rainfall signal.
- River signal.
- Soil saturation signal.
- District risk tier.
- Institutional exposure.
- Shelter pressure.
- Advisory demand for response resources.

The output is marked `synthetic_simulation`. It does not claim exact flood
depth, storm surge, building damage, road-level inundation, or official
forecast accuracy.

### Safety isolation

The simulation is intentionally isolated from:

- Live weather and cyclone records.
- Live user alerts and notifications.
- SOS incidents.
- Emergency reports.
- Rescue-center inventory mutations.
- User dispatches.
- Approved government RAG documents.
- SMS, email, push, and external emergency-service calls.

The UI explicitly tells the admin that no live alert, SOS, or dispatch is
created by the rehearsal.

## 5. Admin UI improvements

The admin dashboard was changed from a long, confusing surface into a
section-based workspace:

- Added navigation for Overview, Simulation, Operations,
  Guidelines/Upload, and Audit Log.
- Kept the dashboard full-screen oriented and scrollable.
- Replaced the misleading one-click
  `ML Flood Simulation / Run Heavy-Rain Inference Simulation` control.
- Added a clearly labeled flood-risk model status card.
- Linked the model status area to the dedicated simulation workspace.
- Preserved guideline upload/RAG management.
- Preserved rescue-center management.
- Preserved notifications and operational views.
- Added a fixed-height audit region so repeated simulation events do not
  create an uncontrolled page-length wall of text.
- Added audit search.
- Added audit category filtering.
- Added local 25-row pagination.
- Added clear simulation-mode messaging and run status.
- Added responsive styling for simulation controls, map, chart, and audit
  sections.

The audit UI currently paginates the backend response locally. The backend
still returns a bounded maximum event set, so cursor pagination is required
before very high-volume production use.

## 6. Map implementation and map suggestions

The admin simulation map is a separate Leaflet map inside the simulation
workspace. It includes:

- Synthetic cyclone start marker.
- Odisha target corridor marker.
- Polyline showing generated cyclone movement.
- Current cyclone marker.
- Target-radius circle.
- Popup details for the selected synthetic timestep.
- Current risk state and weather/impact information.
- Previous-hour and next-hour controls.
- Range slider for replay.

The normal user map remains separate and keeps its normal live-weather and
live-cyclone behavior outside simulation mode.

### Map suggestions implemented

The requested map direction was interpreted as:

1. Keep simulation playback separate from the live user map.
2. Show the cyclone path and position during an admin rehearsal.
3. Make the path reviewable hour by hour.
4. Keep street-map context through Leaflet tiles.
5. Add operational map layers later for shelters, hospitals, fire stations,
   rescue centers, roads, and response units.

Items still required for the complete operational map:

- Rescue-center, hospital, fire-station, shelter, and unit markers.
- Resource allocation overlays for ambulance, fire, and NDRF teams.
- District-by-hour rainfall and wind overlays.
- Road closure and accessibility layers.
- Storm-surge and inundation layers from validated external data or a future
  physical model.
- Server-generated report map snapshots.

The current map is therefore a functional synthetic track/replay map, not a
complete GIS operations map.

## 7. Were live alerts, user messages, help, AI, and all services tested
    together during a cyclone?

**No. That combined production scenario was not proven by this test.**

The test deliberately ran the isolated simulation boundary. It verified that
the simulation did **not** create live alerts or SOS records. That is a
successful isolation result, but it is not the same as proving every live
service under simultaneous cyclone load.

### What is present

- Live weather/map behavior exists outside simulation mode.
- Admin notification broadcasting exists as a separate operational action.
- SOS/report flows exist as separate live workflows.
- The grounded AI/chat boundary exists and is intended to answer from
  approved documents with citations or refuse when evidence is missing.
- Flood-risk model responses distinguish live, stale, simulated, and
  unavailable states in the broader platform design.

### What this rehearsal did not prove

- A real live cyclone feed arriving while a synthetic rehearsal is running.
- Simultaneous high-volume public alerts and user messages.
- User help/chat responses under cyclone traffic.
- SOS creation and operator acknowledgement during the same run.
- Live AI answers using current cyclone data plus approved RAG evidence.
- SMS, email, push, or external emergency dispatch delivery.
- WebSocket/SSE fan-out to many users.
- Multiple concurrent cyclone runs.
- Cloud failover, provider outage behavior, or 100+ concurrent users.
- Production-scale MongoDB, object storage, queue, and rate-limit behavior.

The correct current conclusion is:

> The system can demonstrate an isolated admin cyclone rehearsal locally.
> The live operations stack and the simulator are not yet a tested,
> simultaneously coordinated cyclone command platform.

## 8. What was done for the previous request

The previous request asked for a complete admin test of one cyclone, impact
analysis, custom paths, hourly data, resource planning, graphs, PDF output,
map context, auditability, and documentation. The implemented portion was:

- Added custom cyclone start and target coordinates.
- Expanded the rule engine to all 30 Odisha districts.
- Added hourly district/risk/rainfall/river insight output.
- Added an insights chart to the simulation workspace.
- Added a print/save-to-PDF browser report action.
- Added audit search, category filters, pagination, and fixed-height scrolling.
- Added the admin simulation map and timeline replay.
- Verified a 12-hour browser rehearsal.
- Re-ran backend tests and frontend production build.
- Verified backend health.
- Committed the changes as `f1d6a0a`.

The request also asked for many response-resource types, state-neighbor data,
people reports, a final immutable PDF report, and repeated analysis of 100
cyclones. Those parts are not fully implemented. The current engine has
advisory resource-demand calculations, but not a complete allocation and
reservation system. The current report uses browser print/save-to-PDF, not a
server-generated immutable object-storage artifact.

## 9. Interpretation of the previous request

The request was interpreted as four separate deliverables:

1. **A safe rehearsal simulator:** create and replay one bounded Odisha
   cyclone without touching live operations.
2. **An admin command view:** make the dashboard usable for scenario setup,
   map review, charts, audit review, and report printing.
3. **An evidence view:** show hourly synthetic outputs across Odisha districts
   and make assumptions visible.
4. **A future production roadmap:** identify the work needed for resources,
   live user coordination, validated data, concurrent runs, and cloud scale.

Only the first three were implemented in bounded local form. The fourth remains
planned work and must not be represented as already production-ready.

## 10. Remaining gates before live cyclone operations

Before calling the system ready for live cyclone operations, complete and test:

- Backend cursor pagination for audit events.
- Resource models for ambulances, fire teams, NDRF teams, members, boats,
  supplies, and reservations.
- Atomic allocation with optimistic concurrency and conflict handling.
- Operational map markers and district/hour data layers.
- Server-generated signed report artifacts and object storage.
- Live cyclone/weather ingestion with source timestamps and staleness rules.
- Explicit simulation/live context handling for approved user viewers.
- WebSocket/SSE streaming with reconnect and ordering guarantees.
- Grounded AI retrieval combining approved documents and explicitly labeled
  live telemetry.
- End-to-end notification, chat, SOS, and operator workflow tests.
- Provider outage, delayed data, duplicate event, and partial failure tests.
- Staging load tests and cloud rollback rehearsal.
- Security, authorization, rate-limit, backup, and audit-retention review.

Until those gates pass, use the simulator for local rehearsal and UI/workflow
testing only. Do not use it as an official emergency forecast or autonomous
dispatch authority.

## 11. Strict simultaneous-system and 10,000-request check

This section was added after the initial report. It is intentionally a frank
acceptance result and does not replace or rewrite the earlier findings.

### Test method

The local services were already running on:

- Express backend: `http://127.0.0.1:5000`
- Vite frontend: `http://localhost:5173/GeoSentinel/`
- ML service: `http://127.0.0.1:8000`

The existing dependency-free smoke suite was run first. It exercised:

- Frontend response.
- Backend health and request IDs.
- Backend readiness.
- Missing-auth protection.
- Admin mutation protection.
- Chat authentication protection.
- Rescue-center authorization.
- Registration and ordinary-user authorization.
- Invalid report handling.
- Invalid weather-tile handling.
- ML service health and valid/invalid prediction handling.
- Live dashboard, state, trend, and map-prediction calls.

Then a 10,000-request mixed concurrency probe was run with 200 local worker
threads across health, live dashboard, live state, protected auth, and chat
paths. This was an HTTP concurrency test, not 10,000 independent browser
users, mobile clients, sockets, or geographically distributed systems.

### Results

| Check | Result | Verdict |
|---|---:|---|
| Existing cross-service smoke suite | 17/19 passed | **FAIL** |
| Live state endpoint in smoke run | HTTP 503; upstream HTTP 429 | **FAIL** |
| Live map prediction in smoke run | HTTP 429; upstream HTTP 429 | **FAIL** |
| Mixed 10,000-request probe | 4,055 HTTP 200, 2,000 HTTP 401, 2,000 HTTP 404, 1,942 HTTP 503, 3 HTTP 500 | **FAIL** |
| Health-only 10,000-request probe | 10,000 HTTP 200 | Pass for health endpoint only |
| Health-only throughput | Approximately 1,605 requests/sec | Measurement only |
| Backend health after load | HTTP 200, database connected | Pass |

The 401 and 404 results in the mixed probe are expected for deliberately
unauthenticated or invalid route requests. The 503 and 500 results are not
acceptable as a full-system readiness result. The weather/provider HTTP 429
responses demonstrate that external provider limits can make live features
unavailable during repeated or concurrent access.

### Acceptance decision

**REJECTED for the requested claim that 10,000 people can use the complete
system at once.**

The system passes a narrow local health-endpoint stress check, but it does not
pass a complete live-weather, prediction, chat, notification, SOS, AI, admin,
and simulation concurrency gate. A single healthy `/api/health` endpoint
cannot certify the whole platform.

### What was not falsely counted as passing

The following were not claimed as 10,000-user successes:

- 10,000 authenticated public sessions.
- 10,000 simultaneous live maps with independent provider data.
- 10,000 concurrent AI/chat conversations.
- 10,000 notification deliveries.
- 10,000 SOS submissions and operator updates.
- 10,000 WebSocket/SSE streams.
- 10,000 simulation steps.
- 10,000 users reading or writing MongoDB-backed operational data.
- Multi-region or multi-machine traffic.
- SMS, email, push, or external emergency-service delivery.

Running 10,000 simulation mutations would also be the wrong test because it
would create a large amount of audit and timestep data and could distort the
local database. Those workflows need a purpose-built load-test environment,
isolated test data, cleanup, and explicit rate limits.

### Why the full test was rejected

1. The live state and map-prediction paths reached an upstream provider rate
   limit (`HTTP 429`).
2. The mixed concurrent probe produced thousands of `503` responses and some
   `500` responses.
3. There is no completed distributed WebSocket/SSE fan-out test.
4. There is no completed authenticated multi-user load test for chat, SOS,
   notifications, admin operations, and simulation together.
5. There is no cloud staging test with production-like MongoDB, caching,
   queues, provider quotas, observability, and rollback.

### Required work before retest

- Add provider caching, quotas, backoff, circuit breakers, and stale-data
  handling for weather and prediction dependencies.
- Identify and eliminate the mixed-load HTTP 500 path with request IDs and
  structured logs.
- Use a staging load generator with distributed workers rather than one local
  process.
- Create authenticated test users and non-production test tenants.
- Test chat, alerts, SOS, notifications, reports, admin reads, and simulation
  reads/writes as separate measured scenarios.
- Test WebSocket/SSE connection count, broadcast latency, reconnect, ordering,
  and dropped-client behavior.
- Measure MongoDB connection pools, indexes, queue depth, CPU, memory, and
  provider quotas.
- Define pass thresholds for error rate, p95/p99 latency, recovery time, and
  data loss before rerunning the claim.

Until that retest passes in staging, evaluators should record the platform as
**local rehearsal ready, full concurrent operations not ready**.

## 12. Follow-up review: missing cyclone outcome pack and admin layout

The earlier report correctly recorded that the simulator mechanics worked, but
it also exposed a major product gap: the test did not present one complete
cyclone outcome package containing hourly telemetry, user-help status, AI
insight status, and a final summary in one admin view. The old dashboard also
rendered every section in one long page, while the section buttons only
scrolled to anchors.

### Fixes made

- Converted Overview, Simulation, Operations, Guidelines &amp; upload, and Audit
  into exclusive admin views instead of stacking all sections vertically.
- Added a fixed secondary admin rail beside the existing global navigation so
  labels and content no longer overlap or clip.
- Kept a responsive horizontal tab rail for narrow screens.
- Kept the simulation workspace as a dedicated view with its own map and
  controls.
- Added synthetic temperature and river-discharge-proxy fields to every
  simulation timestep.
- Added chart series for:
  - Hourly rainfall.
  - River signal.
  - River discharge proxy.
  - Temperature proxy.
  - Risk score.
- Added a cyclone outcome pack with:
  - Peak risk and peak hour.
  - Peak rainfall.
  - Peak river-discharge proxy.
  - Advisory boats, paramedics, and rescue teams at the viewed hour.
  - Viewed-hour district evidence for risk, rainfall, river signal, and
    exposed institutions.
  - User-help/report status.
  - AI insight status.
  - Final review and improvement guidance.
- Added a final-summary browser print/save-to-PDF action.

### Strict honesty about the new data

The new temperature and river-discharge values are **synthetic proxies from
the rule engine**, not Odisha gauges or official forecasts. They are labeled
as proxies in the UI and report. The live Overview tab continues to show
India-wide and monitored-city telemetry from the configured live weather
provider. The simulation remains Odisha-only and must not be interpreted as a
live all-India cyclone model.

The user-help card explicitly states that no public SOS, help message,
notification, or citizen report was created by the isolated simulation. The AI
card explicitly states that the run produced a rule-matrix explanation only;
synthetic steps were not sent to grounded AI chat and were not presented as an
AI forecast.

### Follow-up automated validation

After these changes:

```powershell
cd Backend\server
npm test
```

Result: **13 passed, 0 failed**.

```powershell
cd Frontend\Resq-AI
npm run build
npm run lint
```

Results:

- Production build: **passed**.
- Lint: **passed with existing warnings** in `WindyMap.jsx` and the existing
  admin data-loading effect; no new build-blocking lint error remained.

### Follow-up browser validation

The shared browser page was reloaded and Admin Dashboard → Simulation was
opened. The observed result was:

```text
Navigation tabs: 5
Simulation view visible: yes
Overview/Operations/Guidelines/Audit visible in Simulation view: no
Outcome pack after one synthetic step: yes
Hourly chart: yes
District evidence rows: 31 (header + 30 Odisha districts)
User help status text: present
```

This fixes the missing presentation layer for the local rehearsal. It does
not change the previous strict rejection of full live multi-system and
10,000-user readiness. Live notifications, SOS, user help, grounded AI,
provider delivery, and cloud concurrency still require separate integrated
staging tests.
