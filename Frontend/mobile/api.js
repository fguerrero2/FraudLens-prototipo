import { t as translate, getLocale, languages, setLocale, subscribe } from './shared/i18n'
import * as SecureStore from 'expo-secure-store'
const base = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '')
let credentials = null, refreshing = null
export async function restoreSession() {
  const stored = await SecureStore.getItemAsync('fraudlens-session')
  credentials = stored ? JSON.parse(stored) : null
  return credentials
}
export async function saveSession(value) {
  credentials = value
  if (value) await SecureStore.setItemAsync('fraudlens-session', JSON.stringify(value))
  else await SecureStore.deleteItemAsync('fraudlens-session')
}
export async function request(path, method = 'GET', body, retry = true) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'Accept-Language': getLocale(), ...(credentials ? { Authorization: `Bearer ${credentials.access_token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (response.status === 401 && credentials && retry && path !== '/auth/login' && path !== '/auth/refresh') {
    const previous = credentials
    refreshing ||= request('/auth/refresh', 'POST', { refresh_token: previous.refresh_token }, false).then(value => { if (credentials === previous) return saveSession(value) }).finally(() => { refreshing = null })
    try { await refreshing } catch (error) { await saveSession(null); throw error }
    return request(path, method, body, false)
  }
  const value = await response.json().catch(() => ({}))
  if (!response.ok) { const error = new Error(response.status === 401 ? translate("Session expired. Sign in again.") : Array.isArray(value.message) ? value.message.join(' · ') : typeof value.message === 'string' ? value.message : translate("Request failed ({0}). Try again.", [response.status])); error.status = response.status; throw error }
  return value
}
