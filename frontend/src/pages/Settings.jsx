import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const currencies = ['LKR', 'USD', 'GBP', 'AUD', 'CAD', 'EUR']
const receiptSizes = ['58mm', '80mm']

const initialForm = {
  shop_name: '',
  phone: '',
  email: '',
  address: '',
  receipt_footer: '',
  currency: 'LKR',
  default_low_stock_limit: '5',
  tax_percentage: '0',
  logo_url: '',
  default_receipt_size: '80mm',
}

const settingsToForm = (settings) => ({
  shop_name: settings.shop_name || '',
  phone: settings.phone || '',
  email: settings.email || '',
  address: settings.address || '',
  receipt_footer: settings.receipt_footer || '',
  currency: settings.currency || 'LKR',
  default_low_stock_limit: String(settings.default_low_stock_limit ?? 5),
  tax_percentage: String(settings.tax_percentage ?? 0),
  logo_url: settings.logo_url || '',
  default_receipt_size: receiptSizes.includes(settings.default_receipt_size)
    ? settings.default_receipt_size
    : '80mm',
})

function Settings() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
  })
  const [savedSettings, setSavedSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadSettings = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/settings')
      const settings = response.data || {}
      setSavedSettings(settings)
      setForm(settingsToForm(settings))
      localStorage.setItem('shopSettings', JSON.stringify(settings))
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load settings'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const updatePasswordField = (event) => {
    const { name, value } = event.target
    setPasswordForm((current) => ({ ...current, [name]: value }))
  }

  const resetForm = () => {
    setForm(settingsToForm(savedSettings || initialForm))
    setMessage('')
    setError('')
  }

  const saveSettings = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const response = await api.put('/settings', {
        ...form,
        default_low_stock_limit: Number(form.default_low_stock_limit || 0),
        tax_percentage: Number(form.tax_percentage || 0),
        default_receipt_size: receiptSizes.includes(form.default_receipt_size)
          ? form.default_receipt_size
          : '80mm',
      })
      const settings = response.data.settings || response.data

      setSavedSettings(settings)
      setForm(settingsToForm(settings))
      localStorage.setItem('shopSettings', JSON.stringify(settings))
      window.dispatchEvent(new Event('shopmate:settings-changed'))
      setMessage('Settings saved successfully')
    } catch (err) {
      setError(getApiMessage(err, 'Failed to save settings'))
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    try {
      await api.put('/auth/change-password', passwordForm)
      setPasswordForm({ current_password: '', new_password: '' })
      setMessage('Password changed successfully')
    } catch (err) {
      setError(getApiMessage(err, 'Failed to change password'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">Loading settings...</div>
  }

  return (
    <section className="page-stack">
      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <form onSubmit={saveSettings} className="page-stack">
        <section className="panel">
          <div className="section-heading">
            <h2>Shop Profile</h2>
          </div>
          <div className="form-grid">
            <label>
              Shop Name
              <input name="shop_name" value={form.shop_name} onChange={updateField} required />
            </label>
            <label>
              Phone
              <input name="phone" value={form.phone} onChange={updateField} />
            </label>
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={updateField} />
            </label>
            <label>
              Address
              <input name="address" value={form.address} onChange={updateField} />
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Receipt Settings</h2>
          </div>
          <div className="form-grid">
            <label className="full-width">
              Receipt Footer Message
              <input
                name="receipt_footer"
                value={form.receipt_footer}
                onChange={updateField}
                placeholder="Thank you for shopping with us."
              />
            </label>
            <label className="full-width">
              Logo URL
              <input name="logo_url" value={form.logo_url} onChange={updateField} />
            </label>
            <label>
              Thermal Receipt Size
              <select
                name="default_receipt_size"
                value={form.default_receipt_size}
                onChange={updateField}
              >
                {receiptSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Business Preferences</h2>
          </div>
          <div className="form-grid">
            <label>
              Currency
              <select name="currency" value={form.currency} onChange={updateField}>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Default Low Stock Limit
              <input
                name="default_low_stock_limit"
                type="number"
                min="0"
                value={form.default_low_stock_limit}
                onChange={updateField}
              />
            </label>
            <label>
              Tax Percentage
              <input
                name="tax_percentage"
                type="number"
                min="0"
                step="0.01"
                value={form.tax_percentage}
                onChange={updateField}
              />
            </label>
          </div>
        </section>

        <div className="settings-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button type="button" className="ghost-button" onClick={resetForm} disabled={saving}>
            Reset Form
          </button>
        </div>
      </form>

      <section className="panel">
        <div className="section-heading">
          <h2>Security Settings</h2>
          <button type="button" className="ghost-button" onClick={() => navigate('/login-activity')}>
            Login Activity
          </button>
        </div>
        <p className="muted">
          Sessions expire automatically after the configured JWT lifetime. You will be asked to
          login again when your session expires.
        </p>
        <form onSubmit={changePassword} className="form-grid compact-form">
          <label>
            Current Password
            <input
              name="current_password"
              type="password"
              value={passwordForm.current_password}
              onChange={updatePasswordField}
              required
            />
          </label>
          <label>
            New Password
            <input
              name="new_password"
              type="password"
              value={passwordForm.new_password}
              onChange={updatePasswordField}
              required
            />
          </label>
          <button type="submit" className="full-width" disabled={saving}>
            {saving ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </section>
    </section>
  )
}

export default Settings
