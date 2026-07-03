import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'
import { permissions, rolePermissions } from '../utils/permissions'

const formatDate = (value) => {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

const roleOptions = ['owner', 'cashier', 'manager', 'stock_keeper', 'staff']

const initialUserForm = {
  id: null,
  name: '',
  username: '',
  email: '',
  role: 'cashier',
  permissions: rolePermissions.cashier,
  password: '',
  is_active: true,
}

const shopToForm = (shop) => ({
  shop_name: shop?.shop_name || '',
  owner_name: shop?.owner_name || '',
  login_email: shop?.login_email || '',
  phone: shop?.phone || '',
  email: shop?.email || '',
  address: shop?.address || '',
  receipt_footer: shop?.receipt_footer || '',
  logo_url: shop?.logo_url || '',
  currency: shop?.currency || 'LKR',
  default_low_stock_limit: String(shop?.default_low_stock_limit ?? 5),
  tax_percentage: String(shop?.tax_percentage ?? 0),
  default_receipt_size: shop?.default_receipt_size || '80mm',
  language: shop?.language || 'en',
  subscription_plan: shop?.subscription_plan || 'starter',
  subscription_status: shop?.subscription_status || 'trial',
  subscription_start_date: formatDate(shop?.subscription_start_date) === '-' ? '' : formatDate(shop?.subscription_start_date),
  subscription_expiry_date: formatDate(shop?.subscription_expiry_date) === '-' ? '' : formatDate(shop?.subscription_expiry_date),
  monthly_fee: String(shop?.monthly_fee ?? 0),
  is_enabled: Boolean(shop?.is_enabled),
})

function AdminShopDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [shop, setShop] = useState(null)
  const [shopForm, setShopForm] = useState(shopToForm(null))
  const [usage, setUsage] = useState({})
  const [users, setUsers] = useState([])
  const [userForm, setUserForm] = useState(initialUserForm)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const selectedPermissionSet = useMemo(
    () => new Set(userForm.permissions || []),
    [userForm.permissions],
  )

  useEffect(() => {
    const loadShop = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await api.get(`/admin/shops/${id}`)
        const usersResponse = await api.get(`/admin/shops/${id}/users`)
        const nextShop = response.data.shop || null
        setShop(nextShop)
        setShopForm(shopToForm(nextShop))
        setUsage(response.data.usage || {})
        setUsers(usersResponse.data.users || [])
      } catch (err) {
        setError(getApiMessage(err, 'Failed to load shop details'))
      } finally {
        setLoading(false)
      }
    }

    loadShop()
  }, [id])

  const loadUsers = async () => {
    const response = await api.get(`/admin/shops/${id}/users`)
    setUsers(response.data.users || [])
  }

  const updateUserField = (event) => {
    const { name, value, checked, type } = event.target

    if (name === 'role') {
      setUserForm((current) => ({
        ...current,
        role: value,
        permissions: rolePermissions[value] || rolePermissions.staff,
      }))
      return
    }

    setUserForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const togglePermission = (permission) => {
    setUserForm((current) => {
      const nextPermissions = new Set(current.permissions || [])

      if (nextPermissions.has(permission)) {
        nextPermissions.delete(permission)
      } else {
        nextPermissions.add(permission)
      }

      return { ...current, permissions: [...nextPermissions] }
    })
  }

  const updateShopField = (event) => {
    const { name, value, checked, type } = event.target
    setShopForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const saveShop = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await api.put(`/admin/shops/${id}`, {
        ...shopForm,
        tax_percentage: Number(shopForm.tax_percentage || 0),
        default_low_stock_limit: Number(shopForm.default_low_stock_limit || 5),
        monthly_fee: Number(shopForm.monthly_fee || 0),
      })
      const nextShop = response.data.shop || shop
      setShop(nextShop)
      setShopForm(shopToForm(nextShop))
      setMessage('Shop updated successfully')
    } catch (err) {
      setError(getApiMessage(err, 'Failed to update shop'))
    } finally {
      setSaving(false)
    }
  }

  const editUser = (user) => {
    setUserForm({
      id: user.id,
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      role: user.role || 'staff',
      permissions: Array.isArray(user.permissions)
        ? user.permissions
        : rolePermissions[user.role] || rolePermissions.staff,
      password: '',
      is_active: Boolean(user.is_active),
    })
    setTemporaryPassword('')
  }

  const resetUserForm = () => {
    setUserForm(initialUserForm)
  }

  const saveUser = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    setTemporaryPassword('')

    try {
      if (userForm.id) {
        await api.put(`/admin/shops/${id}/users/${userForm.id}`, userForm)
        setMessage('User updated successfully')
      } else {
        const response = await api.post(`/admin/shops/${id}/users`, userForm)
        setTemporaryPassword(response.data.temporary_password || '')
        setMessage('User created successfully')
      }
      resetUserForm()
      await loadUsers()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to save user'))
    } finally {
      setSaving(false)
    }
  }

  const resetShopPassword = async () => {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await api.put(`/admin/shops/${id}/reset-password`)
      setTemporaryPassword(response.data.temporary_password || '')
      setMessage('Shop login password reset successfully')
    } catch (err) {
      setError(getApiMessage(err, 'Failed to reset shop password'))
    } finally {
      setSaving(false)
    }
  }

  const resetUserPassword = async (user) => {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const response = await api.put(`/admin/shops/${id}/users/${user.id}/reset-password`)
      setTemporaryPassword(response.data.temporary_password || '')
      setMessage(`Password reset for ${user.username}`)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to reset user password'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">{t('Loading shop details...')}</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  if (!shop) {
    return <div className="empty-state">{t('Shop not found.')}</div>
  }

  const usageCards = [
    { label: t('Total Products'), value: usage.total_products || 0 },
    { label: t('Total Sales'), value: usage.total_sales || 0 },
    { label: t('Total Staff'), value: usage.total_staff || 0 },
    { label: t('Total Customers'), value: usage.total_customers || 0 },
    { label: t('Total Revenue'), value: formatMoney(usage.total_revenue) },
  ]

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{shop.shop_name}</h2>
          <button type="button" className="ghost-button" onClick={() => navigate('/admin/shops')}>
            {t('Back to Shops')}
          </button>
        </div>
        <div className="summary-box admin-detail-grid">
          <div>
            <span>{t('Shop Login')}</span>
            <strong>{shop.login_email || '-'}</strong>
          </div>
          <div>
            <span>{t('Owner')}</span>
            <strong>{shop.owner_name || '-'}</strong>
          </div>
          <div>
            <span>{t('Email')}</span>
            <strong>{shop.owner_email || '-'}</strong>
          </div>
          <div>
            <span>{t('Phone')}</span>
            <strong>{shop.phone || '-'}</strong>
          </div>
          <div>
            <span>{t('Address')}</span>
            <strong>{shop.address || '-'}</strong>
          </div>
          <div>
            <span>{t('Plan')}</span>
            <strong>{shop.subscription_plan || '-'}</strong>
          </div>
          <div>
            <span>{t('Status')}</span>
            <strong className={`status ${shop.subscription_status || 'trial'}`}>
              {shop.subscription_status || 'trial'}
            </strong>
          </div>
          <div>
            <span>{t('Start Date')}</span>
            <strong>{formatDate(shop.subscription_start_date)}</strong>
          </div>
          <div>
            <span>{t('Expiry Date')}</span>
            <strong>{formatDate(shop.subscription_expiry_date)}</strong>
          </div>
          <div>
            <span>{t('Monthly Fee')}</span>
            <strong>{formatMoney(shop.monthly_fee)}</strong>
          </div>
          <div>
            <span>{t('Enabled')}</span>
            <strong>{shop.is_enabled ? t('Yes') : t('No')}</strong>
          </div>
          <div>
            <span>{t('Created')}</span>
            <strong>{formatDate(shop.created_at)}</strong>
          </div>
        </div>
        <div className="settings-actions">
          <button type="button" className="ghost-button" onClick={resetShopPassword} disabled={saving}>
            {t('Reset Shop Password')}
          </button>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}
      {temporaryPassword && (
        <div className="info-banner">
          {t('Temporary Password')}: <strong>{temporaryPassword}</strong>
        </div>
      )}

      <div className="metric-grid compact-metrics">
        {usageCards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Shop Settings')}</h2>
        </div>
        <form className="form-grid" onSubmit={saveShop}>
          <label>
            {t('Shop Name')}
            <input name="shop_name" value={shopForm.shop_name} onChange={updateShopField} required />
          </label>
          <label>
            {t('Owner Name')}
            <input name="owner_name" value={shopForm.owner_name} onChange={updateShopField} required />
          </label>
          <label>
            {t('Shop Email')}
            <input name="login_email" type="email" value={shopForm.login_email} onChange={updateShopField} required />
          </label>
          <label>
            {t('Phone')}
            <input name="phone" value={shopForm.phone} onChange={updateShopField} />
          </label>
          <label>
            {t('Email')}
            <input name="email" type="email" value={shopForm.email} onChange={updateShopField} />
          </label>
          <label className="full-width">
            {t('Address')}
            <input name="address" value={shopForm.address} onChange={updateShopField} />
          </label>
          <label className="full-width">
            {t('Receipt Footer Message')}
            <input name="receipt_footer" value={shopForm.receipt_footer} onChange={updateShopField} />
          </label>
          <label className="full-width">
            {t('Logo URL')}
            <input name="logo_url" value={shopForm.logo_url} onChange={updateShopField} />
          </label>
          <label>
            {t('language')}
            <select name="language" value={shopForm.language} onChange={updateShopField}>
              <option value="en">{t('english')}</option>
              <option value="si">{t('sinhala')}</option>
              <option value="ta">{t('tamil')}</option>
            </select>
          </label>
          <label>
            {t('Currency')}
            <input name="currency" value={shopForm.currency} onChange={updateShopField} />
          </label>
          <label>
            {t('Default Low Stock Limit')}
            <input name="default_low_stock_limit" type="number" min="0" value={shopForm.default_low_stock_limit} onChange={updateShopField} />
          </label>
          <label>
            {t('Tax Percentage')}
            <input name="tax_percentage" type="number" min="0" step="0.01" value={shopForm.tax_percentage} onChange={updateShopField} />
          </label>
          <label>
            {t('Thermal Receipt Size')}
            <select name="default_receipt_size" value={shopForm.default_receipt_size} onChange={updateShopField}>
              <option value="58mm">58mm</option>
              <option value="80mm">80mm</option>
            </select>
          </label>
          <label>
            {t('Plan')}
            <select name="subscription_plan" value={shopForm.subscription_plan} onChange={updateShopField}>
              <option value="starter">starter</option>
              <option value="business">business</option>
              <option value="pro">pro</option>
            </select>
          </label>
          <label>
            {t('Status')}
            <select name="subscription_status" value={shopForm.subscription_status} onChange={updateShopField}>
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="expired">expired</option>
              <option value="suspended">suspended</option>
            </select>
          </label>
          <label>
            {t('Expiry Date')}
            <input name="subscription_expiry_date" type="date" value={shopForm.subscription_expiry_date} onChange={updateShopField} />
          </label>
          <label>
            {t('Monthly Fee')}
            <input name="monthly_fee" type="number" min="0" step="0.01" value={shopForm.monthly_fee} onChange={updateShopField} />
          </label>
          <label className="checkbox-row">
            <input name="is_enabled" type="checkbox" checked={shopForm.is_enabled} onChange={updateShopField} />
            {t('Enabled')}
          </label>
          <button type="submit" className="full-width" disabled={saving}>
            {saving ? t('Saving...') : t('Save Settings')}
          </button>
        </form>
      </section>

      <section className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{userForm.id ? t('Edit User') : t('Create User')}</h2>
          </div>
          <form className="form-stack" onSubmit={saveUser}>
            <label>
              {t('Name')}
              <input name="name" value={userForm.name} onChange={updateUserField} required />
            </label>
            <label>
              {t('Username')}
              <input name="username" value={userForm.username} onChange={updateUserField} required />
            </label>
            <label>
              {t('Email')}
              <input name="email" type="email" value={userForm.email} onChange={updateUserField} />
            </label>
            <label>
              {t('Role')}
              <select name="role" value={userForm.role} onChange={updateUserField}>
                {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <div className="permission-grid">
              {permissions.map((permission) => (
                <label className="checkbox-row" key={permission.value}>
                  <input
                    type="checkbox"
                    checked={selectedPermissionSet.has(permission.value)}
                    onChange={() => togglePermission(permission.value)}
                  />
                  {permission.label}
                </label>
              ))}
            </div>
            {!userForm.id && (
              <label>
                {t('Temporary Password')}
                <input name="password" type="password" value={userForm.password} onChange={updateUserField} placeholder={t('Leave blank to generate')} />
              </label>
            )}
            <label className="checkbox-row">
              <input name="is_active" type="checkbox" checked={userForm.is_active} onChange={updateUserField} />
              {t('Active account')}
            </label>
            <button type="submit" disabled={saving}>
              {saving ? t('Saving...') : userForm.id ? t('Save User') : t('Create User')}
            </button>
            {userForm.id && (
              <button type="button" className="ghost-button" onClick={resetUserForm}>
                {t('Cancel Edit')}
              </button>
            )}
          </form>
        </section>
        <section className="panel wide-panel">
          <div className="section-heading">
            <h2>{t('Users')}</h2>
            <button type="button" className="ghost-button" onClick={loadUsers}>
              {t('Refresh')}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Username')}</th>
                  <th>{t('Role')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.username}</td>
                    <td><span className={`status role-${user.role}`}>{user.role}</span></td>
                    <td>{user.is_active ? t('Active') : t('Inactive')}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="ghost-button" onClick={() => editUser(user)}>
                          {t('Edit')}
                        </button>
                        <button type="button" className="ghost-button" onClick={() => resetUserPassword(user)} disabled={saving}>
                          {t('Reset Password')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-cell">{t('No users found.')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </section>
  )
}

export default AdminShopDetails
