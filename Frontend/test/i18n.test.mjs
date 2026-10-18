import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
// Load the exact shared module with JSON embedded; Node, Vite and Metro have different JSON import requirements.
const moduleUrl = new URL('../mobile/shared/i18n.js', import.meta.url)
let source = await readFile(moduleUrl, 'utf8')
for (const name of ['spanish', 'serverMessages', 'systemLabels']) {
  const pattern = new RegExp(`import ${name} from '([^']+)'`)
  const [, path] = source.match(pattern)
  source = source.replace(pattern, `const ${name} = ${await readFile(new URL(path, moduleUrl), 'utf8')}`)
}
const { t, languages, setLocale, getLocale, normalizeLocale, subscribe } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('BCP 47 tags match the language options and unsupported values fall back', () => {
  assert.deepEqual(languages.map(l => l.tag), ['en-US', 'es-419'])
  for (const {tag} of languages) assert.equal(Intl.getCanonicalLocales(tag)[0], tag)
  assert.equal(normalizeLocale('EN-us'), 'en-US')
  assert.equal(normalizeLocale('es-US'), 'es-419')
  assert.equal(normalizeLocale(null), 'es-419')
})
test('switching updates subscribers and both translation directions', () => {
  setLocale('es-419')
  let changes = 0
  const unsubscribe = subscribe(() => changes++)
  assert.equal(t('Sign in'), 'Iniciar sesión')
  setLocale('en-US')
  assert.equal(getLocale(), 'en-US')
  assert.equal(t('Sign in'), 'Sign in')
  assert.equal(t('Credenciales inválidas'), 'Invalid credentials')
  setLocale('en-US')
  assert.equal(changes, 1)
  unsubscribe()
  setLocale('es-419')
  assert.equal(changes, 1)
})
test('interpolated messages, system codes, backend reasons and unknown data', () => {
  setLocale('es-419')
  assert.equal(t('Updated {0}', ['10:30']), 'Actualizado 10:30')
  assert.equal(t('umbral_bloqueo'), 'Umbral de bloqueo')
  assert.equal(t('Merchant supplied by user'), 'Merchant supplied by user')
  assert.equal(t(42), 42)
  setLocale('en-US')
  assert.equal(t('umbral_bloqueo'), 'Block threshold')
  assert.equal(t('Historial insuficiente (solo 1 operacion previa)'), 'Insufficient history (1 previous transaction)')
  assert.equal(t('No existe una transaccion con id tx_123'), 'Transaction tx_123 does not exist')
  assert.equal(t('Patron estadisticamente atipico (distancia 2.30)'), 'Statistically unusual pattern (distance 2.30)')
  assert.equal(t('Credenciales inválidas · Sesión vencida'), 'Invalid credentials · Session expired')
})
