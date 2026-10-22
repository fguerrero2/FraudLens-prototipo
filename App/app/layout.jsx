import '../web/styles.css'

// No static title: web/i18n.jsx sets the translated one (a metadata title would be restored by React on render).
export const metadata = {
  icons: { icon: '/brand/favicon.png' },
}

export const viewport = { themeColor: '#FAFAFA' }

export default function RootLayout({ children }) {
  // The client app sets lang and theme on <html> after loading the saved preferences.
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>
}
