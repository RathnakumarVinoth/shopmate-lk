import axios from 'axios'
import {
  getSessionToken,
  isTokenExpired,
  redirectToLogin,
} from '../utils/session'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

const shopAccessMessages = [
  'Shop disabled',
  'Shop not found',
  'Subscription expired',
  'Subscription is not active',
  'Subscription suspended',
]

const isShopAccessError = (message = '') =>
  shopAccessMessages.some((shopMessage) => message.includes(shopMessage))

api.interceptors.request.use((config) => {
  const token = getSessionToken()

  if (token) {
    if (isTokenExpired(token)) {
      redirectToLogin('Session expired. Please login again.', {
        recordReason: 'Session expired',
      })
      return Promise.reject(new Error('Session expired. Please login again.'))
    }

    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestWasAuthenticated = Boolean(error.config?.headers?.Authorization)
    const message = error.response?.data?.message || ''
    const isAdminPath = window.location.pathname.startsWith('/admin')

    if (error.response?.status === 401 && requestWasAuthenticated) {
      redirectToLogin('Session expired. Please login again.')
    }

    if (!isAdminPath && error.response?.status === 403 && isShopAccessError(message)) {
      redirectToLogin(message, { clearShop: true })
    }

    return Promise.reject(error)
  },
)

export default api
