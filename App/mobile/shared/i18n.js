import systemLabels from './system-labels.json'
import serverMessages from './server-messages.json'
import spanish from './es-419.json'
export const languages = [
  { tag: 'en-US', label: 'Inglés (Estados Unidos)' },
  { tag: 'es-419', label: 'Español (Latinoamérica)' },
]
export const normalizeLocale = value => languages.find(item => item.tag.toLowerCase() === String(value).toLowerCase())?.tag || 'es-419'
let locale = 'es-419'
const listeners = new Set()
export const getLocale = () => locale
export const subscribe = callback => { listeners.add(callback); return () => listeners.delete(callback) }
export function setLocale(value) {
  const next = normalizeLocale(value)
  if (next !== locale) { locale = next; listeners.forEach(callback => callback()) }
}
export function t(message, values = {}) {
  if (typeof message !== 'string') return message
  message = systemLabels[message] ?? message
  if (serverMessages[message]) return locale === 'en-US' ? serverMessages[message] : message
  const validation = message.match(/^(\w+) (must be an email|should not be empty|must be a string|must be a positive number|must be a number conforming to the specified constraints|must be a UUID)$/)
  if (validation) return t('{0} ' + validation[2], [t({email:'Email', password:'Password', amount:'Amount', comment:'Evidence / comment', analyst:'Analyst', name:'Name'}[validation[1]] || validation[1])])
  const length = message.match(/^(\w+) must be (longer|shorter) than or equal to (\d+) characters$/)
  if (length) return t('{0} must be ' + length[2] + ' than or equal to {1} characters', [t({password:'Password', comment:'Evidence / comment', name:'Name'}[length[1]] || length[1]), length[3]])
  const rules = [
    [/^No existe una transaccion con id (.+)$/, 'Transaction {0} does not exist'],
    [/^No existe un caso para la transaccion (.+)$/, 'No case exists for transaction {0}'],
    [/^Historial insuficiente \(solo (1) operacion previa\)$/, 'Insufficient history ({0} previous transaction)'],
    [/^Historial insuficiente \(solo (\d+) operaciones previas\)$/, 'Insufficient history ({0} previous transactions)'],
    [/^Patron estadisticamente atipico \(distancia (.+)\)$/, 'Statistically unusual pattern (distance {0})'],
    [/^Transferencia superior al limite de control \((.+)\)$/, 'Transfer above the control limit ({0})'],
  ]
  for (const [pattern, english] of rules) {
    const match = message.match(pattern)
    if (match) return locale === 'en-US' ? english.replace(/\{(\d+)\}/g, (_, key) => match[Number(key) + 1]) : message
  }
  if (!spanish[message] && message.includes(' · ')) return message.split(' · ').map(part => t(part, values)).join(' · ')
  const translated = locale === 'es-419' ? spanish[message] ?? message : message
  return translated.replace(/\{(\d+)\}/g, (match, key) => String(values[key] ?? match))
}
