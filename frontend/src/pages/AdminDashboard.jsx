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
    { label: t('Total Shops'), value: summary.total_shops || 0, icon: '#' },
    { label: t('Active Shops'), value: summary.active_shops || 0, icon: '+' },
    { label: t('Trial Shops'), value: summary.trial_shops || 0, icon: 'T' },
    { label: t('Expired Shops'), value: summary.expired_shops || 0, icon: '!' },
    { label: t('Suspended Shops'), value: summary.suspended_shops || 0, icon: '-' },
    {
      label: t('Estimated Monthly Revenue'),
      value: formatMoney(summary.estimated_monthly_revenue),
      icon: 'Rs',
    },
  ]

  return (
    <section className="page-stack">
      <section className="dashboard-welcome admin-welcome">
        <div>
          <p className="eyebrow">{t('Administration overview')}</p>
          <h2>{t('Subscription portfolio')}</h2>
          <p>{t('Monitor active shops, subscription health, and monthly revenue.')}</p>
        </div>
        <button type="button" className="ghost-button" onClick={loadSummary}>
          {t('Refresh')}
        </button>
      </section>

      <div className="metric-grid report-metrics">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <div className="metric-card-heading">
              <span>{card.label}</span>
              <i aria-hidden="true">{card.icon}</i>
            </div>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

export default AdminDashboard
