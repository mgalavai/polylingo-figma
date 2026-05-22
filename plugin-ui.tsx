"use client"

import React from 'react'
import { createRoot } from 'react-dom/client'
import Component from './figma-translation-plugin'

function mount() {
  const container = document.getElementById('root')
  if (!container) {
    console.error('Plugin UI: #root not found')
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'UI root not found' } }, '*')
    return
  }
  try {
    console.log('Plugin UI: mounting React root')
    const root = createRoot(container)
    root.render(<Component />)
    console.log('Plugin UI: render complete')
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'UI mounted' } }, '*')
    // Signal readiness so the controller can send initial selection state
    parent.postMessage({ pluginMessage: { type: 'ready' } }, '*')
  } catch (err) {
    console.error('Plugin UI: render error', err)
    container.innerHTML = '<div style="padding:12px;color:#b91c1c">Failed to render UI. See console.</div>'
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'UI render error' } }, '*')
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}


