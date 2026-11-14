# GeoSentinel Test Result 3

**Test date:** 2026-11-15  
**Scope:** Full local synthetic cyclone rehearsal, national state evidence,
report downloads, backend report retrieval, and admin simulation UX  
**Geography:** Odisha detailed district model plus synthetic India-wide state
summary  
**Run tested:** `6af8ce6056b7d0c5d76158fc`  
**Scenario:** 200 km approach, 160 km/h wind, 180 mm/hour rainfall,
24-hour duration, 500 institutions, 20 shelters

## 1. Acceptance result

The simulation is ready for a **local full rehearsal and evidence review**.
It is not ready to claim live emergency operations or 10,000-user production
capacity.

The 24-hour browser run reached:

```text
RUNNING · synthetic hour 24
India synthetic state rows: 36 states and union territories
Odisha district rows: 30
Outcome pack: rendered
Report actions: 4, including 3 downloadable data reports and print-to-PDF
User-help status: rendered
AI status: rendered
```

## 2. What was tested end to end

1. Reloaded the running frontend.
2. Opened Admin Dashboard.
3. Opened the single-sidebar Simulation workspace.
4. Created the configured cyclone run.
5. Advanced the same run through synthetic hour 24.
6. Confirmed cyclone path, map, timeline, risk cards, and charts rendered.
7. Confirmed 30 Odisha district evidence rows.
8. Confirmed 36 synthetic India state rows.
9. Confirmed hourly rainfall, risk, river signal, river-discharge proxy, and
   temperature proxy data were available.
10. Confirmed the outcome pack showed resource advice, user-help status, AI
    status, and final review guidance.
11. Confirmed the three report controls were rendered and each was clickable.
12. Confirmed the run remained marked `synthetic_simulation`.
13. Confirmed no live SOS, public help message, live notification, or dispatch
    was created by the isolated simulation design.

## 3. Report outputs

The simulation now provides three distinct downloadable data reports:

### Report 1: Executive summary

Filename pattern:

```text
<run-id>-executive-summary.json
```

Contains scenario inputs, run ID, peak step, viewed step, user-help status,
AI status, and explicit model limitations.

### Report 2: Hourly telemetry

Filename pattern:

```text
<run-id>-hourly-telemetry.csv
```

Contains one row per generated hour with timestamp, risk, rainfall, river
signal, river-discharge proxy, temperature proxy, cyclone wind, and distance
to Odisha.

### Report 3: India state impacts

Filename pattern:

```text
<run-id>-india-state-impacts.csv
```

Contains one row per state/union territory per generated hour with risk tier,
risk score, rainfall, river-discharge proxy, temperature proxy, and
`synthetic_simulation` provenance.

The existing print/save-to-PDF action remains available for a human-readable
summary. The browser test confirmed the controls and click handlers, but the
shared browser harness did not expose a reliable download-event stream for
Blob downloads, so byte-level file inspection was **not claimed as passed**.

## 4. Backend storage and retrieval

Each generated hour is persisted as a `SimulationTimestep` linked to the
`SimulationRun`. The new admin-only endpoint:

```text
GET /api/simulation/runs/:id/report
```

reconstructs the evidence pack from stored timesteps and returns:

- Run and scenario metadata.
- All ordered timesteps.
- Peak-risk summary.
- User-help isolation status.
- AI insight status.
- `synthetic_simulation` provenance.

This makes a run findable by run ID and allows future server-side report
generation without trusting browser state. Server-generated immutable PDF
artifacts, object storage, retention policies, and report search indexes are
still future production work.

## 5. India-wide versus Odisha data

The detailed rule matrix remains Odisha-only because that is the approved first
test geography. The new 36-entry India-wide table is a bounded synthetic
context layer derived from the same scenario conditions. It is not live
weather for every state and is not an official national forecast.

The normal admin Overview still shows configured live provider telemetry for
India, monitored cities, and available state data. The Simulation tab labels
its national rows as synthetic so an evaluator cannot confuse them with live
measurements.

## 6. User help and AI during the simulation

The simulation outcome pack now reports these explicitly:

- **User help/SOS:** isolated; no live help request, SOS, notification, or
  citizen report was created.
- **AI:** rule-matrix explanation only; synthetic data was not sent to grounded
  AI chat and no AI forecast was claimed.

This is the safe result for a rehearsal. It is not proof that live user help,
notifications, SOS operations, or grounded AI can handle a real cyclone
simultaneously. Those remain separate integration and load-test gates.

## 7. Automated validation

Backend:

```text
13 tests passed, 0 failed
```

This includes deterministic simulation output and verifies that each timestep
contains 30 Odisha districts, 36 state summaries, river-discharge proxy data,
and temperature proxy data.

Frontend:

```text
npm run build: passed
npm run lint: passed with existing warnings
```

The remaining lint warnings are pre-existing Windy iframe code and the
existing admin data-loading effect. No build-blocking error remains.

## 8. Design and usability result

The admin navigation is now one sidebar, not two competing bars. The global
sidebar contains the admin workspace links for Overview, Simulation,
Operations, Guidelines &amp; upload, and Audit log. Selecting Simulation hides
the other admin sections.

The Simulation workspace contains:

- Scenario inputs.
- Create, step, and pause controls.
- Cyclone path map.
- Hourly replay.
- Odisha district evidence.
- India-wide synthetic state evidence.
- Charts.
- Resource advice.
- User-help and AI status.
- Three downloadable data reports.
- Human-readable print-to-PDF action.

## 9. Final limitations and rejection boundaries

This test does not change the earlier rejection of:

- 10,000-user full-system readiness.
- Live weather/provider reliability under load.
- Authenticated multi-user AI/chat load.
- Notification delivery at scale.
- SOS and operator workflow concurrency.
- WebSocket/SSE fan-out.
- Cloud failover and distributed storage.
- Official cyclone forecasting.
- Hydrodynamic flood depth or cell-level inundation.

The correct evaluator statement is:

> GeoSentinel is ready for a local, isolated, 24-hour synthetic cyclone
> rehearsal with stored timesteps, national synthetic context, three
> downloadable data reports, and a printable summary. It is not yet ready for
> live emergency command, official forecasting, or 10,000 concurrent users.

## 10. Prompts and requested work covered

This test result covers the requested work to:

- Test a complete cyclone simulation.
- Show hourly rainfall, water/river signal, temperature, wind, and risk.
- Show Odisha district impacts and India-wide state context.
- Include user-help and AI status without falsely connecting live systems.
- Produce three downloadable reports and a printable summary.
- Keep many runs identifiable by run ID and stored timestep data.
- Summarize what was completed, what was tested, and what remains unsafe to
  claim.
