import React, { Component } from 'react'
import Navbar from './component/navbar'
import MapContainer from './component/MapContainer'
import AdminDashboard from './component/AdminDashboard'
import './App.css'

export default class App extends Component {
  state = {
    activeView: 'map',
    adminSection: 'overview',
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

  handleNavigate = (activeView) => {
    this.setState({ activeView })
  }

  render() {
    const isAdminView = this.state.activeView === 'admin'
    return (
      <div className={isAdminView ? 'app-shell admin-view-active' : 'app-shell'}>
        <Navbar
          user={this.state.user}
          token={this.state.token}
          onAuthenticated={this.handleAuthenticated}
          onLogout={this.handleLogout}
          activeView={this.state.activeView}
          adminSection={this.state.adminSection}
          onAdminSection={(adminSection) => this.setState({ adminSection })}
          onNavigate={this.handleNavigate}
        />
        {isAdminView ? (
          <AdminDashboard
            token={this.state.token}
            activeSection={this.state.adminSection}
            onSectionChange={(adminSection) => this.setState({ adminSection })}
            onSwitchToMap={() => this.handleNavigate('map')}
          />
        ) : (
          <MapContainer />
        )}
      </div>
    )
  }
}
