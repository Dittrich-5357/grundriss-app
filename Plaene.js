import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Plaene() {
  const [plaene, setPlaene] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('plaene').select('*').order('created_at', { ascending: false })
    setPlaene(data || [])
  }

  useEffect(() => { load() }, [])

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
    setName(''); setFile(null); setShowModal(false); setLoading(false)
    load()
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString('de-DE')

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
            <div key={p.id} className="plan-card" onClick={() => p.file_url && window.open(p.file_url, '_blank')}>
              <div className="plan-thumb">⊞</div>
              <div className="plan-name">{p.name}</div>
              <div className="plan-date">{p.file_name} · {fmtDate(p.created_at)}</div>
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
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Werk Nord – Halle 3" />
            </div>
            <div className="form-group">
              <label>Datei</label>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files[0])} />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowModal(false)}>Abbrechen</button>
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
