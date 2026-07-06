import { useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

function AdminBackups() {
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStatus = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/admin/backups/status')
      setShops(response.data.shops || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load backup status'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  if (loading) {
    return <div className="panel loading-panel">{t('Loading backup status...')}</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  return (
    <section className="page-stack">
      <section className="dashboard-welcome admin-welcome">
        <div>
          <p className="eyebrow">{t('Administration overview')}</p>
          <h2>{t('Backup Status')}</h2>
          <p>{t('Review each shop manual backup status and recent failures.')}</p>
        </div>
        <button type="button" className="ghost-button" onClick={loadStatus}>
          {t('Refresh')}
        </button>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Shops')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Shop')}</th>
                <th>{t('Subscription')}</th>
                <th>{t('Backup Status')}</th>
                <th>{t('Last Backup')}</th>
                <th>{t('Records')}</th>
                <th>{t('Error')}</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.shop_id}>
                  <td>
                    <strong>{shop.shop_name}</strong>
                    <span className="muted">{shop.shop_code || `#${shop.shop_id}`}</span>
                  </td>
                  <td>{shop.subscription_status || '-'}</td>
                  <td>{shop.latest_backup?.status || t('No records found')}</td>
                  <td>{shop.latest_backup?.completed_at || '-'}</td>
                  <td>{shop.latest_backup?.record_count || 0}</td>
                  <td>{shop.latest_backup?.error_message || '-'}</td>
                </tr>
              ))}
              {shops.length === 0 && (
                <tr>
                  <td colSpan="6">{t('No records found')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

export default AdminBackups
