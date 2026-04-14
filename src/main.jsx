import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrimeReactProvider } from 'primereact/api'
import {
  captureAuthHashErrorOnce,
  takeAuthLinkErrorFromSession,
} from './lib/authHashCapture.js'
import 'primereact/resources/themes/lara-light-amber/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './prime-anneth.css'
import './index.css'
import App from './App.jsx'

captureAuthHashErrorOnce()
const initialAuthLinkError = takeAuthLinkErrorFromSession()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrimeReactProvider>
      <BrowserRouter>
        <App initialAuthLinkError={initialAuthLinkError} />
      </BrowserRouter>
    </PrimeReactProvider>
  </StrictMode>,
)
