import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Registration from './Registration.tsx'
import WorkerIntakeReview from './WorkerIntakeReview.tsx'
import PatientRequests from './PatientRequests.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/register' ? <BrowserRouter><Registration /></BrowserRouter> : window.location.pathname.startsWith('/worker/intake-review/') ? <WorkerIntakeReview /> : window.location.pathname === '/patient/requests' ? <PatientRequests /> : <App />}
  </StrictMode>,
)
