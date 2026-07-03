import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { getHomePath } from '../utils/permissions'
import { getSessionMessage, saveSession } from '../utils/session'
import LanguageSelector from '../components/LanguageSelector.jsx'

function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [, setLanguageVersion] = useState(0)

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
      saveSession({ token: response.data.token, user })
      navigate(getHomePath(user))
    } catch (err) {
      setError(getApiMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-language">
          <LanguageSelector onLanguageChange={() => setLanguageVersion((version) => version + 1)} />
        </div>
        <p className="eyebrow">ShopMate LK</p>
        <h1>{t('login')}</h1>
        <form onSubmit={submit} className="form-stack">
          {message && <div className="info-banner">{message}</div>}
          {error && <div className="alert">{error}</div>}
          <label>
            {t('Email')}
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            {t('Password')}
            <span className="password-field">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={updateField}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={t(showPassword ? 'Hide password' : 'Show password')}
              >
                {t(showPassword ? 'Hide' : 'Show')}
              </button>
            </span>
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : t('login')}
          </button>
        </form>
        <p className="auth-link">
          {t('New shop?')} <Link to="/register">{t('Create an account')}</Link>
        </p>
      </section>
    </main>
  )
}

export default Login
