import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const priorityLabel = (priority) => priority || 'low'

function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/notifications')
      setNotifications(response.data.notifications || [])
    } catch {
      setError('Unable to load alerts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadNotifications()

    const refreshNotifications = () => loadNotifications()
    window.addEventListener('shopmate:data-changed', refreshNotifications)
    window.addEventListener('shopmate:settings-changed', refreshNotifications)

    return () => {
      window.removeEventListener('shopmate:data-changed', refreshNotifications)
      window.removeEventListener('shopmate:settings-changed', refreshNotifications)
    }
  }, [loadNotifications])

  const openLink = (link) => {
    if (!link) return
    setOpen(false)
    navigate(link)
  }

  const totalCount = notifications.reduce((sum, notification) => sum + Number(notification.count || 0), 0)

  return (
    <div className="notifications">
      <button
        type="button"
        className="notification-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span aria-hidden="true">🔔</span>
        <strong>{totalCount}</strong>
      </button>

      {open && (
        <section className="notification-menu">
          <div className="notification-menu-header">
            <strong>Alerts</strong>
            <button type="button" className="ghost-button" onClick={loadNotifications} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {error && <div className="notification-error">{error}</div>}

          <div className="notification-list">
            {notifications.map((notification) => (
              <article className="notification-item" key={notification.id}>
                <div>
                  <div className="notification-title-row">
                    <strong>{notification.title}</strong>
                    <span className={`priority-badge ${priorityLabel(notification.priority)}`}>
                      {priorityLabel(notification.priority)}
                    </span>
                  </div>
                  <p>{notification.message}</p>
                </div>
                {notification.link && (
                  <button type="button" className="ghost-button" onClick={() => openLink(notification.link)}>
                    Open
                  </button>
                )}
              </article>
            ))}

            {notifications.length === 0 && (
              <div className="notification-empty">No active alerts.</div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default Notifications
