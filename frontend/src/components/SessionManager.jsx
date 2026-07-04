import { useEffect } from 'react'
import {
  clearHiddenAt,
  clearLegacyAuthStorage,
  getHiddenAt,
  getSecuritySettings,
  getSessionToken,
  isTokenExpired,
  redirectToLogin,
  saveHiddenAt,
  scheduleSessionExpiry,
  subscribeToSessionLogout,
} from '../utils/session'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
const INACTIVITY_MESSAGE = 'Session expired. Please login again.'
const EXPIRY_MESSAGE = 'Session expired. Please login again.'

function SessionManager() {
  useEffect(() => {
    let idleTimer
    let cancelExpiry
    let lastActivityAt = Date.now()
    let lastIdleScheduleAt = 0

    const logoutForInactivity = () => {
      redirectToLogin(INACTIVITY_MESSAGE, { recordReason: 'Idle timeout' })
    }

    const scheduleIdleLogout = () => {
      window.clearTimeout(idleTimer)
      if (!getSessionToken()) return

      const { idleTimeoutMinutes } = getSecuritySettings()
      const timeoutMs = idleTimeoutMinutes * 60 * 1000
      const remainingMs = Math.max(0, timeoutMs - (Date.now() - lastActivityAt))
      idleTimer = window.setTimeout(logoutForInactivity, remainingMs)
    }

    const handleActivity = () => {
      if (!getSessionToken() || document.hidden) return
      lastActivityAt = Date.now()
      if (lastActivityAt - lastIdleScheduleAt < 1000) return
      lastIdleScheduleAt = lastActivityAt
      scheduleIdleLogout()
    }

    const handleVisibilityChange = () => {
      if (!getSessionToken()) {
        clearHiddenAt()
        return
      }

      if (document.hidden) {
        window.clearTimeout(idleTimer)
        saveHiddenAt()
        return
      }

      const hiddenAt = getHiddenAt()
      clearHiddenAt()

      if (hiddenAt) {
        const { backgroundLogoutMinutes } = getSecuritySettings()
        const backgroundTimeoutMs = backgroundLogoutMinutes * 60 * 1000

        if (Date.now() - hiddenAt > backgroundTimeoutMs) {
          redirectToLogin(INACTIVITY_MESSAGE, { recordReason: 'Idle timeout' })
          return
        }
      }

      handleActivity()
    }

    const handleSettingsChanged = () => {
      lastActivityAt = Date.now()
      scheduleIdleLogout()
    }

    const handleRemoteLogout = (message, payload) => {
      redirectToLogin(message || '', {
        broadcast: false,
        clearShop: Boolean(payload?.clearShop),
      })
    }

    const startSessionTimers = () => {
      const token = getSessionToken()
      if (!token) return

      if (isTokenExpired(token)) {
        redirectToLogin(EXPIRY_MESSAGE, { recordReason: 'Session expired' })
        return
      }

      lastActivityAt = Date.now()
      cancelExpiry?.()
      cancelExpiry = scheduleSessionExpiry()
      scheduleIdleLogout()
    }

    const unsubscribe = subscribeToSessionLogout(handleRemoteLogout)

    clearLegacyAuthStorage()
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true })
    })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('shopmate:settings-changed', handleSettingsChanged)
    window.addEventListener('shopmate:session-started', startSessionTimers)
    startSessionTimers()

    return () => {
      window.clearTimeout(idleTimer)
      cancelExpiry?.()
      unsubscribe()
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('shopmate:settings-changed', handleSettingsChanged)
      window.removeEventListener('shopmate:session-started', startSessionTimers)
    }
  }, [])

  return null
}

export default SessionManager
