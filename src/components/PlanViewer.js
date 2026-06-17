import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmtDate, tageBis, fristColor, statusColor, statusBg } from '../utils'

const TYPEN = ['Antrag', 'Bescheid', 'Nachtrag', 'Ablehnung', 'Sonstiges']
const STATUS = ['Offen', 'Beantragt', 'Erteilt', 'Abgelaufen']

export default function PlanViewer({ plan, onBack }) {
  const [zonen, setZonen] = useState([])
  const [selectedZone, setSelectedZone] = useState(null)
  const [tab, setTab] = useState('genehm')
  const [genehmigungen, setGenehmigungen] = useState([])
  const [dokumente, setDokumente] = useState([])
  const [fristen, setFristen] = useState([])
  const [drawing, setDrawing] = useState(false)
  const [newZone, setNewZone] = useState(null)
  const [showZoneModal, setShowZoneModal] = useState(false)
  const [showDokModal, setShowDokModal] = useState(false)
  const [showFristModal, setShowFristModal] = useState(false)
  const [showGenModal, setShowGenModal] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [zoneNutzung, setZoneNutzung] = useState('')
  const [kiLoading, setKiLoading] = useState(false)
  const [kiResult, setKiResult] = useState(null)
  const [dokFile, setDokFile] = useState(null)
  const [dokForm, setDokForm] = useState({ typ: '', bezeichnung: '', behoerde: '', aktenzeichen: '', antragsteller: '', datum: '', frist: '' })
  const [fristForm, setFristForm] = useState({ name: '', typ: '', faellig: '' })
  const [genForm, setGenForm] = useState({ name: '', behoerde: '', status: 'Offen', frist: '' })
  const imgRef = useRef(null)
  const startRef = useRef(null)

  const isImage = plan.file_name && /\.(png|jpe?g|gif|webp)$/i.test(plan.file_name)

  useEffect(() => { loadZonen() }, [plan.id])

  const loadZonen = async () => {
    const { data } = await supabase.from('zonen').select('*').eq('plan_id', plan.id)
    setZonen(data || [])
  }

  const loadZoneData = async (zone) => {
    const [g, d, f] = await Promise.all([
      supabase.from('genehmigungen').select('*').eq('zone_id', zone.id).order('frist'),
      supabase.from('dokumente').select('*').eq('zone_id', zone.id).order('created_at'),
      supabase.from('fristen').select('*').eq('zone_id', zone.id).order('faellig')
    ])
    setGenehmigungen(g.data || [])
    setDokumente(d.data || [])
    setFristen(f.data || [])
  }

  const selectZone = (zone) => {
    setSelectedZone(zone)
    setTab('genehm')
    loadZoneData(zone)
  }

  const getImgRect = () => imgRef.current?.getBoundingClientRect()

  const handleMouseDown = (e) => {
    if (!drawing) return
    const r = getImgRect()
    startRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const handleMouseUp = (e) => {
    if (!drawing || !startRef.current) return
    const r = getImgRect()
    const x2 = e.clientX - r.left
    const y2 = e.clientY - r.top
    const x = Math.min(startRef.current.x, x2)
    const y = Math.min(startRef.current.y, y2)
    const w = Math.abs(x2 - startRef.current.x)
    const h = Math.abs(y2 - startRef.current.y)
    if (w < 10 || h < 10) { startRef.current = null; return }
    const pct = {
      x: (x / r.width) * 100,
      y: (y / r.height) * 100,
      w: (w / r.width) * 100,
      h: (h / r.height) * 100
    }
    setNewZone(pct)
    setDrawing(false)
    setShowZoneModal(true)
    startRef.current = null
  }

  const saveZone = async () => {
    if (!zoneName || !newZone) return
    await supabase.from('zonen').insert({
      plan_id: plan.id,
      name: zoneName,
      nutzung: zoneNutzung,
      x: newZone.x, y: newZone.y, w: newZone.w, h: newZone.h
    })
    setZoneName(''); setZoneNutzung(''); setNewZone(null); setShowZoneModal(false)
    loadZonen()
  }

  const analyzeDoc = async (file) => {
    if (!file) return
    setKiLoading(true)
    setKiResult(null)
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
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: `Analysiere dieses Behördendokument. Antworte NUR mit JSON, kein Markdown, keine Erklärung:
{"typ":"Antrag|Bescheid|Nachtrag|Ablehnung|Sonstiges","bezeichnung":"kurze Bezeichnung","behoerde":"Name der Behörde","aktenzeichen":"Aktenzeichen falls vorhanden","antragsteller":"Antragsteller falls vorhanden","datum":"YYYY-MM-DD falls vorhanden","frist":"YYYY-MM-DD falls eine Frist oder Gültigkeit erwähnt wird"}` }
            ]
          }]
        })
      })
      const data = await response.json()
      const text = data.content.map(i => i.text || '').join('')
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      setKiResult(parsed)
      setDokForm({
        typ: parsed.typ || '',
        bezeichnung: parsed.bezeichnung || '',
        behoerde: parsed.behoerde || '',
        aktenzeichen: parsed.aktenzeichen || '',
        antragsteller: parsed.antragsteller || '',
        datum: parsed.datum || '',
        frist: parsed.frist || ''
      })
    } catch (e) {
      alert('KI-Analyse fehlgeschlagen – bitte Felder manuell ausfüllen.')
    }
    setKiLoading(false)
  }

  const saveDok = async () => {
    if (!dokFile) return
    const ext = dokFile.name.split('.').pop()
    const path = `dokumente/${Date.now()}_${dokFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('plaene').upload(path, dokFile)
    if (uploadError) { alert('Upload fehlgeschlagen: ' + uploadError.message); return }
    const { data: { publicUrl } } = supabase.storage.from('plaene').getPublicUrl(path)
    await supabase.from('dokumente').insert({
      zone_id: selectedZone.id,
      plan_id: plan.id,
      ...dokForm,
      datum: dokForm.datum || null,
      frist: dokForm.frist || null,
      file_url: publicUrl,
      ki_extraktion: kiResult
    })
    setDokFile(null); setDokForm({ typ: '', bezeichnung: '', behoerde: '', aktenzeichen: '', antragsteller: '', datum: '', frist: '' })
    setKiResult(null); setShowDokModal(false)
    loadZoneData(selectedZone)
  }

  const saveFrist = async () => {
    if (!fristForm.name) return
    await supabase.from('fristen').insert({ zone_id: selectedZone.id, plan_id: plan.id, ...fristForm, faellig: fristForm.faellig || null })
    setFristForm({ name: '', typ: '', faellig: '' }); setShowFristModal(false)
    loadZoneData(selectedZone)
  }

  const saveGen = async () => {
    if (!genForm.name) return
    await supabase.from('genehmigungen').insert({ zone_id: selectedZone.id, plan_id: plan.id, objekt: selectedZone.name, ...genForm, frist: genForm.frist || null })
    setGenForm({ name: '', behoerde: '', status: 'Offen', frist: '' }); setShowGenModal(false)
    loadZoneData(selectedZone)
  }

  const zoneColor = (zone) => {
    const colors = ['#1A6B3C', '#1A3F8F', '#B84000', '#8A5200', '#B01B0C', '#6B3FA0']
    const idx = zonen.indexOf(zone) % colors.length
    return colors[idx]
  }

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <button className="btn" onClick={onBack}>← Lagepläne</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>{plan.name}</h2>
        <button
          className={`btn ${drawing ? 'btn-primary' : ''}`}
          onClick={() => setDrawing(!drawing)}
        >
          {drawing ? '✕ Abbrechen' : '+ Bereich markieren'}
        </button>
      </div>

      {drawing && (
        <div style={{ background: '#EAF0FC', border: '1px solid #1A3F8F33', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#1A3F8F', marginBottom: 12, flexShrink: 0 }}>
          Ziehe einen Rahmen auf dem Plan um einen Bereich zu markieren
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 16, overflow: 'hidden' }}>

        <div style={{ flex: 1, background: '#fff', border: '1px solid #e8e8e4', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
          <div
            ref={imgRef}
            style={{ width: '100%', height: '100%', position: 'relative', cursor: drawing ? 'crosshair' : 'default', userSelect: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          >
            {plan.file_url ? (
              isImage ? (
                <img src={plan.file_url} alt={plan.name} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
              ) : (
                <iframe src={plan.file_url} style={{ width: '100%', height: '100%', border: 'none', pointerEvents: drawing ? 'none' : 'auto' }} title="Lageplan" />
              )
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888', fontSize: 14 }}>
                Kein Lageplan hinterlegt
              </div>
            )}

            {zonen.map(zone => (
              <div
                key={zone.id}
                onClick={() => !drawing && selectZone(zone)}
                style={{
                  position: 'absolute',
                  left: `${zone.x}%`, top: `${zone.y}%`,
                  width: `${zone.w}%`, height: `${zone.h}%`,
                  border: `2px solid ${zoneColor(zone)}`,
                  background: selectedZone?.id === zone.id ? `${zoneColor(zone)}22` : `${zoneColor(zone)}11`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  pointerEvents: drawing ? 'none' : 'auto'
                }}
              >
                <div style={{
                  position: 'absolute', top: -22, left: 0,
                  background: zoneColor(zone), color: '#fff',
                  fontSize: 10, fontWeight: 600, padding: '2px 7px',
                  borderRadius: 4, whiteSpace: 'nowrap'
                }}>
                  {zone.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 300, background: '#fff', border: '1px solid #e8e8e4', borderRadius: 12, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          {!selectedZone ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, textAlign: 'center', color: '#888' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⊞</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Bereich auf dem Plan markieren und anklicken</div>
              <div style={{ fontSize: 11 }}>{zonen.length} Bereiche markiert</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8e8e4', background: '#f5f5f3' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Bereich</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedZone.name}</div>
                {selectedZone.nutzung && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{selectedZone.nutzung}</div>}
              </div>

              <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e4', background: '#f5f5f3' }}>
                {[['genehm', 'Genehmigungen'], ['docs', 'Dokumente'], ['fristen', 'Fristen']].map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)} style={{
                    flex: 1, padding: '9px 4px', fontSize: 11, fontWeight: 600,
                    border: 'none', background: 'none', cursor: 'pointer',
                    color: tab === id ? '#B84000' : '#888',
                    borderBottom: tab === id ? '2.5px solid #B84000' : '2.5px solid transparent',
                    marginBottom: -1
                  }}>{label}</button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {tab === 'genehm' && (
                  <div>
                    {genehmigungen.length === 0 ? (
                      <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Keine Genehmigungen erfasst</div>
                    ) : genehmigungen.map(g => (
                      <div key={g.id} style={{ background: '#f5f5f3', borderRadius: 8, padding: '9px 11px', marginBottom: 6, borderLeft: `3px solid ${statusColor(g.status)}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{g.name}</div>
                        {g.behoerde && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{g.behoerde}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: statusBg(g.status), color: statusColor(g.status) }}>{g.status}</span>
                          {g.frist && <span style={{ fontSize: 10, color: fristColor(tageBis(g.frist)) }}>Frist: {fmtDate(g.frist)}</span>}
                        </div>
                      </div>
                    ))}
                    <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 4, borderStyle: 'dashed' }} onClick={() => setShowGenModal(true)}>
                      + Genehmigung erfassen
                    </button>
                  </div>
                )}

                {tab === 'docs' && (
                  <div>
                    {dokumente.length === 0 ? (
                      <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Keine Dokumente hochgeladen</div>
                    ) : dokumente.map(d => (
                      <div key={d.id} style={{ background: '#f5f5f3', border: '1px solid #e8e8e4', borderRadius: 8, padding: '8px 10px', marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{d.bezeichnung || d.typ}</div>
                          {d.behoerde && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{d.behoerde}</div>}
                          {d.aktenzeichen && <div style={{ fontSize: 10, color: '#888' }}>Az: {d.aktenzeichen}</div>}
                          {d.datum && <div style={{ fontSize: 10, color: '#888' }}>{fmtDate(d.datum)}</div>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                          {d.typ && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#EAF0FC', color: '#1A3F8F' }}>{d.typ}</span>}
                          <button className="btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => window.open(d.file_url, '_blank')}>↗</button>
                        </div>
                      </div>
                    ))}
                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => setShowDokModal(true)}>
                      + Dokument hochladen
                    </button>
                  </div>
                )}

                {tab === 'fristen' && (
                  <div>
                    {fristen.length === 0 ? (
                      <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Keine Fristen erfasst</div>
                    ) : [...fristen].sort((a, b) => new Date(a.faellig) - new Date(b.faellig)).map(f => {
                      const tage = tageBis(f.faellig)
                      const fc = fristColor(tage)
                      const label = tage === null ? '–' : tage < 0 ? 'Abgelaufen' : tage === 0 ? 'Heute!' : `in ${tage} Tagen`
                      return (
                        <div key={f.id} style={{ background: '#f5f5f3', borderRadius: 8, padding: '8px 10px', marginBottom: 6, borderLeft: `3px solid ${fc}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 600 }}>{f.name}</div>
                            {f.typ && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{f.typ} · {fmtDate(f.faellig)}</div>}
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: fc, whiteSpace: 'nowrap' }}>{label}</span>
                        </div>
                      )
                    })}
                    <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 4, borderStyle: 'dashed' }} onClick={() => setShowFristModal(true)}>
                      + Frist hinzufügen
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showZoneModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowZoneModal(false)}>
          <div className="modal">
            <h3>Bereich benennen</h3>
            <div className="form-group"><label>Name</label><input type="text" value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="z.B. Halle 3, Bürogebäude Nord" autoFocus /></div>
            <div className="form-group"><label>Nutzung (optional)</label><input type="text" value={zoneNutzung} onChange={e => setZoneNutzung(e.target.value)} placeholder="z.B. Produktion, Lager, Verwaltung" /></div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowZoneModal(false); setNewZone(null) }}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveZone}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      {showDokModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowDokModal(false)}>
          <div className="modal" style={{ width: 480 }}>
            <h3>Dokument hochladen</h3>
            <p style={{ fontSize: 12, color: '#888', marginBottom: '1rem' }}>{selectedZone?.name}</p>
            <div className="form-group">
              <label>PDF auswählen</label>
              <input type="file" accept=".pdf" onChange={e => { setDokFile(e.target.files[0]); setKiResult(null); if (e.target.files[0]) analyzeDoc(e.target.files[0]) }} />
            </div>
            {kiLoading && (
              <div style={{ background: '#EAF0FC', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1A3F8F', marginBottom: '1rem' }}>
                ✦ KI analysiert das Dokument...
              </div>
            )}
            {kiResult && (
              <div style={{ background: '#EAF4EE', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1A6B3C', marginBottom: '1rem' }}>
                ✓ KI hat das Dokument analysiert – bitte prüfen
              </div>
            )}
            {dokFile && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="form-group">
                    <label>Typ</label>
                    <select value={dokForm.typ} onChange={e => setDokForm(f => ({ ...f, typ: e.target.value }))}>
                      <option value="">– wählen –</option>
                      {TYPEN.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Datum</label>
                    <input type="date" value={dokForm.datum} onChange={e => setDokForm(f => ({ ...f, datum: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group"><label>Bezeichnung</label><input type="text" value={dokForm.bezeichnung} onChange={e => setDokForm(f => ({ ...f, bezeichnung: e.target.value }))} /></div>
                <div className="form-group"><label>Behörde</label><input type="text" value={dokForm.behoerde} onChange={e => setDokForm(f => ({ ...f, behoerde: e.target.value }))} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="form-group"><label>Aktenzeichen</label><input type="text" value={dokForm.aktenzeichen} onChange={e => setDokForm(f => ({ ...f, aktenzeichen: e.target.value }))} /></div>
                  <div className="form-group"><label>Frist / Ablauf</label><input type="date" value={dokForm.frist} onChange={e => setDokForm(f => ({ ...f, frist: e.target.value }))} /></div>
                </div>
                <div className="form-group"><label>Antragsteller</label><input type="text" value={dokForm.antragsteller} onChange={e => setDokForm(f => ({ ...f, antragsteller: e.target.value }))} /></div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowDokModal(false); setDokFile(null); setKiResult(null) }}>Abbrechen</button>
              {dokFile && !kiLoading && <button className="btn btn-primary" onClick={saveDok}>Speichern</button>}
            </div>
          </div>
        </div>
      )}

      {showFristModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowFristModal(false)}>
          <div className="modal">
            <h3>Frist hinzufügen</h3>
            <div className="form-group"><label>Bezeichnung</label><input type="text" value={fristForm.name} onChange={e => setFristForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Wiederkehrende Prüfung Brandschutz" /></div>
            <div className="form-group"><label>Typ</label><input type="text" value={fristForm.typ} onChange={e => setFristForm(f => ({ ...f, typ: e.target.value }))} placeholder="z.B. Prüftermin, Verlängerung" /></div>
            <div className="form-group"><label>Fällig am</label><input type="date" value={fristForm.faellig} onChange={e => setFristForm(f => ({ ...f, faellig: e.target.value }))} /></div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowFristModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveFrist}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      {showGenModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowGenModal(false)}>
          <div className="modal">
            <h3>Genehmigung erfassen</h3>
            <div className="form-group"><label>Bezeichnung</label><input type="text" value={genForm.name} onChange={e => setGenForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Baugenehmigung Erweiterung" /></div>
            <div className="form-group"><label>Behörde</label><input type="text" value={genForm.behoerde} onChange={e => setGenForm(f => ({ ...f, behoerde: e.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group"><label>Status</label>
                <select value={genForm.status} onChange={e => setGenForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Frist</label><input type="date" value={genForm.frist} onChange={e => setGenForm(f => ({ ...f, frist: e.target.value }))} /></div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowGenModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveGen}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
