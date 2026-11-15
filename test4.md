# GeoSentinel Local Cyclone Simulation and Responsive UI Test

**Test date:** 2026-11-15
**Environment:** shared local Resq-AI browser, Vite frontend, Express API, and
configured local MongoDB
**Purpose:** verify the admin simulation workflow, stored evidence, cyclone-map
separation, and responsive navigation. This is local verification only.

## Result

The synthetic simulation workflow completed successfully in the shared admin
workspace. The live cyclone provider did not return usable data during these
checks, so live cyclone detection and display remain **unverified**. Do not
treat the empty live layer as proof that no cyclone exists.

## Synthetic scenario

| Input/result | Value |
|---|---|
| Scenario | `UI cyclone rehearsal - 2 hour` |
| Run ID | `6af94ad82ac7886fc72e0c96` |
| Route waypoints | (17.6, 88.8) → (18.4, 87.6) → (20.3, 86.6) |
| Wind | 180 km/h |
| Rain | 160 mm/hour |
| Duration | 2 synthetic hours |
| Final status | `COMPLETED`, hour 2 |
| Peak synthetic risk | HIGH, 71% at hour 2 |
| Peak synthetic rainfall | 160.0 mm/hour |
| Peak river-discharge proxy | 1852.0 m³/s; not a gauge reading |
| Resource advice at viewed hour | 30 teams, 30 boats, 30 paramedics |
| Evidence displayed | 30 Odisha district rows and 36 synthetic state rows |

These are deterministic rule-matrix simulation results, not an official
forecast, observed cyclone, live impact report, or AI prediction. The route is
customizable globally, but district impacts remain an Odisha-only synthetic
model.

## PDF and saved-run checks

- The completed run automatically created one archived PDF.
- Report file shown in the UI:
  `6af94ad82ac7886fc72e0c96-complete-evidence-2026-11-15T06-02-21-044Z.pdf`
- SHA-256 prefix shown in report metadata: `7d649a14fd0654c6`.
- The report appeared in the run's archive and opened in the in-page PDF
  preview.
- Navigating to the Live cyclone map and back, then selecting the saved run,
  reloaded its completed-hour summary and archived report metadata.
- A PDF download click was attempted, but the browser automation did not
  capture a completed download event. Treat PDF download as **not verified by
  this test**; preview and stored report listing did pass.

## Live-map isolation and provider status

- Admin `Live cyclone map` rendered the same Windy map controls as the user
  map, with `Cyclones (0)`.
- The synthetic run was not shown on the live map.
- The browser logged `Live cyclone feed is unavailable` from GDACS. Therefore,
  the live map test verified separation and unavailable-state behavior, not
  current-event accuracy or an actual live cyclone.
- No SOS, notification, dispatch, or public alert was created by this run.

## Responsive browser checks

The active shared browser was inspected at these CSS viewport sizes:

- **Mobile:** 390 × 844. Simulation header stacked into one column. The map
  toolbar started below the menu toggle; no visual overlap was observed.
- **Tablet:** 820 × 1180. The first layout was too compressed; the responsive
  breakpoint was moved to 900 px. Recheck showed one-column intro/history/
  actions, with no horizontal overflow.
- **Laptop/desktop:** 1440 × 900. Simulation header used two balanced columns;
  map controls were positioned to the right of the admin sidebar.
- **Intermediate:** 1058 × 800. Confirmed the repaired header grid and saved-run
  controls.

The tablet screenshot check prompted the final 900 px breakpoint adjustment.
The map-control layout was also measured at mobile, tablet, and desktop sizes.

## Automated checks

- Latest backend `npm test`: **22 passed, 0 failed**.
- Frontend `npm run build`: **passed**. Vite emitted its existing advisory for
  a minified JavaScript chunk larger than 500 kB.
- Frontend `npm run lint`: **passed with 5 warnings, no errors**. Warnings are
  unused values and set-state-in-effect findings in existing components.
- `git diff --check`: **passed**.

## Supplemental admin workflow rehearsal

A second, separately named two-hour run was created to check cross-view
behavior and per-run evidence. It was advanced to hour 1, left in progress
while visiting Operations and Live cyclone map, then returned to Simulation
and completed at hour 2.

| Input/result | Value |
|---|---|
| Scenario | `UI parallel operations rehearsal - 2 hour` |
| Run ID | `6af94e532ac7886fc72e0d66` |
| Wind | 165 km/h |
| Rain | 120 mm/hour |
| Duration | 2 synthetic hours |
| Final status | `COMPLETED`, hour 2 |
| Peak synthetic risk | HIGH, 59% at hour 2 |
| Peak synthetic rainfall | 120.0 mm/hour |
| Peak river-discharge proxy | 1564.0 m³/s; not a gauge reading |
| Resource advice | 20 teams, 20 boats, 20 paramedics |
| Evidence displayed | 30 Odisha district rows and 36 synthetic state rows |

This run is deterministic simulation output, not a live forecast or an
operational recommendation.

### Parallel admin views and evidence

- At synthetic hour 1, Operations displayed one existing pending Help request.
  Personal details are not reproduced here.
- The Help form opened while the run was active and was closed without
  submitting. Location lookup was still in progress at close.
- Live cyclone map remained separate from the active synthetic track. The map
  showed `Cyclones (0)`, and the browser logged GDACS feed unavailability. The
  empty layer does not establish that no live cyclone exists.
- Returning to Simulation allowed the run to complete at hour 2. The selector
  listed both separately named completed runs. The selected run displayed its
  own one-report archive; preview opened and reported two hours of evidence
  with SHA-256 prefix `a3b605140199b38c`.
- The prior completed run's PDF preview had also opened. Native browser
  download completion was not confirmed for either PDF.
- The rescue-center layer accurately reported zero open/limited registry
  entries. No fake centers were inserted. Rendering markers from actual
  records remains unverified. OpenStreetMap tile requests were aborted during
  view navigation, so stable street-tile rendering remains unverified.

### Guidelines and RAG

The Guidelines page contained one approved OCR document and one pending
document. A grounded-chat question returned `GROUNDED` with citations to the
approved `Disaster Management Plan SSD Department`. This query occurred before
the second run was active; it was not a parallel active-run test. The answer
was not generated from synthetic inputs. Repeated document/page citations
were deduplicated in the UI after the browser surfaced duplicate React keys;
the frontend build and lint passed, but the chat request was not repeated
after that presentation fix.

## Navigation-persistence regression check

The root cause was at the UI boundary: switching admin sections unmounted
`SimulationWorkspace`, which discarded its component-local run state. The
backend had persisted runs and timesteps, but Simulation did not automatically
reload the last selected run on return.

The fix remembers the selected run ID in the current browser tab's
`sessionStorage` and reloads the run and its stored timesteps/reports when the
Simulation section mounts again. It does not auto-advance the synthetic clock;
the admin still controls advancement with **Step +1 hour**.

| Input/result | Value |
|---|---|
| Scenario | `Navigation persistence verification - 2 hour` |
| Run ID | `6af953d32ac7886fc72e0f01` |
| Status before navigation | `RUNNING`, synthetic hour 1 |
| Views visited | Live cyclone map, then Operations/Broadcast Emergency Notification |
| Status after each return | Same run restored as `RUNNING`, hour 1 |
| Final status | `COMPLETED`, synthetic hour 2 |
| Archived PDF | Preview listed; SHA-256 prefix `68c55f25d4d33f14` |

No broadcast was submitted. After the regression check, the run was advanced
to hour 2 and completed rather than being left active in the shared test
database. The revised recovery note was checked at 390×844, 820×1180, and
1440×900; the simulation header stayed within the viewport at all three sizes.

## Not covered / deployment gates

- GDACS live event delivery and provider recovery.
- A genuine cyclone observation or official-source reconciliation.
- Rescue-center marker rendering with actual open/limited registry records.
- RAG request/response behavior while a simulation is actively running.
- Completed native PDF download verification.
- Concurrent step requests and multi-admin contention.
- Load, failover, backup/restore, production object storage, and retention.
- Real SMS/email/push delivery, SOS, public notifications, or dispatch.
- AI cyclone forecasting or operational ML validation.

**Conclusion:** local synthetic admin rehearsal, per-run evidence archives,
PDF preview, admin Help inbox visibility, grounded retrieval from an approved
document, live-map separation, and simulation-run restoration across Live map
and Operations navigation passed. The run remains step-driven; it does not
advance while another admin view is open. This does not establish live cyclone
readiness or production deployment acceptance. The rescue-center registry had
no active records, so populated markers and dependable street-map tiles were
not verified.
