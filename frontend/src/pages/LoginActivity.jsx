import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const initialFilters = {
  date_from: '',
  date_to: '',
  status: '',
}

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null

  if (!date || Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString()
}

function LoginActivity() {
  const [activity, setActivity] = useState([])
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadActivity = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()

      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })

      const query = params.toString()
      const response = await api.get(`/login-activity${query ? `?${query}` : ''}`)
      setActivity(response.data.activity || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load login activity'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadActivity()
  }, [loadActivity])

  const updateFilter = (event) => {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  if (loading) {
    return <div className="panel loading-panel">{t('Loading login activity...')}</div>
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Login Activity')}</h2>
          <button type="button" className="ghost-button" onClick={() => loadActivity(false)}>
            {t('Refresh')}
          </button>
        </div>
        <div className="form-grid compact-form">
          <label>
            {t('From Date')}
            <input name="date_from" type="date" value={filters.date_from} onChange={updateFilter} />
          </label>
          <label>
            {t('To Date')}
            <input name="date_to" type="date" value={filters.date_to} onChange={updateFilter} />
          </label>
          <label>
            {t('Status')}
            <select name="status" value={filters.status} onChange={updateFilter}>
              <option value="">{t('All')}</option>
              <option value="success">{t('Success')}</option>
              <option value="failed">{t('Failed')}</option>
            </select>
          </label>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Date/Time')}</th>
                <th>{t('Email')}</th>
                <th>{t('Role')}</th>
                <th>{t('Status')}</th>
                <th>{t('IP Address')}</th>
                <th>{t('User Agent')}</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.email || '-'}</td>
                  <td>{item.role || '-'}</td>
                  <td>
                    <span className={`status ${item.status === 'success' ? 'paid' : 'unpaid'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.ip_address || '-'}</td>
                  <td>{item.user_agent || '-'}</td>
                </tr>
              ))}
              {activity.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    {t('No login activity found.')}
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

export default LoginActivity
