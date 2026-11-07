import React, { Component } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default class Register extends Component {
  state = {
    name: '',
    email: '',
    phone: '',
    password: '',
    age: '',
    gender: 'Other',
    address: '',
    error: '',
    isSubmitting: false,
  }

  submit = async (event) => {
    event.preventDefault()
    this.setState({ error: '', isSubmitting: true })
    const { name, email, phone, password, age, gender, address } = this.state
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password, age: Number(age), gender, address }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create your account')
      this.props.onSuccess(data)
    } catch (error) {
      this.setState({ error: error.message })
    } finally {
      this.setState({ isSubmitting: false })
    }
  }

  update = (field) => (event) => this.setState({ [field]: event.target.value })

  render() {
    return (
      <form className="auth-form" onSubmit={this.submit}>
        <label htmlFor="register-name">Full name</label>
        <input id="register-name" type="text" value={this.state.name} onChange={this.update('name')} required />
        <label htmlFor="register-email">Email</label>
        <input id="register-email" type="email" value={this.state.email} onChange={this.update('email')} required />
        <label htmlFor="register-phone">Phone</label>
        <input id="register-phone" type="tel" value={this.state.phone} onChange={this.update('phone')} required />
        <label htmlFor="register-password">Password</label>
        <input id="register-password" type="password" value={this.state.password} onChange={this.update('password')} required />
        <label htmlFor="register-age">Age</label>
        <input id="register-age" type="number" min="0" max="130" value={this.state.age} onChange={this.update('age')} required />
        <label htmlFor="register-gender">Gender</label>
        <select id="register-gender" value={this.state.gender} onChange={this.update('gender')}>
          <option>Male</option>
          <option>Female</option>
          <option>Other</option>
        </select>
        <label htmlFor="register-address">Address</label>
        <textarea id="register-address" rows="3" value={this.state.address} onChange={this.update('address')} required />
        <button className="form-submit" type="submit" disabled={this.state.isSubmitting}>
          {this.state.isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
        {this.state.error && <p className="form-error">{this.state.error}</p>}
      </form>
    )
  }
}
