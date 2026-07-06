import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const PAGE_SIZE = 10

const formatBytes = (value) => {
  if (value === null || value === undefined) return '-'

  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const statusClass = (status) => {
  if (['ok', 'completed', 'read'].includes(status)) return 'paid'
  if (['degraded', 'pending', 'running', 'unread'].includes(status)) return 'pending'
  return 'failed'
}

function Pager({ pagination, onPageChange }) {
  if (!pagination || pagination.total_pages <= 1) return null

  return (
    <div className="table-actions">
      <button
        type="button"
        className="ghost-button"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        {t('Previous')}
      </button>
      <span>
        {t('Page')} {pagination.page} {t('of')} {pagination.total_pages}
      </span>
      <button
        type="button"
        className="ghost-button"
        disabled={pagination.page >= pagination.total_pages}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        {t('Next')}
      </button>
    </div>
  )
}

function AdminSystemHealth() {
  const [health, setHealth] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [errorLogs, setErrorLogs] = useState([])
  const [requestLogs, setRequestLogs] = useState([])
  const [alertPagination, setAlertPagination] = useState(null)
  const [errorPagination, setErrorPagination] = useState(null)
  const [requestPagination, setRequestPagination] = useState(null)
  const [alertPage, setAlertPage] = useState(1)
  const [errorPage, setErrorPage] = useState(1)
  const [requestPage, setRequestPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [healthResponse, alertResponse, errorResponse, requestResponse] = await Promise.all([
        api.get('/admin/system-health'),
        api.get('/admin/system-alerts', {
          params: { page: alertPage, limit: PAGE_SIZE },
        }),
        api.get('/admin/error-logs', {
          params: { page: errorPage, limit: PAGE_SIZE },
        }),
        api.get('/admin/api-request-logs', {
          params: { page: requestPage, limit: PAGE_SIZE },
        }),
      ])

      setHealth(healthResponse.data.health || null)
      setAlerts(alertResponse.data.alerts || [])
      setAlertPagination(alertResponse.data.pagination || null)
      setErrorLogs(errorResponse.data.logs || [])
      setErrorPagination(errorResponse.data.pagination || null)
      setRequestLogs(requestResponse.data.logs || [])
      setRequestPagination(requestResponse.data.pagination || null)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load system health'))
    } finally {
      setLoading(false)
    }
  }, [alertPage, errorPage, requestPage])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const markAlertRead = async (alertId) => {
    setActionId(alertId)
    setError('')

    try {
      await api.patch(`/admin/system-alerts/${alertId}/read`)
      await loadDashboard()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to update alert'))
    } finally {
      setActionId(null)
    }
  }

  if (loading && !health) {
    return <div className="panel loading-panel">{t('Loading system health...')}</div>
  }

  const storage = health?.storage || {}
  const cards = [
    {
      label: t('API Status'),
      value: health?.api?.status || '-',
      status: health?.api?.status,
    },
    {
      label: t('Database Status'),
      value: health?.database?.status || '-',
      status: health?.database?.status,
    },
    {
      label: t('Last Backup'),
      value: health?.last_backup?.status || t('No records found'),
      status: health?.last_backup?.status,
    },
    {
      label: t('Storage Usage'),
      value: formatBytes(storage.database_bytes),
      status: 'ok',
    },
    {
      label: t('Recent Errors'),
      value: health?.recent_error_count ?? '-',
      status: Number(health?.recent_error_count || 0) > 0 ? 'degraded' : 'ok',
    },
    {
      label: t('Failed Requests'),
      value: health?.failed_api_request_count ?? '-',
      status: Number(health?.failed_api_request_count || 0) > 0 ? 'degraded' : 'ok',
    },
  ]

  return (
    <section className="page-stack">
      <section className="dashboard-welcome admin-welcome">
        <div>
          <p className="eyebrow">{t('Administration overview')}</p>
          <h2>{t('System Health')}</h2>
          <p>{t('Review API, database, backup, storage, and recent failure activity.')}</p>
        </div>
        <button type="button" className="ghost-button" onClick={loadDashboard} disabled={loading}>
          {loading ? t('Refreshing...') : t('Refresh')}
        </button>
      </section>

      {error && <div className="alert">{error}</div>}

      <div className="metric-grid report-metrics">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <div className="metric-card-heading">
              <span>{card.label}</span>
              <i aria-hidden="true">i</i>
            </div>
            <strong>{card.value}</strong>
            <span className={`status ${statusClass(card.status)}`}>{card.status || '-'}</span>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Storage Details')}</h2>
        </div>
        <div className="metric-grid compact-metrics">
          <article className="metric-card">
            <span>{t('Database')}</span>
            <strong>{formatBytes(storage.database_bytes)}</strong>
          </article>
          <article className="metric-card">
            <span>{t('Backup Data')}</span>
            <strong>{formatBytes(storage.backup_database_bytes)}</strong>
          </article>
          <article className="metric-card">
            <span>{t('Backup Files')}</span>
            <strong>{formatBytes(storage.backup_file_bytes)}</strong>
          </article>
          <article className="metric-card">
            <span>{t('Disk Free')}</span>
            <strong>{formatBytes(storage.disk_free_bytes)}</strong>
          </article>
        </div>
        <p className="muted">{health?.retention?.strategy}</p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Admin Alerts')}</h2>
          <span className="status pending">
            {health?.unread_alert_count || 0} {t('Unread')}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Severity')}</th>
                <th>{t('Alert')}</th>
                <th>{t('Shop')}</th>
                <th>{t('Occurrences')}</th>
                <th>{t('Date/Time')}</th>
                <th>{t('Status')}</th>
                <th>{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td><span className={`status ${statusClass(alert.severity === 'critical' ? 'failed' : alert.status)}`}>{alert.severity}</span></td>
                  <td>
                    <strong>{alert.title}</strong>
                    <span className="muted">{alert.message}</span>
                  </td>
                  <td>{alert.shop_name || t('Global')}</td>
                  <td>{alert.occurrence_count || 1}</td>
                  <td>{formatDateTime(alert.created_at)}</td>
                  <td><span className={`status ${statusClass(alert.status)}`}>{alert.status}</span></td>
                  <td>
                    {alert.status === 'unread' ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => markAlertRead(alert.id)}
                        disabled={actionId === alert.id}
                      >
                        {actionId === alert.id ? t('Saving...') : t('Mark Read')}
                      </button>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr><td colSpan="7">{t('No active alerts.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager pagination={alertPagination} onPageChange={setAlertPage} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Recent Error Logs')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Date/Time')}</th>
                <th>{t('Type')}</th>
                <th>{t('Request')}</th>
                <th>{t('Status')}</th>
                <th>{t('Message')}</th>
                <th>{t('Request ID')}</th>
              </tr>
            </thead>
            <tbody>
              {errorLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.error_type}</td>
                  <td>{log.method || '-'} {log.path || '-'}</td>
                  <td><span className="status failed">{log.status_code}</span></td>
                  <td>{log.message}</td>
                  <td>{log.request_id || '-'}</td>
                </tr>
              ))}
              {errorLogs.length === 0 && (
                <tr><td colSpan="6">{t('No records found')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager pagination={errorPagination} onPageChange={setErrorPage} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Recent Failed API Requests')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Date/Time')}</th>
                <th>{t('Method')}</th>
                <th>{t('Path')}</th>
                <th>{t('Status')}</th>
                <th>{t('Response Time')}</th>
                <th>{t('Shop')}</th>
                <th>{t('Request ID')}</th>
              </tr>
            </thead>
            <tbody>
              {requestLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.method}</td>
                  <td>{log.path}</td>
                  <td><span className={`status ${log.status_code >= 500 ? 'failed' : 'pending'}`}>{log.status_code}</span></td>
                  <td>{log.response_time_ms} ms</td>
                  <td>{log.shop_id || t('Global')}</td>
                  <td>{log.request_id || '-'}</td>
                </tr>
              ))}
              {requestLogs.length === 0 && (
                <tr><td colSpan="7">{t('No records found')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager pagination={requestPagination} onPageChange={setRequestPage} />
      </section>
    </section>
  )
}

export default AdminSystemHealth
