import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import PlanViewer from './PlanViewer'

export default function Plaene() {
  const [plaene, setPlaene] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await supabase.from('plaene').select('*').order('created_at', { ascending: false })
    setPlaene(data || [])
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!name || !file) { setError('Bitte Name und Datei angeben.'); return }
    setLoading(true)
    setError('')

    const ext = file.name.split('.').pop()
    const path = `lageplaene/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    const { error: uploadError } = await supabase.storage.from('plaene').upload(path, file)
    if (uploadError) {
      setError('Upload fehlgeschlagen: ' + uploadError.message)
      setLoading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('plaene').getPublicUrl(path)

    const { error: insertError } = await supabase.from('plaene').insert({
      name, file_name: file.name, file_url: publicUrl
    })
    if (insertError) {
      setError('Speichern fehlgeschlagen: ' + insertError.message)
      setLoading(false)
      return
    }

    setName(''); setFile(null); setShowModal(false); setLoading(false)
    load()
  }

  const handleDelete = async (e, plan) => {
    e.stopPropagation()
    if (!window.confirm(`"${plan.name}" wirklich löschen? Alle zugehörigen Gebäude, Genehmigungen, Dokumente und Fristen werden ebenfalls gelöscht.`)) return
    await supabase.from('plaene').delete().eq('id', plan.id)
    load()
  }

  const fmtDateShort = (d) => new Date(d).toLocaleDateString('de-DE')

  if (selectedPlan) {
    return <PlanViewer plan={selectedPlan} onBack={() => setSelectedPlan(null)} />
  }

  return (
    <div>
      <div className="section-header">
        <h2>Lagepläne</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Plan hochladen</button>
      </div>

      <div className="upload-zone" onClick={() => setShowModal(true)}>
        <div style={{ fontSize: 32 }}>⊞</div>
        <p>Plan hier ablegen oder klicken zum Hochladen</p>
        <span>PDF, PNG, JPG – max. 50 MB</span>
      </div>

      {plaene.length === 0 ? (
        <p className="empty-state">Noch keine Lagepläne hochgeladen.</p>
      ) : (
        <div className="plan-grid">
          {plaene.map(p => (
            <div key={p.id} className="plan-card" onClick={() => setSelectedPlan(p)} style={{ position: 'relative' }}>
              <button
                onClick={(e) => handleDelete(e, p)}
                style={{ position: 'absolute', top: 8, right: 8, background: '#fff', border: '1px solid #e8e8e4', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, color: '#B01B0C', zIndex: 2 }}
                title="Lageplan löschen"
              >🗑</button>
              <div className="plan-thumb">⊞</div>
              <div className="plan-name">{p.name}</div>
              <div className="plan-date">{fmtDateShort(p.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h3>Lageplan hochladen</h3>
            <div className="form-group">
              <label>Bezeichnung</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Werk Nord – Gesamtgelände" autoFocus />
            </div>
            <div className="form-group">
              <label>Datei</label>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files[0])} />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? 'Wird hochgeladen...' : 'Hochladen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
