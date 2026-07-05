import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
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
  getShopSession,
  getShopSessionId,
  isTokenExpired,
  saveSession,
  saveShopSession,
} from '../utils/session'

const shopAccessMessages = [
  'Shop disabled',
  'Shop not found',
  'Subscription expired',
  'Subscription is not active',
  'Subscription suspended',
]

const isShopAccessError = (message = '') =>
  shopAccessMessages.some((shopMessage) => message.includes(shopMessage))

function RoleLogin() {
  const navigate = useNavigate()
  const shopSession = getShopSession()
  const shopSessionId = getShopSessionId(shopSession)
  const shopToken = shopSession?.shopToken
  const shopSessionInvalid = !shopSessionId || !shopToken || isTokenExpired(shopToken)
  const [form, setForm] = useState({ username: '', password: '' })
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

    if (shopSessionInvalid) {
      clearSession('Shop session expired. Please login again.', {
        broadcast: false,
        clearShop: true,
      })
      navigate('/shop-login', { replace: true })
    }
  }, [navigate, shopSessionInvalid])

  if (shopSessionInvalid) {
    return <Navigate to="/shop-login" replace />
  }

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!shopSessionId || !shopToken || isTokenExpired(shopToken)) {
      clearSession('Shop session expired. Please login again.', {
        broadcast: false,
        clearShop: true,
      })
      navigate('/shop-login', { replace: true })
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/auth/role-login', {
        username: form.username,
        password: form.password,
        shop_token: shopToken,
        shop_id: shopSessionId,
      })
      saveSession({ token: response.data.token, user: response.data.user })
      saveShopSession({
        shopToken,
        shop: response.data.shop || shopSession.shop,
      })
      navigate(getHomePath(response.data.user))
    } catch (err) {
      const apiMessage = getApiMessage(err, 'Invalid username/password')

      if (err.response?.status === 403 && isShopAccessError(apiMessage)) {
        clearSession(apiMessage, { broadcast: false, clearShop: true })
        navigate('/shop-login', { replace: true })
        return
      }

      setError(apiMessage)
    } finally {
      setLoading(false)
    }
  }

  const switchShop = () => {
    clearSession(undefined, { clearShop: true })
    navigate('/shop-login', { replace: true })
  }

  const shopName = shopSession.shop_name || shopSession.shop?.shop_name || t('Selected Shop')

  return (
    <main className="auth-page">
      <div className="auth-stack">
        <BrandLogo full className="auth-brand-logo" />
        <section className="auth-panel">
          <div className="auth-language">
            <LanguageSelector onLanguageChange={() => setLanguageVersion((version) => version + 1)} />
          </div>
          <p className="eyebrow">
            {t('Logging in to')}: {shopName}
          </p>
          <h1>{t('Role Login')}</h1>
          <form onSubmit={submit} className="form-stack">
            {message && <div className="info-banner">{message}</div>}
            {error && <div className="alert">{error}</div>}
            <label>
              {t('Username')}
              <input name="username" value={form.username} onChange={updateField} required autoFocus />
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
              {loading ? t('Logging in...') : t('Login')}
            </button>
          </form>
          <p className="auth-link">
            <button type="button" className="link-button" onClick={switchShop}>
              {t('Switch Shop')}
            </button>
          </p>
        </section>
      </div>
    </main>
  )
}

export default RoleLogin
