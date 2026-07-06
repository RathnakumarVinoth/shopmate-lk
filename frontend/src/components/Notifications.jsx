import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { hasPermission } from '../utils/permissions'
import { getSessionUser } from '../utils/session'

const priorityLabel = (priority) => priority || 'low'

function Notifications() {
  const navigate = useNavigate()
  const user = getSessionUser()
  const endpoint = user.role === 'admin' ? '/admin/notifications' : '/notifications'
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [actionId, setActionId] = useState(null)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get(endpoint)
      setNotifications(response.data.notifications || [])
      setUnreadCount(Number(response.data.unread_count || 0))
    } catch {
      setError(t('Unable to load alerts'))
    } finally {
      setLoading(false)
    }
  }, [endpoint])

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

  const markRead = async (notification) => {
    if (!notification.persisted || notification.status === 'read') return
    setActionId(notification.id)
    setError('')

    try {
      await api.patch(`/notifications/${notification.id}/read`)
      await loadNotifications()
    } catch {
      setError(t('Unable to update notification'))
    } finally {
      setActionId(null)
    }
  }

  if (!user || (user.role !== 'admin' && !hasPermission(user, 'notifications_access'))) {
    return null
  }

  return (
    <div className="notifications">
      <button
        type="button"
        className="notification-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={t('Notifications')}
      >
        <span className="notification-icon" aria-hidden="true">!</span>
        <strong>{unreadCount}</strong>
      </button>

      {open && (
        <section className="notification-menu">
          <div className="notification-menu-header">
            <strong>{t('Alerts')}</strong>
            <button type="button" className="ghost-button" onClick={loadNotifications} disabled={loading}>
              {loading ? t('Refreshing...') : t('Refresh')}
            </button>
          </div>

          {error && <div className="notification-error">{error}</div>}

          <div className="notification-list">
            {notifications.map((notification) => (
              <article className="notification-item" key={notification.id}>
                <div>
                  <div className="notification-title-row">
                    <strong>{t(notification.title)}</strong>
                    <span className={`priority-badge ${priorityLabel(notification.priority)}`}>
                      {priorityLabel(notification.priority)}
                    </span>
                  </div>
                  <p>{notification.persisted ? notification.message : t(notification.message)}</p>
                </div>
                <div className="table-actions">
                  {notification.persisted && notification.status === 'unread' && (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => markRead(notification)}
                      disabled={actionId === notification.id}
                    >
                      {actionId === notification.id ? t('Saving...') : t('Mark Read')}
                    </button>
                  )}
                  {notification.link && (
                    <button type="button" className="ghost-button" onClick={() => openLink(notification.link)}>
                      {t('Open')}
                    </button>
                  )}
                </div>
              </article>
            ))}

            {notifications.length === 0 && (
              <div className="notification-empty">{t('No active alerts.')}</div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default Notifications
