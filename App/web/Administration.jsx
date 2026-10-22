import { t as translate, getLocale } from './i18n'
import { useEffect, useState } from 'react'
import { Copy, FileSpreadsheet, FileText, Pencil, Plus, Search } from 'lucide-react'
import { api } from './api'

const actionLabel = { read: 'View', create: 'Create', update: 'Edit', review: 'Review', revoke: 'Revoke' }
const resourceLabel = { api_clients: 'API integrations', dashboard: 'dashboard', transactions: 'transactions', settings: 'organization settings', users: 'members', roles: 'roles', alerts: 'alerts', audit: 'audit records' }
const permissionLabel = permission => { const [resource, action] = permission.split('.'); return `${translate(actionLabel[action] || action)} ${translate(resourceLabel[resource] || resource)}` }

function Section({ title, description, children }) {
  return <section className="content-card admin-section"><header><h2>{translate(title)}</h2>{description && <p className="hint">{translate(description)}</p>}</header>{children}</section>
}
function Status({ value }) { return <span className={`status-pill ${value === 'active' ? 'active' : ''}`}>{translate(value)}</span> }
function Empty({ children }) { return <p className="admin-empty">{children}</p> }
const historyDetail = h => [h.metadata?.email || h.metadata?.name || h.metadata?.before?.name, h.metadata?.changes?.role && translate(h.metadata.changes.role), h.metadata?.role && translate(h.metadata.role), h.metadata?.format?.toUpperCase()].filter(Boolean).join(' · ')
function History({ entries, tenants = [] }) {
  const tenantName = id => tenants.find(t => t.id === id)?.name
  return <><ul className="admin-list">{entries.map(h => <li key={h.id}><div className="admin-item"><strong>{translate(h.action)}{historyDetail(h) && <> · {historyDetail(h)}</>}</strong><small>{new Date(h.createdAt).toLocaleString(getLocale())} · {translate(h.actor)} ({translate(h.actorRole)}){tenantName(h.tenantId) && <> · {tenantName(h.tenantId)}</>}</small></div></li>)}</ul>
    {!entries.length && <Empty>{translate("No history yet.")}</Empty>}</>
}

export default function Administration({ profile, onRefresh }) {
  const [roles, setRoles] = useState([]), [users, setUsers] = useState([]), [clients, setClients] = useState([]), [tenants, setTenants] = useState([]), [audit, setAudit] = useState([]), [models, setModels] = useState([]), [alerts, setAlerts] = useState([]), [report, setReport] = useState(null), [platformHistory, setPlatformHistory] = useState([]), [memberHistory, setMemberHistory] = useState([])
  const [error, setError] = useState(''), [secret, setSecret] = useState(''), [copied, setCopied] = useState(false), [busy, setBusy] = useState(false)
  const can = p => profile.permissions.includes(p)
  const platform = profile.user.platformRoles.some(r => r.role === 'SUPER_ADMIN')
  async function load() {
    const tasks = []
    if (can('roles.read')) tasks.push(api.get('/roles').then(setRoles))
    if (can('users.read')) tasks.push(api.get('/users').then(setUsers))
    if (can('api_clients.read')) tasks.push(api.get('/api-clients').then(setClients))
    if (can('audit.read')) tasks.push(api.get('/settings/thresholds/audit').then(setAudit))
    if (can('settings.read')) tasks.push(api.get('/models').then(setModels))
    if (can('alerts.read')) tasks.push(api.get('/alerts').then(setAlerts))
    if (can('users.read') && can('audit.read')) tasks.push(api.get('/users/history').then(setMemberHistory))
    if (platform) tasks.push(api.get('/platform/tenants').then(setTenants), api.get('/platform/history').then(setPlatformHistory))
    await Promise.all(tasks)
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [])
  async function submit(event, action) {
    event.preventDefault(); setBusy(true); setError('')
    const form = event.currentTarget, data = Object.fromEntries(new FormData(form)); data.permissions = new FormData(form).getAll('permission-choice').join(',')
    try { await action(data); window.dispatchEvent(new CustomEvent('fraudlens:saved', { detail: form })); form.reset(); await load(); await onRefresh() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function mutate(action) { setBusy(true); setError(''); try { await action(); await load() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  async function copySecret() { try { await navigator.clipboard.writeText(secret); setCopied(true) } catch { setCopied(false) } }
  // Only the platform Administrator grants the organization admin role or manages organization admins.
  const assignableRoles = roles.filter(r => platform || r.name !== 'TENANT_ADMIN')
  const canManage = m => m.user.id !== profile.user.id && (platform || m.role.name !== 'TENANT_ADMIN')
  async function consultReport() { await mutate(async () => { setReport(await api.get('/platform/report/tenants')); setPlatformHistory(await api.get('/platform/history')) }) }
  async function download(format) { await mutate(async () => { await api.download(`/platform/report/tenants?format=${format}`, `organizaciones-${new Date().toISOString().slice(0, 10)}.${format}`); setPlatformHistory(await api.get('/platform/history')) }) }
  const roleSelect = <label className="field">{translate("Role")}<select name="role_id" required defaultValue=""><option value="" disabled>{translate("Select a role")}</option>{assignableRoles.map(r => <option key={r.id} value={r.id}>{translate(r.name)}</option>)}</select></label>
  return <main className="administration"><header><div><p className="eyebrow">{translate("Active organization settings")}</p><h1>{translate("Administration")}</h1></div></header>{error && <p role="alert" className="api-error" style={{ marginTop: 20 }}>{translate(error)}</p>}
    {platform && <Section title={translate("Platform organizations")} description={translate("Create organizations and control whether their members can sign in.")}>
      <form className="admin-form" onSubmit={e => submit(e, data => api.post('/platform/tenants', data))}><label className="field">{translate("Name")}<input name="name" required minLength={2}/></label><label className="field">{translate("Identifier")}<input name="slug" placeholder={translate("lowercase-with-dashes")} required pattern="[a-z0-9]+(-[a-z0-9]+)*" title={translate("Lowercase letters, numbers and dashes")}/></label><button className="btn btn-primary" disabled={busy}><Plus size={18} aria-hidden="true"/> {translate("Create organization")}</button></form>
      <ul className="admin-list">{tenants.map(t => <li key={t.id}><div className="admin-item"><strong>{t.name}</strong><small><Status value={t.status}/></small></div><div className="admin-actions"><button type="button" className="btn" disabled={busy} onClick={() => { const name = window.prompt(translate("New name for {0}", [t.name]), t.name)?.trim(); if (name && name !== t.name) mutate(async () => { await api.put(`/platform/tenants/${t.id}`, { name }); await onRefresh() }) }}><Pencil size={18} aria-hidden="true"/> {translate("Rename")}</button><button type="button" className={`btn ${t.status === 'active' ? 'btn-danger' : ''}`} disabled={busy} onClick={() => { if (window.confirm(translate("{0} {1}? This changes access for all its members.", [t.status === 'active' ? translate("Suspend") : translate("Activate"), t.name]))) mutate(async () => { await api.put(`/platform/tenants/${t.id}`, { status: t.status === 'active' ? 'suspended' : 'active' }); await onRefresh() }) }}>{t.status === 'active' ? translate("Suspend") : translate("Activate")}</button></div></li>)}</ul>
      {!tenants.length && <Empty>{translate("No organizations yet.")}</Empty>}
    </Section>}
    {platform && <Section title={translate("Organization admins")} description={translate("Create the admin of an organization, or give that role to an existing user. To edit or deactivate an admin, select the organization and use its member list.")}>
      <form className="admin-form" onSubmit={e => submit(e, ({ tenant_id, name, email, password }) => api.post(`/platform/tenants/${tenant_id}/admins`, { email, ...(name ? { name } : {}), ...(password ? { password } : {}) }))}><label className="field">{translate("Organization")}<select name="tenant_id" required defaultValue=""><option value="" disabled>{translate("Select organization")}</option>{tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="field">{translate("Email")}<input name="email" type="email" required autoComplete="off"/></label><label className="field">{translate("Name (new users)")}<input name="name" minLength={2} autoComplete="off"/></label><label className="field">{translate("Initial password (new users, min. 12 characters)")}<input name="password" type="password" minLength={12} autoComplete="new-password"/></label><button className="btn btn-primary" disabled={busy || !tenants.length}><Plus size={18} aria-hidden="true"/> {translate("Create organization admin")}</button></form>
    </Section>}
    {platform && <Section title={translate("Organizations report")} description={translate("All organizations and their admins. Every query and download is recorded in the history.")}>
      <div className="admin-actions btn-group"><button type="button" className="btn btn-primary" disabled={busy} onClick={consultReport}><Search size={18} aria-hidden="true"/> {translate("Consult report")}</button><button type="button" className="btn" disabled={busy} onClick={() => download('xlsx')}><FileSpreadsheet size={18} aria-hidden="true"/> {translate("Download Excel")}</button><button type="button" className="btn" disabled={busy} onClick={() => download('txt')}><FileText size={18} aria-hidden="true"/> {translate("Download TXT")}</button></div>
      {report && <ul className="admin-list">{report.map(t => <li key={t.id}><div className="admin-item"><strong>{t.name} <small className="mono">{t.slug}</small></strong><small><Status value={t.status}/> · {t.admins.length ? t.admins.map(a => `${a.name} <${a.email}>${a.status === 'active' ? '' : ` (${translate(a.status)})`}`).join(', ') : translate("No admin assigned")}</small></div></li>)}</ul>}
      {report && !report.length && <Empty>{translate("No organizations yet.")}</Empty>}
    </Section>}
    {platform && <Section title={translate("Organizations and users history")} description={translate("Creations, changes and deactivations of organizations and users, and report queries, newest first.")}>
      <History entries={platformHistory} tenants={tenants}/>
    </Section>}
    {can('users.read') && <Section title={translate("Organization members")} description={translate("People who can sign in to this organization and the role each one has.")}>
      {can('users.create') && <><form className="admin-form" onSubmit={e => submit(e, data => api.post('/users', data))}><label className="field">{translate("Name")}<input name="name" required minLength={2} autoComplete="off"/></label><label className="field">{translate("Email")}<input name="email" type="email" required autoComplete="off"/></label><label className="field">{translate("Initial password (min. 12 characters)")}<input name="password" type="password" required minLength={12} autoComplete="new-password"/></label>{roleSelect}<button className="btn btn-primary" disabled={busy}><Plus size={18} aria-hidden="true"/> {translate("Create user")}</button></form>
        <form className="admin-form" onSubmit={e => submit(e, data => api.post('/memberships', data))}><label className="field">{translate("Existing user email")}<input name="email" type="email" required/></label>{roleSelect}<button className="btn btn-primary" disabled={busy}><Plus size={18} aria-hidden="true"/> {translate("Add member")}</button></form></>}
      <ul className="admin-list">{users.map(m => <li key={m.id}><div className="admin-item"><strong>{m.user.name}</strong><small>{m.user.email} · {translate(m.role.name)} · <Status value={m.status}/></small></div>{can('users.update') && canManage(m) && <div className="admin-actions"><select className="control" aria-label={translate("Role of {0}", [m.user.name])} disabled={busy} value={m.role.id} onChange={e => mutate(() => api.put(`/memberships/${m.user.id}`, { role_id: e.target.value }))}>{assignableRoles.map(r => <option key={r.id} value={r.id}>{translate(r.name)}</option>)}</select><button type="button" className={`btn ${m.status === 'active' ? 'btn-danger' : ''}`} disabled={busy} onClick={() => { if (window.confirm(translate("{0} {1} in this organization?", [m.status === 'active' ? translate("Deactivate") : translate("Activate"), m.user.name]))) mutate(() => api.put(`/memberships/${m.user.id}`, { status: m.status === 'active' ? 'disabled' : 'active' })) }}>{m.status === 'active' ? translate("Deactivate") : translate("Activate")}</button></div>}</li>)}</ul>
      {!users.length && <Empty>{translate("No members yet.")}</Empty>}
    </Section>}
    {can('users.read') && can('audit.read') && <Section title={translate("Members history")} description={translate("Who created, changed or deactivated members of this organization, newest first.")}>
      <History entries={memberHistory}/>
    </Section>}
    {can('api_clients.read') && <Section title={translate("API integrations")} description={translate("Credentials that let other systems send transactions to this organization.")}>
      {can('api_clients.create') && <form className="admin-form" onSubmit={e => submit(e, async data => { const result = await api.post('/api-clients', { name: data.name, permissions: ['transactions.create', 'transactions.read'] }); setSecret(result.secret); setCopied(false) })}><label className="field">{translate("Integration name")}<input name="name" required minLength={2}/></label><button className="btn btn-primary" disabled={busy}><Plus size={18} aria-hidden="true"/> {translate("Create credential")}</button></form>}
      {secret && <div role="status" className="secret-box"><p><strong>{translate("Save this credential securely.")}</strong> {translate("It is shown only once.")}</p><code>{secret}</code><div className="admin-actions"><button type="button" className="btn btn-primary" onClick={copySecret}><Copy size={18} aria-hidden="true"/> {copied ? translate("Copied") : translate("Copy")}</button><button type="button" className="btn" onClick={() => setSecret('')}>{translate("Hide")}</button></div></div>}
      <ul className="admin-list">{clients.map(c => <li key={c.id}><div className="admin-item"><strong>{c.name}</strong><small><Status value={c.status}/></small></div>{can('api_clients.revoke') && c.status === 'active' && <div className="admin-actions"><button type="button" className="btn btn-danger" disabled={busy} onClick={() => { if (window.confirm(translate("Revoke {0}? This integration will lose access to this organization.", [c.name]))) mutate(() => api.put(`/api-clients/${c.id}/revoke`, {})) }}>{translate("Revoke")}</button></div>}</li>)}</ul>
      {!clients.length && <Empty>{translate("No integrations yet.")}</Empty>}
    </Section>}
    {can('roles.create') && <Section title={translate("Custom roles")} description={translate("Create a role and choose what its members can do in the active organization.")}>
      <form className="admin-form" onSubmit={e => submit(e, data => api.post('/roles', { name: data.name, permissions: data.permissions.split(',').filter(Boolean) }))}><label className="field">{translate("Role name")}<input name="name" required minLength={2}/></label><fieldset className="permission-grid"><legend>{translate("Allowed actions")}</legend><p className="hint">{translate("Only actions you already have can be granted.")}</p>{profile.permissions.map(permission => <label className="check" key={permission}><input type="checkbox" name="permission-choice" value={permission}/><span>{permissionLabel(permission)}</span></label>)}</fieldset><button className="btn btn-primary" disabled={busy}><Plus size={18} aria-hidden="true"/> {translate("Create role")}</button></form>
    </Section>}
    {can('settings.update') && <Section title={translate("Scoring model")} description={translate("Model used to score new transactions in this organization.")}>
      <form className="admin-form" onSubmit={e => submit(e, data => api.put('/settings/model', data))}><label className="field">{translate("Model")}<select required name="model_id" defaultValue=""><option value="" disabled>{translate("Select a model")}</option>{models.map(m => <option key={m.id} value={m.id}>{m.name} · {m.version}</option>)}</select></label><button className="btn btn-primary" disabled={busy}>{translate("Apply to this organization")}</button></form>
    </Section>}
    {can('alerts.read') && <Section title={translate("Alerts")}>
      <ul className="admin-list">{alerts.map(a => <li key={a.id}><div className="admin-item"><strong className="mono">{a.transaction.externalId}</strong><small>{translate(a.severity)} · {translate(a.status)}</small></div>{can('alerts.update') && a.status !== 'resolved' && <div className="admin-actions"><button type="button" className="btn" disabled={busy} onClick={() => { if (window.confirm(translate("Mark the alert for {0} as resolved?", [a.transaction.externalId]))) mutate(() => api.put(`/alerts/${a.id}`, { status: 'resolved' })) }}>{translate("Resolve")}</button></div>}</li>)}</ul>
      {!alerts.length && <Empty>{translate("No alerts in this organization.")}</Empty>}
    </Section>}
    {can('audit.read') && <Section title={translate("Audit")} description={translate("Changes to rules and thresholds, newest first.")}>
      <ul className="admin-list">{audit.map(a => <li key={a.id}><div className="admin-item"><strong>{translate(a.action)}</strong><small>{new Date(a.createdAt).toLocaleString(getLocale())} · {a.actor}</small></div></li>)}</ul>
      {!audit.length && <Empty>{translate("No audit records yet.")}</Empty>}
    </Section>}
  </main>
}
