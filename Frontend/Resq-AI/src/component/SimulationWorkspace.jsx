import React, { useMemo, useState } from 'react'

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
      setSteps((current) => [...current, data.timestep])
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
        <div className="simulation-results">
          <div className="simulation-metric"><span>Risk tier</span><strong>{steps.at(-1).impacts.riskTier}</strong></div>
          <div className="simulation-metric"><span>Risk score</span><strong>{Math.round(steps.at(-1).impacts.riskScore * 100)}%</strong></div>
          <div className="simulation-metric"><span>Distance to Odisha</span><strong>{steps.at(-1).cyclone.distanceToOdishaKm.toFixed(1)} km</strong></div>
          <div className="simulation-metric"><span>Critical districts</span><strong>{steps.at(-1).impacts.criticalDistricts}</strong></div>
          <div className="simulation-districts">
            {steps.at(-1).impacts.districts.map((district) => (
              <div key={district.district}><strong>{district.district}</strong><span>{district.riskTier} · {Math.round(district.riskScore * 100)}%</span></div>
            ))}
          </div>
        </div>
      )}
      {message && <p className="form-error" role="status">{message}</p>}
    </section>
  )
}
