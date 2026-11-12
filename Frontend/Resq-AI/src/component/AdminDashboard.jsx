import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const streetMapUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

const rescueCenterIcon = L.divIcon({
  className: 'rescue-center-icon',
  html: '<div class="rescue-center-pin" aria-label="Rescue center">🏥</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const cycloneIcon = L.divIcon({
  className: 'cyclone-icon',
  html: '<div style="font-size: 26px; text-shadow: 0 0 8px red;">🌀</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

const ARABIAN_SEA_CYCLONE_SIMULATION = {
  name: '🌀 Arabian Sea Cyclone ASNA (Mock Test)',
  category: 'Severe Cyclonic Storm (Simulated)',
  maxWindKmh: 95,
  pressureHpa: 988,
  coordinates: [
    [19.2, 70.5],
    [20.5, 69.2],
    [21.8, 68.1],
    [22.9, 66.8],
    [23.6, 65.4],
    [24.1, 63.5],
  ],
  radiiKm: { warning: 140, danger: 70 },
  landfallRisk: ['Kutch Coastal Belt', 'Saurashtra Coast', 'South Sindh Coast'],
}

export default function AdminDashboard({ token }) {
  const [guidelines, setGuidelines] = useState([])
  const [verifications, setVerifications] = useState([])
  const [message, setMessage] = useState('')
  const [centers, setCenters] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [health, setHealth] = useState(null)
  const [simulation, setSimulation] = useState(null)
  const [isMapMaximized, setIsMapMaximized] = useState(false)
  const [cycloneMockActive, setCycloneMockActive] = useState(false)
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
    const [guidelineResponse, verificationResponse, centersResponse, auditResponse, healthResponse] =
      await Promise.all([
        fetch(`${API_URL}/admin/guidelines`, { headers }),
        fetch(`${API_URL}/admin/verifications`, { headers }),
        fetch(`${API_URL}/rescue-centers`, { headers }),
        fetch(`${API_URL}/admin/audit`, { headers }),
        fetch(`${API_URL}/admin/health`, { headers }),
      ])
    if (!guidelineResponse.ok || !verificationResponse.ok || !auditResponse.ok)
      throw new Error('Unable to load admin data')
    setGuidelines(await guidelineResponse.json())
    setVerifications(await verificationResponse.json())
    setCenters(await centersResponse.json())
    setAuditEvents(await auditResponse.json())
    setHealth(healthResponse.ok ? await healthResponse.json() : null)
  }, [headers])

  const toggleCycloneMock = async () => {
    const nextState = !cycloneMockActive
    setCycloneMockActive(nextState)
    await fetch(`${API_URL}/weather/storms/simulate`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: nextState }),
    }).catch(() => {})
    setMessage(
      nextState
        ? 'Arabian Sea Cyclone ASNA simulation activated for real-time testing!'
        : 'Cyclone simulation stopped. Real-time live weather restored.',
    )
  }

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
    setMessage(`Uploaded ${data.chunks} chunks. Approve it before chat can use it.`)
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

  const updateGuideline = async (id, status) => {
    const response = await fetch(`${API_URL}/admin/guidelines/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) throw new Error('Unable to update guideline')
    await load()
  }

  return (
    <div className="admin-dashboard">
      <h3>System Health</h3>
      <p>
        {health
          ? Object.entries(health)
              .filter(([key]) => key !== 'checkedAt')
              .map(([key, value]) => `${key}: ${value}`)
              .join(' · ')
          : 'Health unavailable'}
      </p>

      {/* Admin Tactical Map Box */}
      <h3>Tactical Map & Cyclone Simulation Box</h3>
      <div className={`admin-map-box ${isMapMaximized ? 'is-maximized' : ''}`}>
        <div className="admin-map-toolbar">
          <button
            type="button"
            className={`admin-map-btn ${cycloneMockActive ? 'primary' : ''}`}
            onClick={toggleCycloneMock}
          >
            {cycloneMockActive ? '⏹️ Stop Cyclone Mock Test' : '🌀 Run Arabian Sea Cyclone Mock Test'}
          </button>
          <button
            type="button"
            className="admin-map-btn"
            onClick={() => setIsMapMaximized(!isMapMaximized)}
          >
            {isMapMaximized ? '🗗 Minimize Map' : '⛶ Maximize Map'}
          </button>
        </div>

        <MapContainer
          center={[21.5, 71.0]}
          zoom={isMapMaximized ? 6 : 5}
          zoomControl={false}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer url={streetMapUrl} attribution="&copy; OpenStreetMap" />

          {/* Rescue Centers */}
          {centers.map((center) => (
            <Marker
              key={center._id}
              position={[center.location.coordinates[1], center.location.coordinates[0]]}
              icon={rescueCenterIcon}
            >
              <Popup>
                <strong>{center.name}</strong>
                <br />
                {center.address}
                <br />
                Occupancy: {center.occupancy}/{center.capacity} · Status: {center.status}
              </Popup>
            </Marker>
          ))}

          {/* Cyclone Simulation on Admin Map */}
          {cycloneMockActive && (
            <>
              <Polyline
                positions={ARABIAN_SEA_CYCLONE_SIMULATION.coordinates}
                color="#ea580c"
                weight={5}
                dashArray="10 8"
              >
                <Popup>
                  <strong>{ARABIAN_SEA_CYCLONE_SIMULATION.name}</strong>
                  <br />
                  Wind: {ARABIAN_SEA_CYCLONE_SIMULATION.maxWindKmh} km/h · Pressure: {ARABIAN_SEA_CYCLONE_SIMULATION.pressureHpa} hPa
                  <br />
                  Coastal Advisory: {ARABIAN_SEA_CYCLONE_SIMULATION.landfallRisk.join(', ')}
                </Popup>
              </Polyline>
              <Marker
                position={ARABIAN_SEA_CYCLONE_SIMULATION.coordinates[1]}
                icon={cycloneIcon}
              >
                <Popup>
                  <strong>Current Eye Position (Mock Test)</strong>
                  <br />
                  Approaching Saurashtra / Kutch Coast
                </Popup>
              </Marker>
              <Circle
                center={ARABIAN_SEA_CYCLONE_SIMULATION.coordinates[1]}
                radius={ARABIAN_SEA_CYCLONE_SIMULATION.radiiKm.warning * 1000}
                pathOptions={{ color: '#ea580c', fillColor: '#f97316', fillOpacity: 0.15, weight: 2 }}
              />
              <Circle
                center={ARABIAN_SEA_CYCLONE_SIMULATION.coordinates[1]}
                radius={ARABIAN_SEA_CYCLONE_SIMULATION.radiiKm.danger * 1000}
                pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.25, weight: 2 }}
              />
            </>
          )}
        </MapContainer>
      </div>

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

      <h3>Rescue Centers (Manage & Upload)</h3>
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

      <h3>Official Guidelines & Document Upload</h3>
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

      <h3>Pending Guidelines Review</h3>
      {guidelines
        .filter((item) => item.status === 'pending')
        .map((item) => (
          <p key={item._id}>
            {item.title}{' '}
            <button type="button" onClick={() => updateGuideline(item._id, 'approved')}>
              Approve
            </button>
          </p>
        ))}

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

      <h3>Audit Log</h3>
      {auditEvents.map((event) => (
        <p key={event._id}>
          {new Date(event.createdAt).toLocaleString()} · {event.action} · {event.oldStatus || '—'} →{' '}
          {event.newStatus || '—'} · request {event.requestId}
        </p>
      ))}

      {message && <p className="form-error">{message}</p>}
    </div>
  )
}
