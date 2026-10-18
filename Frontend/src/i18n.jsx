import { useSyncExternalStore } from 'react'
import { getLocale, languages, normalizeLocale, setLocale, subscribe, t } from '../mobile/shared/i18n'
try { setLocale(localStorage.getItem('fraudlens-language')) } catch { /* Storage may be unavailable. */ }
document.documentElement.lang = getLocale()
document.title = t('FraudLens · Fraud monitoring')
export { t, getLocale }
export const useLocale = () => useSyncExternalStore(subscribe, getLocale)
function changeLanguage(value) {
  setLocale(normalizeLocale(value))
  document.documentElement.lang = getLocale()
  document.title = t('FraudLens · Fraud monitoring')
  try { localStorage.setItem('fraudlens-language', getLocale()) } catch { /* Keep the in-memory choice. */ }
}
export function LanguageSelector() {
  const locale = useLocale()
  return <label className="language-selector"><span className="preference-label">{t('Language')}</span><select data-keep-draft className="control" aria-label={t('Change language')} value={locale} onChange={event => changeLanguage(event.target.value)}>{languages.map(language => <option key={language.tag} value={language.tag}>{language.label}</option>)}</select></label>
}
