import axios from 'axios'
import {
  getSessionToken,
  isTokenExpired,
  redirectToLogin,
} from '../utils/session'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

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

    if (error.response?.status === 401 && requestWasAuthenticated) {
      redirectToLogin('Session expired. Please login again.')
    }

    return Promise.reject(error)
  },
)

export default api
