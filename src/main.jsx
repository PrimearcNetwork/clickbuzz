import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { capturePlanLock } from './utils/planLock'

// weekly./monthly.clickbuz.in land here as /login?plan=<cycle> — remember it
// before any route can redirect away.
capturePlanLock()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
