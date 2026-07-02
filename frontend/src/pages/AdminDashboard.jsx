import { useEffect, useState } from 'react'
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
    return <div className="panel loading-panel">Loading admin dashboard...</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  const cards = [
    { label: 'Total Shops', value: summary.total_shops || 0 },
    { label: 'Active Shops', value: summary.active_shops || 0 },
    { label: 'Trial Shops', value: summary.trial_shops || 0 },
    { label: 'Expired Shops', value: summary.expired_shops || 0 },
    { label: 'Suspended Shops', value: summary.suspended_shops || 0 },
    {
      label: 'Estimated Monthly Revenue',
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
          <h2>Subscription Control</h2>
          <button type="button" className="ghost-button" onClick={loadSummary}>
            Refresh
          </button>
        </div>
      </section>
    </section>
  )
}

export default AdminDashboard
