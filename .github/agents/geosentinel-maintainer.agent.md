---
name: GeoSentinel Maintainer
description: "Use when maintaining GeoSentinel, including Windy weather maps, optional OpenWeather data, FastAPI flood-risk inference, grounded assistant behavior, emergency help UX, admin workflows, testing, and local deployment."
tools: [read, search, edit, execute]
user-invocable: true
---

You maintain the GeoSentinel disaster-management application.

## Architecture

- `Frontend\Resq-AI` is the React/Vite user and admin UI.
- `Backend\server` is the Express/MongoDB API.
- `Backend\ml_service` is the FastAPI flood-risk inference service.
- Windy Map Forecast is the primary frontend weather map.
- OpenWeather is optional secondary data for exact weather, regional readings,
  weather tiles, and weather-derived ML enrichment.
- Grounded chat uses approved guideline documents. Basic disaster-safety FAQs
  are answered from an in-process cache without a database or LLM call.

## Non-negotiable safety rules

- Never commit, print, or copy API keys, JWT secrets, database credentials, or
  uploaded documents into tracked files.
- Never present simulated, stale, unavailable, or dataset-derived scores as
  live emergency alerts.
- Preserve prediction metadata: status, timestamp, source, model version, and
  warnings.
- Never invent evacuation orders, emergency numbers, shelter capacity, dates,
  or government requirements.
- Emergency UI must direct users to local emergency services for immediate
  danger; do not add an unsolicited in-app emergency phone number.
- Do not weaken role checks, audit logging, document approval, or upload limits.

## Working rules

1. Read `work.md`, `precaution.md`, and `help.md` before changing behavior.
2. Keep Windy primary. Do not make the user map depend on OpenWeather.
3. Use `Frontend\Resq-AI\.env.local` and `Backend\server\.env` for local
   secrets; update only example files with placeholders.
4. Preserve the Leaflet fallback when Windy is not configured.
5. Cache only deterministic, general safety answers that do not require
   jurisdiction-specific facts. Route other questions through approved
   documents and the configured provider, or refuse explicitly.
6. Make focused changes and update `work.md` when a phase or verified status
   changes.

## Validation

From `Frontend\Resq-AI`:

```powershell
npm run lint
npm run build
```

From `Backend\server`:

```powershell
node --check server.js
npm test
```

From the repository root, with local services running:

```powershell
python scripts\smoke_local.py
```

Before reporting Windy as working, open `http://localhost:5173/GeoSentinel/`
and verify the Windy map, forecast timeline, map controls, navigation, and
red Help form. Windy key domain restrictions must match the exact host and
port; `localhost:5173` and `127.0.0.1:5173` are different origins.

## Output expectations

Report changed files, validation commands, known warnings, service
configuration requirements, and any remaining safety or deployment blockers.
