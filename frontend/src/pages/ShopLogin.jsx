import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageSelector from '../components/LanguageSelector.jsx'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { getHomePath } from '../utils/permissions'
import {
  clearSession,
  getSessionMessage,
  getSessionToken,
  getSessionUser,
  hasShopContext,
  isTokenExpired,
  saveShopSession,
} from '../utils/session'

function ShopLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ login_email: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [, setLanguageVersion] = useState(0)

  useEffect(() => {
    const sessionMessage = getSessionMessage()
    if (sessionMessage) setMessage(sessionMessage)

    const token = getSessionToken()

    if (token && !isTokenExpired(token)) {
      navigate(getHomePath(getSessionUser()), { replace: true })
      return
    }

    if (token && isTokenExpired(token)) {
      clearSession(undefined, { broadcast: false })
    }

    if (hasShopContext()) {
      navigate('/role-login', { replace: true })
    }
  }, [navigate])

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await api.post('/shop-auth/login', form)
      saveShopSession({
        shopToken: response.data.shop_token,
        shop: response.data.shop,
        shopLoginEmail: form.login_email,
      })
      navigate('/role-login')
    } catch (err) {
      setError(getApiMessage(err, 'Invalid shop login'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-stack">
        <BrandLogo full className="auth-brand-logo" />
        <section className="auth-panel">
          <div className="auth-language">
            <LanguageSelector onLanguageChange={() => setLanguageVersion((version) => version + 1)} />
          </div>
          <h1>{t('Shop Login')}</h1>
          <form onSubmit={submit} className="form-stack">
            {message && <div className="info-banner">{message}</div>}
            {error && <div className="alert">{error}</div>}
            <label>
              {t('Shop Email')}
              <input name="login_email" type="email" value={form.login_email} onChange={updateField} required />
            </label>
            <label>
              {t('Shop Password')}
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
              {loading ? t('Logging in...') : t('Continue')}
            </button>
          </form>
          <p className="auth-link">
            {t('Accounts are created by ShopMate LK admin.')} <Link to="/admin/login">{t('Admin Login')}</Link>
          </p>
        </section>
      </div>
    </main>
  )
}

export default ShopLogin
