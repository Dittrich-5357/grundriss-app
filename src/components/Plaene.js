
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

export default function Plaene() {
  const [plaene, setPlaene] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [genehmigungen, setGenehmigungen] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [name, setName] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [form, setForm] = useState({ name: '', behoerde: '', frist: '', status: 'Offen' })

  const loadPlaene = async () => {
    const { data } = await supabase.from('plaene').select('*').order('created_at', { ascending: false })
    setPlaene(data || [])
  }

  const loadGenehmigungen = async (planId) => {
    const { data } = await supabase.from('genehmigungen').select('*').eq('plan_id', planId).order('frist')
    setGenehmigungen(data || [])
  }

  useEffect(() => { loadPlaene() }, [])

  const selectPlan = (plan) => {
    setSelectedPlan(plan)
    loadGenehmigungen(plan.id)
  }

  const handleSavePlan = async () => {
    if (!name) return
    await supabase.from('plaene').insert({ name, file_name: fileUrl, file_url: fileUrl })
    setName(''); setFileUrl(''); setShowUpload(false)
    loadPlaene()
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSaveGen = async () => {
    if (!form.name) return
    await supabase.from('genehmigungen').insert({
      ...form,
      objekt: selectedPlan.name,
      plan_id: selectedPlan.id
    })
    setForm({ name: '', behoerde: '', frist: '', status: 'Offen' })
    setShowGenModal(false)
    loadGenehmigungen(selectedPlan.id)
  }

  const handleDeleteGen = async (id) => {
    if (!window.confirm('Genehmigung löschen?')) return
    await supabase.from('genehmigungen').delete().eq('id', id)
    loadGenehmigungen(selectedPlan.id)
  }

  const fmtDateShort = (d) => new Date(d).toLocaleDateString('de-DE')

  if (selectedPlan) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
          <button className="btn" onClick={() => setSelectedPlan(null)}>← Zurück</button>
          <h2 style={{ fontSize: 16, fontWeight: 500 }}>{selectedPlan.name}</h2>
          {selectedPlan.file_url && (
            <button className="btn" onClick={() => window.open(selectedPlan.file_url, '_blank')}>
              Lageplan öffnen ↗
            </button>
          )}
        </div>

        <div className="section-header">
          <h2>Genehmigungen für diesen Plan</h2>
          <button className="btn btn-primary" onClick={() => setShowGenModal(true)}>+ Neue Genehmigung</button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {genehmigungen.length === 0 ? (
            <p className="empty-state">Noch keine Genehmigungen für diesen Plan.</p>
          ) : (
            <table>
              <thead>
                <tr style={{ background: '#f5f5f3' }}>
                  <th style={{ padding: '12px 1.25rem' }}>Bezeichnung</th>
                  <th style={{ padding: '12px' }}>Behörde</th>
                  <th style={{ padding: '12px' }}>Frist</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {genehmigungen.map(g => (
                  <tr key={g.id}>
                    <td style={{ paddingLeft: '1.25rem' }}>{g.name}</td>
                    <td style={{ color: '#888' }}>{g.behoerde}</td>
                    <td style={{ color: '#888' }}>{fmtDate(g.frist)}</td>
                    <td>{statusBadge(g.status)}</td>
                    <td>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDeleteGen(g.id)}>Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showGenModal && (
          <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowGenModal(false)}>
            <div className="modal">
              <h3>Neue Genehmigung für {selectedPlan.name}</h3>
              <div className="form-group"><label>Bezeichnung</label><input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="z.B. Baugenehmigung Erweiterung" /></div>
              <div className="form-group"><label>Behörde</label><input type="text" value={form.behoerde} onChange={e => setF('behoerde', e.target.value)} placeholder="z.B. Kreisverwaltung Neuwied" /></div>
              <div className="form-group"><label>Frist</label><input type="date" value={form.frist} onChange={e => setF('frist', e.target.value)} /></div>
              <div className="form-group"><label>Status</label>
                <select value={form.status} onChange={e => setF('status', e.target.value)}>
                  <option>Offen</option>
                  <option>Beantragt</option>
                  <option>Erteilt</option>
                  <option>Abgelaufen</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setShowGenModal(false)}>Abbrechen</button>
                <button className="btn btn-primary" onClick={handleSaveGen}>Speichern</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h2>Lagepläne</h2>
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>+ Plan hinzufügen</button>
      </div>

      {plaene.length === 0 ? (
        <p className="empty-state">Noch keine Lagepläne angelegt.</p>
      ) : (
        <div className="plan-grid">
          {plaene.map(p => (
            <div key={p.id} className="plan-card" onClick={() => selectPlan(p)}>
              <div className="plan-thumb">⊞</div>
              <div className="plan-name">{p.name}</div>
              <div className="plan-date">{fmtDateShort(p.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="modal">
            <h3>Lageplan hinzufügen</h3>
            <div className="form-group">
              <label>Bezeichnung</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Werk Nord – Halle 3" />
            </div>
            <div className="form-group">
              <label>Supabase URL des Lageplans</label>
              <input type="text" value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://...supabase.co/storage/v1/object/public/plaene/..." />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                Plan zuerst in Supabase Storage hochladen, dann URL hier einfügen.
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowUpload(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSavePlan}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
