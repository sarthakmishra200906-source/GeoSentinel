import React, { useCallback, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { MapContainer, Polyline, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { API_URL } from '../api'
const SELECTED_RUN_STORAGE_KEY = 'resq-ai-selected-simulation-run'
const DEFAULT_ROUTE = [
  { latitude: 17.6, longitude: 88.8 },
  { latitude: 19, longitude: 87.7 },
  { latitude: 20.3, longitude: 86.6 },
]
const DEFAULT_SCENARIO = {
  name: 'Odisha cyclone rehearsal',
  windSpeedKmh: 160,
  routePoints: DEFAULT_ROUTE,
  hourlyMm: 180,
  durationHours: 24,
  institutions: 500,
  shelters: 20,
}

function scenarioFromParameters(name, parameters = {}) {
  const cyclone = parameters.cyclone || {}
  const rainfall = parameters.rainfall || {}
  const capacity = parameters.capacity || {}
  return {
    name: name || DEFAULT_SCENARIO.name,
    windSpeedKmh: cyclone.windSpeedKmh ?? DEFAULT_SCENARIO.windSpeedKmh,
    routePoints: cyclone.routePoints || [
      { latitude: cyclone.startLatitude ?? 17.6, longitude: cyclone.startLongitude ?? 88.8 },
      { latitude: cyclone.targetLatitude ?? 20.3, longitude: cyclone.targetLongitude ?? 86.6 },
    ],
    hourlyMm: rainfall.hourlyMm ?? DEFAULT_SCENARIO.hourlyMm,
    durationHours: rainfall.durationHours ?? DEFAULT_SCENARIO.durationHours,
    institutions: capacity.institutions ?? DEFAULT_SCENARIO.institutions,
    shelters: capacity.shelters ?? DEFAULT_SCENARIO.shelters,
  }
}

function RouteMapClick({ enabled, onAddPoint }) {
  useMapEvents({
    click(event) {
      if (enabled) onAddPoint({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    },
  })
  return null
}

function FitRouteBounds({ positions }) {
  const map = useMap()
  React.useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [24, 24], maxZoom: 6 })
  }, [map, positions])
  return null
}

function splitRouteAtDateLine(points) {
  if (!points.length) return []
  const segments = [[points[0]]]
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const longitudeDifference = current[1] - previous[1]
    if (Math.abs(longitudeDifference) > 180) {
      const unwrappedLongitude = longitudeDifference > 180 ? current[1] - 360 : current[1] + 360
      const boundary = unwrappedLongitude > previous[1] ? 180 : -180
      const fraction = (boundary - previous[1]) / (unwrappedLongitude - previous[1])
      const crossingLatitude = previous[0] + (current[0] - previous[0]) * fraction
      segments[segments.length - 1].push([crossingLatitude, boundary])
      segments.push([[crossingLatitude, -boundary], current])
    } else {
      segments[segments.length - 1].push(current)
    }
  }
  return segments.filter((segment) => segment.length > 1)
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function getSelectedRunId() {
  return window.sessionStorage.getItem(SELECTED_RUN_STORAGE_KEY)
}

function rememberSelectedRun(runId) {
  if (runId) {
    window.sessionStorage.setItem(SELECTED_RUN_STORAGE_KEY, runId)
  } else {
    window.sessionStorage.removeItem(SELECTED_RUN_STORAGE_KEY)
  }
}

export default function SimulationWorkspace({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO)
  const [run, setRun] = useState(null)
  const [savedRuns, setSavedRuns] = useState([])
  const [runCursor, setRunCursor] = useState(null)
  const [hasMoreRuns, setHasMoreRuns] = useState(false)
  const [steps, setSteps] = useState([])
  const [storedReports, setStoredReports] = useState([])
  const [timelineIndex, setTimelineIndex] = useState(-1)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('')
  const [rescueCenterLayer, setRescueCenterLayer] = useState({ status: 'loading', centers: [], error: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(() => Boolean(getSelectedRunId()))

  const loadRuns = useCallback(async ({ cursor = null, append = false } = {}) => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const response = await fetch(`${API_URL}/simulation/runs${query}`, { headers })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to load saved simulation runs')
    setSavedRuns((current) => append ? [...current, ...data.runs] : data.runs)
    setRunCursor(data.nextCursor)
    setHasMoreRuns(data.hasMore)
  }, [headers])

  const loadReports = useCallback(async (runId) => {
    const response = await fetch(`${API_URL}/simulation/runs/${runId}/reports`, { headers })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to load stored simulation reports')
    setStoredReports(data)
  }, [headers])

  const loadRun = useCallback(async (runId) => {
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/simulation/runs/${runId}`, { headers })
      const data = await response.json()
      if (!response.ok) {
        rememberSelectedRun(null)
        throw new Error(data.error || 'Unable to load simulation run')
      }
      setRun(data.run)
      setScenario(scenarioFromParameters(data.run.scenario?.name, data.run.scenario?.parameters))
      setSteps(data.timesteps || [])
      setTimelineIndex(data.timesteps?.length ? data.timesteps.length - 1 : -1)
      setPdfPreviewUrl('')
      rememberSelectedRun(runId)
      await loadReports(runId)
      setMessage(`Loaded saved simulation run ${runId}.`)
      return true
    } catch (error) {
      setMessage(error.message)
      return false
    } finally {
      setBusy(false)
    }
  }, [headers, loadReports])

  const startNewScenario = () => {
    rememberSelectedRun(null)
    setRun(null)
    setSteps([])
    setStoredReports([])
    setTimelineIndex(-1)
    setPdfPreviewUrl('')
    setMessage('The previous run remains saved in run history. Configure a new scenario and create another isolated run.')
  }

  const addRoutePoint = (point) => {
    if (run) return
    setScenario((current) => ({
      ...current,
      routePoints: [
        ...current.routePoints.slice(0, -1),
        point,
        current.routePoints[current.routePoints.length - 1],
      ],
    }))
  }

  const insertRoutePoint = () => {
    setScenario((current) => {
      const target = current.routePoints[current.routePoints.length - 1]
      const previous = current.routePoints[current.routePoints.length - 2]
      const point = {
        latitude: (Number(previous.latitude) + Number(target.latitude)) / 2,
        longitude: (Number(previous.longitude) + Number(target.longitude)) / 2,
      }
      return {
        ...current,
        routePoints: [...current.routePoints.slice(0, -1), point, target],
      }
    })
  }

  const updateRoutePoint = (index, key, value) => {
    setScenario((current) => ({
      ...current,
      routePoints: current.routePoints.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [key]: value } : point,
      ),
    }))
  }

  React.useEffect(() => {
    let active = true
    const restoreWorkspace = async () => {
      const selectedRunId = getSelectedRunId()
      try {
        await loadRuns()
        if (active && selectedRunId && await loadRun(selectedRunId)) {
          setMessage(`Restored saved simulation run ${selectedRunId}. Use Step to advance synthetic time.`)
        }
      } catch (error) {
        if (active) {
          setMessage(error.message)
          setBusy(false)
        }
      }
    }
    restoreWorkspace()
    return () => {
      active = false
    }
  }, [loadRuns, loadRun])

  React.useEffect(() => {
    let active = true
    fetch(`${API_URL}/rescue-centers`, { headers })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load rescue centers')
        if (!Array.isArray(data)) throw new Error('Rescue center response is invalid')
        if (active) setRescueCenterLayer({ status: 'loaded', centers: data, error: '' })
      })
      .catch((error) => {
        if (active) setRescueCenterLayer({ status: 'error', centers: [], error: error.message })
      })
    return () => {
      active = false
    }
  }, [headers])

  React.useEffect(() => () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
  }, [pdfPreviewUrl])

  const createRun = async () => {
    setBusy(true)
    try {
      const scenarioResponse = await fetch(`${API_URL}/simulation/scenarios`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scenario.name,
          parameters: {
            cyclone: {
              windSpeedKmh: Number(scenario.windSpeedKmh),
              routePoints: scenario.routePoints.map((point) => ({
                latitude: Number(point.latitude),
                longitude: Number(point.longitude),
              })),
            },
            rainfall: { hourlyMm: Number(scenario.hourlyMm), durationHours: Number(scenario.durationHours) },
            capacity: { districts: 30, institutions: Number(scenario.institutions), shelters: Number(scenario.shelters) },
          },
        }),
      })
      const scenarioData = await scenarioResponse.json()
      if (!scenarioResponse.ok) throw new Error(scenarioData.error || 'Unable to create scenario')
      const runResponse = await fetch(`${API_URL}/simulation/runs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: scenarioData._id, clockMode: 'DEMO_ACCELERATED' }),
      })
      const runData = await runResponse.json()
      if (!runResponse.ok) throw new Error(runData.error || 'Unable to create simulation run')
      setRun(runData)
      rememberSelectedRun(runData._id)
      await loadRuns()
      setSteps([])
      setTimelineIndex(-1)
      setStoredReports([])
      setMessage('Simulation ready. Advance one synthetic hour with Step.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const step = async () => {
    if (!run) return
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/simulation/runs/${run._id}/step`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      if (data.stepCommitted && data.run && data.timestep) {
        setRun(data.run)
        setSteps((current) => {
          const next = [...current, data.timestep]
          setTimelineIndex(next.length - 1)
          return next
        })
      } else if (!response.ok) {
        throw new Error(data.error || 'Unable to advance simulation')
      } else {
        setRun(data.run)
        setSteps((current) => {
          const next = [...current, data.timestep]
          setTimelineIndex(next.length - 1)
          return next
        })
      }
      if (data.storedReport) await loadReports(run._id)
      if (data.run.status === 'COMPLETED') await loadRuns()
      setMessage(data.reportError
        ? data.storedReport
          ? `Synthetic hour ${data.timestep.sequence} completed. PDF stored, but audit logging needs attention: ${data.reportError}`
          : `Synthetic hour ${data.timestep.sequence} completed, but PDF archiving failed: ${data.reportError}`
        : data.run.status === 'COMPLETED'
          ? `Simulation completed at hour ${data.timestep.sequence}. Its complete PDF report was archived.`
          : `Synthetic hour ${data.timestep.sequence} completed. No live alert or dispatch was created.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const pause = async () => {
    if (!run) return
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/simulation/runs/${run._id}/pause`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin test pause' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to pause simulation')
      setRun(data)
      setMessage('Simulation paused.')
      await loadRuns()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const selectedStep = timelineIndex >= 0 ? steps[timelineIndex] : null
  const activeRoute = selectedStep?.cyclone.routePoints
    || run?.scenario?.parameters?.cyclone?.routePoints
    || scenario.routePoints
  const routePositions = useMemo(
    () => activeRoute.map((point) => [Number(point.latitude), Number(point.longitude)]),
    [activeRoute],
  )
  const rescueCenterMarkers = useMemo(() => rescueCenterLayer.centers.flatMap((center) => {
    const coordinates = center.location?.coordinates
    const longitude = Number(coordinates?.[0])
    const latitude = Number(coordinates?.[1])
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) return []
    return [{ center, position: [latitude, longitude] }]
  }), [rescueCenterLayer.centers])
  const unmappedCenterCount = rescueCenterLayer.centers.length - rescueCenterMarkers.length
  const mapBoundsPositions = useMemo(
    () => [...routePositions, ...rescueCenterMarkers.map((marker) => marker.position)],
    [routePositions, rescueCenterMarkers],
  )
  const routeStart = routePositions[0]
  const routeTarget = routePositions[routePositions.length - 1]
  const getStepPosition = (stepItem) => {
    if (Number.isFinite(stepItem.cyclone.positionLatitude) && Number.isFinite(stepItem.cyclone.positionLongitude)) {
      return [stepItem.cyclone.positionLatitude, stepItem.cyclone.positionLongitude]
    }
    const progress = stepItem.cyclone.approachProgress
    return [
      routeStart[0] + (routeTarget[0] - routeStart[0]) * progress,
      routeStart[1] + (routeTarget[1] - routeStart[1]) * progress,
    ]
  }
  const cyclonePath = [routeStart, ...steps.map(getStepPosition)]
  const drawnRouteSegments = splitRouteAtDateLine(routePositions)
  const drawnCycloneSegments = splitRouteAtDateLine(cyclonePath)
  const cyclonePosition = selectedStep ? getStepPosition(selectedStep) : routeStart
  const peakStep = steps.reduce((peak, item) => item.impacts.riskScore > peak.impacts.riskScore ? item : peak, steps[0])
  const totalResourceDemand = selectedStep
    ? selectedStep.recommendations.resources.reduce((total, item) => ({
        boats: total.boats + item.boats,
        paramedics: total.paramedics + item.paramedics,
        rescueTeams: total.rescueTeams + item.rescueTeams,
      }), { boats: 0, paramedics: 0, rescueTeams: 0 })
    : { boats: 0, paramedics: 0, rescueTeams: 0 }
  const runStamp = run?._id || 'simulation'
  const downloadSummary = () => {
    downloadFile(`${runStamp}-executive-summary.json`, JSON.stringify({
      reportType: 'simulation_executive_summary',
      dataSource: 'synthetic_simulation',
      runId: run?._id,
      scenario,
      peakStep,
      viewedStep: selectedStep,
      userHelpStatus: 'isolated_no_live_help_or_sos_created',
      aiInsightStatus: 'rule_matrix_only_no_synthetic_prompt_sent',
      limitation: 'Not an official forecast or hydrodynamic model.',
    }, null, 2), 'application/json')
  }
  const downloadHourly = () => {
    const rows = [
      ['run_id', 'hour', 'timestamp', 'risk_tier', 'risk_score', 'rainfall_mm_per_hour', 'river_signal', 'river_discharge_proxy_m3s', 'temperature_proxy_c', 'cyclone_wind_kmh', 'distance_to_target_km'],
      ...steps.map((item) => [run?._id, item.sequence, item.timestamp, item.impacts.riskTier, item.impacts.riskScore, item.weather.hourlyRainfallMm, item.weather.riverSignal, item.weather.riverDischargeM3s, item.weather.temperatureC, item.cyclone.windSpeedKmh, item.cyclone.distanceToTargetKm ?? item.cyclone.distanceToOdishaKm]),
    ]
    downloadFile(`${runStamp}-hourly-telemetry.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }
  const downloadStateImpacts = () => {
    const rows = [['run_id', 'hour', 'state', 'risk_tier', 'risk_score', 'rainfall_mm_per_hour', 'river_discharge_proxy_m3s', 'temperature_proxy_c', 'data_source']]
    steps.forEach((item) => item.impacts.states.forEach((state) => rows.push([run?._id, item.sequence, state.state, state.riskTier, state.riskScore, state.rainfallMm, state.riverDischargeM3s, state.temperatureC, state.dataSource])))
    downloadFile(`${runStamp}-india-state-impacts.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  const createStoredPdf = async () => {
    if (!run) return
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/simulation/runs/${run._id}/reports`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      if (!response.ok && !data._id) throw new Error(data.error || 'Unable to store simulation PDF')
      await loadReports(run._id)
      setMessage(data.auditError
        ? data.auditError
        : `Complete PDF report stored in the database with SHA-256 ${data.sha256}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const fetchStoredPdf = async (report, download = false) => {
    if (!run) return
    setBusy(true)
    try {
      const downloadQuery = download ? '?download=1' : ''
      const response = await fetch(
        `${API_URL}/simulation/runs/${run._id}/reports/${report._id}/pdf${downloadQuery}`,
        { headers },
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Unable to load stored PDF report')
      }
      const url = URL.createObjectURL(await response.blob())
      if (download) {
        const link = document.createElement('a')
        link.href = url
        link.download = report.fileName
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      } else {
        setPdfPreviewUrl(url)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteStoredPdf = async (report) => {
    if (!run) return
    const confirmed = window.confirm(`Permanently delete the archived PDF "${report.fileName}"? The simulation run and its saved hours will remain.`)
    if (!confirmed) return
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/simulation/runs/${run._id}/reports/${report._id}`, {
        method: 'DELETE',
        headers,
      })
      const data = await response.json()
      if (!response.ok && !data.deleted) throw new Error(data.error || 'Unable to delete stored PDF report')
      setStoredReports((current) => current.filter((storedReport) => storedReport._id !== report._id))
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
      setPdfPreviewUrl('')
      setMessage(data.auditError || `Archived PDF "${report.fileName}" deleted. The simulation run and its saved hours remain.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const downloadRun = async (savedRun) => {
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/simulation/runs/${savedRun._id}/report`, { headers })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to download simulation run')
      downloadFile(
        `${savedRun._id}-simulation-evidence.json`,
        JSON.stringify(data, null, 2),
        'application/json',
      )
      setMessage(`Downloaded all persisted evidence for ${savedRun.scenario?.name || 'the selected run'}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteRun = async (savedRun) => {
    const confirmed = window.confirm(
      `Permanently delete "${savedRun.scenario?.name || 'this simulation'}" and its saved hours and PDF reports? This cannot be undone.`,
    )
    if (!confirmed) return
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/simulation/runs/${savedRun._id}`, {
        method: 'DELETE',
        headers,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to delete simulation run')
      setSavedRuns((current) => current.filter((item) => item._id !== savedRun._id))
      if (run?._id === savedRun._id) {
        rememberSelectedRun(null)
        setRun(null)
        setScenario(DEFAULT_SCENARIO)
        setSteps([])
        setStoredReports([])
        setTimelineIndex(-1)
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
        setPdfPreviewUrl('')
      }
      setMessage('Simulation run, saved hours, and archived PDF reports deleted.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="simulation-workspace" aria-labelledby="simulation-title">
      <div className="simulation-banner">
        <strong>SIMULATION MODE · ODISHA</strong>
        <span>Synthetic rule-matrix rehearsal. No live alert, SOS, or dispatch is created.</span>
      </div>
      <div className="simulation-workspace-header">
        <div className="simulation-workspace-intro">
          <h3 id="simulation-title">Flood &amp; cyclone simulator</h3>
          <p>Configure a custom global route. District impact calculations are Odisha-only synthetic proxies. The selected run is restored when you return from another admin view; synthetic time advances only when you choose Step.</p>
        </div>
        <div className="simulation-run-history">
          <div>
            <strong>Saved cyclone runs</strong>
            <span>Starting a new run keeps these records. View, export, or delete an individual run.</span>
          </div>
          <select aria-label="Saved simulation runs" value={run?._id || ''} onChange={(event) => event.target.value && loadRun(event.target.value)} disabled={busy}>
            <option value="">Select a saved run</option>
            {savedRuns.map((savedRun) => <option key={savedRun._id} value={savedRun._id}>{savedRun.scenario?.name || 'Scenario'} · H{savedRun.sequence} · {savedRun.status}</option>)}
          </select>
          {hasMoreRuns && <button type="button" onClick={() => loadRuns({ cursor: runCursor, append: true }).catch((error) => setMessage(error.message))} disabled={busy}>Load older runs</button>}
          <div className="simulation-run-list" aria-label="Saved simulation run actions">
            {savedRuns.length === 0
              ? <span>No saved simulation runs yet.</span>
              : savedRuns.map((savedRun) => (
                <div className="simulation-run-item" key={savedRun._id}>
                  <span><strong>{savedRun.scenario?.name || 'Scenario'}</strong> · H{savedRun.sequence} · {savedRun.status}</span>
                  <button type="button" onClick={() => loadRun(savedRun._id)} disabled={busy} aria-label={`View ${savedRun.scenario?.name || 'simulation'} run`}>View</button>
                  <button type="button" onClick={() => downloadRun(savedRun)} disabled={busy} aria-label={`Download ${savedRun.scenario?.name || 'simulation'} run`}>Download</button>
                  <button type="button" onClick={() => deleteRun(savedRun)} disabled={busy} aria-label={`Delete ${savedRun.scenario?.name || 'simulation'} run`}>Delete</button>
                </div>
              ))}
          </div>
        </div>
        <div className="simulation-actions">
          {!run
            ? <button type="button" className="form-submit" onClick={createRun} disabled={busy}>Create test run</button>
            : <button type="button" onClick={startNewScenario} disabled={busy}>New scenario</button>}
          <button type="button" onClick={step} disabled={!run || busy || run.status === 'COMPLETED'}>Step +1 hour</button>
          <button type="button" onClick={pause} disabled={!run || busy || run.status === 'PAUSED' || run.status === 'COMPLETED'}>Pause</button>
        </div>
      </div>
      <div className="simulation-controls">
        {[
          ['name', 'Scenario name', 'text'],
          ['windSpeedKmh', 'Wind speed (km/h)', 'number'],
          ['hourlyMm', 'Heavy rain (mm/hour)', 'number'],
          ['durationHours', 'Rain duration (hours)', 'number'],
          ['institutions', 'Institutions exposed', 'number'],
          ['shelters', 'Shelters available', 'number'],
        ].map(([key, label, type]) => (
          <label key={key}>{label}<input type={type} min={key === 'durationHours' ? 1 : key === 'windSpeedKmh' ? 0 : key === 'hourlyMm' ? 0 : undefined} max={key === 'durationHours' ? 168 : key === 'windSpeedKmh' ? 300 : key === 'hourlyMm' ? 500 : undefined} value={scenario[key]} disabled={Boolean(run) || busy} onChange={(event) => setScenario({ ...scenario, [key]: event.target.value })} /></label>
        ))}
      </div>
      <div className="simulation-route-editor">
        <div className="simulation-map-heading">
          <strong>Custom cyclone route ({scenario.routePoints.length}/20 waypoints)</strong>
          <span>Click the map to add route points; drag the map or edit coordinates directly.</span>
        </div>
        {scenario.routePoints.map((point, index) => (
          <div className="simulation-route-point" key={`route-${index}`}>
            <strong>{index === 0 ? 'Start' : index === scenario.routePoints.length - 1 ? 'Target' : `Waypoint ${index}`}</strong>
            <label>Latitude<input aria-label={`Waypoint ${index + 1} latitude`} type="number" min="-90" max="90" step="0.0001" value={point.latitude} disabled={Boolean(run) || busy} onChange={(event) => updateRoutePoint(index, 'latitude', event.target.value)} /></label>
            <label>Longitude<input aria-label={`Waypoint ${index + 1} longitude`} type="number" min="-180" max="180" step="0.0001" value={point.longitude} disabled={Boolean(run) || busy} onChange={(event) => updateRoutePoint(index, 'longitude', event.target.value)} /></label>
            {scenario.routePoints.length > 2 && <button type="button" onClick={() => setScenario((current) => ({ ...current, routePoints: current.routePoints.filter((_, pointIndex) => pointIndex !== index) }))} disabled={Boolean(run) || busy}>Remove</button>}
          </div>
        ))}
        <button type="button" onClick={insertRoutePoint} disabled={Boolean(run) || busy || scenario.routePoints.length >= 20}>Insert midpoint waypoint</button>
        <p>Custom route points affect cyclone movement only. The current impact model still reports Odisha districts and synthetic state context.</p>
      </div>
      {run && <p className="simulation-run-meta">Run {run._id} · {run.status} · synthetic hour {run.sequence}</p>}
      {steps.length > 0 && (
        <div className="simulation-timeline">
          <div className="simulation-timeline-header">
            <strong>Replay timeline</strong>
            <span>Viewing synthetic hour {timelineIndex + 1}; moving backward only changes the display.</span>
          </div>
          <input
            type="range"
            min="0"
            max={steps.length - 1}
            value={Math.max(0, timelineIndex)}
            onChange={(event) => setTimelineIndex(Number(event.target.value))}
            aria-label="Simulation timeline"
          />
          <div className="simulation-timeline-actions">
            <button type="button" onClick={() => setTimelineIndex((index) => Math.max(0, index - 1))}>← Previous hour</button>
            <button type="button" onClick={() => setTimelineIndex((index) => Math.min(steps.length - 1, index + 1))}>Next hour →</button>
          </div>
        </div>
      )}
      <div className="simulation-map-panel">
        <div className="simulation-map-heading">
          <strong>Synthetic cyclone route and rescue centers</strong>
          <span>{selectedStep ? `Hour ${selectedStep.sequence} · ${selectedStep.impacts.riskTier}` : 'Advance the run to draw the track'}</span>
        </div>
        <p>
          Click the map to add route waypoints while configuring. Rescue center markers use the current registry and are reference-only;
          simulation does not change their status or occupancy.
          {rescueCenterLayer.status === 'loading' && ' Loading rescue centers…'}
          {rescueCenterLayer.status === 'error' && ` Rescue center layer unavailable: ${rescueCenterLayer.error}`}
          {rescueCenterLayer.status === 'loaded' && ` ${rescueCenterMarkers.length} open/limited rescue centers displayed.`}
          {unmappedCenterCount > 0 && ` ${unmappedCenterCount} center records have invalid coordinates and were omitted.`}
          {' '}Impacts remain a synthetic Odisha district model.
        </p>
        <MapContainer center={routeTarget} zoom={4} scrollWheelZoom className="simulation-map">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitRouteBounds positions={mapBoundsPositions} />
          <RouteMapClick enabled={!run && scenario.routePoints.length < 20} onAddPoint={addRoutePoint} />
          {drawnRouteSegments.map((segment, index) => <Polyline key={`planned-route-${index}`} positions={segment} pathOptions={{ color: '#94a3b8', dashArray: '8 8', weight: 2 }} />)}
          {steps.length > 0 && drawnCycloneSegments.map((segment, index) => <Polyline key={`actual-track-${index}`} positions={segment} pathOptions={{ color: '#dc2626', weight: 5 }} />)}
          {routePositions.map((position, index) => (
            <CircleMarker key={`route-marker-${index}`} center={position} radius={index === routePositions.length - 1 ? 8 : 5} pathOptions={{ color: index === routePositions.length - 1 ? '#0f766e' : '#1d4ed8', fillColor: index === routePositions.length - 1 ? '#14b8a6' : '#60a5fa', fillOpacity: 0.9 }}>
              <Popup>{index === 0 ? 'Cyclone start' : index === routePositions.length - 1 ? 'Custom route target' : `Route waypoint ${index}`}</Popup>
            </CircleMarker>
          ))}
          {rescueCenterMarkers.map(({ center, position }) => (
            <CircleMarker key={`rescue-center-${center._id}`} center={position} radius={7} pathOptions={{ color: '#166534', fillColor: '#22c55e', fillOpacity: 0.9 }}>
              <Popup>
                <strong>{center.name}</strong><br />
                {center.address}<br />
                Status: {center.status}<br />
                Occupancy: {center.occupancy}/{center.capacity}<br />
                Access: {center.accessibility ? 'accessible' : 'standard'} · Water: {center.waterAvailable ? 'yes' : 'no'}<br />
                Medical: {center.medicalAvailable ? 'yes' : 'no'} · Power: {center.powerAvailable ? 'yes' : 'no'}<br />
                Last verified: {center.lastVerifiedAt ? new Date(center.lastVerifiedAt).toLocaleString() : 'unknown'}
              </Popup>
            </CircleMarker>
          ))}
          <CircleMarker center={cyclonePosition} radius={12} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
            <Popup>
              Synthetic cyclone · {selectedStep ? `Hour ${selectedStep.sequence}` : 'start'}<br />
              Wind: {selectedStep?.cyclone.windSpeedKmh?.toFixed(1) || '—'} km/h<br />
              Distance to target: {(selectedStep?.cyclone.distanceToTargetKm ?? selectedStep?.cyclone.distanceToOdishaKm)?.toFixed(1) || '—'} km
            </Popup>
          </CircleMarker>
        </MapContainer>
      </div>
      {selectedStep && (
        <div className="simulation-results">
          <div className="simulation-metric"><span>Risk tier</span><strong>{selectedStep.impacts.riskTier}</strong></div>
          <div className="simulation-metric"><span>Risk score</span><strong>{Math.round(selectedStep.impacts.riskScore * 100)}%</strong></div>
          <div className="simulation-metric"><span>Distance to route target</span><strong>{(selectedStep.cyclone.distanceToTargetKm ?? selectedStep.cyclone.distanceToOdishaKm).toFixed(1)} km</strong></div>
          <div className="simulation-metric"><span>Critical districts</span><strong>{selectedStep.impacts.criticalDistricts}</strong></div>
          <div className="simulation-districts">
            {selectedStep.impacts.districts.map((district) => (
              <div key={district.district}><strong>{district.district}</strong><span>{district.riskTier} · {Math.round(district.riskScore * 100)}%</span></div>
            ))}
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <div className="simulation-chart-card">
          <div className="simulation-map-heading">
            <strong>Hourly simulation insights</strong>
            <button type="button" onClick={createStoredPdf} disabled={busy}>Generate &amp; store complete PDF</button>
          </div>
          <div className="simulation-chart">
            <Line
              data={{
                labels: steps.map((stepItem) => `H${stepItem.sequence}`),
                datasets: [
                  { label: 'Risk score (%)', data: steps.map((stepItem) => Math.round(stepItem.impacts.riskScore * 100)), borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.12)', fill: true, tension: 0.3 },
                  { label: 'Rainfall (mm/hour)', data: steps.map((stepItem) => stepItem.weather.hourlyRainfallMm), borderColor: '#0284c7', tension: 0.3 },
                  { label: 'River signal (%)', data: steps.map((stepItem) => Math.round(stepItem.weather.riverSignal * 100)), borderColor: '#0f766e', tension: 0.3 },
                  { label: 'River discharge proxy (m³/s)', data: steps.map((stepItem) => stepItem.weather.riverDischargeM3s), borderColor: '#6366f1', tension: 0.3 },
                  { label: 'Temperature proxy (°C)', data: steps.map((stepItem) => stepItem.weather.temperatureC), borderColor: '#f97316', tension: 0.3 },
                ],
              }}
              options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }}
            />
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <section className="simulation-outcome-pack" aria-labelledby="simulation-outcome-title">
          <div className="simulation-outcome-header">
            <div>
              <span className="eyebrow">Rehearsal evidence pack</span>
              <h4 id="simulation-outcome-title">Cyclone outcome, help and insight summary</h4>
              <p>Route movement is customizable worldwide. Impacts remain synthetic Odisha and state-context proxies; live telemetry is separate.</p>
            </div>
            <div className="simulation-report-actions">
              <button type="button" onClick={downloadSummary}>Download executive summary</button>
              <button type="button" onClick={downloadHourly}>Download hourly telemetry</button>
              <button type="button" onClick={downloadStateImpacts}>Download India state impacts</button>
              <button type="button" onClick={createStoredPdf} disabled={busy}>Generate &amp; store full PDF</button>
            </div>
          </div>
          <div className="simulation-stored-reports">
            <div className="simulation-map-heading">
              <strong>Archived PDF reports for this run</strong>
              <span>{storedReports.length} stored version{storedReports.length === 1 ? '' : 's'} · each includes every generated hour, all 30 Odisha districts, and 36 state summaries.</span>
            </div>
            {storedReports.length === 0
              ? <p>No archived PDF yet. Completing the run stores one automatically; you can also store a snapshot now.</p>
              : storedReports.map((report) => (
                <div className="simulation-stored-report" key={report._id}>
                  <div>
                    <strong>{report.fileName}</strong>
                    <span>{new Date(report.generatedAt).toLocaleString()} · SHA-256 {report.sha256.slice(0, 16)}… · {report.summary?.timestepCount || 0} hours</span>
                  </div>
                  <button type="button" onClick={() => fetchStoredPdf(report)} disabled={busy}>View PDF</button>
                  <button type="button" onClick={() => fetchStoredPdf(report, true)} disabled={busy}>Download PDF</button>
                  <button type="button" onClick={() => deleteStoredPdf(report)} disabled={busy}>Delete PDF</button>
                </div>
              ))}
            {pdfPreviewUrl && (
              <div className="simulation-pdf-preview">
                <div className="simulation-map-heading">
                  <strong>Stored PDF preview</strong>
                  <button type="button" onClick={() => setPdfPreviewUrl('')}>Close preview</button>
                </div>
                <iframe title="Stored simulation report PDF" src={pdfPreviewUrl} />
              </div>
            )}
          </div>
          <div className="simulation-outcome-grid">
            <div><span>Peak risk</span><strong>{peakStep.impacts.riskTier} · {Math.round(peakStep.impacts.riskScore * 100)}%</strong><small>Hour {peakStep.sequence}</small></div>
            <div><span>Peak rainfall</span><strong>{Math.max(...steps.map((item) => item.weather.hourlyRainfallMm)).toFixed(1)} mm/h</strong><small>Synthetic Odisha signal</small></div>
            <div><span>Peak river discharge proxy</span><strong>{Math.max(...steps.map((item) => item.weather.riverDischargeM3s)).toFixed(1)} m³/s</strong><small>Not a gauge reading</small></div>
            <div><span>Resource advice at viewed hour</span><strong>{totalResourceDemand.rescueTeams} teams</strong><small>{totalResourceDemand.boats} boats · {totalResourceDemand.paramedics} paramedics</small></div>
          </div>
          <div className="simulation-outcome-columns">
            <div className="simulation-outcome-card">
              <h5>User help / reports</h5>
              <strong>Not connected to this isolated run</strong>
              <p>No public SOS, help message, notification, or citizen report was created. A live incident inbox must be tested separately before operational use.</p>
            </div>
            <div className="simulation-outcome-card">
              <h5>AI insight</h5>
              <strong>Rule-matrix explanation only</strong>
              <p>{selectedStep?.recommendations.rationale} This run did not send synthetic data to grounded AI chat or claim an AI forecast.</p>
            </div>
            <div className="simulation-outcome-card">
              <h5>Final review</h5>
              <strong>What to improve</strong>
              <p>Validate against gauges and verified incident data, add resource reservations, connect approved live telemetry, and generate server-signed reports before deployment.</p>
            </div>
          </div>
          {selectedStep && <div className="simulation-hour-table">
            <h5>Viewed-hour district evidence</h5>
            <div className="simulation-hour-row simulation-hour-heading"><span>District</span><span>Risk</span><span>Rain</span><span>River signal</span><span>Exposure</span></div>
            {selectedStep.impacts.districts.map((district) => (
              <div className="simulation-hour-row" key={district.district}>
                <strong>{district.district}</strong><span>{district.riskTier}</span><span>{district.rainfallMm} mm/h</span><span>{Math.round(district.riverSignal * 100)}%</span><span>{district.exposedInstitutions}</span>
              </div>
            ))}
          </div>}
          {selectedStep && <div className="simulation-hour-table">
            <h5>India-wide synthetic state impact summary</h5>
            <div className="simulation-hour-row simulation-state-row simulation-hour-heading"><span>State</span><span>Risk</span><span>Rain</span><span>River proxy</span><span>Heat</span></div>
            {selectedStep.impacts.states.map((state) => (
              <div className="simulation-hour-row simulation-state-row" key={state.state}>
                <strong>{state.state}</strong><span>{state.riskTier} · {Math.round(state.riskScore * 100)}%</span><span>{state.rainfallMm} mm/h</span><span>{state.riverDischargeM3s} m³/s</span><span>{state.temperatureC}°C</span>
              </div>
            ))}
          </div>}
        </section>
      )}
      {message && <p className="form-error" role="status">{message}</p>}
    </section>
  )
}
