import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getLanguage, languageOptions, setLanguage, t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { getSessionUser, saveStoredSettings } from '../utils/session'

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
  language: 'en',
  idle_timeout_minutes: '15',
  background_logout_minutes: '3',
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
  language: languageOptions.some((language) => language.value === settings.language)
    ? settings.language
    : getLanguage(),
  idle_timeout_minutes: String(settings.idle_timeout_minutes ?? 15),
  background_logout_minutes: String(settings.background_logout_minutes ?? 3),
})

function Settings() {
  const navigate = useNavigate()
  const user = getSessionUser()
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
      saveStoredSettings(settings)
      if (settings.language) {
        setLanguage(settings.language)
      }
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

    if (name === 'language') {
      setLanguage(value)
    }

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
      const settingsPayload = {
        ...form,
        default_low_stock_limit: Number(form.default_low_stock_limit || 0),
        tax_percentage: Number(form.tax_percentage || 0),
        default_receipt_size: receiptSizes.includes(form.default_receipt_size)
          ? form.default_receipt_size
          : '80mm',
        language: form.language,
      }

      if (user.role === 'owner') {
        settingsPayload.idle_timeout_minutes = Number(form.idle_timeout_minutes || 15)
        settingsPayload.background_logout_minutes = Number(
          form.background_logout_minutes || 3,
        )
      } else {
        delete settingsPayload.idle_timeout_minutes
        delete settingsPayload.background_logout_minutes
      }

      const response = await api.put('/settings', settingsPayload)
      const settings = response.data.settings || response.data

      setSavedSettings(settings)
      setForm(settingsToForm(settings))
      saveStoredSettings(settings)
      if (settings.language) {
        setLanguage(settings.language)
      }
      window.dispatchEvent(new Event('shopmate:settings-changed'))
      setMessage(t('Settings saved successfully'))
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
      setMessage(t('Password changed successfully'))
    } catch (err) {
      setError(getApiMessage(err, 'Failed to change password'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">{t('Loading settings...')}</div>
  }

  return (
    <section className="page-stack">
      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <form onSubmit={saveSettings} className="page-stack">
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Shop Profile')}</h2>
          </div>
          <div className="form-grid">
            <label>
              {t('Shop Name')}
              <input name="shop_name" value={form.shop_name} onChange={updateField} required />
            </label>
            <label>
              {t('Phone')}
              <input name="phone" value={form.phone} onChange={updateField} />
            </label>
            <label>
              {t('Email')}
              <input name="email" type="email" value={form.email} onChange={updateField} />
            </label>
            <label>
              {t('Address')}
              <input name="address" value={form.address} onChange={updateField} />
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>{t('Receipt Settings')}</h2>
          </div>
          <div className="form-grid">
            <label className="full-width">
              {t('Receipt Footer Message')}
              <input
                name="receipt_footer"
                value={form.receipt_footer}
                onChange={updateField}
                placeholder="Thank you for shopping with us."
              />
            </label>
            <label className="full-width">
              {t('Logo URL')}
              <input name="logo_url" value={form.logo_url} onChange={updateField} />
            </label>
            <label>
              {t('Thermal Receipt Size')}
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
            <h2>{t('Business Preferences')}</h2>
          </div>
          <div className="form-grid">
            <label>
              {t('language')}
              <select name="language" value={form.language} onChange={updateField}>
                {languageOptions.map((language) => (
                  <option key={language.value} value={language.value}>
                    {t(language.value === 'en' ? 'english' : language.value === 'si' ? 'sinhala' : 'tamil')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Currency')}
              <select name="currency" value={form.currency} onChange={updateField}>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Default Low Stock Limit')}
              <input
                name="default_low_stock_limit"
                type="number"
                min="0"
                value={form.default_low_stock_limit}
                onChange={updateField}
              />
            </label>
            <label>
              {t('Tax Percentage')}
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

        {user.role === 'owner' && (
          <section className="panel">
            <div className="section-heading">
              <h2>{t('Security Settings')}</h2>
              <button type="button" className="ghost-button" onClick={() => navigate('/login-activity')}>
                {t('Login Activity')}
              </button>
            </div>
            <div className="form-grid">
              <label>
                {t('Idle timeout (minutes)')}
                <input
                  name="idle_timeout_minutes"
                  type="number"
                  min="1"
                  max="480"
                  value={form.idle_timeout_minutes}
                  onChange={updateField}
                  required
                />
              </label>
              <label>
                {t('Background logout (minutes)')}
                <input
                  name="background_logout_minutes"
                  type="number"
                  min="1"
                  max="60"
                  value={form.background_logout_minutes}
                  onChange={updateField}
                  required
                />
              </label>
            </div>
          </section>
        )}

        <div className="settings-actions">
          <button type="submit" disabled={saving}>
            {saving ? t('saving') : t('saveSettings')}
          </button>
          <button type="button" className="ghost-button" onClick={resetForm} disabled={saving}>
            {t('Reset Form')}
          </button>
        </div>
      </form>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Password Security')}</h2>
        </div>
        <p className="muted">
          {t('Sessions expire automatically after the configured JWT lifetime. You will be asked to login again when your session expires.')}
        </p>
        <form onSubmit={changePassword} className="form-grid compact-form">
          <label>
            {t('Current Password')}
            <input
              name="current_password"
              type="password"
              value={passwordForm.current_password}
              onChange={updatePasswordField}
              required
            />
          </label>
          <label>
            {t('New Password')}
            <input
              name="new_password"
              type="password"
              value={passwordForm.new_password}
              onChange={updatePasswordField}
              required
            />
          </label>
          <button type="submit" className="full-width" disabled={saving}>
            {saving ? t('Saving...') : t('Change Password')}
          </button>
        </form>
      </section>
    </section>
  )
}

export default Settings
