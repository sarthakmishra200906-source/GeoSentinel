import React, { Component } from 'react';
import { MapContainer, TileLayer, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default class MapComponent extends Component {
  render() {
    const position = [20.5937, 78.9629];

    return (
      <div className="map-background">
        <MapContainer
          center={position}
          zoom={5}
          minZoom={4}
          zoomSnap={0.5}
          maxBounds={[[-85, -540], [85, 540]]}
          maxBoundsViscosity={1.0}
          worldCopyJump={false}
          zoomControl={false}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="bottomright" />
        </MapContainer>
      </div>
    );
  }
}