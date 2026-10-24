// Global styles first so screen styles (imported by screens) cascade after them.
import '@v2/styles/tokens.css'
import '@v2/styles/base.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { applyThemeMode, readStoredThemeMode } from '@/features/preferences/preferencesStore'
import { router } from '@v2/router'

applyThemeMode(readStoredThemeMode())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
