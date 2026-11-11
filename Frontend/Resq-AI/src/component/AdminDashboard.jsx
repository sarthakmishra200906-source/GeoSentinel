import React, { useCallback, useEffect, useMemo, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default function AdminDashboard({ token }) {
  const [guidelines, setGuidelines] = useState([])
  const [verifications, setVerifications] = useState([])
  const [message, setMessage] = useState('')
  const [centers, setCenters] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [health, setHealth] = useState(null)
  const [simulation, setSimulation] = useState(null)
  const [notificationForm, setNotificationForm] = useState({ title: '', message: '', severity: 'info', audience: 'all' })
  const [editingCenterId, setEditingCenterId] = useState(null)
  const [centerForm, setCenterForm] = useState({
    name: '', address: '', latitude: '', longitude: '', capacity: '', occupancy: '0',
    accessibility: false, waterAvailable: false, medicalAvailable: false, powerAvailable: false, contact: '',
  })
  const [form, setForm] = useState({ title: '', issuingAuthority: '', officialUrl: '', jurisdiction: 'India', document: null })

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const load = useCallback(async () => {
    const [guidelineResponse, verificationResponse, centersResponse, auditResponse, healthResponse] = await Promise.all([
      fetch(`${API_URL}/admin/guidelines`, { headers }),
      fetch(`${API_URL}/admin/verifications`, { headers }),
      fetch(`${API_URL}/rescue-centers`, { headers }),
      fetch(`${API_URL}/admin/audit`, { headers }),
      fetch(`${API_URL}/admin/health`, { headers }),
    ])
    if (!guidelineResponse.ok || !verificationResponse.ok || !auditResponse.ok) throw new Error('Unable to load admin data')
    setGuidelines(await guidelineResponse.json())
    setVerifications(await verificationResponse.json())
    setCenters(await centersResponse.json())
    setAuditEvents(await auditResponse.json())
    setHealth(healthResponse.ok ? await healthResponse.json() : null)
  }, [headers])

  const runSimulation = async () => {
    const response = await fetch(`${API_URL}/prediction/simulate`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
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
    setNotificationForm({ title: '', message: '', severity: 'info', audience: 'all' })
    setMessage('Notification sent to users.')
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
    setMessage(`Rescue center ${data.name} ${editingCenterId ? 'updated' : 'created'}.`)
    setEditingCenterId(null)
    setCenterForm({ name: '', address: '', latitude: '', longitude: '', capacity: '', occupancy: '0', accessibility: false, waterAvailable: false, medicalAvailable: false, powerAvailable: false, contact: '' })
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
    load()
      .catch((error) => {
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
      <h3>System health</h3>
      <p>{health ? Object.entries(health).filter(([key]) => key !== 'checkedAt').map(([key, value]) => `${key}: ${value}`).join(' · ') : 'Health unavailable'}</p>
      <h3>Risk simulation</h3>
      <button type="button" onClick={() => runSimulation().catch((error) => setMessage(error.message))}>Run heavy-rain simulation</button>
      {simulation && <p role="status">SIMULATED · {simulation.riskTier || simulation.risk_tier} · probability {simulation.probability} · no public alert created</p>}
      <h3>Send user notification</h3>
      <form className="auth-form" onSubmit={(event) => sendNotification(event).catch((error) => setMessage(error.message))}>
        <input placeholder="Title" value={notificationForm.title} onChange={(event) => setNotificationForm({ ...notificationForm, title: event.target.value })} required />
        <textarea placeholder="Message" value={notificationForm.message} onChange={(event) => setNotificationForm({ ...notificationForm, message: event.target.value })} required />
        <select value={notificationForm.severity} onChange={(event) => setNotificationForm({ ...notificationForm, severity: event.target.value })}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
        <button className="form-submit" type="submit">Send notification</button>
      </form>
      <p>Only approved documents are returned as grounded context to chat. Review official sources before approval.</p>
      <form className="auth-form" onSubmit={(event) => upload(event).catch((error) => setMessage(error.message))}>
        <h3>Upload guideline</h3>
        <input placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        <input placeholder="Issuing authority" value={form.issuingAuthority} onChange={(event) => setForm({ ...form, issuingAuthority: event.target.value })} required />
        <input placeholder="Official government URL (https://...gov.in)" value={form.officialUrl} onChange={(event) => setForm({ ...form, officialUrl: event.target.value })} required />
        <input placeholder="Jurisdiction" value={form.jurisdiction} onChange={(event) => setForm({ ...form, jurisdiction: event.target.value })} required />
        <input type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" onChange={(event) => setForm({ ...form, document: event.target.files[0] || null })} required />
        <button className="form-submit" type="submit">Upload for review</button>
      </form>
      <h3>Pending guideline review</h3>
      {guidelines.filter((item) => item.status === 'pending').map((item) => (
        <p key={item._id}>{item.title} <button type="button" onClick={() => updateGuideline(item._id, 'approved')}>Approve</button></p>
      ))}
      <h3>Admin verification requests</h3>
      {verifications.map((item) => (
        <p key={item._id}>{item.user?.name} ({item.governmentIdReference}) <button type="button" onClick={() => updateVerification(item._id, 'approved')}>Approve</button> <button type="button" onClick={() => updateVerification(item._id, 'rejected')}>Reject</button></p>
      ))}
      <h3>Rescue centers</h3>
      <form className="auth-form" onSubmit={(event) => saveCenter(event).catch((error) => setMessage(error.message))}>
        <h4>{editingCenterId ? 'Edit rescue center' : 'Add rescue center'}</h4>
        <input placeholder="Center name" value={centerForm.name} onChange={(event) => setCenterForm({ ...centerForm, name: event.target.value })} required />
        <input placeholder="Address" value={centerForm.address} onChange={(event) => setCenterForm({ ...centerForm, address: event.target.value })} required />
        <input type="number" step="any" placeholder="Latitude" value={centerForm.latitude} onChange={(event) => setCenterForm({ ...centerForm, latitude: event.target.value })} required />
        <input type="number" step="any" placeholder="Longitude" value={centerForm.longitude} onChange={(event) => setCenterForm({ ...centerForm, longitude: event.target.value })} required />
        <input type="number" min="0" placeholder="Capacity" value={centerForm.capacity} onChange={(event) => setCenterForm({ ...centerForm, capacity: event.target.value })} required />
        <input type="number" min="0" placeholder="Occupancy" value={centerForm.occupancy} onChange={(event) => setCenterForm({ ...centerForm, occupancy: event.target.value })} required />
        <input placeholder="Contact" value={centerForm.contact} onChange={(event) => setCenterForm({ ...centerForm, contact: event.target.value })} />
        <label><input type="checkbox" checked={centerForm.accessibility} onChange={(event) => setCenterForm({ ...centerForm, accessibility: event.target.checked })} /> Accessible</label>
        <label><input type="checkbox" checked={centerForm.waterAvailable} onChange={(event) => setCenterForm({ ...centerForm, waterAvailable: event.target.checked })} /> Water</label>
        <label><input type="checkbox" checked={centerForm.medicalAvailable} onChange={(event) => setCenterForm({ ...centerForm, medicalAvailable: event.target.checked })} /> Medical</label>
        <label><input type="checkbox" checked={centerForm.powerAvailable} onChange={(event) => setCenterForm({ ...centerForm, powerAvailable: event.target.checked })} /> Power</label>
        <button className="form-submit" type="submit">{editingCenterId ? 'Save rescue center' : 'Add rescue center'}</button>
        {editingCenterId && <button type="button" onClick={() => { setEditingCenterId(null); setCenterForm({ name: '', address: '', latitude: '', longitude: '', capacity: '', occupancy: '0', accessibility: false, waterAvailable: false, medicalAvailable: false, powerAvailable: false, contact: '' }) }}>Cancel edit</button>}
      </form>
      {centers.map((center) => (
        <p key={center._id}>
          {center.name} · {center.occupancy}/{center.capacity} · {center.status}
          <button type="button" onClick={() => editCenter(center)}>Edit</button>
          <button type="button" onClick={() => updateCenterStatus(center, 'open').catch((error) => setMessage(error.message))}>Active</button>
          <button type="button" onClick={() => updateCenterStatus(center, 'limited').catch((error) => setMessage(error.message))}>Full / limited</button>
          <button type="button" onClick={() => closeCenter(center._id).catch((error) => setMessage(error.message))}>Close</button>
        </p>
      ))}
      <h3>Audit log</h3>
      {auditEvents.map((event) => (
        <p key={event._id}>
          {new Date(event.createdAt).toLocaleString()} · {event.action} · {event.oldStatus || '—'} → {event.newStatus || '—'} · request {event.requestId}
        </p>
      ))}
      {message && <p className="form-error">{message}</p>}
    </div>
  )
}
