import React, { Component } from 'react'

export default class navbar extends Component {
  render() {
    return (
      <div className="map-menu">
        <button className="btn-solid theme-secondary" type="button" data-bs-toggle="menu" aria-expanded="false">
          Menu button
        </button>
        <div className="menu menu-translucent">
          <a className="menu-item active" href="#">Active menu item</a>
          <a className="menu-item" href="#">Menu item</a>
          <a className="menu-item" href="#">Menu item</a>
          <a className="menu-item" href="#">Menu item</a>
          <a className="menu-item" href="#">Menu item</a>
          <hr className="menu-divider"/>
          <a className="menu-item theme-danger" href="#">Danger menu item</a>
        </div>
      </div>
    )
  }
}
