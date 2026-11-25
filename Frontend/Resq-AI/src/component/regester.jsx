import React, { Component } from 'react'

import { API_URL } from '../api'

export default class Register extends Component {
  state = {
    name: '',
    email: '',
    phone: '',
    password: '',
    showPassword: false,
    age: '',
    gender: 'Other',
    address: '',
    governmentIdReference: '',
    error: '',
    isSubmitting: false,
  }

  submit = async (event) => {
    event.preventDefault()
    this.setState({ error: '', isSubmitting: true })
    const { name, email, phone, password, age, gender, address, governmentIdReference } = this.state
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          age: Number(age),
          gender,
          address,
          accountType: 'admin',
          governmentIdReference,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create your account')
      this.props.onAuthResult(data)
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSubmitting: false })
    }
  }

  update = (field) => (event) => this.setState({ [field]: event.target.value })

  render() {
    const { error, isSubmitting } = this.state
    return (
      <form className="auth-form auth-card-form" onSubmit={this.submit}>
        <div className="auth-form-intro">
          <span className="auth-form-intro-icon" aria-hidden="true">🛡️</span>
          <div>
            <h3>Request administrator access</h3>
            <p>
              Verify your phone, then an existing administrator must approve your request before
              the dashboard unlocks. The public map and AI assistant need no account.
            </p>
          </div>
        </div>

        <p className="auth-section-label">Contact details</p>
        <div className="auth-field-grid">
          <div className="auth-field auth-field-wide">
            <label htmlFor="register-name">Full name</label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Ananya Sharma"
              value={this.state.name}
              onChange={this.update('name')}
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="register-email">Email address</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={this.state.email}
              onChange={this.update('email')}
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="register-phone">Phone number</label>
            <input
              id="register-phone"
              type="tel"
              autoComplete="tel"
              placeholder="+919876543210"
              value={this.state.phone}
              onChange={this.update('phone')}
              required
            />
            <small className="auth-field-hint">Use international format, including the country code.</small>
          </div>
        </div>

        <p className="auth-section-label">Account security</p>
        <div className="auth-field-grid">
          <div className="auth-field auth-field-wide">
            <label htmlFor="register-password">Password</label>
            <div className="password-field">
              <input
                id="register-password"
                type={this.state.showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                minLength={8}
                value={this.state.password}
                onChange={this.update('password')}
                required
              />
              <button
                type="button"
                aria-pressed={this.state.showPassword}
                onClick={() => this.setState({ showPassword: !this.state.showPassword })}
              >
                {this.state.showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="register-age">Age</label>
            <input
              id="register-age"
              type="number"
              min="18"
              max="130"
              placeholder="18 or above"
              value={this.state.age}
              onChange={this.update('age')}
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="register-gender">Gender</label>
            <select id="register-gender" value={this.state.gender} onChange={this.update('gender')}>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
              <option>Prefer not to say</option>
            </select>
          </div>
          <div className="auth-field auth-field-wide">
            <label htmlFor="register-address">Office / residential address</label>
            <textarea
              id="register-address"
              rows="2"
              placeholder="City, state and landmark"
              value={this.state.address}
              onChange={this.update('address')}
              required
            />
          </div>
        </div>

        <p className="auth-section-label">Verification for admin review</p>
        <div className="auth-field">
          <label htmlFor="register-government-id">Government ID reference</label>
          <input
            id="register-government-id"
            type="text"
            maxLength={120}
            placeholder="ID type and last 4 digits only, e.g. Aadhaar •••• 1234"
            value={this.state.governmentIdReference}
            onChange={this.update('governmentIdReference')}
            required
          />
          <small className="auth-field-hint">
            Enter only a reference for review — do not upload or share a full ID number here.
          </small>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="auth-form-actions">
          <button className="form-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting request…' : 'Request admin access'}
          </button>
          {this.props.onBack && (
            <button className="auth-secondary-button" type="button" onClick={this.props.onBack}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    )
  }
}
