import React, { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('E-Mail oder Passwort falsch.')
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <div className="brand">GrundRiss</div>
          <div className="sub">by Dittrich</div>
        </div>
        <p className="login-tagline">Facility- & Genehmigungsmanagement</p>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>E-Mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@unternehmen.de" required />
          </div>
          <div className="form-group">
            <label>Passwort</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
          {error && <p className="error-msg">{error}</p>}
        </form>
      </div>
    </div>
  )
}
