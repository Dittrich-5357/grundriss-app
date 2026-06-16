
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

function DokumentUpload({ genehmigung, onClose, onSaved }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [form, setForm] = useState({
    typ: '', bezeichnung: '', behoerde: '', aktenzeichen: '',
    datum: '', frist: '', antragsteller: ''
  })

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true)

    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 }
              },
              {
                type: 'text',
                text: `Analysiere dieses Behördendokument und extrahiere alle relevanten Informationen. 
Antworte NUR mit einem JSON-Objekt, ohne Markdown oder Erklärungen:
{
  "typ": "Antrag|Bescheid|Nachtrag|Ablehnung|Sonstiges",
  "bezeichnung": "kurze Bezeichnung des Dokuments",
  "behoerde": "Name der Behörde",
  "aktenzeichen": "Aktenzeichen falls vorhanden",
  "datum": "YYYY-MM-DD falls vorhanden",
  "frist": "YYYY-MM-DD falls eine Frist erwähnt wird",
  "antragsteller": "Name des Antragstellers falls vorhanden"
}`
              }
            ]
          }]
        })
      })

      const data = await response.json()
      const text = data.content.map(i => i.text || '').join('')
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setExtracted(parsed)
      setForm({
        typ: parsed.typ || '',
        bezeichnung: parsed.bezeichnung || '',
        behoerde: parsed.behoerde || '',
        aktenzeichen: parsed.aktenzeichen || '',
        datum: parsed.datum || '',
        frist: parsed.frist || '',
        antragsteller: parsed.antragsteller || ''
      })
    } catch (err) {
      console.error('KI-Extraktion fehlgeschlagen:', err)
      alert('Extraktion fehlgeschlagen – bitte Felder manuell ausfüllen.')
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (!file) return
    setLoading(true)

    const ext = file.name.split('.').pop()
    const path = `dokumente/${Date.now()}.${ext}`
    await supabase.storage.from('plaene').upload(path, file)
    const { data: { publicUrl } } = supabase.storage.from('plaene').getPublicUrl(path)

    await supabase.from('dokumente').insert({
      genehmigung_id: genehmigung.id,
      ...form,
      datum: form.datum || null,
      frist: form.frist || null,
      file_url: publicUrl,
      ki_extraktion: extracted
    })

    setLoading(false)
    onSaved()
    onClose()
  }

  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480 }}>
        <h3>Dokument hochladen</h3>
        <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>für: {genehmigung.name}</p>

        <div className="form-group">
          <label>PDF hochladen</label>
          <input type="file" accept=".pdf" onChange={e => { setFile(e.target.files[0]); setExtracted(null) }} />
        </div>

        {file && !extracted && (
          <button className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem', justifyContent: 'center' }} onClick={handleAnalyze} disabled={loading}>
            {loading ? 'KI analysiert Dokument...' : '✦ Mit KI analysieren'}
          </button>
        )}

        {(extracted || file) && (
          <>
            {extracted && (
              <div style={{ background: '#e1f5ee', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#0f6e56', marginBottom: '1rem' }}>
                ✓ KI hat das Dokument analysiert – bitte prüfen und ggf. korrigieren
              </div>
            )}
            <div className="form-group">
              <label>Typ</label>
              <select value={form.typ} onChange={e => setF('typ', e.target.value)}>
                <option value="">– bitte wählen –</option>
                <option>Antrag</option>
                <option>Bescheid</option>
                <option>Nachtrag</option>
                <option>Ablehnung</option>
                <option>Sonstiges</option>
              </select>
            </div>
            <div className="form-group">
              <label>Bezeichnung</label>
              <input type="text" value={form.bezeichnung} onChange={e => setF('bezeichnung', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Behörde</label>
              <input type="text" value={form.behoerde} onChange={e => setF('behoerde', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Aktenzeichen</label>
              <input type="text" value={form.aktenzeichen} onChange={e => setF('aktenzeichen', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Antragsteller</label>
              <input type="text" value={form.antragsteller} onChange={e => setF('antragsteller', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Datum</label>
                <input type="date" value={form.datum} onChange={e => setF('datum', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Frist / Ablauf</label>
                <input type="date" value={form.frist} onChange={e => setF('frist', e.target.value)} />
              </div>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Abbrechen</button>
          {extracted && (
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Wird gespeichert...' : 'Speichern'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Genehmigungen({ planId, planName }) {
  const [list, setList] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [selectedGen, setSelectedGen] = useState(null)
  const [dokumente, setDokumente] = useState([])
  const [showDokUpload, setShowDokUpload] = useState(false)
  const [form, setForm] = useState({ name: '', objekt: '', behoerde: '', frist: '', status: 'Offen' })

  const load = async () => {
    const query = supabase.from('genehmigungen').select('*').order('frist')
    if (planId) query.eq('plan_id', planId)
    const { data } = await query
    setList(data || [])
  }

  const loadDokumente = async (genId) => {
    const { data } = await supabase.from('dokumente').select('*').eq('genehmigung_id', genId).order('created_at')
    setDokumente(data || [])
  }

  useEffect(() => { load() }, [planId])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name) return
    await supabase.from('genehmigungen').insert({ ...form, plan_id: planId || null })
    setForm({ name: '', objekt: planName || '', behoerde: '', frist: '', status: 'Offen' })
    setShowModal(false)
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Genehmigung löschen?')) return
    await supabase.from('genehmigungen').delete().eq('id', id)
    load()
  }

  const selectGen = (g) => {
    setSelectedGen(g)
    loadDokumente(g.id)
  }

  const typColor = (t) => {
    const map = { 'Bescheid': 'success', 'Antrag': 'info', 'Nachtrag': 'warning', 'Ablehnung': 'danger' }
    return map[t] || 'info'
  }

  if (selectedGen) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
          <button className="btn" onClick={() => setSelectedGen(null)}>← Zurück</button>
          <h2 style={{ fontSize: 16, fontWeight: 500 }}>{selectedGen.name}</h2>
          {statusBadge(selectedGen.status)}
        </div>

        <div className="grid-3" style={{ marginBottom: '1rem' }}>
          <div className="metric-card">
            <div className="metric-label">Behörde</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{selectedGen.behoerde || '–'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Frist</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{fmtDate(selectedGen.frist)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Objekt</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginTop: 4 }}>{selectedGen.objekt || '–'}</div>
          </div>
        </div>

        <div className="section-header">
          <h2>Dokumente</h2>
          <button className="btn btn-primary" onClick={() => setShowDokUpload(true)}>+ Dokument hochladen</button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {dokumente.length === 0 ? (
            <p className="empty-state">Noch keine Dokumente hochgeladen.</p>
          ) : (
            <table>
              <thead>
                <tr style={{ background: '#f5f5f3' }}>
                  <th style={{ padding: '12px 1.25rem' }}>Typ</th>
                  <th style={{ padding: '12px' }}>Bezeichnung</th>
                  <th style={{ padding: '12px' }}>Behörde</th>
                  <th style={{ padding: '12px' }}>Aktenzeichen</th>
                  <th style={{ padding: '12px' }}>Datum</th>
                  <th style={{ padding: '12px' }}>Frist</th>
                  <th style={{ padding: '12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {dokumente.map(d => (
                  <tr key={d.id}>
                    <td style={{ paddingLeft: '1.25rem' }}>
                      <span className={`badge badge-${typColor(d.typ)}`}>{d.typ}</span>
                    </td>
                    <td>{d.bezeichnung}</td>
                    <td style={{ color: '#888' }}>{d.behoerde}</td>
                    <td style={{ color: '#888' }}>{d.aktenzeichen || '–'}</td>
                    <td style={{ color: '#888' }}>{fmtDate(d.datum)}</td>
                    <td style={{ color: '#888' }}>{fmtDate(d.frist)}</td>
                    <td>
                      <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => window.open(d.file_url, '_blank')}>
                        Öffnen ↗
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showDokUpload && (
          <DokumentUpload
            genehmigung={selectedGen}
            onClose={() => setShowDokUpload(false)}
            onSaved={() => loadDokumente(selectedGen.id)}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h2>{planName ? `Genehmigungen – ${planName}` : 'Genehmigungen'}</h2>
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
                <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => selectGen(g)}>
                  <td style={{ paddingLeft: '1.25rem' }}>{g.name}</td>
                  <td style={{ color: '#888' }}>{g.objekt}</td>
                  <td style={{ color: '#888' }}>{g.behoerde}</td>
                  <td style={{ color: '#888' }}>{fmtDate(g.frist)}</td>
                  <td>{statusBadge(g.status)}</td>
                  <td onClick={e => e.stopPropagation()}>
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
            <div className="form-group"><label>Bezeichnung</label><input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="z.B. Baugenehmigung Erweiterung" /></div>
            <div className="form-group"><label>Objekt / Standort</label><input type="text" value={form.objekt} onChange={e => setF('objekt', e.target.value)} placeholder="z.B. Halle 3" /></div>
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
              <button className="btn" onClick={() => setShowModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
