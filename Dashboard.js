import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function statusBadge(s) {
  const map = { 'Erteilt': 'success', 'Beantragt': 'info', 'Offen': 'warning', 'Abgelaufen': 'danger' }
  return <span className={`badge badge-${map[s] || 'info'}`}>{s}</span>
}

function fmtDate(d) {
  if (!d) return '–'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

export default function Dashboard({ setScreen }) {
  const [genehmigungen, setGenehmigungen] = useState([])
  const [plaeneCount, setPlaeneCount] = useState(0)

  useEffect(() => {
    supabase.from('genehmigungen').select('*').order('frist').then(({ data }) => setGenehmigungen(data || []))
    supabase.from('plaene').select('id', { count: 'exact' }).then(({ count }) => setPlaeneCount(count || 0))
  }, [])

  const baldAblaufend = genehmigungen.filter(g => {
    if (!g.frist || g.status === 'Erteilt') return false
    const diff = (new Date(g.frist) - new Date()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 60
  }).length

  return (
    <div>
      <div className="grid-3">
        <div className="metric-card">
          <div className="metric-label">Lagepläne</div>
          <div className="metric-value">{plaeneCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Genehmigungen</div>
          <div className="metric-value">{genehmigungen.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Bald ablaufend</div>
          <div className="metric-value" style={{ color: baldAblaufend > 0 ? '#854f0b' : 'inherit' }}>{baldAblaufend}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2>Genehmigungen – Übersicht</h2>
          <button className="btn" onClick={() => setScreen('genehmigungen')}>Alle anzeigen</button>
        </div>
        {genehmigungen.length === 0 ? (
          <p className="empty-state">Noch keine Genehmigungen angelegt.</p>
        ) : (
          <table>
            <thead><tr>
              <th>Bezeichnung</th><th>Objekt</th><th>Frist</th><th>Status</th>
            </tr></thead>
            <tbody>
              {genehmigungen.slice(0, 5).map(g => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td style={{ color: '#888' }}>{g.objekt}</td>
                  <td style={{ color: '#888' }}>{fmtDate(g.frist)}</td>
                  <td>{statusBadge(g.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
