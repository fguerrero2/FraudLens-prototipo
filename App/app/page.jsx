'use client'
import dynamic from 'next/dynamic'

// The dashboard is a client-only app (localStorage, Leaflet, in-memory session), as it was with Vite.
const Root = dynamic(() => import('../web/Root'), { ssr: false })

export default function Page() {
  return <Root />
}
