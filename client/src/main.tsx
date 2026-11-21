import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Registration from './Registration.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/register' ? <BrowserRouter><Registration /></BrowserRouter> : <><App />{window.location.pathname === '/login' && <a className="global-register-link" href="/register">নতুন patient account খুলুন →</a>}</>}
  </StrictMode>,
)
