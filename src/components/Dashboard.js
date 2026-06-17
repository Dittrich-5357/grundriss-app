import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { fmtDate, statusColor, statusBg, sammleErinnerungen, fristColor } from '../utils'

export default function Dashboard({ setScreen }) {
  const [genehmigungen, setGenehmigungen] = useState([])
  const [fristen, setFristen] = useState([])
  const [plaeneCount, setPlaeneCount] = useState(0)

  useEffect(() => {
    supabase.from('genehmigungen').select('*').order('frist').then(({ data }) => setGenehmigungen(data || []))
    supabase.from('fristen').select('*').order('faellig').then(({ data }) => setFristen(data || []))
    supabase.from('plaene').select('id', { count: 'exact' }).then(({ count }) => setPlaeneCount(count || 0))
  }, [])

  const erinnerungen = sammleErinnerungen(genehmigungen, fristen)
  const dringend = erinnerungen.filter(e => e.stufe === 'dringend' || e.stufe === 'abgelaufen')

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
          <div className="metric-label">Fristen im Blick</div>
          <div className="metric-value" style={{ color: dringend.length > 0 ? '#B01B0C' : 'inherit' }}>{erinnerungen.length}</div>
        </div>
      </div>

      {erinnerungen.length > 0 && (
        <div className="card">
          <div className="section-header">
            <h2>Anstehende Fristen</h2>
          </div>
          <div className="reminder-banner-list">
            {erinnerungen.slice(0, 8).map(e => (
              <div key={e.id} className={`reminder-banner ${e.stufe === 'dringend' || e.stufe === 'abgelaufen' ? 'urgent' : 'warning'}`}>
                <span style={{ fontWeight: 600 }}>{e.name}</span>
                <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {e.tage < 0 ? `Abgelaufen seit ${Math.abs(e.tage)} Tagen` : e.tage === 0 ? 'Heute fällig' : `Fällig in ${e.tage} Tagen`} · {fmtDate(e.datum)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-header">
          <h2>Genehmigungen – Übersicht</h2>
          <button className="btn" onClick={() => setScreen('plaene')}>Zu den Lageplänen</button>
        </div>
        {genehmigungen.length === 0 ? (
          <p className="empty-state">Noch keine Genehmigungen angelegt.</p>
        ) : (
          <table>
            <thead><tr>
              <th>Bezeichnung</th><th>Objekt</th><th>Frist</th><th>Status</th>
            </tr></thead>
            <tbody>
              {genehmigungen.slice(0, 6).map(g => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td style={{ color: '#888' }}>{g.objekt}</td>
                  <td style={{ color: '#888' }}>{fmtDate(g.frist)}</td>
                  <td><span className="badge" style={{ background: statusBg(g.status), color: statusColor(g.status) }}>{g.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
