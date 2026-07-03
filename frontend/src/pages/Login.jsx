import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { getHomePath } from '../utils/permissions'

function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const sessionMessage = localStorage.getItem('sessionMessage')

    if (sessionMessage) {
      setMessage(sessionMessage)
      localStorage.removeItem('sessionMessage')
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
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(user))
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
        <p className="eyebrow">ShopMate LK</p>
        <h1>{t('login')}</h1>
        <form onSubmit={submit} className="form-stack">
          {message && <div className="info-banner">{message}</div>}
          {error && <div className="alert">{error}</div>}
          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : t('login')}
          </button>
        </form>
        <p className="auth-link">
          New shop? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  )
}

export default Login
