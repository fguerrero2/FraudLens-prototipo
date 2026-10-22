import { t as translate, getLocale } from './i18n'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import { api } from './api'
export default function Heatmap() {
  const container = useRef(null)
  const [error, setError] = useState(''), [count, setCount] = useState(null)
  useEffect(() => {
    const map = L.map(container.current).setView([-34.6, -58.38], 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map)
    let disposed = false
    api.get('/dashboard/heatmap').then(cells => {
      if (disposed) return
      setCount(cells.length)
      L.heatLayer(cells.map(c => [c.lat, c.lon, Math.max(.1, c.risk || 0)]), { radius: 24, blur: 18, maxZoom: 12, gradient: { .2: '#16A34A', .5: '#FBBF24', .8: '#F97316', 1: '#DC2626' } }).addTo(map)
      for (const cell of cells) {
        const popup = document.createElement('div')
        popup.textContent = translate("{0} transactions · {1} confirmed fraud · Average risk: {2}", [cell.transactions, cell.frauds, cell.risk === null ? 'not evaluated' : Math.round(cell.risk * 100) + '/100'])
        L.circleMarker([cell.lat, cell.lon], { radius: 5, color: '#9333EA', fillOpacity: .3 }).addTo(map).bindPopup(popup)
      }
      if (cells.length) map.fitBounds(cells.map(c => [c.lat, c.lon]), { maxZoom: 12, padding: [24, 24] })
    }).catch(err => { if (!disposed) setError(err.message) })
    return () => { disposed = true; map.remove() }
  }, [getLocale()])
  return <section className="content-card heatmap-card"><div className="card-heading"><div><h2>{translate("Risk heatmap")}</h2><p>{translate("Last 30 days · Average risk by location")}</p></div></div>{error && <p role="alert" className="api-error" style={{ margin: '0 20px 12px' }}>{translate(error)}</p>}{count === 0 && <p className="heatmap-empty">{translate("No geolocated transactions yet.")}</p>}<div ref={container} className="risk-map" role="img" aria-label={translate("Aggregated risk map by location")}/></section>
}
