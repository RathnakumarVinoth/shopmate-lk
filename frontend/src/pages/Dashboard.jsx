import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const alertCards = [
  { type: 'low_stock', label: 'Low stock', link: '/products' },
  { type: 'pending_payments', label: 'Pending payments', link: '/payment-verification' },
  { type: 'unpaid_credits', label: 'Unpaid credits', link: '/credit-book' },
  { type: 'supplier_due', label: 'Supplier due', link: '/suppliers' },
]

function Dashboard() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [dashboard, setDashboard] = useState(null)
  const [notifications, setNotifications] = useState([])
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
      const dashboardResponse = await api.get('/dashboard')
      setDashboard(dashboardResponse.data.dashboard || dashboardResponse.data)

      try {
        const notificationsResponse = await api.get('/notifications')
        setNotifications(notificationsResponse.data.notifications || [])
      } catch {
        setNotifications([])
      }
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
    { label: 'Today Expenses', value: formatMoney(dashboard.today_expenses) },
    { label: 'Month Expenses', value: formatMoney(dashboard.month_expenses) },
    { label: 'Supplier Balance', value: formatMoney(dashboard.supplier_balance) },
    { label: 'Net Profit Today', value: formatMoney(dashboard.net_profit_today) },
  ]
  const notificationByType = notifications.reduce((map, notification) => {
    map[notification.type] = notification
    return map
  }, {})
  const visibleAlertCards =
    user.role === 'staff'
      ? alertCards.filter((card) => ['low_stock', 'pending_payments'].includes(card.type))
      : alertCards

  return (
    <section className="page-stack">
      {refreshing && <div className="info-banner">Refreshing dashboard data...</div>}
      <section className="panel">
        <div className="section-heading">
          <h2>Alerts</h2>
          <button type="button" className="ghost-button" onClick={() => loadDashboard(true)} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="metric-grid alert-summary-grid">
          {visibleAlertCards.map((card) => {
            const notification = notificationByType[card.type]
            const count = Number(notification?.count || 0)

            return (
              <button
                type="button"
                className={`alert-summary-card ${count > 0 ? notification?.priority || 'medium' : 'low'}`}
                key={card.type}
                onClick={() => navigate(notification?.link || card.link)}
              >
                <span>{card.label}</span>
                <strong>{count}</strong>
              </button>
            )
          })}
        </div>
      </section>

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
