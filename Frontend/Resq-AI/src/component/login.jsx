import React, { Component } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default class Login extends Component {
  state = { identifier: '', password: '', error: '', isSubmitting: false }

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
  }

  render() {
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
        <input
          id="login-password"
          type="password"
          value={this.state.password}
          onChange={(event) => this.setState({ password: event.target.value })}
          required
          autoComplete="current-password"
        />
        <button className="form-submit" type="submit" disabled={this.state.isSubmitting}>
          {this.state.isSubmitting ? 'Logging in…' : 'Log in'}
        </button>
        {this.state.error && <p className="form-error">{this.state.error}</p>}
      </form>
    )
  }
}
