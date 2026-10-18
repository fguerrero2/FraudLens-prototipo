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
  return <div className="preference-toggle"><span className="preference-label">{translate(theme === 'dark' ? 'Dark mode' : 'Light mode')}</span><button type="button" role="switch" data-keep-draft className="toggle-track" aria-checked={theme === 'dark'} aria-label={translate('Dark mode')} title={translate(theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode')} onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}><span className="toggle-thumb" aria-hidden="true"/><span className="toggle-state" aria-hidden="true"><Sun size={18}/></span><span className="toggle-state" aria-hidden="true"><Moon size={18}/></span></button></div>
}
