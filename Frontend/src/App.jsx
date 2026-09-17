import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, CircleCheck, Circle, Diamond, Moon, Sun, Filter, LayoutDashboard, LoaderCircle, Plus, Search, Settings, ShieldAlert, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { api } from './api'

const PAGE_SIZE = 10
const decisionLabel = { aprobar: 'Approve', revisar: 'Review', bloquear: 'Block' }
const levelLabel = { bajo: 'Low', medio: 'Medium', alto: 'High', critico: 'Critical' }
const levelTone = { bajo: 'low', medio: 'medium', alto: 'high', critico: 'critical' }
const money = (n, currency = 'ARS') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
const formatDate = value => new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
function Badge({ children, tone }) {
  const Icon = { low: CircleCheck, medium: AlertTriangle, high: Diamond, critical: Circle, aprobar: CircleCheck, revisar: AlertTriangle, bloquear: ShieldAlert }[tone]
  return <span className={`badge ${tone}`}>{Icon && <Icon size={12} aria-hidden="true" fill={tone === 'critical' ? 'currentColor' : 'none'}/>} {children}</span>
}
function Brand() { return <div className="brand"><span className="brand-symbol" aria-hidden="true"/><span>Fraud<span>Lens</span></span></div> }


export default function App() {
  const [view, setView] = useState(() => window.location.hash === '#transactions' ? 'transactions' : 'dashboard')
  useEffect(() => {
    const navigate = () => { setView(window.location.hash === '#transactions' ? 'transactions' : 'dashboard'); setSelectedId(null); setSelected(null) }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const [settingsError, setSettingsError] = useState('')
  const [theme, setTheme] = useState(() => {
    try { const saved = localStorage.getItem('fraudlens-theme'); if (saved === 'light' || saved === 'dark') return saved } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0D0D10' : '#FAFAFA'
    try { localStorage.setItem('fraudlens-theme', theme) } catch {}
  }, [theme])
  const [items, setItems] = useState([]), [metrics, setMetrics] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 })
  const [selectedId, setSelectedId] = useState(null), [selected, setSelected] = useState(null)
  const [showSettings, setShowSettings] = useState(false), [thresholds, setThresholds] = useState(null), [showCreate, setShowCreate] = useState(false), [created, setCreated] = useState(null)
  const [query, setQuery] = useState(''), [decision, setDecision] = useState(''), [riskLevel, setRiskLevel] = useState('')
  const [sort, setSort] = useState('date'), [order, setOrder] = useState('desc'), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const load = useCallback(async (page = pagination.page) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort, order })
      if (query.trim()) params.set('transaction_id', query.trim())
      if (decision) params.set('decision', decision)
      if (riskLevel) params.set('risk_level', riskLevel)
      const [list, nextMetrics] = await Promise.all([api.get(`/transactions?${params}`), api.get('/dashboard/metrics')])
      setItems(list.data); setPagination(list.pagination); setMetrics(nextMetrics)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [query, decision, riskLevel, sort, order, pagination.page])
  useEffect(() => { const timeout = setTimeout(() => load(1), query ? 350 : 0); return () => clearTimeout(timeout) }, [query, decision, riskLevel, sort, order])
  useEffect(() => { const interval = setInterval(() => load(), 15000); return () => clearInterval(interval) }, [load])
  async function openDetail(id) { setSelectedId(id); setSelected(null); try { setSelected(await api.get(`/transactions/${encodeURIComponent(id)}`)) } catch (err) { setError(err.message); setSelectedId(null) } }
  async function openSettings() { setShowSettings(true); setThresholds(null); setSettingsError(''); try { setThresholds(await api.get('/settings/thresholds')) } catch (err) { setSettingsError(err.message) } }
  async function saveSettings(values) { const response = await api.put('/settings/thresholds', { min_amount_enabled: values.minAmountEnabled, min_amount: Number(values.minAmount), review_threshold: Number(values.reviewThreshold), block_threshold: Number(values.blockThreshold) }); setThresholds(response) }
  async function createTransaction(payload) { const result = await api.post('/transactions', payload); setCreated(result); setShowCreate(false); await load(1) }
  const toggleSort = field => { if (sort === field) setOrder(v => v === 'desc' ? 'asc' : 'desc'); else { setSort(field); setOrder('desc') } }
  function exportVisibleTransactions() {
    if (!items.length) return
    const columns = ['transaction_id', 'user_id', 'timestamp', 'amount', 'currency', 'merchant', 'risk_score', 'risk_level', 'decision', 'status']
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csv = [columns.join(';'), ...items.map(transaction => columns.map(column => escape(transaction[column])).join(';'))].join('\n')
    const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fraudlens-transacciones-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  return <div className="app-shell">
    <aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-dot"/> Production</div><nav aria-label="Main navigation"><a className={view === 'dashboard' ? 'nav-active' : ''} aria-current={view === 'dashboard' ? 'page' : undefined} href="#dashboard"><LayoutDashboard size={18}/> Dashboard</a><a className={view === 'transactions' ? 'nav-active' : ''} aria-current={view === 'transactions' ? 'page' : undefined} href="#transactions"><Clock3 size={18}/> Transactions</a><button aria-haspopup="dialog" aria-expanded={showSettings} onClick={openSettings}><SlidersHorizontal size={18}/> Rules & thresholds</button></nav><div className="sidebar-bottom"><div className="profile"><div className="avatar">FG</div><div><strong>Francisco Guerrero</strong><small>Analyst</small></div></div></div></aside>
    <main id={view}><header><div><p className="eyebrow">REAL-TIME MONITORING</p><h1>{view === 'transactions' ? 'Transactions' : 'Dashboard'}</h1></div><div className="header-actions"><button className="new-transaction" onClick={() => setShowCreate(true)}><Plus size={17}/> New transaction</button><button className="icon-button" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>{theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button><button className="export" onClick={exportVisibleTransactions} disabled={!items.length}><ArrowDownToLine size={17}/> Export</button><button className="settings-trigger" aria-haspopup="dialog" aria-expanded={showSettings} onClick={openSettings}><Settings size={17}/> Configure rules</button></div></header>
      {error && <div className="api-error"><AlertTriangle size={17}/><span>{error}</span><button onClick={() => load(1)}>Retry</button></div>}
      {created && <div className="api-success"><Check size={17}/><span><b>{created.transaction_id}</b> created: {created.decision === 'bloquear' ? 'Block' : created.decision === 'revisar' ? 'Review' : 'Approve'}{created.risk_score !== null ? ` · Risk ${created.risk_score}/100` : ' · Not evaluated by the model'}</span><button aria-label="Dismiss notification" onClick={() => setCreated(null)}><X size={15}/></button></div>}
      {view === 'dashboard' && <section className="metrics"><Metric label="Transactions today" value={metrics?.transactions_today?.toLocaleString('en-US') ?? '—'} hint="Since midnight" icon={<Clock3/>} tone="blue"/><Metric label="High & critical risk" value={metrics?.high_critical_count ?? '—'} hint={metrics ? `${metrics.high_critical_pct}% of total` : ''} icon={<AlertTriangle/>} tone="amber"/><Metric label="Blocked" value={metrics?.blocked_count ?? '—'} hint={metrics ? `${metrics.blocked_pct}% of total` : ''} icon={<ShieldAlert/>} tone="red"/><Metric label="Average risk score" value={metrics?.avg_risk_score ?? '—'} hint="Evaluated transactions only" icon={<ShieldCheck/>} tone="green"/></section>}
      <section className="content-card"><div className="card-heading"><div><h2>{view === 'transactions' ? 'All transactions' : 'Recent transactions'}</h2><p>Refreshes every 15 seconds <span className="live"><i/> Live</span></p></div><button className="text-button" onClick={() => load(1)} disabled={loading}>{loading ? <LoaderCircle className="spin" size={16}/> : 'Refresh'}</button></div>
        <div className="filters"><label className="search"><Search size={18}/><input aria-label="Search by transaction ID" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by transaction ID"/></label><label className="filter-select"><Filter size={16}/><select aria-label="Filter by decision" value={decision} onChange={e => setDecision(e.target.value)}><option value="">All decisions</option><option value="aprobar">Approve</option><option value="revisar">Review</option><option value="bloquear">Block</option></select></label><label className="filter-select"><SlidersHorizontal size={16}/><select aria-label="Filter by risk level" value={riskLevel} onChange={e => setRiskLevel(e.target.value)}><option value="">All risk levels</option><option value="bajo">Low</option><option value="medio">Medium</option><option value="alto">High</option><option value="critico">Critical</option><option value="no_evaluado">Not evaluated</option></select></label></div>
        <TransactionsTable items={items} loading={loading} selectedId={selectedId} onSelect={openDetail} sort={sort} order={order} toggleSort={toggleSort}/><footer className="pagination"><span>Showing <b>{items.length}</b> of <b>{pagination.total}</b> transactions</span><div><button aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}><ChevronLeft size={16}/></button><button className="page-active">{pagination.page}</button><span> of {pagination.total_pages}</span><button aria-label="Next page" disabled={pagination.page >= pagination.total_pages} onClick={() => load(pagination.page + 1)}><ChevronRight size={16}/></button></div></footer></section>
    </main>{selectedId && <TransactionPanel key={selectedId} onReviewed={setSelected} transaction={selected} onClose={() => { setSelectedId(null); setSelected(null) }}/>} {showSettings && <SettingsModal loadError={settingsError} onRetry={openSettings} values={thresholds} onSave={saveSettings} onClose={() => setShowSettings(false)}/>} {showCreate && <CreateTransactionModal onSave={createTransaction} onClose={() => setShowCreate(false)}/>}</div>
}
function Metric({ label, value, hint, icon, tone }) { return <article className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><p>{label}</p><strong>{value}</strong><small>{hint}</small></article> }
function TransactionsTable({ items, loading, selectedId, onSelect, sort, order, toggleSort }) { return <div className="table-wrap"><table><thead><tr><th>TRANSACTION</th><th className="sortable" onClick={() => toggleSort('date')}>DATE & TIME {sort === 'date' && <ChevronDown className={order === 'asc' ? 'upside-down' : ''} size={13}/>}</th><th>AMOUNT</th><th className="sortable" onClick={() => toggleSort('risk')}>RISK {sort === 'risk' && <ChevronDown className={order === 'asc' ? 'upside-down' : ''} size={13}/>}</th><th>DECISION</th><th>STATUS</th><th/></tr></thead><tbody>{items.map(t => <TransactionRow key={t.transaction_id} transaction={t} active={selectedId === t.transaction_id} onClick={() => onSelect(t.transaction_id)}/>)}</tbody></table>{loading && <div className="loading"><LoaderCircle className="spin" size={20}/> Loading transactions…</div>}{!loading && !items.length && <div className="empty">No transactions match these filters.</div>}</div> }
function TransactionRow({ transaction: t, active, onClick }) { const tone = levelTone[t.risk_level]; return <tr tabIndex={0} aria-label={`View transaction ${t.transaction_id}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick() } }} onClick={onClick} className={active ? 'selected-row' : ''}><td><strong>{t.transaction_id}</strong><small>{t.user_id}</small></td><td>{formatDate(t.timestamp)}</td><td><strong>{money(t.amount, t.currency)}</strong><small>{t.merchant}</small></td><td>{t.risk_score === null ? <span className="not-evaluated">Not evaluated</span> : <div className="risk"><b className={tone}>{t.risk_score}</b><Badge tone={tone}>{levelLabel[t.risk_level]}</Badge></div>}</td><td><Badge tone={t.decision}>{decisionLabel[t.decision]}</Badge></td><td><span className={`status ${t.status === 'analizada' ? 'done' : t.status === 'analisis_no_disponible' ? 'unavailable' : 'skipped'}`}><i/>{t.status === 'analizada' ? 'Analyzed' : t.status === 'no_evaluada' ? 'Not evaluated' : 'Unavailable'}</span></td><td><ChevronRight size={18} className="row-arrow"/></td></tr> }
function TransactionPanel({ transaction, onClose, onReviewed }) { if (!transaction) return <aside className="detail-panel"><div className="detail-top"><span>TRANSACTION DETAILS</span><button onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="panel-loading"><LoaderCircle className="spin"/> Loading details…</div></aside>; const tone = levelTone[transaction.risk_level], data = transaction.received_data; return <aside className="detail-panel"><div className="detail-top"><span>TRANSACTION DETAILS</span><button onClick={onClose} aria-label="Close"><X size={19}/></button></div><h2>{transaction.transaction_id}</h2><p className="detail-user">{transaction.user_id}</p><div className="detail-decision"><div><small>RECOMMENDED DECISION</small><Badge tone={transaction.decision}>{decisionLabel[transaction.decision]}</Badge></div>{transaction.risk_score !== null && <div><small>RISK SCORE</small><strong className={tone}>{transaction.risk_score}<em>/100</em></strong><Badge tone={tone}>{levelLabel[transaction.risk_level]}</Badge></div>}</div><div className="detail-section"><h3>Risk factors</h3>{transaction.factors.map(factor => <p className="reason" key={factor.code}><span>{factor.points}</span>{factor.label}</p>)}</div><div className="detail-section"><h3>Transaction data</h3><dl><div><dt>Date</dt><dd>{formatDate(data.timestamp)}</dd></div><div><dt>Amount</dt><dd>{money(data.amount, data.currency)}</dd></div><div><dt>Merchant</dt><dd>{data.merchant}</dd></div><div><dt>Location</dt><dd>{data.country}</dd></div><div><dt>Channel</dt><dd>{data.channel}</dd></div><div><dt>Applied rule</dt><dd>{transaction.rule_applied.replaceAll('_', ' ')}</dd></div><div><dt>Model analysis</dt><dd>{transaction.analyzed_by_model ? 'Completed' : 'Not performed'}</dd></div></dl></div><ReviewForm transaction={transaction} onReviewed={onReviewed}/><div className="threshold-note">Thresholds at analysis: review from {transaction.thresholds_applied.reviewThreshold}% · block from {transaction.thresholds_applied.blockThreshold}%</div></aside> }
function SettingsModal({ values, loadError, onRetry, onSave, onClose }) { const [form, setForm] = useState(values), [saving, setSaving] = useState(false), [error, setError] = useState(''); useEffect(() => setForm(values), [values]); if (!form) return <div className="modal-layer"><div className="modal modal-loader" role="dialog" aria-modal="true" aria-label="Rules & thresholds"><div className="modal-header"><h2>Rules & thresholds</h2><button type="button" onClick={onClose} aria-label="Close"><X/></button></div>{loadError ? <><p className="validation" role="alert">{loadError}</p><div className="modal-actions"><button type="button" className="cancel" onClick={onClose}>Cancel</button><button type="button" className="save" onClick={onRetry}>Retry</button></div></> : <div className="panel-loading" role="status"><LoaderCircle className="spin"/> Loading settings…</div>}</div></div>; const update = (key, value) => setForm(v => ({ ...v, [key]: value })); async function submit(e) { e.preventDefault(); setSaving(true); setError(''); try { await onSave(form); onClose() } catch (err) { setError(err.message) } finally { setSaving(false) } } return <div className="modal-layer"><form className="modal" role="dialog" aria-modal="true" aria-label="Rules & thresholds" onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">ADMINISTRATION</p><h2>Rules & thresholds</h2></div><button type="button" onClick={onClose} aria-label="Close"><X/></button></div><p className="modal-copy">Changes apply to new evaluations only.</p><label className="switch-line"><span><b>Minimum amount rule</b><small>Skip scoring for low-value transactions after checking frequency.</small></span><input type="checkbox" checked={form.minAmountEnabled} onChange={e => update('minAmountEnabled', e.target.checked)}/><i/></label><label className="field">Minimum analysis amount <span><input type="number" min="0" value={form.minAmount} onChange={e => update('minAmount', e.target.value)}/><b>ARS</b></span></label><div className="thresholds"><label className="field">Review threshold <span><input type="number" min="0" max="99" value={form.reviewThreshold} onChange={e => update('reviewThreshold', e.target.value)}/><b>%</b></span></label><label className="field">Block threshold <span><input type="number" min="1" max="100" value={form.blockThreshold} onChange={e => update('blockThreshold', e.target.value)}/><b>%</b></span></label></div>{Number(form.blockThreshold) <= Number(form.reviewThreshold) && <p className="validation">The block threshold must exceed the review threshold.</p>}{error && <p className="validation">{error}</p>}<div className="modal-actions"><button type="button" className="cancel" onClick={onClose}>Cancel</button><button disabled={saving || Number(form.blockThreshold) <= Number(form.reviewThreshold)} className="save">{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={17}/>} {saving ? 'Saving…' : 'Save changes'}</button></div></form></div> }
function CreateTransactionModal({ onSave, onClose }) {
  const [form, setForm] = useState({ transaction_id: `trx-${Date.now()}`, user_id: '', timestamp: new Date().toISOString().slice(0, 16), amount: '', currency: 'ARS', category: '', merchant: '', country: 'Argentina', channel: 'E-commerce', device_id: '' })
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const update = event => setForm(value => ({ ...value, [event.target.name]: event.target.value }))
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const payload = { ...form, timestamp: new Date(form.timestamp).toISOString(), amount: Number(form.amount) }
      if (!payload.device_id.trim()) delete payload.device_id
      await onSave(payload)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  return <div className="modal-layer"><form className="modal transaction-modal" onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">NEW EVALUATION</p><h2>New transaction</h2></div><button type="button" onClick={onClose} aria-label="Close"><X/></button></div><p className="modal-copy">Submit a transaction to evaluate its risk and receive a recommendation.</p><div className="form-grid"><FormField label="Transaction ID" name="transaction_id" value={form.transaction_id} onChange={update}/><FormField label="User ID" name="user_id" value={form.user_id} onChange={update} placeholder="usr_01A2B3"/><FormField label="Date & time" name="timestamp" type="datetime-local" value={form.timestamp} onChange={update}/><FormField label="Amount" name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={update}/><FormField label="Currency" name="currency" value={form.currency} onChange={update} maxLength="3"/><FormField label="Category" name="category" value={form.category} onChange={update} placeholder="Supermarket"/><FormField label="Merchant or recipient" name="merchant" value={form.merchant} onChange={update} placeholder="Merchant name"/><FormField label="Country" name="country" value={form.country} onChange={update}/><FormField label="Channel" name="channel" value={form.channel} onChange={update}/><FormField optional label="Device or session (optional)" name="device_id" value={form.device_id} onChange={update}/></div>{error && <p className="validation">{error}</p>}<div className="modal-actions"><button type="button" className="cancel" onClick={onClose}>Cancel</button><button disabled={saving} className="save">{saving ? <LoaderCircle className="spin" size={16}/> : <ShieldCheck size={17}/>} {saving ? 'Analyzing…' : 'Analyze transaction'}</button></div></form></div>
}
function FormField({ label, optional = false, ...input }) { return <label className="form-field">{label}<input required={!optional} {...input}/></label> }

function ReviewForm({ transaction, onReviewed }) {
  const [outcome, setOutcome] = useState('pending')
  const [analyst, setAnalyst] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const labels = { fraud: 'Confirmed fraud', legitimate: 'Legitimate', pending: 'Pending' }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = await api.put(`/transactions/${encodeURIComponent(transaction.transaction_id)}/review`, { outcome, analyst: analyst.trim(), comment: comment.trim() })
      onReviewed(result); setComment('')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  return <section className="detail-section review-section"><h3>Human review</h3><p className="modal-copy">Automatic recommendation: {decisionLabel[transaction.decision]}. Reviews are recorded separately.</p><p>Current result: <strong>{labels[transaction.review?.outcome] || 'Pending'}</strong></p><form onSubmit={submit}><label className="field">Result<select value={outcome} onChange={e => setOutcome(e.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field">Analyst<input required minLength={2} maxLength={100} value={analyst} onChange={e => setAnalyst(e.target.value)}/></label><label className="field">Evidence / comment<textarea required minLength={3} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></label>{error && <p role="alert" className="validation">{error}</p>}<div className="modal-actions"><button className="save" disabled={saving}>{saving ? 'Saving…' : 'Record review'}</button></div></form><details><summary>Review history ({transaction.review_history?.length || 0})</summary>{transaction.review_history?.map(review => <article key={review.id}><strong>{labels[review.outcome]}</strong><small>{review.analyst} · {formatDate(review.createdAt)}</small><p>{review.comment}</p></article>)}</details></section>
}
