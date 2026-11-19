import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadPrintFonts } from './components/print/printFonts'

// S3 Gate C finding: the print-only faces load at start, so any print finds them ready.
void loadPrintFonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
