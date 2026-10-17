import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { captureRecoveryFromUrl, watchRecoveryInUrl } from './lib/auth'

// v51: handle the password-reset link (tokens or errors) before the hash router sees the URL
captureRecoveryFromUrl()
watchRecoveryInUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
