import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const plans = ['starter', 'business', 'pro']
const statuses = ['trial', 'active', 'expired', 'suspended']

const formatDate = (value) => {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

const getSubscriptionForm = (shop) => ({
  subscription_plan: shop.subscription_plan || 'starter',
  subscription_status: shop.subscription_status || 'trial',
  subscription_start_date: formatDate(shop.subscription_start_date) === '-' ? '' : formatDate(shop.subscription_start_date),
  subscription_expiry_date: formatDate(shop.subscription_expiry_date) === '-' ? '' : formatDate(shop.subscription_expiry_date),
  monthly_fee: String(shop.monthly_fee ?? 0),
  is_enabled: Boolean(shop.is_enabled),
})

function AdminShops() {
  const navigate = useNavigate()
  const [shops, setShops] = useState([])
  const [editingShop, setEditingShop] = useState(null)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadShops = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const response = await api.get('/admin/shops')
      setShops(response.data.shops || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load shops'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadShops()
  }, [])

  const openEditor = (shop) => {
    setEditingShop(shop)
    setForm(getSubscriptionForm(shop))
    setError('')
    setMessage('')
  }

  const updateField = (event) => {
    const { name, value, checked, type } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const saveSubscription = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      await api.put(`/admin/shops/${editingShop.id}/subscription`, {
        ...form,
        monthly_fee: Number(form.monthly_fee || 0),
      })
      setEditingShop(null)
      setForm(null)
      setMessage('Subscription updated successfully')
      await loadShops(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to update subscription'))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (shop) => {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      await api.put(`/admin/shops/${shop.id}/${shop.is_enabled ? 'disable' : 'enable'}`)
      setMessage(shop.is_enabled ? 'Shop disabled successfully' : 'Shop enabled successfully')
      await loadShops(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to update shop status'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">{t('Loading shops...')}</div>
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Shops')}</h2>
          <button type="button" className="ghost-button" onClick={() => loadShops(false)}>
            {t('Refresh')}
          </button>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table className="admin-shops-table">
            <thead>
              <tr>
                <th>{t('Shop Name')}</th>
                <th>{t('Owner')}</th>
                <th>{t('Email')}</th>
                <th>{t('Plan')}</th>
                <th>{t('Status')}</th>
                <th>{t('Expiry Date')}</th>
                <th>{t('Monthly Fee')}</th>
                <th>{t('Enabled')}</th>
                <th>{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td>
                    <strong>{shop.shop_name}</strong>
                  </td>
                  <td>{shop.owner_name || '-'}</td>
                  <td>{shop.owner_email || '-'}</td>
                  <td>{shop.subscription_plan || '-'}</td>
                  <td>
                    <span className={`status ${shop.subscription_status || 'trial'}`}>
                      {shop.subscription_status || 'trial'}
                    </span>
                  </td>
                  <td>{formatDate(shop.subscription_expiry_date)}</td>
                  <td>{formatMoney(shop.monthly_fee)}</td>
                  <td>{shop.is_enabled ? t('Yes') : t('No')}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => navigate(`/admin/shops/${shop.id}`)}
                      >
                        {t('View')}
                      </button>
                      <button type="button" onClick={() => openEditor(shop)}>
                        {t('Edit Subscription')}
                      </button>
                      <button
                        type="button"
                        className={shop.is_enabled ? 'danger-button' : 'ghost-button'}
                        onClick={() => toggleEnabled(shop)}
                        disabled={saving}
                      >
                        {shop.is_enabled ? t('Disable') : t('Enable')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr>
                  <td colSpan="9" className="empty-cell">
                    {t('No shops found.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingShop && form && (
        <div className="modal-backdrop">
          <section className="receipt-modal admin-modal">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('Subscription')}</p>
                <h2>{editingShop.shop_name}</h2>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setEditingShop(null)
                  setForm(null)
                }}
              >
                {t('Close')}
              </button>
            </div>

            <form className="form-grid" onSubmit={saveSubscription}>
              <label>
                {t('Plan')}
                <select
                  name="subscription_plan"
                  value={form.subscription_plan}
                  onChange={updateField}
                >
                  {plans.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Status')}
                <select
                  name="subscription_status"
                  value={form.subscription_status}
                  onChange={updateField}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Start Date')}
                <input
                  name="subscription_start_date"
                  type="date"
                  value={form.subscription_start_date}
                  onChange={updateField}
                />
              </label>
              <label>
                {t('Expiry Date')}
                <input
                  name="subscription_expiry_date"
                  type="date"
                  value={form.subscription_expiry_date}
                  onChange={updateField}
                />
              </label>
              <label>
                {t('Monthly Fee')}
                <input
                  name="monthly_fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthly_fee}
                  onChange={updateField}
                />
              </label>
              <label className="checkbox-row">
                <input
                  name="is_enabled"
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={updateField}
                />
                {t('Enabled')}
              </label>
              <button type="submit" className="full-width" disabled={saving}>
                {saving ? t('Saving...') : t('Save Subscription')}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default AdminShops
