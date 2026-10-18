import { t as translate, useLocale } from './i18n'
import { useEffect, useState } from 'react'

// One guard covers navigation, organization changes and dismissing edited forms.
export default function Usability() {
  useLocale()
  const [help, setHelp] = useState(false)
  useEffect(() => {
    const dirty = new Set()
    const changed = event => { const form = event.target.closest('form'); if (form && !form.closest('.auth-page')) dirty.add(form) }
    const pending = () => [...dirty].some(form => form.isConnected)
    window.fraudlensCanLeave = () => !pending() || window.confirm(translate("Discard unsaved changes? Your draft has not been saved."))
    const leave = event => { if (pending()) { event.preventDefault(); event.returnValue = '' } }
    const click = event => {
      const target = event.target.closest('button,a,select,tr[tabindex]')
      if (!target || !pending()) return
      const leaving = !target.matches('[data-keep-draft]') && (target.matches('a[href^="#"],.session-bar button,tr[tabindex]') || /^(Cancel|Close|Back|Cancelar|Cerrar|Volver)/i.test(target.textContent.trim() || target.getAttribute('aria-label') || ''))
      if (leaving && !window.confirm(translate("Discard unsaved changes? Your draft has not been saved."))) { event.preventDefault(); event.stopPropagation() }
      else if (leaving) dirty.clear()
    }
    const saved = event => { if (event.detail) dirty.delete(event.detail); else [...dirty].filter(form => !form.isConnected).forEach(form => dirty.delete(form)) }
    const showHelp = () => setHelp(true)
    window.addEventListener('fraudlens:help', showHelp)
    document.addEventListener('input', changed)
    document.addEventListener('click', click, true)
    window.addEventListener('beforeunload', leave)
    window.addEventListener('fraudlens:saved', saved)
    // Focus the first editable control and keep keyboard focus inside modal surfaces.
    const key = event => {
      const modal = document.querySelector('.modal-layer .modal')
      if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { const search = document.querySelector('.search input'); if (search && !modal) { event.preventDefault(); search.focus() } }
      if (!modal) return
      if (event.key === 'Escape') { event.preventDefault(); modal.querySelector('.modal-header button, .detail-top button')?.click() }
      if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button,input,select,textarea,a[href]')].filter(el => !el.disabled && el.getClientRects().length)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
      }
    }
    let previous, lastModal
    const observer = new MutationObserver(() => {
      const modal = document.querySelector('.modal-layer .modal')
      if (modal && modal !== lastModal) { previous = document.activeElement; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', modal.querySelector('h2')?.textContent || translate("Dialog")); modal.querySelector('input,button')?.focus() }
      if (!modal && lastModal) previous?.isConnected && previous.focus()
      lastModal = modal
    })
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('keydown', key)
    return () => { window.removeEventListener('fraudlens:help', showHelp); delete window.fraudlensCanLeave; observer.disconnect(); document.removeEventListener('keydown', key); document.removeEventListener('input', changed); document.removeEventListener('click', click, true); window.removeEventListener('beforeunload', leave); window.removeEventListener('fraudlens:saved', saved) }
  }, [])
  return <>{help && <div className="modal-layer" onClick={event => { if (event.target === event.currentTarget) setHelp(false) }}><section className="modal"><div className="modal-header"><div><p className="eyebrow">{translate("Help")}</p><h2>{translate("Using FraudLens")}</h2></div><button type="button" data-keep-draft className="btn" aria-label={translate("Close")} onClick={() => setHelp(false)}>{translate("Close")}</button></div><p>{translate("Check the active organization before creating or reviewing a transaction. Organization changes show a different set of data and permissions.")}</p><p>{translate("Automatic recommendations and human reviews are recorded separately. A risk score is an indicator, not a probability of fraud.")}</p><p>{translate("Filter transactions by decision or risk. Press / to search, Tab to move between controls and Escape to close a dialog.")}</p><p>{translate("Record the evidence behind a review. You can correct a review by recording a new one; the history remains available.")}</p><p>{translate("If a request fails, your entered values remain available. Check the error and retry. Contact your organization administrator for access changes.")}</p></section></div>}</>
}
