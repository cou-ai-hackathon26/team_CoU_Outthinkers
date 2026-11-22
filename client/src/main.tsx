import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Registration from './Registration.tsx'
import WorkerIntakeReview from './WorkerIntakeReview.tsx'
import PatientRequests from './PatientRequests.tsx'
import WorkerFollowUps from './WorkerFollowUps.tsx'
import WorkerPatientCase from './WorkerPatientCase.tsx'
import AdminPanel from './AdminPanel.tsx'
import PasswordReset from './PasswordReset.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/register' ? <BrowserRouter><Registration /></BrowserRouter> : window.location.pathname === '/forgot-password' || window.location.pathname === '/reset-password' ? <BrowserRouter><PasswordReset /></BrowserRouter> : window.location.pathname.startsWith('/worker/intake-review/') ? <WorkerIntakeReview /> : window.location.pathname.startsWith('/worker/patient-case/') ? <WorkerPatientCase /> : window.location.pathname.startsWith('/admin/') ? <AdminPanel /> : window.location.pathname === '/patient/requests' ? <PatientRequests /> : window.location.pathname === '/worker/follow-ups' ? <WorkerFollowUps /> : <App />}
  </StrictMode>,
)
