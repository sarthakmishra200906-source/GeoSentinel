import React from 'react'

export default function NavigationCard({ title, children, onClose }) {
  return (
    <div className="card-backdrop" role="presentation" onClick={onClose}>
      <section
        className="navigation-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="navigation-card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="navigation-card-header">
          <h2 id="navigation-card-title">{title}</h2>
          <button className="card-close" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="navigation-card-content">{children}</div>
      </section>
    </div>
  )
}
