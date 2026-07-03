export const getTokenPayload = (token = localStorage.getItem('token')) => {
  if (!token) return null

  try {
    const [, payload] = token.split('.')
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(window.atob(normalized))
  } catch {
    return null
  }
}

export const getTokenExpiresAt = (token = localStorage.getItem('token')) => {
  const payload = getTokenPayload(token)
  return payload?.exp ? payload.exp * 1000 : null
}

export const isTokenExpired = (token = localStorage.getItem('token')) => {
  const expiresAt = getTokenExpiresAt(token)
  return Boolean(expiresAt && Date.now() >= expiresAt)
}

export const clearSession = (message) => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('shopSettings')

  if (message) {
    localStorage.setItem('sessionMessage', message)
  }
}

export const redirectToLogin = (message = 'Session expired. Please login again.') => {
  const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login'
  clearSession(message)

  if (window.location.pathname !== loginPath) {
    window.location.href = loginPath
  }
}

export const scheduleSessionExpiry = () => {
  const expiresAt = getTokenExpiresAt()

  if (!expiresAt) return undefined

  const delay = expiresAt - Date.now()

  if (delay <= 0) {
    redirectToLogin()
    return undefined
  }

  const timeout = window.setTimeout(() => redirectToLogin(), delay)
  return () => window.clearTimeout(timeout)
}
