import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const actionOptions = [
  'user_login',
  'product_add',
  'product_update',
  'product_delete',
  'stock_restock',
  'sale_create',
  'sale_return',
  'payment_verified',
  'payment_failed',
  'supplier_add',
  'supplier_update',
  'supplier_delete',
  'expense_add',
  'expense_update',
  'expense_delete',
  'staff_add',
  'staff_update',
  'staff_disable',
  'settings_update',
]

const entityTypeOptions = ['user', 'product', 'sale', 'return', 'supplier', 'expense', 'settings']

const initialFilters = {
  date_from: '',
  date_to: '',
  action: '',
  entity_type: '',
}

const formatLabel = (value) =>
  value
    ? value
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : '-'

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null

  if (!date || Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString()
}

function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadLogs = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()

      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })

      const query = params.toString()
      const response = await api.get(`/audit-logs${query ? `?${query}` : ''}`)
      setLogs(response.data.logs || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load audit logs'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const updateFilter = (event) => {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const resetFilters = () => {
    setFilters(initialFilters)
  }

  if (loading) {
    return <div className="panel loading-panel">Loading audit logs...</div>
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>Audit Logs</h2>
          <button type="button" className="ghost-button" onClick={() => loadLogs(false)}>
            Refresh
          </button>
        </div>
        <div className="form-grid compact-form">
          <label>
            From Date
            <input
              type="date"
              name="date_from"
              value={filters.date_from}
              onChange={updateFilter}
            />
          </label>
          <label>
            To Date
            <input type="date" name="date_to" value={filters.date_to} onChange={updateFilter} />
          </label>
          <label>
            Action
            <select name="action" value={filters.action} onChange={updateFilter}>
              <option value="">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {formatLabel(action)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entity Type
            <select name="entity_type" value={filters.entity_type} onChange={updateFilter}>
              <option value="">All entities</option>
              {entityTypeOptions.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {formatLabel(entityType)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-actions">
          <button type="button" onClick={() => loadLogs(false)}>
            Apply Filters
          </button>
          <button type="button" className="ghost-button" onClick={resetFilters}>
            Clear Filters
          </button>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Entity Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.user_name || '-'}</td>
                  <td>{log.user_role || '-'}</td>
                  <td>{formatLabel(log.action)}</td>
                  <td>{formatLabel(log.entity_type)}</td>
                  <td>{log.description || '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    No audit logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

export default AuditLogs
