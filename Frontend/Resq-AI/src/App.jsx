import React, { Component } from 'react'
import Navbar from './component/navbar'
import MapContainer from './component/MapContainer'
import './App.css'

export default class App extends Component {
  render() {
    return (
      <div>
        <Navbar />
        <MapContainer />

      </div>
    )
  }
}
