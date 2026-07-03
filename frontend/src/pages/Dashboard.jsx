import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'
import { hasPermission } from '../utils/permissions'
import { getSessionUser } from '../utils/session'

const alertCards = [
  { type: 'low_stock', labelKey: 'Low stock', link: '/products' },
  { type: 'pending_payments', labelKey: 'Pending payments', link: '/payment-verification' },
  { type: 'unpaid_credits', labelKey: 'Unpaid credits', link: '/credit-book' },
  { type: 'supplier_due', labelKey: 'Supplier due', link: '/suppliers' },
]

function Dashboard() {
  const navigate = useNavigate()
  const user = getSessionUser()
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
    return <div className="panel loading-panel">{t('Loading dashboard...')}</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  const cards = [
    { label: t('Today Sales'), value: formatMoney(dashboard.today_sales_total), icon: 'Rs' },
    { label: t('Today Profit'), value: formatMoney(dashboard.today_profit_total), icon: '+' },
    { label: t('Bill Count'), value: dashboard.today_bill_count, icon: '#' },
    { label: t('Total Products'), value: dashboard.total_products, icon: 'P' },
    { label: t('Low Stock Count'), value: dashboard.low_stock_count, icon: '!' },
    { label: t('Credit Balance'), value: formatMoney(dashboard.total_credit_balance), icon: 'Cr' },
    { label: t('Total Customers'), value: dashboard.total_customers, icon: 'C' },
    { label: t('Today Expenses'), value: formatMoney(dashboard.today_expenses), icon: '-' },
    { label: t('Month Expenses'), value: formatMoney(dashboard.month_expenses), icon: 'M' },
    { label: t('Supplier Balance'), value: formatMoney(dashboard.supplier_balance), icon: 'S' },
    { label: t('Net Profit Today'), value: formatMoney(dashboard.net_profit_today), icon: 'N' },
  ]
  const notificationByType = notifications.reduce((map, notification) => {
    map[notification.type] = notification
    return map
  }, {})
  const visibleAlertCards =
    user.role !== 'owner'
      ? alertCards.filter((card) => ['low_stock', 'pending_payments'].includes(card.type))
      : alertCards

  return (
    <section className="page-stack">
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">{t('Business overview')}</p>
          <h2>{t('Your shop at a glance')}</h2>
          <p>{t("Track today's sales, stock, payments, and business activity.")}</p>
        </div>
        {hasPermission(user, 'pos_access') && (
          <button type="button" onClick={() => navigate('/pos')}>
            {t('Open POS')}
          </button>
        )}
      </section>
      {refreshing && <div className="info-banner">{t('Refreshing dashboard data...')}</div>}
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Alerts')}</h2>
          <button type="button" className="ghost-button" onClick={() => loadDashboard(true)} disabled={refreshing}>
            {refreshing ? t('refreshing') : t('refresh')}
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
                <span>{t(card.labelKey)}</span>
                <strong>{count}</strong>
              </button>
            )
          })}
        </div>
      </section>

      <div className="metric-grid">
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

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Recent Sales')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Sale ID')}</th>
                <th>{t('total')}</th>
                <th>{t('Profit')}</th>
                <th>{t('Payment')}</th>
                <th>{t('Date')}</th>
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
                    {t('No recent sales yet.')}
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
