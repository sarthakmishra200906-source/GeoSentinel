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
