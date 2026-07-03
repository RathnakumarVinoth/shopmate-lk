import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { getSessionMessage, saveSession } from '../utils/session'

function AdminLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const sessionMessage = getSessionMessage()

    if (sessionMessage) {
      setMessage(sessionMessage)
    }
  }, [])

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await api.post('/auth/login', form)
      const user = response.data.user || {}

      if (user.role !== 'admin') {
        setError('This login is only for super admins')
        return
      }

      saveSession({ token: response.data.token, user })
      navigate('/admin/dashboard')
    } catch (err) {
      setError(getApiMessage(err, 'Admin login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">ShopMate LK</p>
        <h1>{t('Admin Login')}</h1>
        <form onSubmit={submit} className="form-stack">
          {message && <div className="info-banner">{message}</div>}
          {error && <div className="alert">{error}</div>}
          <label>
            {t('Email')}
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            {t('Password')}
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? t('Logging in...') : t('Login as Admin')}
          </button>
        </form>
        <p className="auth-link">
          {t('Shop user?')} <Link to="/login">{t('Go to shop login')}</Link>
        </p>
      </section>
    </main>
  )
}

export default AdminLogin
