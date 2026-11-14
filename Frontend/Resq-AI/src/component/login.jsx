import React, { Component } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default class Login extends Component {
  state = {
    identifier: '',
    password: '',
    email: '',
    resetToken: new URLSearchParams(window.location.search).get('resetToken') || '',
    resetPassword: '',
    showPassword: false,
    forgotMode: Boolean(new URLSearchParams(window.location.search).get('resetToken')),
    error: '',
    success: '',
    isSubmitting: false,
  }

  submit = async (event) => {
    event.preventDefault()
    this.setState({ error: '', isSubmitting: true })
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: this.state.identifier,
          password: this.state.password,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to log in')
      this.props.onSuccess(data)
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSubmitting: false })
    }

    requestReset = async (event) => {
      event.preventDefault()
      this.setState({ error: '', success: '', isSubmitting: true })
      try {
        const response = await fetch(`${API_URL}/auth/request-password-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.state.email }),
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
          body: JSON.stringify({ token: this.state.resetToken, password: this.state.resetPassword }),
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
  }

  render() {
    if (this.state.forgotMode) {
      return (
        <form className="auth-form" onSubmit={this.state.resetToken ? this.resetPassword : this.requestReset}>
          {!this.state.resetToken ? (
            <>
              <p>Enter your Gmail address. If it is registered, reset instructions will be sent.</p>
              <label htmlFor="reset-email">Gmail address</label>
              <input id="reset-email" type="email" value={this.state.email} onChange={(event) => this.setState({ email: event.target.value })} required />
            </>
          ) : (
            <>
              <label htmlFor="reset-token">Reset token</label>
              <input id="reset-token" type="text" value={this.state.resetToken} onChange={(event) => this.setState({ resetToken: event.target.value })} required />
              <label htmlFor="reset-password">New password</label>
              <input id="reset-password" type={this.state.showPassword ? 'text' : 'password'} value={this.state.resetPassword} onChange={(event) => this.setState({ resetPassword: event.target.value })} minLength="8" required />
              <button type="button" onClick={() => this.setState({ showPassword: !this.state.showPassword })}>{this.state.showPassword ? 'Hide password' : 'Show password'}</button>
            </>
          )}
          <button className="form-submit" type="submit" disabled={this.state.isSubmitting}>{this.state.isSubmitting ? 'Working…' : this.state.resetToken ? 'Reset password' : 'Send reset link'}</button>
          <button type="button" onClick={() => this.setState({ forgotMode: false, resetToken: '' })}>Back to log in</button>
          {this.state.success && <p className="form-success">{this.state.success}</p>}
          {this.state.error && <p className="form-error">{this.state.error}</p>}
        </form>
      )
    }
    return (
      <form className="auth-form" onSubmit={this.submit}>
        <p>Use your email address or phone number to continue.</p>
        <label htmlFor="login-identifier">Email or phone</label>
        <input
          id="login-identifier"
          type="text"
          value={this.state.identifier}
          onChange={(event) => this.setState({ identifier: event.target.value })}
          required
          autoComplete="username"
        />
        <label htmlFor="login-password">Password</label>
        <div className="password-field">
          <input
            id="login-password"
            type={this.state.showPassword ? 'text' : 'password'}
            value={this.state.password}
            onChange={(event) => this.setState({ password: event.target.value })}
            required
            autoComplete="current-password"
          />
          <button type="button" onClick={() => this.setState({ showPassword: !this.state.showPassword })}>{this.state.showPassword ? 'Hide' : 'Show'}</button>
        </div>
        <button className="form-submit" type="submit" disabled={this.state.isSubmitting}>
          {this.state.isSubmitting ? 'Logging in…' : 'Log in'}
        </button>
        <button type="button" onClick={() => this.setState({ forgotMode: true })}>Forgot password?</button>
        {this.state.error && <p className="form-error">{this.state.error}</p>}
      </form>
    )
  }
}
