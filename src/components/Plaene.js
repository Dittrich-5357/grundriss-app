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
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
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

  const handleUpload = async () => {
    if (!name) return
    setLoading(true)
    let file_url = null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      await supabase.storage.from('plaene').upload(path, file)
      const { data: { publicUrl } } = supabase.storage.from('plaene').getPublicUrl(path)
      file_url = publicUrl
    }
    await supabase.from('plaene').insert({ name, file_name: file?.name || '', file_url })
    setName(''); setFile(null); setShowUpload(false); setLoading(false)
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

        <div className="card" style={{ marginBottom: '1rem', padding: '1rem', background: '#f5f5f3', border: 'none' }}>
          <div style={{ fontSize: 13, color: '#888' }}>Datei</div>
          <div style={{ fontSize: 14, marginTop: 3 }}>{selectedPlan.file_name || '–'}</div>
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
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>+ Plan hochladen</button>
      </div>

      <div className="upload-zone" onClick={() => setShowUpload(true)}>
        <div style={{ fontSize: 32 }}>⊞</div>
        <p>Plan hier ablegen oder klicken zum Hochladen</p>
        <span>PDF, PNG, JPG – max. 50 MB</span>
      </div>

      {plaene.length === 0 ? (
        <p className="empty-state">Noch keine Lagepläne hochgeladen.</p>
      ) : (
        <div className="plan-grid">
          {plaene.map(p => (
            <div key={p.id} className="plan-card" onClick={() => selectPlan(p)}>
              <div className="plan-thumb">⊞</div>
              <div className="plan-name">{p.name}</div>
              <div className="plan-date">{p.file_name} · {fmtDateShort(p.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="modal">
            <h3>Lageplan hochladen</h3>
            <div className="form-group"><label>Bezeichnung</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Werk Nord – Halle 3" /></div>
            <div className="form-group"><label>Datei</label><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files[0])} /></div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowUpload(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={loading}>
                {loading ? 'Wird hochgeladen...' : 'Hochladen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
