import { t as translate, getLocale } from './i18n'
const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '')
// Tokens remain in memory. Reloading the page requires a new login.
let tokens = null
let refreshPromise = null
export const session = {
  set(value) { tokens = value },
  clear() { tokens = null; window.dispatchEvent(new Event('fraudlens:logout')) },
}
async function request(path, options = {}, retry = true) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'Accept-Language': getLocale(), ...(tokens ? { Authorization: `Bearer ${tokens.access_token}` } : {}), ...options.headers } })
  if (response.status === 401 && tokens && retry && !path.startsWith('/auth/')) {
    const previous = tokens
    refreshPromise ||= request('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: previous.refresh_token }) }, false).then(value => {
      if (tokens === previous) tokens = value
    }).finally(() => { refreshPromise = null })
    try { await refreshPromise } catch (error) { session.clear(); throw error }
    return request(path, options, false)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    if (response.status === 401 && tokens && !path.endsWith('/login')) session.clear()
    throw new Error(Array.isArray(body?.message) ? body.message.join(' · ') : typeof body?.message === 'string' ? body.message : translate("Request failed ({0}). Try again.", [response.status]))
  }
  return options.raw ? response.blob() : response.json()
}
export const api = {
  get: path => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  async download(path, filename) {
    const url = URL.createObjectURL(await request(path, { raw: true }))
    const link = Object.assign(document.createElement('a'), { href: url, download: filename })
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
