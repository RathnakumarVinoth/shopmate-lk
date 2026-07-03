import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageSelector from '../components/LanguageSelector.jsx'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { getHomePath } from '../utils/permissions'
import { getShopSession, saveSession, saveShopSession } from '../utils/session'

function RoleLogin() {
  const navigate = useNavigate()
  const shopSession = getShopSession()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [, setLanguageVersion] = useState(0)

  useEffect(() => {
    if (!shopSession?.shopToken) {
      navigate('/shop-login', { replace: true })
    }
  }, [navigate, shopSession?.shopToken])

  if (!shopSession?.shopToken) {
    return <Navigate to="/shop-login" replace />
  }

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post('/auth/role-login', {
        username: form.username,
        password: form.password,
        shop_token: shopSession.shopToken,
      })
      saveSession({ token: response.data.token, user: response.data.user })
      saveShopSession({
        shopToken: shopSession.shopToken,
        shop: response.data.shop || shopSession.shop,
      })
      navigate(getHomePath(response.data.user))
    } catch (err) {
      setError(getApiMessage(err, 'Invalid username/password'))
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
          <p className="eyebrow">{shopSession.shop?.shop_name || t('Selected Shop')}</p>
          <h1>{t('Role Login')}</h1>
          <form onSubmit={submit} className="form-stack">
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
            <Link to="/shop-login">{t('Use another shop')}</Link>
          </p>
        </section>
      </div>
    </main>
  )
}

export default RoleLogin
