import axios from 'axios'
import { clearSession, isTokenExpired, redirectToLogin } from '../utils/session'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')

  if (token) {
    if (isTokenExpired(token)) {
      redirectToLogin()
      return Promise.reject(new Error('Session expired. Please login again.'))
    }

    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession('Session expired. Please login again.')

      if (window.location.pathname !== '/login') {
        const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login'
        window.location.href = loginPath
      }
    }

    return Promise.reject(error)
  },
)

export default api
