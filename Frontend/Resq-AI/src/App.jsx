import React, { Component } from 'react'
import Navbar from './component/navbar'
import MapContainer from './component/MapContainer'
import './App.css'

export default class App extends Component {
  state = {
    user: (() => {
      const storedUser = localStorage.getItem('resq-ai-user')
      if (!storedUser) return null
      try {
        return JSON.parse(storedUser)
      } catch {
        localStorage.removeItem('resq-ai-user')
        return null
      }
    })(),
    token: localStorage.getItem('resq-ai-token'),
  }

  handleAuthenticated = ({ token, user }) => {
    localStorage.setItem('resq-ai-token', token)
    localStorage.setItem('resq-ai-user', JSON.stringify(user))
    this.setState({ token, user })
  }

  handleLogout = () => {
    localStorage.removeItem('resq-ai-token')
    localStorage.removeItem('resq-ai-user')
    this.setState({ token: null, user: null })
  }

  render() {
    return (
      <div>
        <Navbar
          user={this.state.user}
          token={this.state.token}
          onAuthenticated={this.handleAuthenticated}
          onLogout={this.handleLogout}
        />
        <MapContainer />
      </div>
    )
  }
}
