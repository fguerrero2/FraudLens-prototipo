import { t as translate } from './i18n'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getInitialTheme } from './theme'

// Official Canva logo variants; CSS shows the one that matches the active theme.
export function Brand() {
  return <div className="brand"><img className="brand-logo brand-logo-light" src="/brand/logo-completo-modo-claro.png" alt="FraudLens" width="1471" height="370"/><img className="brand-logo brand-logo-dark" src="/brand/logo-completo-modo-oscuro.png" alt="FraudLens" width="1471" height="370"/></div>
}

// data-keep-draft tells the unsaved-changes guard that switching theme does not leave the page.
export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme)
  useEffect(() => { applyTheme(theme) }, [theme])
  const label = theme === 'light' ? translate("Switch to dark mode") : translate("Switch to light mode")
  return <button type="button" data-keep-draft className="btn" aria-pressed={theme === 'dark'} aria-label={label} title={label} onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} aria-hidden="true"/> : <Sun size={18} aria-hidden="true"/>}<span>{theme === 'light' ? translate("Dark mode") : translate("Light mode")}</span></button>
}
