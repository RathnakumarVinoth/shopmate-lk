const AUTH_CHANNEL = 'shopmate-auth'
const AUTH_EVENT_KEY = 'shopmate-auth-event'
const HIDDEN_AT_KEY = 'shopmate-hidden-at'
const SHOP_SESSION_KEY = 'shopmate-shop-session'
const DEFAULT_IDLE_TIMEOUT_MINUTES = 15
const DEFAULT_BACKGROUND_LOGOUT_MINUTES = 3

let authChannel

const getAuthChannel = () => {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null
  if (!authChannel) authChannel = new BroadcastChannel(AUTH_CHANNEL)
  return authChannel
}

const safeJsonParse = (value, fallback = {}) => {
  try {
    return JSON.parse(value || '')
  } catch {
    return fallback
  }
}

export const getSessionMessage = () => {
  const message = sessionStorage.getItem('sessionMessage') || localStorage.getItem('sessionMessage')
  sessionStorage.removeItem('sessionMessage')
  localStorage.removeItem('sessionMessage')
  return message
}

export const clearLegacyAuthStorage = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('shopSettings')
}

export const saveSession = ({ token, user }) => {
  sessionStorage.setItem('token', token)
  sessionStorage.setItem('user', JSON.stringify(user || {}))
  sessionStorage.removeItem(HIDDEN_AT_KEY)
  clearLegacyAuthStorage()
  window.dispatchEvent(new Event('shopmate:session-started'))
}

export const saveShopSession = ({ shopToken, shop }) => {
  sessionStorage.setItem(
    SHOP_SESSION_KEY,
    JSON.stringify({
      shopToken,
      shop: shop || {},
    }),
  )
}

export const getShopSession = () => safeJsonParse(sessionStorage.getItem(SHOP_SESSION_KEY), null)

export const clearShopSession = () => sessionStorage.removeItem(SHOP_SESSION_KEY)

export const getSessionToken = () => sessionStorage.getItem('token')

export const getSessionUser = () => safeJsonParse(sessionStorage.getItem('user'), {})

export const getStoredSettings = () => safeJsonParse(sessionStorage.getItem('shopSettings'), {})

export const saveStoredSettings = (settings) => {
  sessionStorage.setItem('shopSettings', JSON.stringify(settings || {}))
  localStorage.removeItem('shopSettings')
}

export const clearStoredSettings = () => {
  sessionStorage.removeItem('shopSettings')
  localStorage.removeItem('shopSettings')
}

export const getSecuritySettings = () => {
  const settings = getStoredSettings()
  const idleTimeout = Number(settings.idle_timeout_minutes)
  const backgroundTimeout = Number(settings.background_logout_minutes)

  return {
    idleTimeoutMinutes: idleTimeout > 0 ? idleTimeout : DEFAULT_IDLE_TIMEOUT_MINUTES,
    backgroundLogoutMinutes:
      backgroundTimeout > 0 ? backgroundTimeout : DEFAULT_BACKGROUND_LOGOUT_MINUTES,
  }
}

export const saveHiddenAt = (timestamp = Date.now()) => {
  sessionStorage.setItem(HIDDEN_AT_KEY, String(timestamp))
}

export const getHiddenAt = () => {
  const timestamp = Number(sessionStorage.getItem(HIDDEN_AT_KEY))
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

export const clearHiddenAt = () => sessionStorage.removeItem(HIDDEN_AT_KEY)

export const getTokenPayload = (token = getSessionToken()) => {
  if (!token) return null

  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(window.atob(padded))
  } catch {
    return null
  }
}

export const getTokenExpiresAt = (token = getSessionToken()) => {
  const payload = getTokenPayload(token)
  return payload?.exp ? payload.exp * 1000 : null
}

export const isTokenExpired = (token = getSessionToken()) => {
  const expiresAt = getTokenExpiresAt(token)
  return !expiresAt || Date.now() >= expiresAt
}

export const recordAutoLogout = (reason = 'Session expired') => {
  const token = getSessionToken()
  if (!token || typeof fetch === 'undefined') return

  const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  fetch(`${baseUrl}/auth/auto-logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: reason }),
    keepalive: true,
  }).catch(() => {})
}

export const clearSession = (message, options = {}) => {
  const { broadcast = true, recordReason = '' } = options

  if (recordReason) {
    recordAutoLogout(recordReason)
  }

  sessionStorage.removeItem('token')
  sessionStorage.removeItem('user')
  sessionStorage.removeItem('shopSettings')
  sessionStorage.removeItem(SHOP_SESSION_KEY)
  sessionStorage.removeItem(HIDDEN_AT_KEY)
  clearLegacyAuthStorage()

  if (message) {
    sessionStorage.setItem('sessionMessage', message)
  }

  if (broadcast) {
    const payload = {
      type: 'logout',
      message,
      at: Date.now(),
    }

    getAuthChannel()?.postMessage(payload)
    localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(payload))
    localStorage.removeItem(AUTH_EVENT_KEY)
  }
}

export const redirectToLogin = (
  message = 'Session expired. Please login again.',
  options = {},
) => {
  const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/shop-login'
  clearSession(message, options)

  if (window.location.pathname !== loginPath) {
    window.location.href = loginPath
  }
}

export const scheduleSessionExpiry = () => {
  const expiresAt = getTokenExpiresAt()

  if (!expiresAt) return undefined

  const delay = expiresAt - Date.now()

  if (delay <= 0) {
    redirectToLogin('Session expired. Please login again.', {
      recordReason: 'Session expired',
    })
    return undefined
  }

  const timeout = window.setTimeout(
    () =>
      redirectToLogin('Session expired. Please login again.', {
        recordReason: 'Session expired',
      }),
    delay,
  )
  return () => window.clearTimeout(timeout)
}

export const subscribeToSessionLogout = (onLogout) => {
  const channel = getAuthChannel()
  const handleMessage = (event) => {
    if (event.data?.type === 'logout') {
      onLogout(event.data.message)
    }
  }

  const handleStorage = (event) => {
    if (event.key !== AUTH_EVENT_KEY || !event.newValue) return
    const payload = safeJsonParse(event.newValue, null)
    if (payload?.type === 'logout') {
      onLogout(payload.message)
    }
  }

  channel?.addEventListener('message', handleMessage)
  window.addEventListener('storage', handleStorage)

  return () => {
    channel?.removeEventListener('message', handleMessage)
    window.removeEventListener('storage', handleStorage)
  }
}
