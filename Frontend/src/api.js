const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '')
const analystKey = import.meta.env.VITE_ANALYST_API_KEY || 'analyst_dev_key_change_me'
const adminKey = import.meta.env.VITE_ADMIN_API_KEY || 'admin_dev_key_change_me'
const clientKey = import.meta.env.VITE_CLIENT_API_KEY || 'client_dev_key_change_me'
async function request(path, options = {}) {
  const isReview = path.endsWith('/review')
  const isUpdate = options.method === 'PUT'
  const isCreate = options.method === 'POST'
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', 'x-api-key': isReview ? analystKey : isUpdate ? adminKey : isCreate ? clientKey : analystKey, ...(isUpdate ? { 'x-actor-name': import.meta.env.VITE_ACTOR_NAME || 'Administrador FraudLens' } : {}), ...options.headers } })
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message || `Error ${response.status} communicating with the API`) }
  return response.json()
}
export const api = { get: path => request(path), post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }), put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }) }
