import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import api from '../services/api'
import { scheduleSessionExpiry } from '../utils/session'
import Notifications from './Notifications.jsx'
import Sidebar from './Sidebar.jsx'

function Layout() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [, setSettingsVersion] = useState(0)

  useEffect(() => {
    return scheduleSessionExpiry()
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      if (user.role !== 'owner') return

      try {
        const response = await api.get('/settings')
        localStorage.setItem('shopSettings', JSON.stringify(response.data || {}))
        setSettingsVersion((version) => version + 1)
      } catch {
        localStorage.removeItem('shopSettings')
      }
    }

    loadSettings()
  }, [user.role])

  useEffect(() => {
    const handleSettingsChanged = () => {
      setSettingsVersion((version) => version + 1)
    }

    window.addEventListener('shopmate:settings-changed', handleSettingsChanged)
    return () => window.removeEventListener('shopmate:settings-changed', handleSettingsChanged)
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">ShopMate LK</p>
            <h1>{user?.name ? `Welcome, ${user.name}` : 'Point of Sale'}</h1>
          </div>
          <div className="topbar-actions">
            <Notifications />
            <div className="user-pill">
              <span>{user?.role || 'owner'}</span>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
