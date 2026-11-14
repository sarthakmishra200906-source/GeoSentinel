import React, { useMemo, useState } from 'react'
import { Circle, MapContainer, Polyline, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default function SimulationWorkspace({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const [scenario, setScenario] = useState({
    name: 'Odisha cyclone rehearsal',
    approachDistanceKm: 200,
    windSpeedKmh: 160,
    hourlyMm: 180,
    durationHours: 24,
    institutions: 500,
    shelters: 20,
  })
  const [run, setRun] = useState(null)
  const [steps, setSteps] = useState([])
  const [timelineIndex, setTimelineIndex] = useState(-1)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const createRun = async () => {
    setBusy(true)
    try {
      const scenarioResponse = await fetch(`${API_URL}/simulation/scenarios`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scenario.name,
          parameters: {
            cyclone: { approachDistanceKm: Number(scenario.approachDistanceKm), windSpeedKmh: Number(scenario.windSpeedKmh) },
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
      setSteps([])
      setTimelineIndex(-1)
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
      if (!response.ok) throw new Error(data.error || 'Unable to advance simulation')
      setRun(data.run)
      setSteps((current) => {
        const next = [...current, data.timestep]
        setTimelineIndex(next.length - 1)
        return next
      })
      setMessage(`Synthetic hour ${data.timestep.sequence} completed. No live alert or dispatch was created.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }

  }

  const pause = async () => {
    if (!run) return
    const response = await fetch(`${API_URL}/simulation/runs/${run._id}/pause`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Admin test pause' }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || 'Unable to pause simulation')
      return
    }

    setRun(data)
    setMessage('Simulation paused.')
  }

  const selectedStep = timelineIndex >= 0 ? steps[timelineIndex] : null
  const odishaTarget = [20.3, 86.6]
  const cycloneStart = [17.6, 88.8]
  const cyclonePath = steps.map((stepItem) => {
    const progress = stepItem.cyclone.approachProgress
    return [
      cycloneStart[0] + (odishaTarget[0] - cycloneStart[0]) * progress,
      cycloneStart[1] + (odishaTarget[1] - cycloneStart[1]) * progress,
    ]
  })
  const cyclonePosition = selectedStep
    ? [
        cycloneStart[0] + (odishaTarget[0] - cycloneStart[0]) * selectedStep.cyclone.approachProgress,
        cycloneStart[1] + (odishaTarget[1] - cycloneStart[1]) * selectedStep.cyclone.approachProgress,
      ]
    : cycloneStart

  return (
    <section className="simulation-workspace" aria-labelledby="simulation-title">
      <div className="simulation-banner">
        <strong>SIMULATION MODE · ODISHA</strong>
        <span>Synthetic rule-matrix rehearsal. No live alert, SOS, or dispatch is created.</span>
      </div>
      <div className="simulation-workspace-header">
        <div>
          <h3 id="simulation-title">Flood &amp; cyclone simulator</h3>
          <p>Run a bounded, explainable scenario before connecting future live-context playback.</p>
        </div>
        <div className="simulation-actions">
          <button type="button" className="form-submit" onClick={createRun} disabled={busy}>Create test run</button>
          <button type="button" onClick={step} disabled={!run || busy}>Step +1 hour</button>
          <button type="button" onClick={pause} disabled={!run || run.status === 'PAUSED'}>Pause</button>
        </div>
      </div>
      <div className="simulation-controls">
        {[
          ['name', 'Scenario name', 'text'],
          ['approachDistanceKm', 'Cyclone approach (km)', 'number'],
          ['windSpeedKmh', 'Wind speed (km/h)', 'number'],
          ['hourlyMm', 'Heavy rain (mm/hour)', 'number'],
          ['durationHours', 'Rain duration (hours)', 'number'],
          ['institutions', 'Institutions exposed', 'number'],
          ['shelters', 'Shelters available', 'number'],
        ].map(([key, label, type]) => (
          <label key={key}>{label}<input type={type} value={scenario[key]} onChange={(event) => setScenario({ ...scenario, [key]: event.target.value })} /></label>
        ))}
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
          <strong>Simulated cyclone path and impact map</strong>
          <span>{selectedStep ? `Hour ${selectedStep.sequence} · ${selectedStep.impacts.riskTier}` : 'Advance the run to draw the track'}</span>
        </div>
        <MapContainer center={odishaTarget} zoom={6} scrollWheelZoom className="simulation-map">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={[cycloneStart, odishaTarget]} pathOptions={{ color: '#94a3b8', dashArray: '8 8', weight: 2 }} />
          {cyclonePath.length > 0 && <Polyline positions={cyclonePath} pathOptions={{ color: '#dc2626', weight: 5 }} />}
          <Circle center={odishaTarget} radius={120000} pathOptions={{ color: '#f97316', fillColor: '#fb923c', fillOpacity: 0.12 }} />
          <CircleMarker center={odishaTarget} radius={8} pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.9 }}>
            <Popup>Odisha scenario target corridor</Popup>
          </CircleMarker>
          <CircleMarker center={cyclonePosition} radius={12} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 0.9 }}>
            <Popup>
              Synthetic cyclone · {selectedStep ? `Hour ${selectedStep.sequence}` : 'start'}<br />
              Wind: {selectedStep?.cyclone.windSpeedKmh?.toFixed(1) || '—'} km/h<br />
              Distance: {selectedStep?.cyclone.distanceToOdishaKm?.toFixed(1) || '—'} km
            </Popup>
          </CircleMarker>
        </MapContainer>
      </div>
      {selectedStep && (
        <div className="simulation-results">
          <div className="simulation-metric"><span>Risk tier</span><strong>{selectedStep.impacts.riskTier}</strong></div>
          <div className="simulation-metric"><span>Risk score</span><strong>{Math.round(selectedStep.impacts.riskScore * 100)}%</strong></div>
          <div className="simulation-metric"><span>Distance to Odisha</span><strong>{selectedStep.cyclone.distanceToOdishaKm.toFixed(1)} km</strong></div>
          <div className="simulation-metric"><span>Critical districts</span><strong>{selectedStep.impacts.criticalDistricts}</strong></div>
          <div className="simulation-districts">
            {selectedStep.impacts.districts.map((district) => (
              <div key={district.district}><strong>{district.district}</strong><span>{district.riskTier} · {Math.round(district.riskScore * 100)}%</span></div>
            ))}
          </div>
        </div>
      )}
      {message && <p className="form-error" role="status">{message}</p>}
    </section>
  )
}
