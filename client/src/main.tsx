import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App'
import { suppressGoogleOAuthWarnings } from "./lib/suppressGoogleOAuthWarnings";

// Suppress harmless Google OAuth COOP warnings
suppressGoogleOAuthWarnings();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
