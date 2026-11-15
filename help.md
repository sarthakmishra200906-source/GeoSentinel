# GeoSentinel Help and Maintenance Guide

## Local URLs

- User frontend: `http://localhost:5173/GeoSentinel/`
- Express API: `http://localhost:5000/api/health`
- Express readiness: `http://localhost:5000/api/ready`
- FastAPI ML health: `http://localhost:8000/health`

Use `localhost` when testing Windy if the Windy key is restricted to
`localhost`. Do not switch between `localhost` and `127.0.0.1` without adding
both domains to Windy restrictions.

## Start the application

From the repository root:

```powershell
python scripts\start_local.py
```

Or start each service separately:

```powershell
cd Backend\server
npm start

cd Backend\ml_service
python -m uvicorn main:app --reload --port 8000

cd Frontend\Resq-AI
npm run dev -- --host 127.0.0.1
```

## User-side verification checklist

1. Open the frontend on the exact authorized Windy domain.
2. Confirm the Windy map renders India, controls, legend, and timeline.
3. Open navigation and confirm `🚨 Help now` is visible.
4. Open Help and verify:
   - Red emergency banner.
   - No direct phone-call button.
   - Location button and latitude/longitude fields.
   - Required report fields.
5. Open AI assistant after login.
6. Test cached questions:
   - “What are basic safety measures?”
   - “What is the evacuation process?”
   - “What should I do around floodwater?”
   - “What should I do during an earthquake?”
   - “What should I do during a cyclone?”
   - “What can you do?”
7. Confirm cached responses identify themselves and do not require the LLM.
8. Test an unsupported question and confirm an explicit refusal.

## Configuration

Frontend local configuration belongs in `Frontend\Resq-AI\.env.local`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_WINDY_MAP_FORECAST_KEY=your-map-forecast-key
VITE_WINDY_POINT_FORECAST_KEY=your-point-forecast-key
VITE_OPENWEATHER_ENABLED=false
```

Backend configuration belongs in `Backend\server\.env`. OpenWeather is
optional; leave it empty when only the Windy map is required. Never paste real
values into either example file.

## Common failures

### Windy says unauthorized domain

The exact browser origin is not allowed. Add the precise host and port to the
Windy Map Forecast key, then restart Vite and reload the page.

### Windy says invalid key

The Point Forecast key and Map Forecast key were swapped, or the key was
revoked. Confirm the key type in the Windy portal without placing it in source
code.

### OpenWeather returns 401/503

OpenWeather is optional. Verify the backend key only if exact-weather,
regional-weather, or weather-derived ML features are needed. The Windy map
should continue working.

### AI provider unavailable

Cached general safety questions should still work. Other questions require an
approved document and configured LLM provider. The correct behavior is an
explicit provider status or `NO_SUPPORT`, not a fabricated answer.

### ML prediction unavailable

Check FastAPI health, `FASTAPI_URL`, feature schema, and OpenWeather availability.
Do not treat the result as LOW or SAFE when it is unavailable.

## Quality improvements still needed

- Add browser tests for Windy success/failure and Leaflet fallback.
- Add API tests for prediction proxy, notifications, and cached chat.
- Add admin risk overview and prediction audit/trend views.
- Complete model calibration and domain review.
- Add malware scanning and durable storage for uploads.
- Configure production secrets, monitoring, backups, load tests, and rollback.

## Admin simulation verification

1. Log in as admin and open `Admin dashboard` -> `Simulation`.
2. Confirm the `SIMULATION MODE · ODISHA` banner.
3. Enter a scenario and edit 2–20 route waypoints. Routes may be global;
   detailed impacts remain synthetic Odisha results.
4. Create a short run and advance it through its configured duration.
5. Confirm the route map, replay timeline, 30 Odisha district rows, and 36
   synthetic state rows.
6. Confirm completion automatically archives a PDF. Preview it from
   `Archived PDF reports for this run`, then select the saved run again to
   verify its stored hours and report metadata reload.
7. Confirm the outcome pack shows peak risk, rain, river proxy, temperature,
   resource advice, user-help status, and AI status.
8. Download the executive JSON, hourly CSV, and India state CSV.
9. Select an older run under `Saved cyclone runs` and confirm its evidence
   reloads.
10. Click `Live cyclone map` in the admin sidebar. Confirm the same live map
    component used by users appears and the synthetic route is absent.
11. Return to `Simulation` and confirm the previously selected run, status, and
    latest synthetic hour are restored. The run is saved while away, but the
    synthetic clock advances only when `Step +1 hour` is pressed.
12. Open `Operations` to inspect the Broadcast Emergency Notification form,
    then return to `Simulation` and verify the same run is restored. Do not
    submit a broadcast as part of this check.
13. Confirm no public notification, SOS, dispatch, or ordinary-user map event
    was created by the simulation.

### Admin Operations, Help, and RAG checks

1. While an admin synthetic run is active, open **Operations** and confirm the
   existing Help requests inbox remains readable. Do not copy personal details
   into test notes.
2. Open **Help now** and confirm the emergency form renders. For a smoke test,
   close it without submitting; only submit with an explicitly approved test
   account and dataset.
3. Confirm the rescue-center section shows the current registry state. An empty
   open/limited list is valid; do not insert fabricated centers to make map
   markers appear.
4. Open **Guidelines & upload** and distinguish approved documents from
   pending documents. Ask a non-sensitive question supported by an approved
   document and confirm the answer is marked `GROUNDED` with citations.
5. Do not treat successful retrieval on its own as proof that RAG is isolated
   during an active simulation. Record whether the question was asked while a
   run was actually active; never pass synthetic scenario data into the
   grounded assistant.
6. During the run, open **Live cyclone map**. Confirm the synthetic route is
   absent. If the live cyclone provider reports unavailable, record live event
   status as unverified, not “no cyclone.”

On desktop, tablet, and mobile widths, check that the Rain/Heat toolbar does
not cover Guidelines/Help or the admin navigation. On mobile, open/close the
menu and confirm the map controls start below its toggle. If `/api/weather/storms`
reports `unavailable`, record live-cyclone status as **unverified**; do not
interpret the empty layer as evidence that no cyclone exists.

See [test4.md](./test4.md), [test3.md](./test3.md), and [sarthak.md](./sarthak.md).
This checklist does not prove live cyclone operations or 10,000-user readiness.
