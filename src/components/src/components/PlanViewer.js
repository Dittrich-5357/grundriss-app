
import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Plaene from './components/Plaene'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [screen, setScreen] = useState('plaene')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (!session) return <Login />

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="brand">GrundRiss</div>
          <div className="sub">by Dittrich</div>
        </div>
        <nav>
          <button className={`nav-item ${screen === 'dashboard' ? 'active' : ''}`} onClick={() => setScreen('dashboard')}>
            <span className="nav-icon">▦</span> Dashboard
          </button>
          <button className={`nav-item ${screen === 'plaene' ? 'active' : ''}`} onClick={() => setScreen('plaene')}>
            <span className="nav-icon">⊞</span> Lagepläne
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => supabase.auth.signOut()}>
            <span className="nav-icon">→</span> Abmelden
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1 className="topbar-title">
            {screen === 'dashboard' && 'Dashboard'}
            {screen === 'plaene' && 'Lagepläne'}
          </h1>
          <div className="topbar-user">
            <div className="avatar">{session.user.email[0].toUpperCase()}</div>
            <span>{session.user.email}</span>
          </div>
        </header>

        <div className="content">
          {screen === 'dashboard' && <Dashboard setScreen={setScreen} />}
          {screen === 'plaene' && <Plaene />}
        </div>
      </div>
    </div>
  )
}
