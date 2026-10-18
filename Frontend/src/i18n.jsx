import { useState, useSyncExternalStore } from 'react'
import { getLocale, languages, normalizeLocale, setLocale, subscribe, t } from '../mobile/shared/i18n'
try { setLocale(localStorage.getItem('fraudlens-language')) } catch { /* Storage may be unavailable. */ }
document.documentElement.lang = getLocale()
document.title = t('FraudLens · Fraud monitoring')
export { t, getLocale }
export const useLocale = () => useSyncExternalStore(subscribe, getLocale)
function changeLanguage(value) {
  setLocale(normalizeLocale(value))
  document.documentElement.lang = getLocale()
  try { localStorage.setItem('fraudlens-language', getLocale()) } catch { /* Keep the in-memory choice. */ }
}
export function LanguageSelector() {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  return <div className="language-selector"><button type="button" data-keep-draft className="btn" aria-expanded={open} onClick={() => setOpen(value => !value)}>{t('Change language')}</button>{open && <label className="field">{t('Language')}<select data-keep-draft className="control" value={locale} onChange={event => { changeLanguage(event.target.value); setOpen(false) }}>{languages.map(language => <option key={language.tag} value={language.tag}>{language.label}</option>)}</select></label>}</div>
}
