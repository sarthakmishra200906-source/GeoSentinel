import React, { Component } from 'react'

import { API_URL } from '../api'

const queryParams = new URLSearchParams(window.location.search)

// Local showcase account only. The button is rendered in development builds.
const DEMO_ADMIN = {
  identifier: 'demo.admin@geosentinel.local',
  password: 'DemoAdmin@2026',
}

export default class Login extends Component {
  state = {
    identifier: '',
    password: '',
    email: '',
    resetToken: queryParams.get('resetToken') || '',
    resetPassword: '',
    showPassword: false,
    forgotMode: Boolean(queryParams.get('resetToken')),
    error: '',
    success: '',
    isSubmitting: false,
  }

  performLogin = async (identifier, password) => {
    this.setState({ error: '', success: '', isSubmitting: true })
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to log in')
      this.props.onAuthResult(data)
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSubmitting: false })
    }
  }

  submit = (event) => {
    event.preventDefault()
    this.performLogin(this.state.identifier.trim(), this.state.password)
  }

  useDemoAdmin = () => {
    this.setState({ identifier: DEMO_ADMIN.identifier, password: DEMO_ADMIN.password })
    this.performLogin(DEMO_ADMIN.identifier, DEMO_ADMIN.password)
  }

  requestReset = async (event) => {
    event.preventDefault()
    this.setState({ error: '', success: '', isSubmitting: true })
    try {
      const response = await fetch(`${API_URL}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.state.email.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to request password reset')
      this.setState({
        success: data.devResetToken
          ? `Development reset token: ${data.devResetToken}`
          : data.message,
        resetToken: data.devResetToken || this.state.resetToken,
      })
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSubmitting: false })
    }
  }

  resetPassword = async (event) => {
    event.preventDefault()
    this.setState({ error: '', success: '', isSubmitting: true })
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.state.resetToken.trim(), password: this.state.resetPassword }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to reset password')
      this.setState({ success: data.message, forgotMode: false, resetPassword: '' })
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSubmitting: false })
    }
  }

  togglePassword = () => this.setState((state) => ({ showPassword: !state.showPassword }))

  renderForgotMode() {
    const isReset = Boolean(this.state.resetToken)
    return (
      <form
        className="auth-form auth-card-form"
        onSubmit={isReset ? this.resetPassword : this.requestReset}
      >
        <div className="auth-form-intro">
          <span className="auth-form-intro-icon" aria-hidden="true">🔑</span>
          <div>
            <h3>{isReset ? 'Choose a new password' : 'Reset your password'}</h3>
            <p>
              {isReset
                ? 'Enter the reset token and a new password of at least 8 characters.'
                : 'Enter your administrator email. If it is registered, reset instructions will be prepared.'}
            </p>
          </div>
        </div>

        {!isReset ? (
          <div className="auth-field">
            <label htmlFor="reset-email">Administrator email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={this.state.email}
              onChange={(event) => this.setState({ email: event.target.value })}
              required
            />
          </div>
        ) : (
          <>
            <div className="auth-field">
              <label htmlFor="reset-token">Reset token</label>
              <input
                id="reset-token"
                type="text"
                autoComplete="off"
                value={this.state.resetToken}
                onChange={(event) => this.setState({ resetToken: event.target.value })}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reset-password">New password</label>
              <div className="password-field">
                <input
                  id="reset-password"
                  type={this.state.showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  minLength={8}
                  value={this.state.resetPassword}
                  onChange={(event) => this.setState({ resetPassword: event.target.value })}
                  required
                />
                <button type="button" aria-pressed={this.state.showPassword} onClick={this.togglePassword}>
                  {this.state.showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </>
        )}

        {this.state.success && <p className="form-success" role="status">{this.state.success}</p>}
        {this.state.error && <p className="form-error" role="alert">{this.state.error}</p>}

        <div className="auth-form-actions">
          <button className="form-submit" type="submit" disabled={this.state.isSubmitting}>
            {this.state.isSubmitting
              ? 'Working…'
              : isReset ? 'Reset password' : 'Send reset link'}
          </button>
          <button
            className="auth-secondary-button"
            type="button"
            onClick={() => this.setState({ forgotMode: false, resetToken: '', error: '', success: '' })}
          >
            Back to sign in
          </button>
        </div>
      </form>
    )
  }

  render() {
    if (this.state.forgotMode) return this.renderForgotMode()

    return (
      <form className="auth-form auth-card-form" onSubmit={this.submit}>
        <div className="auth-form-intro">
          <span className="auth-form-intro-icon" aria-hidden="true">🛡️</span>
          <div>
            <h3>Administrator sign-in</h3>
            <p>
              Sign in to manage users, guidelines, simulations and response operations. Public
              safety information and the AI assistant stay open to everyone.
            </p>
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="login-identifier">Email address or phone</label>
          <input
            id="login-identifier"
            type="text"
            autoComplete="username"
            placeholder="you@example.com or +919876543210"
            value={this.state.identifier}
            onChange={(event) => this.setState({ identifier: event.target.value })}
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password">Password</label>
          <div className="password-field">
            <input
              id="login-password"
              type={this.state.showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={this.state.password}
              onChange={(event) => this.setState({ password: event.target.value })}
              required
            />
            <button type="button" aria-pressed={this.state.showPassword} onClick={this.togglePassword}>
              {this.state.showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {this.state.error && <p className="form-error" role="alert">{this.state.error}</p>}
        {this.state.success && <p className="form-success" role="status">{this.state.success}</p>}

        <div className="auth-form-actions">
          <button className="form-submit" type="submit" disabled={this.state.isSubmitting}>
            {this.state.isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            className="auth-secondary-button"
            type="button"
            onClick={() => this.setState({ forgotMode: true, error: '', success: '' })}
          >
            Forgot password?
          </button>
        </div>

        {import.meta.env.DEV && (
          <button
            className="auth-demo-button"
            type="button"
            onClick={this.useDemoAdmin}
            disabled={this.state.isSubmitting}
          >
            <span aria-hidden="true">⚡</span> Use demo admin — one-tap sign in
          </button>
        )}
      </form>
    )
  }
}
