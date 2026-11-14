# GeoSentinel Flood and Cyclone Simulation Test Plan

## Status and approval gate

**Implementation status — Revision 2 baseline.** This document remains the
authoritative technical design and safety plan. The bounded Odisha simulator
has been implemented for local admin rehearsal, but the incomplete production
surfaces listed below must not be added by bypassing its models, provenance,
authorization, or audit boundary.

The simulator is a controlled rehearsal and decision-support system. It is not
an official forecast, evacuation order, autonomous dispatch system, or
replacement for disaster-management authorities.

## 0. MVP fidelity and scope statement

The first implementation is a **rule-based district and institutional safety
decision-support matrix**, not a hydrodynamic flood model. It will focus on
Odisha districts, schools, hostels, students, shelters, hospitals, roads, and
response resources. Odisha is the initial test geography; the data model and
interfaces remain extensible to other Indian states later. The current UI also
shows a clearly labeled synthetic 36-state context summary; that table is not
the detailed all-India rule engine or live national telemetry.

The MVP will not claim to calculate physically accurate water depth, channel
flow, inundation boundaries, storm surge, building damage, or road flooding at
cell-level resolution. It will calculate bounded district/administrative-area
impact classes from documented rules and aggregated inputs. Any map shading is
an impact-zone visualization derived from those rules, not a hydrodynamic
prediction.

The rule engine must expose its inputs, units, thresholds, formula version,
and reasons for every output. A future hydrodynamic or high-resolution model
would be a separate project requiring DEM, river cross-sections, land use,
drainage, road, gauge, and validated impact datasets.

The initial Odisha MVP scope is limited to:

- District-level and institution-level risk tiers.
- Aggregated student/hostel exposure and accessibility status.
- Rainfall, river, cyclone, saturation, and vulnerability rule inputs.
- Explainable resource-demand heuristics and shortages.
- Rehearsal of admin/user workflows, not official emergency operations.

## 1. Objectives

The system must let authorized administrators run repeatable, isolated
scenarios such as a cyclone approaching Odisha by approximately 200 km,
extreme rainfall, river rise, flooding, facility overload, road disruption,
and response-resource shortages. It must show the consequences to the admin
and user experiences without creating real emergency actions.

It must also answer, with traceable evidence:

- Which areas cross each risk threshold and when?
- What resources are needed, where, and by what time?
- What capacity is missing or double-allocated?
- How much warning lead time exists?
- Which roads, shelters, hospitals, and response centers fail first?
- Did the risk engine predict the simulated outcome?
- Which assumptions or model limitations caused the result?

## 2. Hard safety and data boundaries

- Every simulated API response, map, chart, notification, and export is
  marked `SIMULATION MODE` and `data_source: synthetic_simulation`.
- Simulation uses separate run IDs, collections, storage prefixes, caches,
  event channels, and audit records from live operations.
- It cannot create or modify live SOS reports, emergency reports, users,
  notifications, dispatches, rescue-center inventory, live weather, live
  cyclone records, or RAG documents.
- It cannot send SMS, email, push notifications, webhooks, or external
  emergency-service requests.
- The user-side experience may observe a simulation only through an explicit
  approved simulation session; normal users remain on live telemetry by
  default.
- Recommendations are advisory. Acknowledgement, allocation, and override
  actions require an authorized administrator and justification.
- Simulation reports and runs are never indexed into the government-guideline
  RAG. The RAG remains restricted to approved official documents.
- Synthetic data cannot automatically update, promote, or replace the live ML
  model.
- Every failure degrades to an explicit unavailable/error state; it must
  never fall back to fabricated live weather or a false safe state.

## 3. Multi-admin operating model

### Roles

- **Simulation owner:** creates scenarios, starts/stops runs, and approves
  completion.
- **Operations viewers:** observe maps, charts, and recommendations.
- **Resource coordinators:** propose or acknowledge resource allocations.
- **Reviewers:** annotate outcomes, approve datasets, and publish reports.
- **System auditor:** reads immutable audit records and exports compliance
  evidence.

Authorization must be enforced on every API and export, not only in the UI.
A run has a lease/owner, allowed collaborators, and a maximum concurrent
viewer/action policy. Destructive actions require confirmation and are
audited.

### Contention and allocation

Resource inventory is versioned. Every allocation or release includes the
expected inventory version and uses an atomic optimistic-concurrency update.
Stale writes are rejected and force the administrator to refresh. The system
must never allow five available boats to become twelve allocated boats.

Each allocation records resource type, quantity, origin, destination, time
window, status, allocator, reason, and conflict result. Recommendations and
actual simulated allocations are separate states.

High-contention pools use a short-lived distributed lock or reservation record,
for example a three-second Redis lock keyed by run and resource pool. The lock
is only a coordination aid; the database version check remains the authority.
A lock conflict returns a clear retryable response such as
`RESOURCE_ASSIGNMENT_IN_PROGRESS`, never a raw database exception. Expired
locks are recoverable and cannot permanently deadlock a run.

## 4. Admin workflow

1. Select **Flood & Cyclone Simulator** in the admin navigation.
2. Open a dedicated full-screen simulation route, never the live map route.
3. Display a persistent red `SIMULATION MODE` banner, run ID, owner, clock,
   connection state, and last server sequence.
4. Choose a preset or enter a validated custom scenario.
5. Save a versioned scenario and run a preflight validation.
6. Start, pause, resume, single-step, accelerate, replay, or reset the run.
7. Review live simulation state, recommendations, shortages, and warnings.
8. Acknowledge, allocate, override, or annotate recommendations with reasons.
9. Complete the run and generate reports and insights.
10. Approve or reject any candidate dataset for offline ML review.

## 5. Scenario builder and adjusters

### Cyclone

- Starting coordinates and Odisha target corridor.
- Default 200 km approach distance, direction, speed, and landfall window.
- Central pressure, wind speed, category, intensification/weakening rate.
- Wind, rainfall, and surge radii.
- Forecast uncertainty cone and track perturbation.
- One or more cyclones with independent tracks and timestamps.

### Rain, river, and exposure

- Rainfall by district/city and by simulation hour.
- Duration, accumulation, spatial multiplier, and extreme-rain profile.
- Soil saturation, drainage, terrain, river discharge, reservoir, and
  embankment assumptions.
- Flood propagation speed, depth limits, and low-lying-area multiplier.
- Population exposure, vulnerable groups as aggregated counts, shelters,
  hospitals, roads, communications, and facility capacity.

### Response

- NDRF, fire/rescue, paramedic, ambulance, boat, food, water, medicine,
  generator, and shelter resources.
- Travel-time and road-closure multipliers.
- Facility closure, communication outage, or degraded-service scenarios.

All controls have safe bounds, units, defaults, provenance, and validation
messages. Values outside approved bounds are rejected, not clamped silently.

## 6. Clock, execution, and synchronization

The simulation clock is independent of wall-clock time. The initial supported
profiles are:

- **Real-time:** one simulation minute per real minute.
- **Demo accelerated:** one simulation hour per five real seconds.
- **Fast analysis:** configurable bounded acceleration for offline runs.

Every time step has a monotonic sequence, simulation timestamp, server
timestamp, engine version, and input hash. Charts use simulation timestamps,
not browser arrival time. Pause freezes the simulation clock; reconnecting
clients recover from the last acknowledged sequence rather than replaying
duplicate effects.

The server is authoritative. WebSockets/SSE push state, recommendations,
audit events, and clock status to connected clients. A versioned REST snapshot
endpoint is the fallback and recovery mechanism. Clients must detect sequence
gaps and request a snapshot before rendering further deltas.

### Accelerated-clock contract

The server stores both simulation time and wall-clock time. A step is emitted
only after its calculation completes; the engine must not skip steps to meet a
display deadline. If a step cannot complete within its budget, the run enters
`LAGGING` and reports the measured delay.

In accelerated modes, if the primary owner's heartbeat or control WebSocket is
absent for more than five seconds, the run automatically pauses with reason
`OWNER_DISCONNECTED`. Other authorized viewers remain read-only until the
owner reconnects or an explicitly authorized replacement owner takes over.
This prevents blind accelerated execution.

On snapshot recovery, clients snap to the server's simulation timestamp and
sequence, then interpolate display-only animation over a bounded transition.
Charts and Leaflet layers render the authoritative points; they must not invent
intermediate risk values.

### Reproducibility contract

Reproducibility means identical discrete events, rule decisions, sequence
ordering, and outputs within a documented floating-point tolerance, not an
unsupported promise of bit-identical bytes across machines. The engine uses a
fixed seed, canonical JSON input ordering, UTC timestamps, explicit units,
version-pinned dependencies, and a single ordered step executor for the MVP.
Each run stores the engine hash, ruleset hash, seed, input hash, and numerical
tolerance. Any non-reproducible result fails the replay test and is marked
non-comparable.

## 7. Live/user-side monitoring context

Simulation visibility is opt-in and scoped to a signed simulation session.
The backend accepts a validated `X-Simulation-Run-Id` or equivalent session
token only for authorized viewers. Middleware verifies that the run is active,
the user is allowed, and the requested resource belongs to that run.

When the simulation session is active:

- Weather, risk, cyclone, river, map, and dashboard endpoints read the
  simulation snapshot for that run.
- Live telemetry remains available in a clearly separated comparison panel.
- The UI shows `LIVE REALITY` beside `SIMULATION REALITY`.
- The simulation context cannot leak into an ordinary browser session.
- Switching back to live requires explicit action and a new live request.

The ticker shows simulation time, live retrieval time, source status, and
connection freshness. If the simulation stream is stale or disconnected, the
UI says so; it does not display old data as current.

## 8A. Rule matrix and impact methodology

The MVP rule engine uses a documented, versioned matrix. A risk score is an
explainable function of normalized rainfall intensity/accumulation, river
gauge or discharge signal, saturation, cyclone wind/pressure signal,
institutional vulnerability, and accessibility. Thresholds are configuration
data, not hidden constants.

For each district and institution, the engine returns:

- Input values and units.
- Rule IDs and threshold comparisons.
- Risk tier and confidence qualifier.
- Accessibility state and reason.
- Estimated exposed students/hostel occupants as aggregated counts.
- Required resources and shortage calculation.
- `UNAVAILABLE` when a required input is missing or outside its valid range.

Road or institution impact is determined by an explicit rule such as a
district risk threshold plus an accessibility multiplier or configured
closure scenario. It is not inferred as exact water depth. Each result must
be explainable in one sentence to a reviewer.

## 8B. Resource recommendation heuristic

The initial allocator is a deterministic greedy heuristic, not an optimizer.
For each district:

1. Estimate affected institutional population and demand by resource type.
2. Multiply demand priority by risk tier, vulnerability, lead-time gap, and
   accessibility penalty.
3. Rank districts by the resulting score.
4. Allocate available regional inventory in priority order, subject to
   capacity, travel time, and time-window constraints.
5. Record unmet demand and explain why it was not allocated.

Default resource ratios, units, replenishment, travel time, degradation, and
expiry rules are versioned configuration. They must be reviewed by the
project owner/domain reviewer and must never be described as official NDRF
deployment policy.

## 8C. Performance and scale budget

The MVP acceptance budget is:

- Maximum 30 Odisha districts, 2,000 institutions, 100 shelters, and 20
  resource types in one run.
- Maximum 72 hourly steps in a demo run and 10,000 steps in offline analysis.
- Maximum four concurrently running simulations and 250 connected viewers per
  run in the initial deployment.
- p95 single-step calculation under 200 ms for the demo profile on the
  staging instance, excluding storage/network time.
- p95 state publication under 500 ms after calculation.
- No more than 100 time-series writes per second per run and bounded report
  generation concurrency.
- Browser target: 30 district layers and timeline charts remain interactive
  at 30 FPS on the supported review laptop; if not, use aggregated layers or
  lower-frequency rendering without changing server truth.

If a scenario exceeds a budget, preflight rejects it or requires offline mode.
The system must measure CPU, memory, queue delay, MongoDB writes, stream
latency, dropped sequences, and browser render time.

## 8. Engine outputs per time step

The engine calculates:

1. Cyclone location, intensity, movement, and uncertainty.
2. Wind, pressure, rainfall, and accumulated rainfall.
3. Soil saturation, river state, flood depth, and affected cells.
4. District/city, population, road, shelter, hospital, and rescue-center
   impacts.
5. Risk prediction, confidence, threshold crossings, and warnings.
6. Simulated actual outcome generated from the scenario truth model.
7. Demand, available capacity, shortages, travel constraints, and advisory
   recommendations.
8. Prediction-vs-actual errors and data-quality warnings.

The engine is sandboxed per run. A calculation error marks that run's step
failed, records the error class and input hash, and leaves other runs and the
live application healthy. No broad catch may hide the error.

## 9. Storage architecture

### MongoDB

Use separate simulation collections:

- `simulation_scenarios`: immutable scenario versions and validation results.
- `simulation_runs`: lifecycle, owner, collaborators, clock, seed, status,
  versions, and summary metrics.
- `simulation_timesteps`: MongoDB time-series collection with `timestamp` as
  the time field and `runId` as metadata. Do not embed unlimited time steps in
  one document.
- `simulation_recommendations`: recommendation and allocation state.
- `simulation_insights`: calculated metrics and rule evidence.
- `simulation_reports`: report metadata only.
- `simulation_audit_events`: append-only audit records.

Time-step documents are bounded and contain only the fields needed for replay,
charts, audit, and analysis. Large map rasters or generated snapshots use
object storage, not MongoDB documents.

Create indexes for run/time queries, owner/status, recommendation state,
audit time, and report lookup. Apply TTL retention by policy to raw time-step
and transient event data. Retention must be configurable and must not delete
legal/compliance audit records accidentally.

### Reports and artifacts

PDF, CSV, JSON, chart images, and map snapshots are written to a dedicated
object-storage bucket/prefix such as `simulation-reports/{runId}/`. Local
development uses `simulation_reports/{runId}/`, outside public static serving.

`simulation_reports` stores report type, run ID, object key, size, checksum,
content type, generator version, creator, creation time, expiry/retention
class, and access audit. Downloads use authenticated, short-lived signed
URLs. Files are immutable; a regenerated report receives a new version and
checksum.

Transient map snapshots, intermediate exports, and step artifacts use an
object-storage lifecycle rule that deletes them after 14 days by default
within a permitted 7-30 day policy. An administrator may promote a run to
permanent retention or dataset-review retention; that promotion records a
reason, actor, policy class, and audit event. Raw time steps have a separate
configurable TTL and compliance audit events are never removed by that TTL.

## 10. Immutable audit and compliance trail

Every critical action creates an append-only event containing:

- Event ID, timestamp, actor ID, admin email, role, and request ID.
- Run ID, scenario version, target entity, action type, and result.
- Justification/notes where required.
- Before/after version or checksum, input hash, and source IP/device metadata
  only where policy permits.
- Correlation ID, server version, and error details if failed.

Examples include `SIMULATION_CREATED`, `SIMULATION_STARTED`,
`SIMULATION_PAUSED`, `RESOURCE_ALLOCATED`, `RESOURCE_OVERRIDDEN`,
`SIMULATION_RESET`, `REPORT_EXPORTED`, and `DATASET_APPROVED`.

The portal includes a compliance drawer with filters, actor/run/action
search, immutable event details, export, and retention status. Application
code has no update/delete path for audit events. A hash chain or equivalent
tamper-evidence mechanism is required; backups and access to audit storage are
tested.

## 11. Concrete insight calculations

Insights are computed from stored evidence, not manually typed dashboard
labels. Minimum rules:

- **Evacuation bottleneck index:** evacuation demand divided by effective
  road capacity. Flag critical when demand exceeds capacity by more than
  1.5x.
- **Shelter overload ratio:** demand divided by capacity. Flag critical above
  2.0x and warning above 1.0x.
- **Warning lead-time gap:** time from critical threshold crossing to
  simulated alert trigger. Flag late warnings when it is below the configured
  policy target.
- **Hospital overload:** projected demand divided by available beds/staff.
- **Resource shortfall:** required quantity minus available and allocatable
  quantity, with conflicts and travel time included.
- **Coverage gap:** affected population outside configured response-time or
  shelter-distance limits.
- **Prediction quality:** calibration, MAE/RMSE where applicable, confusion
  counts by tier, false positives, false negatives, and missing predictions.
- **Stream health:** step latency, dropped sequences, reconnects, and stale
  client snapshots.

Every insight stores formula version, thresholds, input references, severity,
and calculation timestamp.

## 12. Historical calibration and trust

Before using presets to support operational decisions, calibrate them against
documented historical events such as Cyclone Fani (2019) or Amphan (2020).
The calibration package must use verified sources for track, pressure, wind,
rainfall, landfall timing, river/flood impacts, infrastructure disruption,
and response outcomes. The initial data inventory must explicitly record the
source, geographic coverage, temporal resolution, variables, units, licensing,
missingness, and transformation for every field. Candidate sources include
official IMD cyclone reports, Odisha government situation and impact reports,
official gauge or rainfall records where available, and clearly identified
remote-sensing or research datasets for supplementary spatial evidence.

Public historical reports are not assumed to contain hourly district-wise
rainfall, river gauges, exact road closures, or institution-level status. When
those values are absent, the calibration record must mark them missing or
interpolated, state the interpolation method and uncertainty, and prevent the
result from being labeled high-fidelity. No invented observations may be
presented as historical truth.

Calibration must:

- Keep historical observations separate from synthetic generated values.
- Record source URLs, dates, units, transformations, and missing values.
- Compare track error, rainfall error, timing error, flood extent/depth
  error, and impact-category error.
- Publish uncertainty intervals and known areas of poor fit.
- Require domain review before a preset is labeled historically calibrated.

The calibration suite must cover at least three distinct entry corridors:
South/Puri, Central/Paradip, and North/Balasore. It must include leave-one-
corridor-out evaluation so thresholds are not overfit to one landfall. A
preset is labeled `calibrated_for_rehearsal` only when its metrics,
uncertainties, data gaps, and corridor results are published; it is never
labeled as a forecast guarantee.

Passing a historical replay does not prove a future forecast is correct. The
UI must display calibration date, event, metrics, and limitations.

## 13. Provenance and ML/RAG policy

Every dataset and record has an explicit provenance value, for example:

- `synthetic_simulation`
- `historical_observation`
- `live_provider`
- `official_government_document`

The RAG index accepts only approved government documents and explicitly
rejects simulation reports and run artifacts. Simulation data may be used only
in a separate offline risk-model experiment after review.

The training workflow is:

1. Select runs for review; do not train automatically.
2. Validate assumptions, labels, units, and historical/live comparisons.
3. Build a versioned dataset with provenance and hashes.
4. Keep scenario families separated between training and evaluation to prevent
   leakage.
5. Train offline with reproducible code and fixed evaluation data.
6. Evaluate calibration, false-alert cost, missed-event cost, and subgroup or
   geographic performance.
7. Require human/domain approval and model-card publication.
8. Promote through a staged deployment with rollback; never auto-promote.

## 14. Reports and insight exports

Completed runs support authenticated PDF, CSV, and JSON exports containing:

- Scenario, safety disclaimer, provenance, versions, seed, and assumptions.
- Timeline, map snapshots, peak risk, threshold crossings, and warnings.
- District/city risk and impact tables.
- Predicted-vs-actual metrics and calibration status.
- Shelter/hospital loads, resource demand, allocation conflicts, shortages,
  travel/access constraints, and response timing.
- Stream health, errors, reconnects, admin actions, and overrides.
- Formula versions and evidence links for every insight.

## 15. Network disruption and recovery

- WebSocket/SSE disconnects show an explicit stale/offline state.
- Clients reconnect with bounded exponential backoff and jitter.
- On reconnect, clients request a snapshot and last sequence; they never
  replay allocation actions blindly.
- Idempotency keys protect start/pause/allocate/export requests.
- Offline browsers may queue only non-destructive notes. Allocation and
  control actions require server confirmation.
- Server-side runs continue or pause according to an explicit run policy, not
  according to one browser's connection.
- Provider, model, storage, and calculation failures are isolated to the run
  and visible in its health panel.

## 16. Test suite and acceptance gates

### Isolation and authorization

- Prove no simulation action creates or modifies live records or sends
  external notifications.
- Prove non-admin and unauthorized collaborators cannot read or mutate runs.
- Prove the simulation header cannot be forged into another run.

### Determinism and bounds

- Same scenario, engine version, and seed produce identical outputs.
- Invalid coordinates, pressure, rainfall, capacities, multipliers, and
  acceleration values are rejected.
- Clock pause, resume, step, replay, reset, and acceleration are consistent.
- Multi-cyclone overlap does not double-count exposure or demand.

### Synchronization and failure

- Sequence gaps trigger snapshot recovery.
- Reconnects do not duplicate time steps or allocations.
- Concurrent admins receive stale-version conflicts rather than overwriting.
- One failed run does not crash the API, ML service, or live map.
- Missing model/provider/storage data produces explicit unavailable states.

### Storage, audit, and reports

- Time-series writes scale without 16 MB document failures.
- TTL removes only eligible raw data and preserves compliance events.
- Report checksums and signed access work; public static serving is blocked.
- Audit events are append-only, tamper-evident, searchable, and exportable.
- Reports can be regenerated and compared by checksum/version.
- Transient object artifacts expire under the lifecycle policy unless
  explicitly promoted to a retained run.

### Calibration and ML

- Historical replay metrics and uncertainty are reproducible.
- Simulation data cannot enter RAG.
- Dataset approval, train/evaluation separation, model promotion, and
  rollback are tested.
- Calibration covers South/Puri, Central/Paradip, and North/Balasore, with
  missing-data and interpolation disclosures.

### Performance and scope

- The documented district/institutional budgets are met for demo and offline
  profiles.
- A step that exceeds its wall-clock budget reports lag rather than skipping
  output or claiming real-time behavior.
- Browser rendering remains usable for the supported district and institution
  limits.

### Regression and load

- Existing live map, weather/cyclone filtering, flood-risk, authentication,
  admin documents/RAG, SOS, reports, and rescue-center concurrency tests stay
  green.
- Test representative concurrent viewers, multiple active runs, time-series
  writes, report generation, reconnects, and allocation conflicts.
- Measure step latency, stream latency, dropped messages, error rate, MongoDB
  load, object-storage operations, and client recovery time.

## 17. Implementation phases

1. **Foundation:** schemas, time-series collection, object storage adapter,
   provenance, authorization, audit, retention, and preflight validation.
2. **Rule engine:** deterministic district/institution matrix, clock profiles,
   bounded calculations, failure isolation, rule explanations, and replay.
3. **Map/UI:** full-screen simulator, adjusters, layers, timeline, WebSocket/
   snapshot synchronization, and live-vs-simulation split.
4. **Operations:** resource inventory locking, recommendations,
   acknowledgements, multi-admin controls, and compliance drawer.
5. **Reports/insights:** artifact generation, formulas, exports, historical
   calibration package, and run comparison.
6. **ML governance:** review queue, provenance-labeled datasets, offline
   training/evaluation, model cards, promotion, and rollback.
7. **Verification:** security, failure, performance, regression, calibration,
   and admin acceptance testing.

## 18. Final go/no-go criteria

Implementation is not complete until:

- Live and simulation data paths are technically isolated.
- Multi-admin authorization and optimistic allocation checks pass.
- Clock, synchronization, reconnect, and snapshot recovery pass.
- Time-series and object-storage retention tests pass.
- Audit records are immutable and tamper-evident.
- Historical calibration is documented with uncertainty and domain review.
- RAG never indexes simulation artifacts.
- ML promotion is manual, provenance-controlled, evaluated, and rollbackable.
- Reports and insights are reproducible and downloadable.
- Representative load and failure tests pass without affecting live users.
- The engine remains within its declared rule-based institutional scope and
  does not claim hydrodynamic or cell-level physical accuracy.
- Accelerated runs auto-pause after the primary owner's five-second heartbeat
  loss, and reconnect/snapshot recovery is verified.
- High-contention allocation locks return clean retryable conflicts and never
  deadlock or over-allocate inventory.
- Transient artifacts expire according to lifecycle policy unless retention is
  explicitly approved.
- Three-corridor calibration and leave-one-corridor-out evaluation are
  complete with documented data gaps and uncertainty.

No public deployment or operational trust claim should be made before these
gates pass.
