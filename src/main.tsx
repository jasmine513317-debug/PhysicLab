import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/wght-italic.css'
import './styles.css'
import './home.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
