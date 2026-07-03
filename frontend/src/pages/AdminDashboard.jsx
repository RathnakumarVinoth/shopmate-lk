import { useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

function AdminDashboard() {
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSummary = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/admin/summary')
      setSummary(response.data.summary || {})
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load admin summary'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [])

  if (loading) {
    return <div className="panel loading-panel">{t('Loading admin dashboard...')}</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  const cards = [
    { label: t('Total Shops'), value: summary.total_shops || 0 },
    { label: t('Active Shops'), value: summary.active_shops || 0 },
    { label: t('Trial Shops'), value: summary.trial_shops || 0 },
    { label: t('Expired Shops'), value: summary.expired_shops || 0 },
    { label: t('Suspended Shops'), value: summary.suspended_shops || 0 },
    {
      label: t('Estimated Monthly Revenue'),
      value: formatMoney(summary.estimated_monthly_revenue),
    },
  ]

  return (
    <section className="page-stack">
      <div className="metric-grid report-metrics">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Subscription Control')}</h2>
          <button type="button" className="ghost-button" onClick={loadSummary}>
            {t('Refresh')}
          </button>
        </div>
      </section>
    </section>
  )
}

export default AdminDashboard
