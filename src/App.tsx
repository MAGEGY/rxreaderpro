import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { matchMedicines, parseMedicineCsv } from './lib/medicineMatcher'
import { processPrescriptionText } from './lib/textPostProcessor'
import type { MatchedMedicine, Medicine, ProcessedPrescription } from './lib/types'

type Status = 'loading-db' | 'idle' | 'camera' | 'ocr' | 'done' | 'error'

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<Status>('loading-db')
  const [db, setDb] = useState<Medicine[]>([])
  const [dbError, setDbError] = useState('')
  const [prescription, setPrescription] = useState<ProcessedPrescription | null>(null)
  const [matches, setMatches] = useState<MatchedMedicine[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'medicine.csv')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((csv) => {
        setDb(parseMedicineCsv(csv))
        setStatus('idle')
      })
      .catch((e) => {
        setDbError(`Failed to load medicine database: ${e.message}`)
        setStatus('error')
      })
    return () => streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setStatus('camera')
    } catch {
      setError('Camera not available. Use "Upload image" instead.')
      setStatus('error')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function runOcr(canvas: HTMLCanvasElement) {
    setStatus('ocr')
    stopCamera()
    try {
      const result = await window.Tesseract.recognize(canvas, 'eng')
      const text = result.data.text
      if (!text.trim()) {
        setError('No text recognized. Try a clearer photo.')
        setStatus('error')
        return
      }
      setPrescription(processPrescriptionText(text))
      setMatches(matchMedicines(text, db))
      setStatus('done')
    } catch {
      setError('OCR failed. Please try again.')
      setStatus('error')
    }
  }

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    runOcr(canvas)
  }

  function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      runOcr(canvas)
    }
    img.src = URL.createObjectURL(file)
  }

  function reset() {
    setPrescription(null)
    setMatches([])
    setError('')
    setStatus('idle')
  }

  return (
    <div className="app">
      <header className="header">
        <h1>💊 RxReaderPro</h1>
        <p className="subtitle">Medical prescription OCR with structured extraction ({db.length} medicines)</p>
      </header>

      {status === 'loading-db' && <p className="loading">⏳ Loading medicine database…</p>}
      {dbError && <p className="error">{dbError}</p>}

      {(status === 'idle' || status === 'error') && !dbError && (
        <div className="actions">
          <button className="primary" onClick={startCamera}>📷 Start camera</button>
          <label className="primary upload">
            🖼 Upload prescription
            <input type="file" accept="image/*" onChange={onUpload} hidden />
          </label>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {status === 'camera' && (
        <div className="camera">
          <video ref={videoRef} autoPlay playsInline />
          <div className="actions">
            <button className="primary" onClick={capture}>📸 Capture & process</button>
            <button onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {status === 'ocr' && <p className="loading">⏳ Processing prescription… first use downloads the language model.</p>}

      {status === 'done' && prescription && (
        <>
          <section className="card">
            <h2>Prescription details</h2>
            <div className="detail-grid">
              <div><span className="muted">Patient</span><strong>{prescription.patientInfo.name || '—'}</strong></div>
              <div><span className="muted">DOB</span><strong>{prescription.patientInfo.dateOfBirth || '—'}</strong></div>
              <div><span className="muted">Patient ID</span><strong>{prescription.patientInfo.patientId || '—'}</strong></div>
              <div><span className="muted">Doctor</span><strong>{prescription.doctorInfo.name || '—'}</strong></div>
              <div><span className="muted">License</span><strong>{prescription.doctorInfo.licenseNumber || '—'}</strong></div>
              <div><span className="muted">Date</span><strong>{prescription.date || '—'}</strong></div>
            </div>

            <h3>Medications ({prescription.medication.length})</h3>
            <ul className="med-list">
              {prescription.medication.map((m, i) => (
                <li key={i}>
                  <div className="med-row">
                    <strong>{m.name}</strong>
                    <span className="strength">{m.strength}</span>
                  </div>
                  <div className="med-details">
                    {m.frequency && <span>🔁 {m.frequency}</span>}
                    {m.duration && <span>📅 {m.duration}</span>}
                  </div>
                  {m.instructions && <p className="muted">{m.instructions}</p>}
                </li>
              ))}
            </ul>
            {prescription.medication.length === 0 && <p className="muted">No medications detected.</p>}

            {prescription.instructions && (
              <details>
                <summary>General instructions</summary>
                <pre>{prescription.instructions}</pre>
              </details>
            )}
          </section>

          <section className="card">
            <h2>Matched medicines ({matches.length})</h2>
            {matches.length === 0 && <p className="muted">No database matches.</p>}
            <ul className="match-list">
              {matches.map((m) => (
                <li key={m.medicine.name}>
                  <div className="med-row">
                    <strong>{m.medicine.name}</strong>
                    <span className="badge">{Math.round(m.confidence * 100)}%</span>
                  </div>
                  <div className="muted">{m.medicine.description}</div>
                  <div className="progress">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${m.confidence * 100}%`,
                        background: m.confidence >= 0.7 ? '#16a34a' : m.confidence >= 0.4 ? '#f59e0b' : '#dc2626',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="actions">
            <button className="primary" onClick={() => window.print()}>🖨 Print report</button>
            <button onClick={reset}>Scan another</button>
          </div>

          <details className="card">
            <summary>Raw OCR text</summary>
            <pre>{prescription.rawText}</pre>
          </details>
        </>
      )}

      <footer className="footer">Not a medical device. Always verify with a healthcare professional.</footer>
    </div>
  )
}
