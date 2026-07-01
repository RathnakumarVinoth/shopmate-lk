import { useEffect, useState } from 'react'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const initialForm = {
  name: '',
  email: '',
  password: '',
}

function Staff() {
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

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
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const addStaff = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)

    try {
      await api.post('/staff', form)
      setForm(initialForm)
      setMessage('Staff account added successfully')
      await loadStaff()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to add staff account'))
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (staffMember) => {
    setError('')
    setMessage('')
    setUpdatingId(staffMember.id)

    try {
      await api.put(`/staff/${staffMember.id}`, {
        name: staffMember.name,
        email: staffMember.email,
        is_active: !staffMember.is_active,
      })
      setMessage(
        `Staff account ${staffMember.is_active ? 'deactivated' : 'activated'} successfully`,
      )
      await loadStaff()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to update staff account'))
    } finally {
      setUpdatingId(null)
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
          <h2>Add Staff</h2>
        </div>
        <form onSubmit={addStaff} className="form-stack">
          {error && <div className="alert">{error}</div>}
          {message && <div className="success">{message}</div>}
          <label>
            Name
            <input name="name" value={form.name} onChange={updateField} required />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              required
            />
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
          <button type="submit" disabled={saving}>
            {saving ? 'Adding...' : 'Add Staff'}
          </button>
        </form>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <h2>Staff Accounts</h2>
          <button type="button" className="ghost-button" onClick={loadStaff} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {loading ? (
          <div className="loading-panel">Loading staff accounts...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((staffMember) => (
                  <tr key={staffMember.id}>
                    <td>{staffMember.name}</td>
                    <td>{staffMember.email}</td>
                    <td>{staffMember.role}</td>
                    <td>
                      <span className={`status ${staffMember.is_active ? 'paid' : 'unpaid'}`}>
                        {staffMember.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {staffMember.created_at
                        ? new Date(staffMember.created_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => toggleStatus(staffMember)}
                          disabled={updatingId === staffMember.id}
                        >
                          {updatingId === staffMember.id
                            ? 'Updating...'
                            : staffMember.is_active
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => deleteStaff(staffMember)}
                          disabled={deletingId === staffMember.id}
                        >
                          {deletingId === staffMember.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-cell">
                      No staff accounts found.
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
