import React, { Component } from 'react'
import Login from './login'
import Register from './regester'
import NavigationCard from './NavigationCard'
import AdminDashboard from './AdminDashboard'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const cardContent = {
  guideline: {
    title: 'Safety guidelines',
    body: (
      <>
        <p>Stay calm, move to a safe location, and share your location with a trusted contact.</p>
        <p>Use SOS for an urgent emergency and keep your phone charged whenever possible.</p>
      </>
    ),
  },
}

class NotificationPanel extends Component {
  state = { notifications: [], error: '' }

  componentDidMount() {
    fetch(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${this.props.token}` } })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load notifications')
        this.setState({ notifications: data })
      })
      .catch((error) => this.setState({ error: error.message }))
  }

  markRead = async (notification) => {
    await fetch(`${API_URL}/notifications/${notification._id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${this.props.token}` },
    })
    this.setState((state) => ({ notifications: state.notifications.map((item) => item._id === notification._id ? { ...item, read: true } : item) }))
  }

  render() {
    return (
      <div>
        {this.state.notifications.map((notification) => (
          <article key={notification._id}>
            <strong>{notification.title}</strong> · {notification.severity}
            <p>{notification.message}</p>
            {!notification.read && <button type="button" onClick={() => this.markRead(notification)}>Mark read</button>}
          </article>
        ))}
        {!this.state.notifications.length && !this.state.error && <p>No notifications.</p>}
        {this.state.error && <p className="form-error">{this.state.error}</p>}
      </div>
    )
  }
}

export default class Navbar extends Component {
  state = {
    isMenuOpen: false,
    activeCard: null,
  }

  openCard = (card) => {
    this.setState({ activeCard: card, isMenuOpen: false })
  }

  closeCard = () => {
    this.setState({ activeCard: null })
  }

  renderCard() {
    const { activeCard } = this.state
    if (!activeCard) return null

    if (activeCard === 'login') {
      return (
        <NavigationCard title="Log in" onClose={this.closeCard}>
          <Login onSuccess={this.props.onAuthenticated} />
        </NavigationCard>
      )
    }

    if (activeCard === 'register') {
      return (
        <NavigationCard title="Create an account" onClose={this.closeCard}>
          <Register onSuccess={this.props.onAuthenticated} />
        </NavigationCard>
      )
    }

    if (activeCard === 'ai') {
      return (
        <NavigationCard title="Resq-AI assistant" onClose={this.closeCard}>
          <AiPanel token={this.props.token} />
        </NavigationCard>
      )
    }

    if (activeCard === 'help') {
      return (
        <NavigationCard title="Help box" onClose={this.closeCard}>
          <HelpPanel user={this.props.user} token={this.props.token} />
        </NavigationCard>
      )
    }

    if (activeCard === 'notifications') {
      return (
        <NavigationCard title="Notifications" onClose={this.closeCard}>
          <NotificationPanel token={this.props.token} />
        </NavigationCard>
      )
    }

    if (activeCard === 'admin') {
      return (
        <NavigationCard title="Admin dashboard" onClose={this.closeCard}>
          <AdminDashboard token={this.props.token} />
        </NavigationCard>
      )
    }

    const content = cardContent[activeCard]
    return (
      <NavigationCard title={content.title} onClose={this.closeCard}>
        {content.body}
      </NavigationCard>
    )
  }

  render() {
    const { isMenuOpen } = this.state
    const { user, onLogout } = this.props

    return (
      <>
        <div className={`map-menu ${isMenuOpen ? 'is-open' : ''}`}>
          <button
            className="nav-toggle"
            type="button"
            aria-label="Open navigation"
            aria-expanded={isMenuOpen}
            onClick={() => this.setState({ isMenuOpen: !isMenuOpen })}
          >
            <span />
            <span />
            <span />
          </button>
          <nav className="menu" aria-label="Main navigation">
            <button className="menu-item" type="button" onClick={() => this.openCard('guideline')}>
              Guidelines
            </button>
            <button className="menu-item emergency-menu-item" type="button" onClick={() => this.openCard('help')}>
              <span aria-hidden="true">🚨</span> Help now
            </button>
            {user ? (
              <>
                {user.role === 'admin' && (
                  <button className="menu-item" type="button" onClick={() => this.openCard('admin')}>
                    Admin dashboard
                  </button>
                )}
                <button className="menu-item" type="button" onClick={() => this.openCard('ai')}>
                  AI assistant
                </button>
                <button className="menu-item" type="button" onClick={() => this.openCard('notifications')}>
                  Notifications
                </button>
                <button className="menu-item" type="button" onClick={onLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <button className="menu-item" type="button" onClick={() => this.openCard('login')}>
                  Log in
                </button>
                <button className="menu-item" type="button" onClick={() => this.openCard('register')}>
                  Register
                </button>
              </>
            )}
          </nav>
        </div>
        {this.renderCard()}
      </>
    )
  }
}

class HelpPanel extends Component {
  constructor(props) {
    super(props)
    this.state = {
      name: props.user?.name || '',
      address: props.user?.address || '',
      description: '',
      image: null,
      latitude: '',
      longitude: '',
      error: '',
      success: '',
      isSubmitting: false,
      isLocating: false,
    }
  }

  componentDidMount() {
    if (this.props.user) this.getCurrentLocation()
  }

  getCurrentLocation = () => {
    if (!navigator.geolocation) {
      this.setState({ error: 'Location is not supported by this browser.' })
      return
    }

    this.setState({ error: '', isLocating: true })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        this.setState({
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6),
          isLocating: false,
        }),
      () => this.setState({ error: 'Location permission is required to submit a help request.', isLocating: false }),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  submit = async (event) => {
    event.preventDefault()
    this.setState({ error: '', success: '', isSubmitting: true })
    const formData = new FormData()
    formData.append('name', this.state.name.trim())
    formData.append('address', this.state.address.trim())
    formData.append('description', this.state.description.trim())
    formData.append('latitude', this.state.latitude)
    formData.append('longitude', this.state.longitude)
    if (this.state.image) formData.append('image', this.state.image)

    try {
      const response = await fetch(`${API_URL}/reports`, {
        method: 'POST',
        headers: this.props.token ? { Authorization: `Bearer ${this.props.token}` } : undefined,
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to send your help request')
      this.setState({ description: '', image: null, success: 'Your help request was submitted successfully.' })
      event.target.reset()
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSubmitting: false })
    }
  }

  render() {
    return (
      <form className="auth-form help-form" onSubmit={this.submit}>
        <div className="emergency-banner" role="alert">
          <strong>Emergency help</strong>
          <span>For immediate danger, contact local emergency services first, then submit your location and request here.</span>
        </div>
        <button className="location-button" type="button" onClick={this.getCurrentLocation} disabled={this.state.isLocating}>
          {this.state.isLocating ? 'Finding location…' : 'Use current location'}
        </button>
        <label htmlFor="help-name">Name</label>
        <input id="help-name" type="text" value={this.state.name} onChange={(event) => this.setState({ name: event.target.value })} required />
        <label htmlFor="help-address">Address</label>
        <textarea id="help-address" rows="3" value={this.state.address} onChange={(event) => this.setState({ address: event.target.value })} required />
        <label htmlFor="help-description">Describe the problem</label>
        <textarea id="help-description" rows="5" value={this.state.description} onChange={(event) => this.setState({ description: event.target.value })} required />
        <label htmlFor="help-image">Image (optional)</label>
        <input id="help-image" type="file" accept="image/*" onChange={(event) => this.setState({ image: event.target.files[0] || null })} />
        <p className="location-status">
          Location: {this.state.latitude && this.state.longitude ? `${this.state.latitude}, ${this.state.longitude}` : 'not selected'}
        </p>
        <div className="location-fields">
          <div>
            <label htmlFor="help-latitude">Latitude</label>
            <input id="help-latitude" type="number" step="any" value={this.state.latitude} onChange={(event) => this.setState({ latitude: event.target.value })} required />
          </div>
          <div>
            <label htmlFor="help-longitude">Longitude</label>
            <input id="help-longitude" type="number" step="any" value={this.state.longitude} onChange={(event) => this.setState({ longitude: event.target.value })} required />
          </div>
        </div>
        <button className="form-submit" type="submit" disabled={this.state.isSubmitting}>
          {this.state.isSubmitting ? 'Sending…' : 'Send help request'}
        </button>
        {this.state.success && <p className="form-success">{this.state.success}</p>}
        {this.state.error && <p className="form-error">{this.state.error}</p>}
      </form>
    )
  }
}

class AiPanel extends Component {
  state = { message: '', response: null, error: '', isSending: false }

  submit = async (event) => {
    event.preventDefault()
    const message = this.state.message.trim()
    if (!message) return

    this.setState({ error: '', isSending: true })
    try {
      const response = await fetch(`${API_URL}/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.props.token}`,
        },
        body: JSON.stringify({ message }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || 'Unable to contact the AI assistant')
      this.setState({ response: data.data, message: '' })
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSending: false })
    }

  }

  render() {
    return (
      <form className="auth-form" onSubmit={this.submit}>
        <p>Ask a question. Answers are generated only from approved government guidance; contact local emergency services for immediate danger.</p>
        <label htmlFor="ai-message">Message</label>
        <textarea
          id="ai-message"
          value={this.state.message}
          onChange={(event) => this.setState({ message: event.target.value })}
          required
          rows="4"
        />
        <button className="form-submit" type="submit" disabled={this.state.isSending}>
          {this.state.isSending ? 'Sending…' : 'Send message'}
        </button>
        {this.state.response && (
          <div className={this.state.response.status === 'GROUNDED' ? 'form-success' : 'form-error'} role="status">
            <strong>{this.state.response.status}</strong>
            <p>{this.state.response.answer || this.state.response.warnings?.[0] || 'No supported answer is available.'}</p>
            {this.state.response.sources?.length > 0 && (
              <ul>
                {this.state.response.sources.map((source) => (
                  <li key={`${source.documentId}-${source.page || source.section}`}>
                    <a href={source.officialUrl} target="_blank" rel="noreferrer">{source.title}</a>
                    {source.page ? `, page ${source.page}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {this.state.error && <p className="form-error">{this.state.error}</p>}
      </form>
    )
  }
}
