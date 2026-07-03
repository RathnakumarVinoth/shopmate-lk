import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { saveSession } from '../utils/session'

const initialForm = {
  name: '',
  email: '',
  password: '',
  shop_name: '',
  phone: '',
  address: '',
}

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post('/auth/register', form)

      if (response.data.token) {
        saveSession({
          token: response.data.token,
          user: response.data.user || {},
        })
      }

      navigate('/dashboard')
    } catch (err) {
      setError(getApiMessage(err, 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel wide-auth">
        <p className="eyebrow">ShopMate LK</p>
        <h1>{t('Register')}</h1>
        <form onSubmit={submit} className="form-grid">
          {error && <div className="alert full-width">{error}</div>}
          <label>
            {t('Owner Name')}
            <input name="name" value={form.name} onChange={updateField} required />
          </label>
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
          <label>
            {t('Shop Name')}
            <input name="shop_name" value={form.shop_name} onChange={updateField} required />
          </label>
          <label>
            {t('Phone')}
            <input name="phone" value={form.phone} onChange={updateField} required />
          </label>
          <label>
            {t('Address')}
            <input name="address" value={form.address} onChange={updateField} required />
          </label>
          <button type="submit" className="full-width" disabled={loading}>
            {loading ? t('Creating account...') : t('Create Account')}
          </button>
        </form>
        <p className="auth-link">
          {t('Already registered?')} <Link to="/login">{t('Login')}</Link>
        </p>
      </section>
    </main>
  )
}

export default Register
