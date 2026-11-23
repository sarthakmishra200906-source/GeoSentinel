import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const application = (
  <StrictMode>
    <App />
  </StrictMode>
)

createRoot(document.getElementById('root')).render(
  googleClientId ? <GoogleOAuthProvider clientId={googleClientId}>{application}</GoogleOAuthProvider> : application,
)
