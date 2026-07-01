import { useEffect, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

function Dashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadDashboard = async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const response = await api.get('/dashboard')
      setDashboard(response.data.dashboard || response.data)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load dashboard'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadDashboard()

    const refreshDashboard = () => loadDashboard(true)
    window.addEventListener('shopmate:data-changed', refreshDashboard)

    return () => window.removeEventListener('shopmate:data-changed', refreshDashboard)
  }, [])

  if (loading) {
    return <div className="panel loading-panel">Loading dashboard...</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  const cards = [
    { label: 'Today Sales', value: formatMoney(dashboard.today_sales_total) },
    { label: 'Today Profit', value: formatMoney(dashboard.today_profit_total) },
    { label: 'Bill Count', value: dashboard.today_bill_count },
    { label: 'Total Products', value: dashboard.total_products },
    { label: 'Low Stock Count', value: dashboard.low_stock_count },
    { label: 'Credit Balance', value: formatMoney(dashboard.total_credit_balance) },
    { label: 'Total Customers', value: dashboard.total_customers },
  ]

  return (
    <section className="page-stack">
      {refreshing && <div className="info-banner">Refreshing dashboard data...</div>}
      <div className="metric-grid">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="section-heading">
          <h2>Recent Sales</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sale ID</th>
                <th>Total</th>
                <th>Profit</th>
                <th>Payment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.recent_sales || []).map((sale) => (
                <tr key={sale.id}>
                  <td>#{sale.id}</td>
                  <td>{formatMoney(sale.total_amount)}</td>
                  <td>{formatMoney(sale.total_profit)}</td>
                  <td>{sale.payment_type}</td>
                  <td>{new Date(sale.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {(dashboard.recent_sales || []).length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-cell">
                    No recent sales yet.
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

export default Dashboard
