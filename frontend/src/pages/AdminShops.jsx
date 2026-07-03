import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const plans = ['starter', 'business', 'pro']
const statuses = ['trial', 'active', 'expired', 'suspended']
const receiptSizes = ['58mm', '80mm']

const initialCreateForm = {
  shop_name: '',
  owner_name: '',
  login_email: '',
  login_password: '',
  owner_username: '',
  owner_password: '',
  phone: '',
  email: '',
  address: '',
  receipt_footer: '',
  logo_url: '',
  language: 'en',
  currency: 'LKR',
  default_low_stock_limit: '5',
  tax_percentage: '0',
  default_receipt_size: '80mm',
  subscription_plan: 'starter',
  subscription_status: 'trial',
  subscription_expiry_date: '',
  monthly_fee: '0',
  is_enabled: true,
}

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
  const [creatingShop, setCreatingShop] = useState(false)
  const [form, setForm] = useState(null)
  const [createForm, setCreateForm] = useState(initialCreateForm)
  const [temporaryCredentials, setTemporaryCredentials] = useState(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
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

  const updateCreateField = (event) => {
    const { name, value, checked, type } = event.target
    setCreateForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const createShop = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    setTemporaryPassword('')
    setTemporaryCredentials(null)

    try {
      const response = await api.post('/admin/shops', {
        ...createForm,
        tax_percentage: Number(createForm.tax_percentage || 0),
        default_low_stock_limit: Number(createForm.default_low_stock_limit || 5),
        monthly_fee: Number(createForm.monthly_fee || 0),
      })
      setTemporaryCredentials(response.data.credentials || null)
      setCreateForm(initialCreateForm)
      setMessage('Shop created successfully')
      await loadShops(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to create shop'))
    } finally {
      setSaving(false)
    }
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

  const resetShopPassword = async (shop) => {
    setSaving(true)
    setError('')
    setMessage('')
    setTemporaryPassword('')

    try {
      const response = await api.put(`/admin/shops/${shop.id}/reset-password`)
      setTemporaryPassword(response.data.temporary_password || '')
      setMessage(`Shop login password reset for ${shop.shop_name}`)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to reset shop password'))
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
          <div className="table-actions">
            <button type="button" onClick={() => setCreatingShop(true)}>
              {t('Create Shop')}
            </button>
            <button type="button" className="ghost-button" onClick={() => loadShops(false)}>
              {t('Refresh')}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}
      {temporaryPassword && (
        <div className="info-banner">
          {t('Temporary Password')}: <strong>{temporaryPassword}</strong>
        </div>
      )}

      <section className="panel">
        <div className="table-wrap">
          <table className="admin-shops-table">
            <thead>
              <tr>
                <th>{t('Shop Name')}</th>
                <th>{t('Owner')}</th>
                <th>{t('Email')}</th>
                <th>{t('Shop Login')}</th>
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
                  <td>{shop.login_email || '-'}</td>
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
                        {t('View/Edit')}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => navigate(`/admin/shops/${shop.id}`)}
                      >
                        {t('Manage Users')}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => resetShopPassword(shop)}
                        disabled={saving}
                      >
                        {t('Reset Password')}
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
                  <td colSpan="10" className="empty-cell">
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

      {creatingShop && (
        <div className="modal-backdrop">
          <section className="receipt-modal admin-modal">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('Master Admin')}</p>
                <h2>{t('Create Shop')}</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setCreatingShop(false)}>
                {t('Close')}
              </button>
            </div>
            {temporaryCredentials && (
              <div className="info-banner">
                <strong>{t('Temporary Credentials')}</strong>
                <div>{t('Shop Email')}: {temporaryCredentials.shop_login_email}</div>
                <div>{t('Shop Password')}: {temporaryCredentials.shop_temporary_password}</div>
                <div>{t('Owner Username')}: {temporaryCredentials.owner_username}</div>
                <div>{t('Owner Password')}: {temporaryCredentials.owner_temporary_password}</div>
              </div>
            )}
            <form className="form-grid" onSubmit={createShop}>
              <label>
                {t('Shop Name')}
                <input name="shop_name" value={createForm.shop_name} onChange={updateCreateField} required />
              </label>
              <label>
                {t('Owner Name')}
                <input name="owner_name" value={createForm.owner_name} onChange={updateCreateField} required />
              </label>
              <label>
                {t('Shop Email')}
                <input name="login_email" type="email" value={createForm.login_email} onChange={updateCreateField} required />
              </label>
              <label>
                {t('Shop Password')}
                <input name="login_password" type="password" value={createForm.login_password} onChange={updateCreateField} placeholder={t('Leave blank to generate')} />
              </label>
              <label>
                {t('Owner Username')}
                <input name="owner_username" value={createForm.owner_username} onChange={updateCreateField} required />
              </label>
              <label>
                {t('Owner Password')}
                <input name="owner_password" type="password" value={createForm.owner_password} onChange={updateCreateField} placeholder={t('Leave blank to generate')} />
              </label>
              <label>
                {t('Phone')}
                <input name="phone" value={createForm.phone} onChange={updateCreateField} />
              </label>
              <label>
                {t('Email')}
                <input name="email" type="email" value={createForm.email} onChange={updateCreateField} />
              </label>
              <label className="full-width">
                {t('Address')}
                <input name="address" value={createForm.address} onChange={updateCreateField} />
              </label>
              <label className="full-width">
                {t('Receipt Footer Message')}
                <input name="receipt_footer" value={createForm.receipt_footer} onChange={updateCreateField} />
              </label>
              <label className="full-width">
                {t('Logo URL')}
                <input name="logo_url" value={createForm.logo_url} onChange={updateCreateField} />
              </label>
              <label>
                {t('language')}
                <select name="language" value={createForm.language} onChange={updateCreateField}>
                  <option value="en">{t('english')}</option>
                  <option value="si">{t('sinhala')}</option>
                  <option value="ta">{t('tamil')}</option>
                </select>
              </label>
              <label>
                {t('Currency')}
                <input name="currency" value={createForm.currency} onChange={updateCreateField} />
              </label>
              <label>
                {t('Default Low Stock Limit')}
                <input name="default_low_stock_limit" type="number" min="0" value={createForm.default_low_stock_limit} onChange={updateCreateField} />
              </label>
              <label>
                {t('Tax Percentage')}
                <input name="tax_percentage" type="number" min="0" step="0.01" value={createForm.tax_percentage} onChange={updateCreateField} />
              </label>
              <label>
                {t('Thermal Receipt Size')}
                <select name="default_receipt_size" value={createForm.default_receipt_size} onChange={updateCreateField}>
                  {receiptSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <label>
                {t('Plan')}
                <select name="subscription_plan" value={createForm.subscription_plan} onChange={updateCreateField}>
                  {plans.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
              </label>
              <label>
                {t('Status')}
                <select name="subscription_status" value={createForm.subscription_status} onChange={updateCreateField}>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>
                {t('Expiry Date')}
                <input name="subscription_expiry_date" type="date" value={createForm.subscription_expiry_date} onChange={updateCreateField} />
              </label>
              <label>
                {t('Monthly Fee')}
                <input name="monthly_fee" type="number" min="0" step="0.01" value={createForm.monthly_fee} onChange={updateCreateField} />
              </label>
              <label className="checkbox-row">
                <input name="is_enabled" type="checkbox" checked={createForm.is_enabled} onChange={updateCreateField} />
                {t('Enabled')}
              </label>
              <button type="submit" className="full-width" disabled={saving}>
                {saving ? t('Saving...') : t('Create Shop')}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default AdminShops
