import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import SimulationWorkspace from './SimulationWorkspace'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default function AdminDashboard({ token, onSwitchToMap }) {
  const [activeSection, setActiveSection] = useState('overview')
  const [guidelines, setGuidelines] = useState([])
  const [verifications, setVerifications] = useState([])
  const [message, setMessage] = useState('')
  const [centers, setCenters] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [health, setHealth] = useState(null)
  const [weatherDashboard, setWeatherDashboard] = useState(null)
  const [stateReport, setStateReport] = useState(null)
  const [trendReport, setTrendReport] = useState(null)
  const [selectedState, setSelectedState] = useState('')
  const [simulation, setSimulation] = useState(null)
  const [notificationForm, setNotificationForm] = useState({
    title: '',
    message: '',
    severity: 'warning',
    audience: 'all',
  })
  const [editingCenterId, setEditingCenterId] = useState(null)
  const [centerForm, setCenterForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    capacity: '',
    occupancy: '0',
    accessibility: false,
    waterAvailable: false,
    medicalAvailable: false,
    powerAvailable: false,
    contact: '',
  })
  const [form, setForm] = useState({
    title: '',
    issuingAuthority: '',
    officialUrl: '',
    jurisdiction: 'India',
    document: null,
  })

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const load = useCallback(async () => {
    const [guidelineResponse, verificationResponse, centersResponse, auditResponse, healthResponse, weatherResponse, stateResponse] =
      await Promise.all([
        fetch(`${API_URL}/admin/guidelines`, { headers }),
        fetch(`${API_URL}/admin/verifications`, { headers }),
        fetch(`${API_URL}/rescue-centers`, { headers }),
        fetch(`${API_URL}/admin/audit`, { headers }),
        fetch(`${API_URL}/admin/health`, { headers }),
        fetch(`${API_URL}/weather/dashboard`),
        fetch(`${API_URL}/weather/states`),
      ])
    if (!guidelineResponse.ok || !verificationResponse.ok || !auditResponse.ok)
      throw new Error('Unable to load admin data')
    setGuidelines(await guidelineResponse.json())
    setVerifications(await verificationResponse.json())
    setCenters(await centersResponse.json())
    setAuditEvents(await auditResponse.json())
    setHealth(healthResponse.ok ? await healthResponse.json() : null)
    setWeatherDashboard(weatherResponse.ok ? await weatherResponse.json() : null)
    setStateReport(stateResponse.ok ? await stateResponse.json() : null)
  }, [headers])

  useEffect(() => {
    const state = selectedState || stateReport?.states?.[0]?.state
    if (!state) return
    fetch(`${API_URL}/weather/trends?state=${encodeURIComponent(state)}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load state trends')
        setTrendReport(data)
      })
      .catch((error) => setMessage(error.message))
  }, [selectedState, stateReport])

  const runSimulation = async () => {
    const response = await fetch(`${API_URL}/prediction/simulate`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to run simulation')
    setSimulation(data)
  }

  const sendNotification = async (event) => {
    event.preventDefault()
    const response = await fetch(`${API_URL}/notifications`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(notificationForm),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to send notification')
    setNotificationForm({ title: '', message: '', severity: 'warning', audience: 'all' })
    setMessage('Emergency notification broadcasted to all users successfully.')
  }

  const saveCenter = async (event) => {
    event.preventDefault()
    const response = await fetch(`${API_URL}/rescue-centers${editingCenterId ? `/${editingCenterId}` : ''}`, {
      method: editingCenterId ? 'PATCH' : 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...centerForm,
        capacity: Number(centerForm.capacity),
        occupancy: Number(centerForm.occupancy),
        latitude: Number(centerForm.latitude),
        longitude: Number(centerForm.longitude),
        ...(editingCenterId ? { version: centerForm.version } : {}),
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to create rescue center')
    setMessage(`Rescue center "${data.name}" ${editingCenterId ? 'updated' : 'created'}.`)
    setEditingCenterId(null)
    setCenterForm({
      name: '',
      address: '',
      latitude: '',
      longitude: '',
      capacity: '',
      occupancy: '0',
      accessibility: false,
      waterAvailable: false,
      medicalAvailable: false,
      powerAvailable: false,
      contact: '',
    })
    await load()
  }

  const closeCenter = async (id) => {
    const center = centers.find((item) => item._id === id)
    if (!center) return
    const response = await fetch(`${API_URL}/rescue-centers/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: center.name,
        address: center.address,
        capacity: center.capacity,
        occupancy: center.occupancy,
        accessibility: center.accessibility,
        waterAvailable: center.waterAvailable,
        medicalAvailable: center.medicalAvailable,
        powerAvailable: center.powerAvailable,
        contact: center.contact,
        latitude: center.location.coordinates[1],
        longitude: center.location.coordinates[0],
        status: 'closed',
        version: center.__v,
      }),
    })
    if (!response.ok) throw new Error('Unable to close rescue center')
    await load()
  }

  const updateCenterStatus = async (center, status) => {
    const response = await fetch(`${API_URL}/rescue-centers/${center._id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: center.name,
        address: center.address,
        capacity: center.capacity,
        occupancy: center.occupancy,
        accessibility: center.accessibility,
        waterAvailable: center.waterAvailable,
        medicalAvailable: center.medicalAvailable,
        powerAvailable: center.powerAvailable,
        contact: center.contact,
        latitude: center.location.coordinates[1],
        longitude: center.location.coordinates[0],
        status,
        version: center.__v,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to update rescue center status')
    await load()
  }

  const editCenter = (center) => {
    setEditingCenterId(center._id)
    setCenterForm({
      name: center.name,
      address: center.address,
      latitude: String(center.location.coordinates[1]),
      longitude: String(center.location.coordinates[0]),
      capacity: String(center.capacity),
      occupancy: String(center.occupancy),
      accessibility: center.accessibility,
      waterAvailable: center.waterAvailable,
      medicalAvailable: center.medicalAvailable,
      powerAvailable: center.powerAvailable,
      contact: center.contact || '',
      version: center.__v,
    })
  }

  useEffect(() => {
    let active = true
    load().catch((error) => {
      if (active) setMessage(error.message)
    })
    return () => {
      active = false
    }
  }, [load])

  const upload = async (event) => {
    event.preventDefault()
    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => value && body.append(key, value))
    const response = await fetch(`${API_URL}/admin/guidelines`, { method: 'POST', headers, body })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Upload failed')
    setMessage(`Uploaded ${data.chunks} RAG chunks. Approve the document before chat can use it.`)
    setForm({ title: '', issuingAuthority: '', officialUrl: '', jurisdiction: 'India', document: null })
    await load()
  }

  const updateVerification = async (id, status) => {
    const response = await fetch(`${API_URL}/admin/verifications/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) throw new Error('Unable to update verification')
    await load()
  }

  const exportTrendCsv = () => {
    if (!trendReport?.months?.length) return
    const rows = [
      ['month', 'rainfall_mm', 'mean_temperature_c', 'max_temperature_c', 'average_river_discharge_m3s', 'flood_risk'],
      ...trendReport.months.map((item) => [
        item.month,
        item.rainfallMm,
        item.meanTemperature ?? '',
        item.maxTemperature ?? '',
        item.averageRiverDischarge ?? '',
        item.floodRisk ?? '',
      ]),
    ]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${trendReport.state.toLowerCase().replaceAll(' ', '-')}-weather-trend.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const activeRiskChartData = useMemo(() => ({
    labels: (stateReport?.states || []).map((item) => item.state),
    datasets: [{
      label: 'Active flood risk (%)',
      data: (stateReport?.states || []).map((item) =>
        item.averageActiveFloodRisk === null ? null : Math.round(item.averageActiveFloodRisk * 100),
      ),
      backgroundColor: (stateReport?.states || []).map((item) => {
        const risk = item.averageActiveFloodRisk || 0
        return risk >= 0.5 ? '#ef4444' : risk >= 0.4 ? '#f59e0b' : '#22c55e'
      }),
      borderRadius: 8,
      borderSkipped: false,
    }],
  }), [stateReport])

  const professionalChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 18, color: '#334155' } },
      tooltip: { padding: 12, cornerRadius: 10, displayColors: true },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 0 } },
      y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.18)' }, ticks: { color: '#64748b' } },
    },
  }

  const updateGuideline = async (id, status) => {
    const response = await fetch(`${API_URL}/admin/guidelines/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) throw new Error('Unable to update guideline')
    await load()
  }

  const deleteGuideline = async (guideline) => {
    if (!window.confirm(`Delete "${guideline.title}" permanently? This removes its RAG content.`)) return
    if (!window.confirm('This cannot be undone. Continue only after verifying the document is obsolete or corrupted.')) return
    const confirmationEmail = window.prompt('Type your signed-in administrator Gmail address to confirm deletion:')
    if (!confirmationEmail) return
    const response = await fetch(`${API_URL}/admin/guidelines/${guideline._id}`, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationEmail, confirmationTitle: guideline.title }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to delete guideline')
    setMessage(`Deleted "${guideline.title}" and removed it from RAG.`)
    await load()
  }

  return (
    <div className="admin-dashboard">
      <nav className="admin-section-nav" aria-label="Admin dashboard sections">
        {[
          ['overview', 'Overview'],
          ['simulation', 'Simulation'],
          ['operations', 'Operations'],
          ['guidelines', 'Guidelines & upload'],
          ['audit', 'Audit log'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={activeSection === id ? 'active' : ''} onClick={() => {
            setActiveSection(id)
            document.getElementById(`admin-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}>{label}</button>
        ))}
      </nav>
      <div className="admin-dashboard-toolbar">
        <div>
          <h2>Admin dashboard</h2>
          <p>Manage verified content, rescue centers, notifications, and system health.</p>
        </div>
        <button type="button" className="btn-switch-map" onClick={onSwitchToMap}>
          🗺️ Open map
        </button>
      </div>
      <div id="admin-overview"><h3>System Health</h3></div>
      <p>
        {health
          ? Object.entries(health)
              .filter(([key]) => key !== 'checkedAt')
              .map(([key, value]) => `${key}: ${value}`)
              .join(' · ')
          : 'Health unavailable'}
      </p>

      <section className="weather-report" aria-labelledby="weather-report-title">
        <div className="weather-report-header">
          <div>
            <h3 id="weather-report-title">Live India Weather Report</h3>
            <p>
              Forecast data from {weatherDashboard?.provider || 'the live weather provider'}.
              Rain values are forecast telemetry, not fabricated model output.
            </p>
          </div>
          <div className="model-readiness">
            <strong>Model readiness</strong>
            <span>Flood-risk model: {health?.ml || 'checking'}</span>
            <span>Rain chance: live forecast</span>
            <span>Cyclone formation: live GDACS events only</span>
          </div>
        </div>
        {weatherDashboard?.india && (
          <div className="weather-report-summary">
            <div className="weather-report-card">
              <span>India rain chance</span>
              <strong>{Math.round(weatherDashboard.india.rainChance)}%</strong>
              <div className="weather-bar"><i style={{ width: `${weatherDashboard.india.rainChance}%` }} /></div>
            </div>
            <div className="weather-report-card">
              <span>India forecast rain</span>
              <strong>{weatherDashboard.india.rainAmountMm.toFixed(1)} mm</strong>
            </div>
            <div className="weather-report-card">
              <span>India max heat</span>
              <strong>{weatherDashboard.india.maxTemperature.toFixed(1)}°C</strong>
            </div>
            <div className={`weather-report-card risk-card risk-${(weatherDashboard.india.activeFloodRiskTier || 'UNAVAILABLE').toLowerCase()}`}>
              <span>Active flood risk</span>
              <strong>
                {weatherDashboard.india.activeFloodRisk === null
                  ? 'Unavailable'
                  : `${Math.round(weatherDashboard.india.activeFloodRisk * 100)}%`}
              </strong>
              <small>{weatherDashboard.india.activeFloodRiskTier || 'UNAVAILABLE'} · live telemetry</small>
            </div>
          </div>
        )}
        {weatherDashboard?.cities?.length > 0 && (
          <div className="weather-city-table">
            <div className="weather-city-row weather-city-heading">
              <span>City</span><span>Rain outlook</span><span>Rain amount</span><span>Heat</span><span>Active flood risk</span>
            </div>
            {weatherDashboard.cities.map((city) => (
              <div className="weather-city-row" key={city.name}>
                <strong>{city.name}</strong>
                <span>
                  {Math.round(city.rainChance)}%
                  <i className="weather-inline-bar"><b style={{ width: `${city.rainChance}%` }} /></i>
                </span>
                <span>{city.rainAmountMm.toFixed(1)} mm</span>
                <span>{city.maxTemperature.toFixed(1)}°C</span>
                <span>{city.activeFloodRiskTier || city.floodRiskTier} · {city.riverDischarge.toFixed(1)} m³/s</span>
              </div>
            ))}
          </div>
        )}
        {!weatherDashboard && <p className="form-error">Live weather report is unavailable.</p>}
      </section>

      <section className="weather-report" aria-labelledby="state-analytics-title">
        <div className="weather-report-header">
          <div>
            <h3 id="state-analytics-title">State Analytics</h3>
            <p>
              Historical rainfall and heat from Open-Meteo, plus current active
              flood risk from live rain, river, pressure, and wind telemetry.
            </p>
          </div>
          <label>
            State
            <select value={selectedState || stateReport?.states?.[0]?.state || ''} onChange={(event) => setSelectedState(event.target.value)}>
              {stateReport?.states?.map((state) => <option key={state.state} value={state.state}>{state.state}</option>)}
            </select>
          </label>
          <div className="analytics-actions">
            <button type="button" onClick={() => window.print()}>Print report</button>
            <button type="button" onClick={exportTrendCsv} disabled={!trendReport?.months?.length}>Export CSV</button>
          </div>
        </div>
        {trendReport?.months?.length > 0 && (
          <div className="analytics-chart-grid">
            <div className="analytics-chart">
              <h4>Monthly rainfall</h4>
              <Bar
                data={{
                  labels: trendReport.months.map((item) => item.month),
                  datasets: [
                    { label: 'Rainfall (mm)', data: trendReport.months.map((item) => item.rainfallMm), backgroundColor: '#38bdf8', borderRadius: 7, borderSkipped: false },
                  ],
                }}
                options={professionalChartOptions}
              />
            </div>
            <div className="analytics-chart">
              <h4>Monthly heat trend</h4>
              <Line
                data={{
                  labels: trendReport.months.map((item) => item.month),
                  datasets: [
                    { label: 'Mean temperature (°C)', data: trendReport.months.map((item) => item.meanTemperature), borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.12)', fill: true, tension: 0.35, pointRadius: 3 },
                    { label: 'Maximum temperature (°C)', data: trendReport.months.map((item) => item.maxTemperature), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', fill: true, tension: 0.35, pointRadius: 3 },
                  ],
                }}
                options={professionalChartOptions}
              />
            </div>
            <div className="analytics-chart">
              <h4>River discharge versus calibration threshold</h4>
              <Line
                data={{
                  labels: trendReport.months.map((item) => item.month),
                  datasets: [
                    { label: 'Average discharge (m³/s)', data: trendReport.months.map((item) => item.averageRiverDischarge), borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.12)', fill: true, tension: 0.35, pointRadius: 3 },
                    { label: 'Proxy 95th percentile', data: trendReport.months.map(() => 2727.98), borderColor: '#94a3b8', borderDash: [6, 6], pointRadius: 0 },
                  ],
                }}
                options={professionalChartOptions}
              />
            </div>
            <div className="analytics-chart analytics-chart-risk">
              <h4>Active flood risk by state</h4>
              <Bar data={activeRiskChartData} options={{ ...professionalChartOptions, indexAxis: 'y', scales: { x: { ...professionalChartOptions.scales.y, max: 100, title: { display: true, text: 'Risk (%)' } }, y: { ...professionalChartOptions.scales.x } } }} />
            </div>
          </div>
        )}
        {stateReport?.states?.length > 0 && (
          <div className="weather-city-table">
            <div className="weather-city-row weather-city-heading">
              <span>State</span><span>Hubs</span><span>Rainfall</span><span>Max heat</span><span>Active risk</span>
            </div>
            {stateReport.states.map((state) => (
              <div className="weather-city-row" key={state.state}>
                <strong>{state.state}</strong>
                <span>{state.monitoredCities}</span>
                <span>{state.rainfallMm.toFixed(1)} mm</span>
                <span>{state.maxTemperature.toFixed(1)}°C</span>
                <span>{state.averageActiveFloodRisk === null ? 'UNAVAILABLE' : state.averageActiveFloodRisk}</span>
              </div>
            ))}
          </div>
        )}
        {trendReport?.warning && <p className="form-warning">{trendReport.warning}</p>}
      </section>

      <h3>ML Flood Simulation</h3>
      <button type="button" onClick={() => runSimulation().catch((error) => setMessage(error.message))}>
        Run Heavy-Rain Inference Simulation
      </button>
      {simulation && (
        <p role="status">
          SIMULATED · {simulation.riskTier || simulation.risk_tier} · probability {simulation.probability} · no public alert created
        </p>
      )}

      <h3>Broadcast Emergency Notification</h3>
      <form
        className="auth-form"
        onSubmit={(event) => sendNotification(event).catch((error) => setMessage(error.message))}
      >
        <input
          placeholder="Emergency Alert Title (e.g. Cyclone Advisory)"
          value={notificationForm.title}
          onChange={(event) => setNotificationForm({ ...notificationForm, title: event.target.value })}
          required
        />
        <textarea
          placeholder="Detailed broadcast instructions for citizens"
          value={notificationForm.message}
          onChange={(event) => setNotificationForm({ ...notificationForm, message: event.target.value })}
          required
        />
        <select
          value={notificationForm.severity}
          onChange={(event) => setNotificationForm({ ...notificationForm, severity: event.target.value })}
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical / Emergency</option>
        </select>
        <button className="form-submit" type="submit">
          Broadcast to Citizens
        </button>
      </form>

      <div id="admin-simulation"><SimulationWorkspace token={token} /></div>
      <div id="admin-operations"><h3>Rescue Centers (Manage & Upload)</h3></div>
      <form
        className="auth-form"
        onSubmit={(event) => saveCenter(event).catch((error) => setMessage(error.message))}
      >
        <h4>{editingCenterId ? 'Edit Rescue Center' : 'Add Rescue Center'}</h4>
        <input
          placeholder="Center name"
          value={centerForm.name}
          onChange={(event) => setCenterForm({ ...centerForm, name: event.target.value })}
          required
        />
        <input
          placeholder="Address"
          value={centerForm.address}
          onChange={(event) => setCenterForm({ ...centerForm, address: event.target.value })}
          required
        />
        <input
          type="number"
          step="any"
          placeholder="Latitude (e.g. 21.64)"
          value={centerForm.latitude}
          onChange={(event) => setCenterForm({ ...centerForm, latitude: event.target.value })}
          required
        />
        <input
          type="number"
          step="any"
          placeholder="Longitude (e.g. 69.62)"
          value={centerForm.longitude}
          onChange={(event) => setCenterForm({ ...centerForm, longitude: event.target.value })}
          required
        />
        <input
          type="number"
          min="0"
          placeholder="Capacity"
          value={centerForm.capacity}
          onChange={(event) => setCenterForm({ ...centerForm, capacity: event.target.value })}
          required
        />
        <input
          type="number"
          min="0"
          placeholder="Occupancy"
          value={centerForm.occupancy}
          onChange={(event) => setCenterForm({ ...centerForm, occupancy: event.target.value })}
          required
        />
        <input
          placeholder="Contact"
          value={centerForm.contact}
          onChange={(event) => setCenterForm({ ...centerForm, contact: event.target.value })}
        />
        <label>
          <input
            type="checkbox"
            checked={centerForm.accessibility}
            onChange={(event) => setCenterForm({ ...centerForm, accessibility: event.target.checked })}
          />{' '}
          Accessible
        </label>
        <label>
          <input
            type="checkbox"
            checked={centerForm.waterAvailable}
            onChange={(event) => setCenterForm({ ...centerForm, waterAvailable: event.target.checked })}
          />{' '}
          Water Supply
        </label>
        <label>
          <input
            type="checkbox"
            checked={centerForm.medicalAvailable}
            onChange={(event) => setCenterForm({ ...centerForm, medicalAvailable: event.target.checked })}
          />{' '}
          Medical Aid
        </label>
        <label>
          <input
            type="checkbox"
            checked={centerForm.powerAvailable}
            onChange={(event) => setCenterForm({ ...centerForm, powerAvailable: event.target.checked })}
          />{' '}
          Backup Power
        </label>
        <button className="form-submit" type="submit">
          {editingCenterId ? 'Save Rescue Center' : 'Upload Rescue Center'}
        </button>
        {editingCenterId && (
          <button
            type="button"
            onClick={() => {
              setEditingCenterId(null)
              setCenterForm({
                name: '',
                address: '',
                latitude: '',
                longitude: '',
                capacity: '',
                occupancy: '0',
                accessibility: false,
                waterAvailable: false,
                medicalAvailable: false,
                powerAvailable: false,
                contact: '',
              })
            }}
          >
            Cancel Edit
          </button>
        )}
      </form>

      {centers.map((center) => (
        <p key={center._id}>
          {center.name} · {center.occupancy}/{center.capacity} · {center.status}
          <button type="button" onClick={() => editCenter(center)}>
            Edit
          </button>
          <button
            type="button"
            onClick={() => updateCenterStatus(center, 'open').catch((error) => setMessage(error.message))}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => updateCenterStatus(center, 'limited').catch((error) => setMessage(error.message))}
          >
            Full / Limited
          </button>
          <button type="button" onClick={() => closeCenter(center._id).catch((error) => setMessage(error.message))}>
            Close
          </button>
        </p>
      ))}

      <div id="admin-guidelines"><h3>Official Guidelines &amp; Document Upload</h3></div>
      <form
        className="auth-form"
        onSubmit={(event) => upload(event).catch((error) => setMessage(error.message))}
      >
        <input
          placeholder="Title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          required
        />
        <input
          placeholder="Issuing authority (e.g. NDMA)"
          value={form.issuingAuthority}
          onChange={(event) => setForm({ ...form, issuingAuthority: event.target.value })}
          required
        />
        <input
          placeholder="Official government URL (https://...gov.in)"
          value={form.officialUrl}
          onChange={(event) => setForm({ ...form, officialUrl: event.target.value })}
          required
        />
        <input
          placeholder="Jurisdiction"
          value={form.jurisdiction}
          onChange={(event) => setForm({ ...form, jurisdiction: event.target.value })}
          required
        />
        <input
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          onChange={(event) => setForm({ ...form, document: event.target.files[0] || null })}
          required
        />
        <button className="form-submit" type="submit">
          Upload for Review
        </button>
      </form>

      <h3>Guidelines / RAG documents</h3>
      {guidelines.map((item) => (
        <p key={item._id}>
          <strong>{item.title}</strong> · {item.status} · {item.extractionMethod || 'text'} · {item.fileName}
          {item.status === 'pending' && (
            <button type="button" onClick={() => updateGuideline(item._id, 'approved')}>
              Approve for RAG
            </button>
          )}
          <button type="button" onClick={() => deleteGuideline(item).catch((error) => setMessage(error.message))}>
            Delete document
          </button>
        </p>
      ))}
      {!guidelines.length && <p>No guideline documents uploaded yet.</p>}

      <h3>Admin Verification Requests</h3>
      {verifications.map((item) => (
        <p key={item._id}>
          {item.user?.name} ({item.governmentIdReference}){' '}
          <button type="button" onClick={() => updateVerification(item._id, 'approved')}>
            Approve
          </button>{' '}
          <button type="button" onClick={() => updateVerification(item._id, 'rejected')}>
            Reject
          </button>
        </p>
      ))}

      <div id="admin-audit"><h3>Audit Log</h3></div>
      {auditEvents.map((event) => (
        <p key={event._id}>
          {new Date(event.createdAt).toLocaleString()} · {event.action} · {event.oldStatus || '—'} →{' '}
          {event.newStatus || '—'} · request {event.requestId}
        </p>
      ))}

      {message && <p className="form-error" role="status">{message}</p>}
    </div>
  )
}
