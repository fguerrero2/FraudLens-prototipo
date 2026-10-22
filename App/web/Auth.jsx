import { t as translate, useLocale, LanguageSelector } from './i18n'
import { useEffect, useState } from 'react'
import { api, session } from './api'
import App from './App'
import Administration from './Administration'
import { Brand, ThemeToggle } from './Brand'
import { CircleHelp, LayoutDashboard, LogOut, Shield } from 'lucide-react'

const openHelp = () => window.dispatchEvent(new Event('fraudlens:help'))
const HelpButton = () => <button type="button" data-keep-draft className="btn" aria-haspopup="dialog" onClick={openHelp}><CircleHelp size={18} aria-hidden="true"/> {translate("Help")}</button>

export default function Auth() {
  useLocale()
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    const clear = () => { setProfile(null); setPassword(''); setAdmin(false) }
    window.addEventListener('fraudlens:logout', clear)
    return () => window.removeEventListener('fraudlens:logout', clear)
  }, [])
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const result = await api.post('/auth/login', { email, password }); session.set(result); setProfile(result); setPassword('') }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function selectTenant(id) {
    if (window.fraudlensCanLeave && !window.fraudlensCanLeave()) return
    setBusy(true); setError('')
    try { setProfile(await api.post('/auth/tenant', { tenant_id: id })); setAdmin(false) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function logout() { try { await api.post('/auth/logout', {}) } finally { session.clear() } }
  if (!profile) return <main className="auth-page login-page"><div className="login-preferences"><LanguageSelector/><ThemeToggle/></div><form className="auth-card" onSubmit={login}><Brand/><div><h1>{translate("Sign in")}</h1><p>{translate("Use the account of your organization.")}</p></div><label className="field">{translate("Email")}<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/></label><label className="field">{translate("Password")}<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label>{error && <p role="alert" className="validation">{translate(error)}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? translate("Signing in…") : translate("Sign in")}</button></form><div className="login-help"><HelpButton/></div></main>
  const activeOrganization = profile.tenants.find(tenant => tenant.id === profile.tenant_id)
  const canAdmin = profile.permissions.includes('users.read') || profile.permissions.includes('api_clients.read') || profile.permissions.includes('alerts.read') || profile.user.platformRoles.some(r => r.role === 'SUPER_ADMIN')
  return <><div className="session-bar"><div className="session-organization" role="status"><span>{translate("Active organization")}</span><strong>{activeOrganization?.name || translate("No organization selected")}</strong></div><div className="session-user"><strong>{profile.user.name}</strong>{profile.role && <small>{translate(profile.role)}</small>}</div><div className="session-actions btn-group"><select className="control" aria-label={translate("Active organization")} disabled={busy} value={profile.tenant_id || ''} onChange={e => selectTenant(e.target.value)}><option value="" disabled>{translate("Select organization")}</option>{profile.tenants.map(t => <option key={t.id} value={t.id}>{t.name} · {translate(t.role)}</option>)}</select>{canAdmin && <button type="button" className="btn" onClick={() => setAdmin(v => !v)}>{admin ? <><LayoutDashboard size={18} aria-hidden="true"/> {translate("Dashboard")}</> : <><Shield size={18} aria-hidden="true"/> {translate("Administration")}</>}</button>}<LanguageSelector/><ThemeToggle/><HelpButton/><button type="button" className="btn" onClick={logout}><LogOut size={18} aria-hidden="true"/> {translate("Sign out")}</button></div>{error && <p role="alert" className="validation session-error">{translate(error)}</p>}</div>{admin ? <Administration key={profile.tenant_id || 'platform'} profile={profile} onRefresh={async () => setProfile(await api.get('/auth/me'))}/> : profile.tenant_id && profile.permissions.includes('transactions.read') ? <App organization={activeOrganization} user={profile.user} key={profile.tenant_id} permissions={profile.permissions}/> : <main className="auth-page"><div className="auth-card"><h1>{profile.tenant_id ? translate("Administration only") : translate("Select an organization")}</h1><p>{profile.tenant_id ? translate("Your role gives access to Administration only. Use the Administration button above.") : profile.tenants.length ? translate("Choose an organization using the selector above.") : translate("Ask for a membership, or create an organization from Administration.")}</p></div></main>}</>
}
