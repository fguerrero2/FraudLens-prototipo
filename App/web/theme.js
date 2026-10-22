export function getInitialTheme() {
  try {
    const saved = window.localStorage.getItem('fraudlens-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* Storage may be unavailable in private browsing. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'dark' ? '#0D0D10' : '#FAFAFA'
  try { window.localStorage.setItem('fraudlens-theme', theme) } catch { /* Theme still works without persistence. */ }
}

// Apply before React renders to avoid a flash of the opposite theme.
applyTheme(getInitialTheme())
