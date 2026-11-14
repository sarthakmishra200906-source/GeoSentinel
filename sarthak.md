# GeoSentinel Simulation and Live-Map Verification

**Updated:** 2026-11-15  
**Latest verification change:** saved simulation-run history and admin-only
report retrieval

## 1. What an admin sees now

The admin has two separate experiences:

### Simulation workspace

Open:

```text
Admin dashboard -> Simulation
```

This view shows the selected synthetic cyclone run:

- Scenario name and custom cyclone start/target coordinates.
- Approach distance, wind speed, rainfall, duration, institutions, and
  shelters.
- Create run, step one synthetic hour, and pause controls.
- Synthetic cyclone path map with current position and target corridor.
- Timeline slider plus previous/next-hour replay.
- Hourly charts for risk, rainfall, river signal, river-discharge proxy, and
  temperature proxy.
- Odisha district evidence for 30 districts.
- Synthetic India-wide context for 36 states and union territories.
- Peak risk, peak rainfall, peak river proxy, and response-resource advice.
- Explicit user-help/SOS status.
- Explicit AI insight status.
- Three downloadable data reports.
- Human-readable print/save-to-PDF summary.

The outcome pack says clearly that the run is synthetic. It does not present
synthetic values as live gauges, official forecasts, real citizen reports, or
AI forecasts.

### Normal map

Click:

```text
Admin sidebar -> Map
```

This leaves the admin dashboard and renders the normal map experience used by
the application. The current normal map is Windy/iframe-based with the live
weather controls and live cyclone layer. The simulation workspace is not
rendered in this view.

## 2. Can an admin view and download the summary?

Yes. The summary is visible in the Simulation workspace after at least one
synthetic step. It contains the current selected hour and peak-run values.

The three report actions are:

1. **Executive summary JSON**
   - Scenario and run metadata.
   - Peak and viewed timestep.
   - User-help isolation status.
   - AI insight status.
   - Explicit limitations.

2. **Hourly telemetry CSV**
   - One row per generated hour.
   - Risk, rainfall, river signal, river-discharge proxy, temperature proxy,
     wind, and cyclone distance.

3. **India state impacts CSV**
   - One row per state/union territory per generated hour.
   - State risk, rainfall, river proxy, temperature proxy, and synthetic
     provenance.

There is also a browser print/save-to-PDF action. It is not yet a signed
server-generated PDF stored in object storage. The downloadable JSON/CSV
reports are generated in the admin browser from the loaded run data.

The backend also exposes an admin-only reconstruction endpoint:

```text
GET /api/simulation/runs/:id/report
```

It reads persisted `SimulationTimestep` records, returns the ordered run
evidence, and calculates a peak-risk summary. This is the source needed for
future server-side PDF generation and durable report indexing.

## 3. What happens when another cyclone is tested?

Each click of **Create test run** creates a new scenario and a new
`SimulationRun`. Its custom route and parameters are stored separately. Every
step is stored as an immutable `SimulationTimestep` with a sequence number.

The Simulation workspace now has **Saved cyclone runs**. An admin can:

1. Create a new cyclone with different coordinates, wind, rainfall, or
   duration.
2. Advance that run.
3. Select an older run from the saved-run selector.
4. Reload its stored hours, map, timeline, district table, state table, charts,
   and reports.
5. Use the run ID to retrieve its backend evidence report.

The list is currently bounded to the latest 50 runs for the admin. Long-term
production work still needs server-side search, cursor pagination, retention,
labels/tags, and report artifact storage.

## 4. Custom cyclone route and impact behavior

The scenario inputs support:

- Start latitude.
- Start longitude.
- Target latitude.
- Target longitude.
- Approach distance.
- Wind speed.
- Rainfall per hour.
- Rain duration.
- Exposed institutions.
- Available shelters.

The map draws a synthetic line from the configured start point toward the
configured target. Each synthetic hour calculates approach progress and moves
the current marker. The selected hour controls the displayed map, charts,
district results, state results, and resource advice.

The impact engine is intentionally a bounded rule matrix. It uses rainfall,
river signal, soil saturation, cyclone wind, and exposure heuristics. It does
not calculate official cyclone track uncertainty, storm surge, cell-level
inundation, building damage, exact road closure, or gauge-calibrated flood
depth.

## 5. Are simulation results visible to ordinary users?

No, not through the current application flow.

- Simulation API routes use `requireAdmin`.
- Scenario creation, run listing, run loading, stepping, pausing, heartbeat,
  and report retrieval are admin-only.
- The normal user-facing `MapContainer` is not passed simulation state.
- The normal user map is rendered when the application is not in the admin
  view.
- The synthetic run is not written to live notifications, SOS, reports,
  dispatches, live weather, or RAG documents.

This means a normal user does not see an admin's test cyclone by default.
An approved future feature could allow explicitly authorized simulation
viewers, but that is not enabled.

## 6. Does the admin normal map show simulation data during a run?

No. The current behavior is deliberately separated:

- **Simulation tab:** synthetic cyclone path and synthetic impact data.
- **Map tab:** normal live Windy/user map behavior.

The browser verification performed this transition:

```text
Simulation view: present before Map click
Click Map
Simulation element: absent
Admin dashboard heading: absent
Normal map controls: present
Synthetic cyclone layer in normal map: not present
```

The simulation does not leak into the normal map. When the admin returns to
Admin dashboard -> Simulation, the saved run can be selected again.

## 7. Does the synthetic cyclone disappear after the test?

It disappears from the normal map immediately when leaving Simulation because
the normal map never consumes simulation state. The saved run itself is not
deleted. It remains available to the admin through Saved cyclone runs and the
admin-only report endpoint.

This is the intended distinction:

- **Disappear from live/public map:** yes.
- **Destroy the admin's evidence:** no.
- **Create a live alert automatically:** no.
- **Make an ordinary user see the test:** no.

## 8. What would happen during a real live cyclone?

The normal map would continue to use its live weather/cyclone behavior and
would not use the synthetic simulation path. Live cyclone visibility depends
on the configured live provider and its timestamps, quotas, errors, and data
availability.

The simulation does not automatically predict or publish a real cyclone. The
simulation is for rehearsal. A real operational alert requires the separate
live-provider, notification, SOS, operator, and AI/RAG workflows to be
validated.

The local tests did **not** prove:

- A real cyclone provider event arriving during a simulation.
- 10,000 users viewing a live cyclone simultaneously.
- 10,000 AI conversations.
- Real SMS/email/push delivery.
- WebSocket/SSE fan-out.
- Live SOS/help workflows under cyclone load.
- Cloud failover or provider quota recovery.

## 9. Verification performed for this update

### Automated

- Backend tests: **13 passed, 0 failed**.
- Frontend production build: **passed**.
- Frontend lint: passed with existing warnings.
- Backend simulation route syntax: passed.

### Browser

- Saved-run selector rendered in Simulation.
- Existing run was available for loading.
- 24-hour run remained available at synthetic hour 24.
- 36 state rows and 30 district rows rendered.
- Outcome summary and report controls rendered.
- Clicking Map removed the simulation workspace.
- Normal map controls rendered after leaving Admin dashboard.
- The duplicate admin navigation was not reintroduced.

## 10. Current readiness statement

The system is ready for **admin-only local synthetic rehearsal, saved-run
review, and downloadable evidence review**.

It is not ready to claim:

- Official forecasting.
- Live emergency command.
- Public simulation sharing.
- Server-generated immutable PDF storage.
- 10,000 concurrent full-system users.
- Complete live cyclone + AI + SOS + notifications integration.

Those limitations are intentional and must remain visible to evaluators.
