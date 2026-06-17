// Gemeinsame Hilfsfunktionen für Datum, Status und Erinnerungslogik

export function fmtDate(d) {
  if (!d) return '–'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

export function tageBis(d) {
  if (!d) return null
  const heute = new Date()
  heute.setHours(0, 0, 0, 0)
  const ziel = new Date(d)
  return Math.round((ziel - heute) / (1000 * 60 * 60 * 24))
}

export function statusColor(s) {
  return { 'Erteilt': '#1A6B3C', 'Beantragt': '#1A3F8F', 'Offen': '#8A5200', 'Abgelaufen': '#B01B0C' }[s] || '#888'
}

export function statusBg(s) {
  return { 'Erteilt': '#EAF4EE', 'Beantragt': '#EAF0FC', 'Offen': '#FEF6E4', 'Abgelaufen': '#FDECEA' }[s] || '#f5f5f3'
}

export function fristColor(tage) {
  if (tage === null) return '#888'
  if (tage < 0) return '#B01B0C'
  if (tage <= 14) return '#B01B0C'
  if (tage <= 90) return '#8A5200'
  return '#1A6B3C'
}

// Erinnerungslogik: 3 Monate (90 Tage) vorher, dann alle 2 Wochen bis Ablauf
// Gibt true zurück, wenn die Frist innerhalb des Erinnerungsfensters liegt
export function brauchtErinnerung(tage) {
  if (tage === null) return false
  return tage <= 90
}

export function erinnerungsStufe(tage) {
  if (tage === null) return null
  if (tage < 0) return 'abgelaufen'
  if (tage <= 14) return 'dringend'
  if (tage <= 90) return 'hinweis'
  return null
}

// Sammelt alle Fristen (aus Genehmigungen + eigenständigen Fristen) die im Erinnerungsfenster liegen
export function sammleErinnerungen(genehmigungen, fristen) {
  const result = []

  genehmigungen.forEach(g => {
    if (!g.frist || g.status === 'Erteilt') return
    const tage = tageBis(g.frist)
    if (brauchtErinnerung(tage)) {
      result.push({
        id: 'gen-' + g.id,
        typ: 'Genehmigung',
        name: g.name,
        datum: g.frist,
        tage,
        stufe: erinnerungsStufe(tage)
      })
    }
  })

  fristen.forEach(f => {
    if (!f.faellig) return
    const tage = tageBis(f.faellig)
    if (brauchtErinnerung(tage)) {
      result.push({
        id: 'frist-' + f.id,
        typ: f.typ || 'Frist',
        name: f.name,
        datum: f.faellig,
        tage,
        stufe: erinnerungsStufe(tage)
      })
    }
  })

  return result.sort((a, b) => a.tage - b.tage)
}
