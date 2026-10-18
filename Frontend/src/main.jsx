import { t as translate, getLocale } from './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Auth from './Auth'
import Usability from './Usability'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode><Auth /><Usability /></StrictMode>,
)
