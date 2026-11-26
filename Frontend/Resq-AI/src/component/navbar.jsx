import React, { Component } from 'react'
import Login from './login'
import Register from './regester'
import NavigationCard from './NavigationCard'
import PhoneVerification from './PhoneVerification'

import { API_URL } from '../api'

function getDismissedNotificationIds() {
  try {
    const storedIds = JSON.parse(localStorage.getItem('resq-ai-dismissed-notifications') || '[]')
    return Array.isArray(storedIds) ? storedIds : []
  } catch {
    return []
  }
}

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
  state = {
    notifications: [],
    dismissedIds: getDismissedNotificationIds(),
    error: '',
  }

  componentDidMount() {
    this.loadNotifications()
    this.pollInterval = setInterval(this.loadNotifications, 10000)
  }

  componentWillUnmount() {
    if (this.pollInterval) clearInterval(this.pollInterval)
  }

  loadNotifications = () => {
    const headers = this.props.token ? { Authorization: `Bearer ${this.props.token}` } : {}
    fetch(`${API_URL}/notifications`, { headers })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load notifications')
        this.setState({ notifications: Array.isArray(data) ? data : [] })
      })
      .catch((error) => this.setState({ error: error.message }))
  }

  markRead = async (notification) => {
    try {
      if (this.props.token) {
        const response = await fetch(`${API_URL}/notifications/${notification._id}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${this.props.token}` },
        })
        if (!response.ok) throw new Error('Unable to dismiss this notification')
      }
      this.setState((state) => {
        const dismissedIds = [...new Set([...state.dismissedIds, notification._id])].slice(-100)
        localStorage.setItem('resq-ai-dismissed-notifications', JSON.stringify(dismissedIds))
        return {
          dismissedIds,
          notifications: state.notifications.map((item) => item._id === notification._id ? { ...item, read: true } : item),
          error: '',
        }
      })
    } catch (error) {
      this.setState({ error: error.message })
    }
  }

  render() {
    const unreadNotifications = this.state.notifications.filter(
      (notification) => !notification.read && !this.state.dismissedIds.includes(notification._id),
    )
    return (
      <div>
        {unreadNotifications.map((notification) => (
          <article key={notification._id}>
            <strong>{notification.title}</strong> · {notification.severity}
            <p>{notification.message}</p>
            <button type="button" aria-label={`Dismiss ${notification.title}`} onClick={() => this.markRead(notification)}>×</button>
          </article>
        ))}
        {!unreadNotifications.length && !this.state.error && <p>No new notifications.</p>}
        {this.state.error && <p className="form-error">{this.state.error}</p>}
      </div>
    )
  }
}

export default class Navbar extends Component {
  state = {
    isMenuOpen: false,
    activeCard: null,
    authFlow: null,
  }

  openCard = (card) => {
    this.setState({ activeCard: card, authFlow: null, isMenuOpen: false })
  }

  closeCard = () => {
    this.setState({ activeCard: null, authFlow: null })
  }

  handleAuthResult = (result) => {
    if (result.status === 'phone_verification_required') {
      this.setState({ authFlow: { type: 'phone', ...result } })
      return
    }
    if (result.status === 'pending_approval') {
      this.setState({ authFlow: { type: 'pending', ...result } })
      return
    }
    if (result.status === 'authenticated' && result.token && result.user) {
      this.props.onAuthenticated(result)
      this.closeCard()
      return
    }
    throw new Error('The server returned an unexpected authentication status')
  }

  renderCard() {
    const { activeCard } = this.state
    if (!activeCard) return null

    if (this.state.authFlow?.type === 'phone') {
      return (
        <NavigationCard title="Verify your phone" onClose={this.closeCard}>
          <PhoneVerification
            verificationToken={this.state.authFlow.verificationToken}
            phoneToVerify={this.state.authFlow.phoneToVerify}
            onAuthResult={this.handleAuthResult}
          />
        </NavigationCard>
      )
    }

    if (this.state.authFlow?.type === 'pending') {
      return (
        <NavigationCard title="Approval pending" onClose={this.closeCard}>
          <div className="auth-form">
            <p>Your email and phone are verified. An administrator must approve your account before you can access GeoSentinel.</p>
            <p>After approval, log in again to continue.</p>
          </div>
        </NavigationCard>
      )
    }

    if (activeCard === 'login') {
      return (
        <NavigationCard title="Admin sign-in" onClose={this.closeCard}>
          <Login onAuthResult={this.handleAuthResult} />
          <p className="auth-foot">
            Need an admin account?{' '}
            <button type="button" className="text-link-button" onClick={() => this.openCard('register')}>
              Request access
            </button>
          </p>
        </NavigationCard>
      )
    }

    if (activeCard === 'register') {
      return (
        <NavigationCard title="Admin registration" onClose={this.closeCard}>
          <Register onAuthResult={this.handleAuthResult} onBack={() => this.openCard('login')} />
        </NavigationCard>
      )
    }

    if (activeCard === 'ai') {
      return (
        <NavigationCard title="Resq-AI assistant" onClose={this.closeCard}>
          <AiPanel />
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
                  <button className="menu-item" type="button" onClick={() => this.props.onNavigate('admin')}>
                    Admin dashboard
                  </button>
                )}
                {this.props.activeView === 'admin' && (
                  <>
                    <div className="admin-nav-group" aria-label="Admin workspace">
                      <span className="admin-nav-heading">Admin workspace</span>
                      {[
                        ['overview', 'Overview'],
                        ['simulation', 'Simulation'],
                        ['operations', 'Operations'],
                        ['users', 'Users & access'],
                        ['guidelines', 'Guidelines & upload'],
                        ['audit', 'Audit log'],
                        ['live-map', 'Live cyclone map'],
                      ].map(([section, label]) => (
                        <button
                          key={section}
                          className={`menu-item admin-nav-item ${this.props.adminSection === section ? 'active' : ''}`}
                          type="button"
                          onClick={() => this.props.onAdminSection(section)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
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
                <button className="menu-item" type="button" onClick={() => this.openCard('ai')}>
                  AI assistant
                </button>
                <button className="menu-item" type="button" onClick={() => this.openCard('notifications')}>
                  Notifications
                </button>
                <button className="menu-item" type="button" onClick={() => this.openCard('login')}>
                  Admin sign in
                </button>
                <button className="menu-item" type="button" onClick={() => this.openCard('register')}>
                  Admin register
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

// The browser speech engine reads Markdown symbols literally ("asterisk",
// "star"). Normalise provider output into the same calm, spoken phrasing a
// live voice assistant would use.
function toSpeakableText(answer) {
  if (typeof answer !== 'string') return ''
  return answer
    .replace(/\*\*|__|`|#{1,6}/g, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/^\s*[-*+•>]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .trim()
}

// Chrome can stop a long utterance after roughly 15 seconds, so playback is
// queued in short sentence-sized chunks instead of one very long utterance.
function splitSpeechChunks(text, maxLength = 180) {
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((part) => part.trim()).filter(Boolean) || [text]
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxLength) {
      chunks.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function compactSourceLabel(source) {
  if (source.label) return source.label
  const title = source.title || 'Approved guideline'
  return source.page ? `${title}, p. ${source.page}` : title
}

class AiPanel extends Component {
  state = {
    message: '',
    response: null,
    error: '',
    isSending: false,
    isListening: false,
    isSpeaking: false,
    autoSpeak: true,
    voiceStatus: '',
    apiNotice: '',
    showDiagnostics: false,
  }

  recognition = null
  silenceTimer = null
  restartTimer = null
  shouldContinueListening = false
  voiceTranscript = ''
  speechQueue = []
  speechIndex = 0
  speechToken = 0
  speechStartTimer = null
  speechResumeTimer = null

  componentDidMount() {
    this.checkApiIdentity()
  }

  componentWillUnmount() {
    this.stopListening()
    this.stopSpeaking()
  }

  checkApiIdentity = async () => {
    try {
      const response = await fetch(`${API_URL}/health`)
      if (!response.ok) {
        this.setState({
          apiNotice: `Connected to ${API_URL} (HTTP ${response.status}). Verify that the GeoSentinel backend is active.`,
        })
        return
      }
      const data = await response.json()
      if (data?.service !== 'geosentinel-api') {
        this.setState({
          apiNotice: `Port conflict detected: ${API_URL} identified as "${data?.service || 'unknown application'}". Ensure the GeoSentinel backend is running on port 5000.`,
        })
      }
    } catch {
      // Backend may still be starting up or running in offline mode.
    }
  }

  toggleVoiceInput = () => {
    if (this.state.isListening) {
      this.stopListening()
      return
    }
    this.startListening()
  }

  startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      this.setState({ error: 'Voice input is not supported by this browser. You can type your question below.' })
      return
    }
    this.shouldContinueListening = true
    this.voiceTranscript = this.state.message.trim()
    this.setState({
      error: '',
      isListening: true,
      voiceStatus: 'Listening continuously… speak your question across natural pauses.',
    })
    this.initRecognition(SpeechRecognition)
  }

  initRecognition = (SpeechRecognition) => {
    if (!this.shouldContinueListening) return

    try {
      if (this.recognition) {
        this.recognition.onend = null
        this.recognition.onerror = null
        this.recognition.onresult = null
        try { this.recognition.abort() } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    const rec = new SpeechRecognition()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript
        if (event.results[index].isFinal) {
          this.voiceTranscript = [this.voiceTranscript, transcript.trim()].filter(Boolean).join(' ')
        } else {
          interim = [interim, transcript.trim()].filter(Boolean).join(' ')
        }
      }
      const fullText = [this.voiceTranscript, interim].filter(Boolean).join(' ')
      this.setState({
        message: fullText,
        voiceStatus: 'Voice captured. Keep speaking or pause to finish.',
      })

      // Silence detection: 6.5s after speech, automatically stop and submit
      window.clearTimeout(this.silenceTimer)
      if (fullText.trim().length > 0) {
        this.silenceTimer = window.setTimeout(() => {
          if (this.state.isListening && this.state.message.trim()) {
            this.stopAndSubmit()
          }
        }, 6500)
      }
    }

    rec.onerror = (event) => {
      // Never break mid-chat on short quiet periods
      if (event.error === 'no-speech') return

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.shouldContinueListening = false
        this.setState({
          error: 'Microphone permission was denied. Allow microphone access in your browser to use voice input.',
          isListening: false,
          voiceStatus: '',
        })
      }
    }

    rec.onend = () => {
      if (this.shouldContinueListening) {
        // Continuous listening: restart cleanly without cutting off mid-speech
        this.restartTimer = window.setTimeout(() => {
          if (this.shouldContinueListening) {
            this.initRecognition(SpeechRecognition)
          }
        }, 150)
      } else {
        this.setState({ isListening: false, voiceStatus: '' })
      }
    }

    this.recognition = rec
    try {
      rec.start()
    } catch {
      if (this.shouldContinueListening) {
        this.restartTimer = window.setTimeout(() => {
          if (this.shouldContinueListening) this.initRecognition(SpeechRecognition)
        }, 300)
      }
    }
  }

  stopListening = () => {
    this.shouldContinueListening = false
    window.clearTimeout(this.silenceTimer)
    window.clearTimeout(this.restartTimer)
    try {
      this.recognition?.stop()
    } catch { /* ignore */ }
    this.setState({ isListening: false, voiceStatus: '' })
  }

  stopAndSubmit = () => {
    this.stopListening()
    const message = this.state.message.trim()
    if (message) {
      this.sendQuery(message, true)
    }
  }

  speakAnswer = (explicitText) => {
    const answer = toSpeakableText(explicitText || this.state.response?.answer)
    if (!answer || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      this.setState({ error: 'Voice playback is not supported by this browser.' })
      return
    }
    this.stopSpeaking()
    const token = ++this.speechToken
    const voices = window.speechSynthesis.getVoices?.() || []
    const preferredVoice = voices.find((voice) => /^en[-_]IN/i.test(voice.lang))
      || voices.find((voice) => /^en/i.test(voice.lang) && /natural|neural|google/i.test(voice.name))
      || voices.find((voice) => /^en/i.test(voice.lang))
      || null
    // Never force an 'en-IN' language tag when no such voice is installed:
    // some browsers then select no voice at all and play nothing.
    const language = preferredVoice?.lang || 'en-US'
    this.speechQueue = splitSpeechChunks(answer)
    this.speechIndex = 0
    this.setState({ isSpeaking: true })
    // Chrome drops a speak() call issued immediately after cancel(). Wait for
    // the cancel to settle before queueing the first chunk.
    this.speechStartTimer = window.setTimeout(() => {
      if (token === this.speechToken) this.speakNextChunk(token, preferredVoice, language)
    }, 120)
  }

  speakNextChunk = (token, voice, language) => {
    if (token !== this.speechToken) return
    if (this.speechIndex >= this.speechQueue.length) {
      this.finishSpeaking()
      return
    }
    const utterance = new window.SpeechSynthesisUtterance(this.speechQueue[this.speechIndex])
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang || language
    utterance.rate = 1.03
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onstart = () => {
      if (token !== this.speechToken) return
      this.setState({ isSpeaking: true })
      // Chrome pauses long speech after ~15s; a periodic resume keeps it going.
      window.clearInterval(this.speechResumeTimer)
      this.speechResumeTimer = window.setInterval(() => {
        if (token === this.speechToken) window.speechSynthesis?.resume?.()
      }, 5000)
    }
    utterance.onend = () => {
      if (token !== this.speechToken) return
      this.speechIndex += 1
      if (this.speechIndex < this.speechQueue.length) {
        this.speakNextChunk(token, voice, language)
      } else {
        this.finishSpeaking()
      }
    }
    utterance.onerror = (event) => {
      if (token !== this.speechToken) return
      if (event?.error && !['interrupted', 'canceled'].includes(event.error)) {
        this.setState({ error: `Voice playback stopped: ${event.error}. Tap Read aloud to retry.` })
      }
      this.finishSpeaking()
    }
    window.speechSynthesis.speak(utterance)
  }

  finishSpeaking = () => {
    window.clearInterval(this.speechResumeTimer)
    window.clearTimeout(this.speechStartTimer)
    this.speechResumeTimer = null
    this.speechStartTimer = null
    this.setState({ isSpeaking: false })
  }

  stopSpeaking = () => {
    this.speechToken = (this.speechToken || 0) + 1
    window.clearInterval(this.speechResumeTimer)
    window.clearTimeout(this.speechStartTimer)
    this.speechResumeTimer = null
    this.speechStartTimer = null
    this.speechQueue = []
    this.speechIndex = 0
    window.speechSynthesis?.cancel()
    this.setState({ isSpeaking: false })
  }

  sendQuery = async (queryText, autoSpeak = this.state.autoSpeak) => {
    const text = (queryText || this.state.message).trim()
    if (!text) return

    this.setState({ error: '', isSending: true })
    try {
      const response = await fetch(`${API_URL}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const responseText = await response.text()
      let data = null
      try {
        data = JSON.parse(responseText)
      } catch {
        data = null
      }
      if (!response.ok) {
        const errorMsg = response.status === 401
          ? 'The chat server requires authentication. Verify VITE_API_URL and restart the GeoSentinel backend.'
          : response.status === 404
            ? 'The GeoSentinel chat endpoint was not found. Check that the backend is running.'
            : response.status === 429
              ? 'Too many requests. Please wait a moment and try again.'
              : data?.message || data?.error || `The chat server returned HTTP ${response.status}.`
        throw new Error(errorMsg)
      }
      if (!data?.data) {
        throw new Error('Unreadable response from chat server.')
      }

      const chatData = data.data
      this.setState({
        response: chatData,
        message: '',
        error: '',
      })

      if (autoSpeak && chatData.answer) {
        this.speakAnswer(chatData.answer)
      }
    } catch (error) {
      const fallbackAnswer = 'For emergency assistance, dial 112 (National Emergency Helpline). In flood, cyclone, or severe weather events: seek high ground or sturdy indoor shelter, stay away from downed power lines, and keep an emergency go-bag prepared.'
      this.setState({
        response: {
          status: 'SAFE_FALLBACK',
          answer: fallbackAnswer,
          warnings: [error instanceof TypeError ? 'Cannot reach local backend; showing public disaster advisory.' : error.message],
          sources: [{
            documentId: 'local-emergency-advisory',
            title: 'National Disaster Preparedness Standards',
            issuingAuthority: 'NDMA Safety Guidelines',
            officialUrl: 'https://ndma.gov.in',
          }],
        },
        error: '',
      })
      if (autoSpeak) {
        this.speakAnswer(fallbackAnswer)
      }
    } finally {
      this.setState({ isSending: false })
    }
  }

  submit = (event) => {
    event.preventDefault()
    this.sendQuery(this.state.message, this.state.autoSpeak)
  }

  handleChipClick = (chipQuery) => {
    this.setState({ message: chipQuery })
    this.sendQuery(chipQuery, this.state.autoSpeak)
  }

  render() {
    // The backend already returns the top 3 distinct chunks; keep all of them
    // so the chips match the evidence used for the answer.
    const sources = this.state.response?.sources || []

    const suggestions = [
      { icon: '🌪️', label: 'Cyclone checklist', query: 'What should I do before a cyclone?' },
      { icon: '🌊', label: 'Flood safety steps', query: 'How do I stay safe during flooding?' },
      { icon: '⚡', label: 'Lightning shelter', query: 'Where is safe during a thunderstorm?' },
      { icon: '🎒', label: 'Emergency kit', query: 'What should I pack in an emergency go-bag?' },
      { icon: '📞', label: 'Helplines', query: 'Which emergency helpline should I call in India?' },
      { icon: '🧭', label: 'How this assistant works', query: 'What can you do?' },
    ]

    const statusBadge = this.state.response?.status === 'GROUNDED'
      ? {
          label: this.state.response?.sourceType === 'builtin'
            ? '🛡️ Verified Safety Guidance'
            : '🛡️ Official Guidelines Grounded',
          className: 'badge-grounded',
        }
      : this.state.response?.status === 'SAFE_FALLBACK'
        ? { label: 'ℹ️ Disaster Safety Advisory', className: 'badge-fallback' }
        : { label: this.state.response?.status || 'Active', className: 'badge-default' }

    return (
      <div className="resq-chat-panel">
        {this.state.apiNotice && (
          <div className="chat-alert-banner" role="alert">
            <span>{this.state.apiNotice}</span>
          </div>
        )}

        <div className="chat-suggestions-container">
          <span className="chat-suggestions-label">Quick Safety Topics:</span>
          <div className="chat-suggestion-chips">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.query}
                type="button"
                className="chat-suggestion-chip"
                onClick={() => this.handleChipClick(suggestion.query)}
              >
                <span aria-hidden="true">{suggestion.icon}</span> {suggestion.label}
              </button>
            ))}
          </div>
        </div>

        <form className="auth-form chat-form" onSubmit={this.submit}>
          <label htmlFor="ai-message" className="chat-input-label">
            Ask Emergency & Disaster AI Assistant
          </label>
          <textarea
            id="ai-message"
            value={this.state.message}
            onChange={(event) => this.setState({ message: event.target.value })}
            placeholder="Describe an emergency, ask about evacuation, storm safety, or first aid…"
            required
            rows="3"
          />

          <div className="chat-voice-actions">
            <button
              type="button"
              className={`btn-voice ${this.state.isListening ? 'is-active' : ''}`}
              onClick={this.toggleVoiceInput}
              aria-pressed={this.state.isListening}
            >
              {this.state.isListening ? '🛑 Stop listening' : '🎙️ Speak (Continuous Voice)'}
            </button>

            {this.state.isListening && (
              <button
                type="button"
                className="btn-voice-done"
                onClick={this.stopAndSubmit}
                disabled={!this.state.message.trim()}
              >
                ⚡ Done & Ask AI
              </button>
            )}
          </div>

          {this.state.isListening && (
            <div className="voice-listening-indicator" role="status" aria-live="polite">
              <div className="voice-wave-bars">
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
              </div>
              <p className="voice-status-text">
                {this.state.voiceStatus || 'Listening continuously across pauses…'}
              </p>
            </div>
          )}

          <button className="form-submit chat-submit-btn" type="submit" disabled={this.state.isSending}>
            {this.state.isSending ? 'Consulting Disaster AI…' : 'Send Question'}
          </button>
        </form>

          <div className="chat-response-card" style={{ display: 'none' }} />
        {this.state.response && (
          <div className={`chat-response-card ${this.state.response.status === 'GROUNDED' ? 'is-grounded' : ''}`} role="status" aria-live="polite">
            <div className="chat-response-header">
              <span className={`status-pill ${statusBadge.className}`}>{statusBadge.label}</span>
              {this.state.response.answer && (
                this.state.isSpeaking ? (
                  <button className="chat-speak-button" type="button" onClick={this.stopSpeaking}>
                    <span aria-hidden="true">⏹</span> Stop reading
                  </button>
                ) : (
                  <button className="chat-speak-button" type="button" onClick={() => this.speakAnswer()}>
                    <span aria-hidden="true">🔊</span> Read aloud
                  </button>
                )
              )}
            </div>

            <p className="chat-response-text">
              {this.state.response.answer || this.state.response.warnings?.[0] || 'No supported guidance available.'}
            </p>

            {this.state.response.warnings?.filter((w) => !/built-in basic safety cache/i.test(w)).length > 0 && (
              <div className="chat-warnings-box">
                {this.state.response.warnings
                  .filter((w) => !/built-in basic safety cache/i.test(w))
                  .map((warning) => (
                    <small key={warning} className="chat-warning-item">⚠️ {warning}</small>
                  ))}
              </div>
            )}

            {sources.length > 0 && (
              <div className="chat-sources-section">
                <span className="chat-sources-title">Sources</span>
                <div className="chat-sources-list">
                  {sources.map((source, index) => (
                    <a
                      key={`${source.documentId}-${source.page ?? source.section ?? source.officialUrl}-${index}`}
                      className="chat-source-chip"
                      href={source.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={source.issuingAuthority || compactSourceLabel(source)}
                    >
                      {compactSourceLabel(source)}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {(this.state.response.provider || this.state.response.diagnostics) && (
              <div className="chat-diagnostics-section">
                <button
                  type="button"
                  className="chat-diagnostics-toggle"
                  onClick={() => this.setState((prev) => ({ showDiagnostics: !prev.showDiagnostics }))}
                >
                  {this.state.showDiagnostics ? '▼ Hide AI diagnostics' : '▶ Show AI provider diagnostics'}
                </button>
                {this.state.showDiagnostics && (
                  <pre className="chat-diagnostics-pre">
                    {JSON.stringify({
                      status: this.state.response.status,
                      provider: this.state.response.provider,
                      model: this.state.response.model,
                      diagnostics: this.state.response.diagnostics,
                    }, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {this.state.error && <p className="chat-response form-error" role="status">{this.state.error}</p>}
      </div>
    )
  }
}
