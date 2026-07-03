import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'
import { permissions, rolePermissions, staffRoleOptions } from '../utils/permissions'

const initialForm = {
  id: null,
  name: '',
  email: '',
  password: '',
  role: 'staff',
  permissions: rolePermissions.staff,
  is_active: true,
}

const getRoleLabel = (role) =>
  staffRoleOptions.find((option) => option.value === role)?.label || role

const staffToForm = (staffMember) => ({
  id: staffMember.id,
  name: staffMember.name || '',
  email: staffMember.email || '',
  password: '',
  role: staffMember.role || 'staff',
  permissions: Array.isArray(staffMember.permissions)
    ? staffMember.permissions
    : rolePermissions[staffMember.role] || rolePermissions.staff,
  is_active: Boolean(staffMember.is_active),
})

function Staff() {
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const editing = Boolean(form.id)

  const selectedPermissionSet = useMemo(() => new Set(form.permissions), [form.permissions])

  const loadStaff = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/staff')
      setStaff(response.data.staff || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load staff accounts'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  const updateField = (event) => {
    const { name, value, checked, type } = event.target

    if (name === 'role') {
      setForm((current) => ({
        ...current,
        role: value,
        permissions: rolePermissions[value] || rolePermissions.staff,
      }))
      return
    }

    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  const togglePermission = (permission) => {
    setForm((current) => {
      const nextPermissions = new Set(current.permissions)

      if (nextPermissions.has(permission)) {
        nextPermissions.delete(permission)
      } else {
        nextPermissions.add(permission)
      }

      return { ...current, permissions: [...nextPermissions] }
    })
  }

  const resetForm = () => {
    setForm(initialForm)
    setMessage('')
    setError('')
  }

  const saveStaff = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)

    const payload = {
      name: form.name,
      email: form.email,
      role: form.role,
      permissions: form.permissions,
      is_active: form.is_active,
    }

    if (!editing) {
      payload.password = form.password
    } else if (form.password.trim()) {
      payload.password = form.password
    }

    try {
      if (editing) {
        await api.put(`/staff/${form.id}`, payload)
        setMessage('Staff account updated successfully')
      } else {
        await api.post('/staff', payload)
        setMessage('Staff account added successfully')
      }

      setForm(initialForm)
      await loadStaff()
    } catch (err) {
      setError(getApiMessage(err, editing ? 'Failed to update staff account' : 'Failed to add staff account'))
    } finally {
      setSaving(false)
    }
  }

  const editStaff = (staffMember) => {
    setForm(staffToForm(staffMember))
    setMessage('')
    setError('')
  }

  const toggleStatus = async (staffMember) => {
    setError('')
    setMessage('')
    setSaving(true)
    const { password, ...payload } = staffToForm(staffMember)

    try {
      await api.put(`/staff/${staffMember.id}`, {
        ...payload,
        is_active: !staffMember.is_active,
      })
      setMessage(`Staff account ${staffMember.is_active ? 'deactivated' : 'activated'} successfully`)
      await loadStaff()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to update staff account'))
    } finally {
      setSaving(false)
    }
  }

  const deleteStaff = async (staffMember) => {
    const confirmed = window.confirm(`Delete staff account for ${staffMember.name}?`)
    if (!confirmed) return

    setError('')
    setMessage('')
    setDeletingId(staffMember.id)

    try {
      await api.delete(`/staff/${staffMember.id}`)
      setMessage('Staff account deleted successfully')
      await loadStaff()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to delete staff account'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="page-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>{editing ? `${t('edit')} ${t('staff')}` : `${t('add')} ${t('staff')}`}</h2>
        </div>
        <form onSubmit={saveStaff} className="form-stack">
          {error && <div className="alert">{error}</div>}
          {message && <div className="success">{message}</div>}
          <label>
            {t('Name')}
            <input name="name" value={form.name} onChange={updateField} required />
          </label>
          <label>
            {t('Email')}
            <input name="email" type="email" value={form.email} onChange={updateField} required />
          </label>
          {!editing && (
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
          )}
          {editing && (
            <label>
              {t('New Password')}
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={updateField}
                placeholder="Leave blank to keep current password"
              />
            </label>
          )}
          <label>
            {t('Role')}
            <select name="role" value={form.role} onChange={updateField}>
              {staffRoleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          {editing && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="is_active"
                checked={form.is_active}
                onChange={updateField}
              />
              {t('Active account')}
            </label>
          )}
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
          <div className="settings-actions">
            <button type="submit" disabled={saving}>
              {saving ? t('saving') : editing ? `${t('save')} ${t('staff')}` : `${t('add')} ${t('staff')}`}
            </button>
            {editing && (
              <button type="button" className="ghost-button" onClick={resetForm} disabled={saving}>
                {t('Cancel Edit')}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <h2>{t('Staff Accounts')}</h2>
          <button type="button" className="ghost-button" onClick={loadStaff} disabled={loading}>
            {loading ? t('refreshing') : t('refresh')}
          </button>
        </div>
        {loading ? (
          <div className="loading-panel">{t('Loading staff accounts...')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Email')}</th>
                  <th>{t('Role')}</th>
                  <th>{t('Permissions')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((staffMember) => (
                  <tr key={staffMember.id}>
                    <td>{staffMember.name}</td>
                    <td>{staffMember.email}</td>
                    <td>
                      <span className={`status role-${staffMember.role}`}>
                        {getRoleLabel(staffMember.role)}
                      </span>
                    </td>
                    <td>{(staffMember.permissions || []).length}</td>
                    <td>
                      <span className={`status ${staffMember.is_active ? 'paid' : 'unpaid'}`}>
                        {staffMember.is_active ? t('Active') : t('Inactive')}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="ghost-button" onClick={() => editStaff(staffMember)}>
                          {t('edit')}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => toggleStatus(staffMember)}
                          disabled={saving}
                        >
                          {staffMember.is_active ? t('Deactivate') : t('Activate')}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => deleteStaff(staffMember)}
                          disabled={deletingId === staffMember.id}
                        >
                          {deletingId === staffMember.id ? t('deleting') : t('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-cell">
                      {t('No staff accounts found.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

export default Staff
