import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import {
  captureAuthHashErrorOnce,
  takeAuthLinkErrorFromSession,
} from './lib/authHashCapture.js'
import './index.css'
import App from './App.jsx'

captureAuthHashErrorOnce()
const initialAuthLinkError = takeAuthLinkErrorFromSession()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App initialAuthLinkError={initialAuthLinkError} />
    </BrowserRouter>
  </StrictMode>,
)
