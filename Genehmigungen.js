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

export default function Genehmigungen() {
  const [list, setList] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', objekt: '', behoerde: '', frist: '', status: 'Offen' })

  const load = async () => {
    const { data } = await supabase.from('genehmigungen').select('*').order('frist')
    setList(data || [])
  }

  useEffect(() => { load() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name) return
    await supabase.from('genehmigungen').insert(form)
    setForm({ name: '', objekt: '', behoerde: '', frist: '', status: 'Offen' })
    setShowModal(false)
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Genehmigung löschen?')) return
    await supabase.from('genehmigungen').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="section-header">
        <h2>Genehmigungen</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Neue Genehmigung</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.length === 0 ? (
          <p className="empty-state">Noch keine Genehmigungen angelegt.</p>
        ) : (
          <table>
            <thead>
              <tr style={{ background: '#f5f5f3' }}>
                <th style={{ padding: '12px 1.25rem' }}>Bezeichnung</th>
                <th style={{ padding: '12px' }}>Objekt</th>
                <th style={{ padding: '12px' }}>Behörde</th>
                <th style={{ padding: '12px' }}>Frist</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map(g => (
                <tr key={g.id}>
                  <td style={{ paddingLeft: '1.25rem' }}>{g.name}</td>
                  <td style={{ color: '#888' }}>{g.objekt}</td>
                  <td style={{ color: '#888' }}>{g.behoerde}</td>
                  <td style={{ color: '#888' }}>{fmtDate(g.frist)}</td>
                  <td>{statusBadge(g.status)}</td>
                  <td>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(g.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h3>Neue Genehmigung</h3>
            <div className="form-group"><label>Bezeichnung</label><input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="z.B. Baugenehmigung Erweiterung" /></div>
            <div className="form-group"><label>Objekt / Standort</label><input type="text" value={form.objekt} onChange={e => set('objekt', e.target.value)} placeholder="z.B. Halle 3" /></div>
            <div className="form-group"><label>Behörde</label><input type="text" value={form.behoerde} onChange={e => set('behoerde', e.target.value)} placeholder="z.B. Kreisverwaltung Neuwied" /></div>
            <div className="form-group"><label>Frist</label><input type="date" value={form.frist} onChange={e => set('frist', e.target.value)} /></div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                <option>Offen</option>
                <option>Beantragt</option>
                <option>Erteilt</option>
                <option>Abgelaufen</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
