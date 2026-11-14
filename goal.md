# GeoSentinel Disaster-Management Goal

## Mission

Provide a trustworthy cyclone and flood situational-awareness system for India.
The system must prefer no alert over an invented alert: every public cyclone
marker must come from a current trusted provider event, and unavailable or stale
data must be shown as unavailable.

## Current build status

### Working locally

- React/Vite user map with Windy and street-map fallback.
- Express API with authentication, admin roles, rescue centers, reports,
  notifications, audit events, and government-domain RAG document ingestion.
- FastAPI prediction service accepting physical Open-Meteo telemetry:
  precipitation, 72-hour rain, maximum wind, surface pressure, and river discharge.
- Historical Open-Meteo calibration for five flood-prone Indian locations:
  20,090 rainfall rows and 20,090 river-discharge rows from 2015–2025.
- Full-screen, scrollable admin dashboard with live India/city weather,
  rain probability, forecast rain amount, river discharge, heat, and flood-risk
  tier.
- Cyclones restricted to current/forming GDACS tropical-cyclone events near India.
  No embedded, simulated, expired, fabricated track, warning radius, or fallback
  cyclone is displayed.

## Before cloud deployment

1. Run the local smoke checks with MongoDB, Express, FastAPI, and Vite running.
2. Add browser end-to-end tests for cyclone suppression, admin navigation, live
   report loading, map click prediction, and RAG upload/approval.
3. Provision managed MongoDB with backups, indexes, encryption, and restore tests.
4. Store JWT, LLM, Windy, and optional weather credentials in a cloud secret
   manager. Set strict production CORS and disable admin self-registration.
5. Put the Express API and FastAPI behind HTTPS, health checks, timeouts, rate
   limits, structured logs, metrics, and error alerting.
6. Use durable object storage and malware scanning for report images and uploaded
   documents.
7. Configure SMS/push/email emergency delivery with retries, provider failover,
   deduplication, escalation, and delivery audit records.

## Required upgrades for the real disaster-management goal

### Trustworthy prediction

- Replace proxy percentile scoring with verified river-gauge, rainfall, flood
  extent, and cyclone advisory labels.
- Add model versioning, calibration metrics, regional validation, drift checks,
  explainable feature contributions, and a human approval gate for public alerts.
- Keep rain probability, river discharge forecast, and cyclone detection separate;
  never claim the flood model predicts cyclone formation without a cyclone-labeled
  training dataset.

### Cyclone operations

- Add IMD/RSMC official advisories as a second authoritative source and reconcile
  conflicting feeds.
- Preserve provider timestamps, event IDs, source URLs, severity, and expiry.
- Show a visible source/freshness badge and suppress events after expiry.
- Add alert deduplication, acknowledgement, escalation, and incident timelines.

### Field response

- Add responder dispatch, shelter capacity, road/bridge status, evacuation zones,
  offline/mobile support, multilingual guidance, accessibility, and location
  privacy controls.
- Add incident command roles, immutable audit logs, evidence attachments, and
  post-incident reporting.

## Definition of deployable

The system is deployable only when all local checks pass, production secrets and
backups are configured, feeds have freshness monitoring, notifications are
tested end-to-end, public scores are clearly labeled and human-reviewed, and
disaster stakeholders have completed a tabletop exercise.

## Current simulation handoff

Admin-only synthetic simulation now supports custom cyclone routes, 24-hour
replay, 30 Odisha district impacts, 36 synthetic India state summaries, saved
runs, and three downloadable evidence reports. The normal live map remains
separate from the simulation map. See [test3.md](./test3.md) and
[sarthak.md](./sarthak.md).

This does not change the deployment gate: the simulation is not an official
forecast, live alert source, or proof of 10,000-user readiness.
