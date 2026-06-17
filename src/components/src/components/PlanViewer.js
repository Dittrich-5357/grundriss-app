import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { fmtDate, tageBis, fristColor, statusColor, statusBg } from '../utils'

const TYPEN = ['Antrag', 'Bescheid', 'Nachtrag', 'Ablehnung', 'Sonstiges']
const STATUS = ['Offen', 'Beantragt', 'Erteilt', 'Abgelaufen']

// Ruft die Supabase Edge Function auf, die sicher mit der Anthropic API spricht
async function analyzeWithAI(base64Pdf) {
  const { data, error } = await supabase.functions.invoke('analyze-document', {
    body: { base64Pdf }
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// Hält das SVG-Overlay exakt über der sichtbaren Bildfläche (wichtig bei object-fit: contain)
function ImageAlignedOverlay({ containerRef, drawing, children }) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    const update = () => {
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const imgEl = container.querySelector('img')
      if (imgEl && imgEl.naturalWidth) {
        const containerRatio = containerRect.width / containerRect.height
        const imgRatio = imgEl.naturalWidth / imgEl.naturalHeight
        let w, h, offX, offY
        if (imgRatio > containerRatio) {
          w = containerRect.width
          h = w / imgRatio
          offX = 0
          offY = (containerRect.height - h) / 2
        } else {
          h = containerRect.height
          w = h * imgRatio
          offY = 0
          offX = (containerRect.width - w) / 2
        }
        setRect({ w, h, offX, offY })
      }
    }
    update()
    window.addEventListener('resize', update)
    const interval = setInterval(update, 300) // Bild lädt asynchron, kurz nachprüfen
    setTimeout(() => clearInterval(interval), 3000)
    return () => { window.removeEventListener('resize', update); clearInterval(interval) }
  }, [containerRef])

  if (!rect) return null
  return children(rect.w, rect.h, rect.offX, rect.offY)
}

export default function PlanViewer({ plan, onBack }) {
  const [zonen, setZonen] = useState([])
  const [selectedZone, setSelectedZone] = useState(null)
  const [genehmigungen, setGenehmigungen] = useState([])
  const [dokumente, setDokumente] = useState([])
  const [fristen, setFristen] = useState([])

  const [drawing, setDrawing] = useState(false)
  const [points, setPoints] = useState([])
  const [showZoneModal, setShowZoneModal] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [zoneNutzung, setZoneNutzung] = useState('')

  const [showDokModal, setShowDokModal] = useState(false)
  const [dokFiles, setDokFiles] = useState([])
  const [dokQueue, setDokQueue] = useState([]) // [{file, status, result, form}]

  const [showFristModal, setShowFristModal] = useState(false)
  const [fristForm, setFristForm] = useState({ name: '', typ: '', faellig: '' })
  const [showGenModal, setShowGenModal] = useState(false)
  const [genForm, setGenForm] = useState({ name: '', behoerde: '', status: 'Offen', frist: '' })

  const imgRef = useRef(null)

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
    loadZoneData(zone)
  }

  // Liefert das tatsächlich sichtbare Bild-Rechteck innerhalb des Containers
  // (wichtig bei object-fit: contain, wo Bild und Container nicht gleich groß sind)
  const getVisibleImageRect = () => {
    const container = imgRef.current
    if (!container) return null
    const containerRect = container.getBoundingClientRect()
    const imgEl = container.querySelector('img')

    if (imgEl && imgEl.naturalWidth) {
      const containerRatio = containerRect.width / containerRect.height
      const imgRatio = imgEl.naturalWidth / imgEl.naturalHeight
      let visW, visH, offX, offY
      if (imgRatio > containerRatio) {
        visW = containerRect.width
        visH = visW / imgRatio
        offX = 0
        offY = (containerRect.height - visH) / 2
      } else {
        visH = containerRect.height
        visW = visH * imgRatio
        offY = 0
        offX = (containerRect.width - visW) / 2
      }
      return {
        left: containerRect.left + offX,
        top: containerRect.top + offY,
        width: visW,
        height: visH
      }
    }
    return containerRect
  }

  // Freihand-Polygon zeichnen: Klicks setzen Punkte
  const handleCanvasClick = (e) => {
    if (!drawing) return
    const r = getVisibleImageRect()
    if (!r) return
    const xPx = e.clientX - r.left
    const yPx = e.clientY - r.top
    if (xPx < 0 || yPx < 0 || xPx > r.width || yPx > r.height) return
    const x = (xPx / r.width) * 100
    const y = (yPx / r.height) * 100
    setPoints(prev => [...prev, [x, y]])
  }

  const finishDrawing = () => {
    if (points.length < 3) { alert('Bitte mindestens 3 Punkte setzen um eine Fläche zu umfahren.'); return }
    setShowZoneModal(true)
  }

  const cancelDrawing = () => {
    setDrawing(false)
    setPoints([])
  }

  const saveZone = async () => {
    if (!zoneName || points.length < 3) return
    await supabase.from('zonen').insert({
      plan_id: plan.id,
      name: zoneName,
      nutzung: zoneNutzung,
      points: points // jsonb array of [x,y] percentage pairs
    })
    setZoneName(''); setZoneNutzung(''); setPoints([]); setDrawing(false); setShowZoneModal(false)
    loadZonen()
  }

  const polygonToSvgPoints = (zone) => {
    if (!zone.points || !Array.isArray(zone.points)) return ''
    return zone.points.map(p => `${p[0]},${p[1]}`).join(' ')
  }

  const zoneCenter = (zone) => {
    if (!zone.points || zone.points.length === 0) return [50, 50]
    const xs = zone.points.map(p => p[0])
    const ys = zone.points.map(p => p[1])
    return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys) - 3]
  }

  const zoneColor = (zone) => {
    const colors = ['#1A6B3C', '#1A3F8F', '#B84000', '#8A5200', '#B01B0C', '#6B3FA0']
    const idx = zonen.indexOf(zone) % colors.length
    return colors[idx]
  }

  // ---- Dokumente: Mehrfach-Upload mit KI-Analyse pro Datei ----
  const handleFilesSelected = (fileList) => {
    const files = Array.from(fileList)
    const queue = files.map(file => ({
      file, status: 'pending', result: null,
      form: { typ: '', bezeichnung: '', behoerde: '', aktenzeichen: '', antragsteller: '', datum: '', frist: '' }
    }))
    setDokQueue(queue)
    queue.forEach((item, idx) => processQueueItem(idx))
  }

  const processQueueItem = async (idx) => {
    setDokQueue(prev => prev.map((it, i) => i === idx ? { ...it, status: 'analyzing' } : it))
    try {
      const file = await new Promise((res) => {
        setDokQueue(prev => { res(prev[idx].file); return prev })
      })
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result.split(',')[1])
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const parsed = await analyzeWithAI(base64)
      setDokQueue(prev => prev.map((it, i) => i === idx ? {
        ...it, status: 'done', result: parsed,
        form: {
          typ: parsed.typ || '', bezeichnung: parsed.bezeichnung || '', behoerde: parsed.behoerde || '',
          aktenzeichen: parsed.aktenzeichen || '', antragsteller: parsed.antragsteller || '',
          datum: parsed.datum || '', frist: parsed.frist || ''
        }
      } : it))
    } catch (err) {
      setDokQueue(prev => prev.map((it, i) => i === idx ? { ...it, status: 'error', errorMsg: err.message } : it))
    }
  }

  const updateQueueForm = (idx, key, value) => {
    setDokQueue(prev => prev.map((it, i) => i === idx ? { ...it, form: { ...it.form, [key]: value } } : it))
  }

  const saveAllDocs = async () => {
    for (const item of dokQueue) {
      if (item.status === 'error') continue
      const ext = item.file.name.split('.').pop()
      const path = `dokumente/${Date.now()}_${Math.random().toString(36).slice(2)}_${item.file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const { error: uploadError } = await supabase.storage.from('plaene').upload(path, item.file)
      if (uploadError) continue
      const { data: { publicUrl } } = supabase.storage.from('plaene').getPublicUrl(path)
      await supabase.from('dokumente').insert({
        zone_id: selectedZone.id,
        plan_id: plan.id,
        ...item.form,
        datum: item.form.datum || null,
        frist: item.form.frist || null,
        file_url: publicUrl,
        ki_extraktion: item.result
      })
    }
    setDokQueue([])
    setShowDokModal(false)
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

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <button className="btn" onClick={onBack}>← Lagepläne</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>{plan.name}</h2>
        {!drawing ? (
          <button className="btn" onClick={() => { setDrawing(true); setPoints([]); setSelectedZone(null) }}>+ Gebäude umfahren</button>
        ) : (
          <>
            <span style={{ fontSize: 12, color: '#888' }}>{points.length} Punkte gesetzt</span>
            <button className="btn" onClick={cancelDrawing}>Abbrechen</button>
            <button className="btn btn-primary" onClick={finishDrawing} disabled={points.length < 3}>Fertig ✓</button>
          </>
        )}
      </div>

      {drawing && (
        <div style={{ background: '#EAF0FC', border: '1px solid #1A3F8F33', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: '#1A3F8F', marginBottom: 12, flexShrink: 0 }}>
          Klicke entlang der Gebäudekontur um Eckpunkte zu setzen. Wenn fertig, klick auf "Fertig ✓".
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: 16, overflow: 'hidden' }}>

        <div style={{ flex: 1, background: '#fff', border: '1px solid #e8e8e4', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
          <div
            ref={imgRef}
            style={{ width: '100%', height: '100%', position: 'relative', cursor: drawing ? 'crosshair' : 'default', userSelect: 'none' }}
            onClick={handleCanvasClick}
          >
            {plan.file_url ? (
              isImage ? (
                <img
                  src={plan.file_url} alt={plan.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', position: 'absolute', inset: 0 }}
                />
              ) : (
                <iframe src={plan.file_url} style={{ width: '100%', height: '100%', border: 'none', pointerEvents: drawing ? 'none' : 'auto' }} title="Lageplan" />
              )
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888', fontSize: 14 }}>
                Kein Lageplan hinterlegt
              </div>
            )}

            {/* SVG overlay - exakt über der sichtbaren Bildfläche positioniert */}
            {isImage ? (
              <ImageAlignedOverlay containerRef={imgRef} drawing={drawing}>
                {(w, h, offX, offY) => (
                  <>
                    <svg
                      style={{ position: 'absolute', left: offX, top: offY, width: w, height: h, pointerEvents: 'none' }}
                      viewBox="0 0 100 100" preserveAspectRatio="none"
                    >
                      {zonen.map(zone => (
                        <polygon
                          key={zone.id}
                          points={polygonToSvgPoints(zone)}
                          fill={selectedZone?.id === zone.id ? `${zoneColor(zone)}33` : `${zoneColor(zone)}1A`}
                          stroke={zoneColor(zone)}
                          strokeWidth="0.4"
                          style={{ pointerEvents: drawing ? 'none' : 'auto', cursor: 'pointer' }}
                          onClick={() => selectZone(zone)}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      {drawing && points.length > 0 && (
                        <>
                          <polyline
                            points={points.map(p => `${p[0]},${p[1]}`).join(' ')}
                            fill="none" stroke="#1A3F8F" strokeWidth="0.4" vectorEffect="non-scaling-stroke"
                          />
                          {points.map((p, i) => (
                            <circle key={i} cx={p[0]} cy={p[1]} r="0.8" fill="#1A3F8F" vectorEffect="non-scaling-stroke" />
                          ))}
                        </>
                      )}
                    </svg>
                    {zonen.map(zone => {
                      const [cx, cy] = zoneCenter(zone)
                      return (
                        <div key={zone.id} style={{
                          position: 'absolute',
                          left: offX + (cx / 100) * w,
                          top: offY + (cy / 100) * h,
                          transform: 'translate(-50%, -100%)',
                          background: zoneColor(zone), color: '#fff', fontSize: 10, fontWeight: 600,
                          padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none'
                        }}>
                          {zone.name}
                        </div>
                      )
                    })}
                  </>
                )}
              </ImageAlignedOverlay>
            ) : (
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                {zonen.map(zone => (
                  <polygon
                    key={zone.id}
                    points={polygonToSvgPoints(zone)}
                    fill={selectedZone?.id === zone.id ? `${zoneColor(zone)}33` : `${zoneColor(zone)}1A`}
                    stroke={zoneColor(zone)}
                    strokeWidth="0.4"
                    style={{ pointerEvents: drawing ? 'none' : 'auto', cursor: 'pointer' }}
                    onClick={() => selectZone(zone)}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {drawing && points.length > 0 && (
                  <>
                    <polyline
                      points={points.map(p => `${p[0]},${p[1]}`).join(' ')}
                      fill="none" stroke="#1A3F8F" strokeWidth="0.4" vectorEffect="non-scaling-stroke"
                    />
                    {points.map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r="0.8" fill="#1A3F8F" vectorEffect="non-scaling-stroke" />
                    ))}
                  </>
                )}
              </svg>
            )}

            {/* Labels - nur für nicht-Bild-Pläne hier, für Bilder innerhalb des Overlays oben */}
            {!isImage && zonen.map(zone => {
              const [cx, cy] = zoneCenter(zone)
              return (
                <div key={zone.id} style={{
                  position: 'absolute', left: `${cx}%`, top: `${cy}%`, transform: 'translate(-50%, -100%)',
                  background: zoneColor(zone), color: '#fff', fontSize: 10, fontWeight: 600,
                  padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none'
                }}>
                  {zone.name}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ width: 340, background: '#fff', border: '1px solid #e8e8e4', borderRadius: 12, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          {!selectedZone ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, textAlign: 'center', color: '#888' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⊞</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Gebäude auf dem Plan umfahren und anklicken</div>
              <div style={{ fontSize: 11 }}>{zonen.length} Bereiche markiert</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8e8e4', background: '#f5f5f3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Gebäude</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedZone.name}</div>
                  {selectedZone.nutzung && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{selectedZone.nutzung}</div>}
                </div>
                <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setSelectedZone(null)}>✕</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

                {/* Genehmigungen */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Genehmigungen</div>
                  <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setShowGenModal(true)}>+</button>
                </div>
                {genehmigungen.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 11, marginBottom: 16 }}>Keine erfasst</div>
                ) : genehmigungen.map(g => (
                  <div key={g.id} style={{ background: '#f5f5f3', borderRadius: 8, padding: '8px 10px', marginBottom: 6, borderLeft: `3px solid ${statusColor(g.status)}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{g.name}</div>
                    {g.behoerde && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{g.behoerde}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: statusBg(g.status), color: statusColor(g.status) }}>{g.status}</span>
                      {g.frist && <span style={{ fontSize: 10, color: fristColor(tageBis(g.frist)) }}>Frist: {fmtDate(g.frist)}</span>}
                    </div>
                  </div>
                ))}

                {/* Dokumente */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dokumente</div>
                  <button className="btn btn-primary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setShowDokModal(true)}>+ Hochladen</button>
                </div>
                {dokumente.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 11, marginBottom: 16 }}>Keine hochgeladen</div>
                ) : dokumente.map(d => (
                  <div key={d.id} style={{ background: '#f5f5f3', border: '1px solid #e8e8e4', borderRadius: 8, padding: '7px 9px', marginBottom: 6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{d.bezeichnung || d.typ}</div>
                      {d.behoerde && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{d.behoerde}</div>}
                      {d.aktenzeichen && <div style={{ fontSize: 10, color: '#888' }}>Az: {d.aktenzeichen}</div>}
                      {d.datum && <div style={{ fontSize: 10, color: '#888' }}>{fmtDate(d.datum)}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      {d.typ && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#EAF0FC', color: '#1A3F8F' }}>{d.typ}</span>}
                      <button className="btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => window.open(d.file_url, '_blank')}>↗</button>
                    </div>
                  </div>
                ))}

                {/* Fristen */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Fristen</div>
                  <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setShowFristModal(true)}>+</button>
                </div>
                {fristen.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 11 }}>Keine erfasst</div>
                ) : [...fristen].sort((a, b) => new Date(a.faellig) - new Date(b.faellig)).map(f => {
                  const tage = tageBis(f.faellig)
                  const fc = fristColor(tage)
                  const label = tage === null ? '–' : tage < 0 ? 'Abgelaufen' : tage === 0 ? 'Heute!' : `in ${tage} Tagen`
                  return (
                    <div key={f.id} style={{ background: '#f5f5f3', borderRadius: 8, padding: '7px 9px', marginBottom: 6, borderLeft: `3px solid ${fc}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{f.name}</div>
                        {f.typ && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{f.typ} · {fmtDate(f.faellig)}</div>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: fc, whiteSpace: 'nowrap' }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Zone name modal */}
      {showZoneModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setShowZoneModal(false)}>
          <div className="modal">
            <h3>Gebäude benennen</h3>
            <div className="form-group"><label>Name</label><input type="text" value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="z.B. Halle 3, Bürogebäude Nord" autoFocus /></div>
            <div className="form-group"><label>Nutzung (optional)</label><input type="text" value={zoneNutzung} onChange={e => setZoneNutzung(e.target.value)} placeholder="z.B. Produktion, Lager, Verwaltung" /></div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowZoneModal(false) }}>Abbrechen</button>
              <button className="btn btn-primary" onClick={saveZone}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* Dokumente modal - multi upload */}
      {showDokModal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && (dokQueue.length === 0) && setShowDokModal(false)}>
          <div className="modal" style={{ width: 560 }}>
            <h3>Dokumente hochladen</h3>
            <p style={{ fontSize: 12, color: '#888', marginBottom: '1rem' }}>{selectedZone?.name} – mehrere PDFs gleichzeitig möglich</p>

            {dokQueue.length === 0 && (
              <div className="form-group">
                <label>PDFs auswählen</label>
                <input type="file" accept=".pdf" multiple onChange={e => handleFilesSelected(e.target.files)} />
              </div>
            )}

            {dokQueue.map((item, idx) => (
              <div key={idx} style={{ border: '1px solid #e8e8e4', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{item.file.name}</span>
                  {item.status === 'analyzing' && <span style={{ fontSize: 11, color: '#1A3F8F' }}>✦ KI analysiert...</span>}
                  {item.status === 'done' && <span style={{ fontSize: 11, color: '#1A6B3C' }}>✓ Analysiert</span>}
                  {item.status === 'error' && <span style={{ fontSize: 11, color: '#B01B0C' }}>✕ Fehler</span>}
                </div>

                {item.status === 'error' && (
                  <div style={{ fontSize: 11, color: '#B01B0C', marginBottom: 6 }}>{item.errorMsg || 'KI-Analyse fehlgeschlagen'} – bitte manuell ausfüllen oder Dokument entfernen.</div>
                )}

                {(item.status === 'done' || item.status === 'error') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <select value={item.form.typ} onChange={e => updateQueueForm(idx, 'typ', e.target.value)} style={{ fontSize: 12, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6 }}>
                      <option value="">Typ wählen</option>
                      {TYPEN.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <input type="text" placeholder="Bezeichnung" value={item.form.bezeichnung} onChange={e => updateQueueForm(idx, 'bezeichnung', e.target.value)} style={{ fontSize: 12, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6 }} />
                    <input type="text" placeholder="Behörde" value={item.form.behoerde} onChange={e => updateQueueForm(idx, 'behoerde', e.target.value)} style={{ fontSize: 12, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6 }} />
                    <input type="text" placeholder="Aktenzeichen" value={item.form.aktenzeichen} onChange={e => updateQueueForm(idx, 'aktenzeichen', e.target.value)} style={{ fontSize: 12, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6 }} />
                    <input type="date" value={item.form.datum} onChange={e => updateQueueForm(idx, 'datum', e.target.value)} style={{ fontSize: 12, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6 }} />
                    <input type="date" placeholder="Frist" value={item.form.frist} onChange={e => updateQueueForm(idx, 'frist', e.target.value)} style={{ fontSize: 12, padding: '5px 7px', border: '1px solid #d0d0cc', borderRadius: 6 }} />
                  </div>
                )}
              </div>
            ))}

            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowDokModal(false); setDokQueue([]) }}>Abbrechen</button>
              {dokQueue.length > 0 && dokQueue.every(it => it.status === 'done' || it.status === 'error') && (
                <button className="btn btn-primary" onClick={saveAllDocs}>Alle speichern</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Frist modal */}
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

      {/* Genehmigung modal */}
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
