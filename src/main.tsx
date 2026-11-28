import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles.css'
import { Startup } from './splash/Startup'

createRoot(document.getElementById('root')!).render(<StrictMode><Startup/></StrictMode>)
