import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const formatDate = (value) => {
  if (!value) return '-'
  return String(value).slice(0, 10)
}

function AdminShopDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [shop, setShop] = useState(null)
  const [usage, setUsage] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadShop = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await api.get(`/admin/shops/${id}`)
        setShop(response.data.shop || null)
        setUsage(response.data.usage || {})
      } catch (err) {
        setError(getApiMessage(err, 'Failed to load shop details'))
      } finally {
        setLoading(false)
      }
    }

    loadShop()
  }, [id])

  if (loading) {
    return <div className="panel loading-panel">Loading shop details...</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  if (!shop) {
    return <div className="empty-state">Shop not found.</div>
  }

  const usageCards = [
    { label: 'Total Products', value: usage.total_products || 0 },
    { label: 'Total Sales', value: usage.total_sales || 0 },
    { label: 'Total Staff', value: usage.total_staff || 0 },
    { label: 'Total Customers', value: usage.total_customers || 0 },
    { label: 'Total Revenue', value: formatMoney(usage.total_revenue) },
  ]

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{shop.shop_name}</h2>
          <button type="button" className="ghost-button" onClick={() => navigate('/admin/shops')}>
            Back to Shops
          </button>
        </div>
        <div className="summary-box admin-detail-grid">
          <div>
            <span>Owner</span>
            <strong>{shop.owner_name || '-'}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{shop.owner_email || '-'}</strong>
          </div>
          <div>
            <span>Phone</span>
            <strong>{shop.phone || '-'}</strong>
          </div>
          <div>
            <span>Address</span>
            <strong>{shop.address || '-'}</strong>
          </div>
          <div>
            <span>Plan</span>
            <strong>{shop.subscription_plan || '-'}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={`status ${shop.subscription_status || 'trial'}`}>
              {shop.subscription_status || 'trial'}
            </strong>
          </div>
          <div>
            <span>Start Date</span>
            <strong>{formatDate(shop.subscription_start_date)}</strong>
          </div>
          <div>
            <span>Expiry Date</span>
            <strong>{formatDate(shop.subscription_expiry_date)}</strong>
          </div>
          <div>
            <span>Monthly Fee</span>
            <strong>{formatMoney(shop.monthly_fee)}</strong>
          </div>
          <div>
            <span>Enabled</span>
            <strong>{shop.is_enabled ? 'Yes' : 'No'}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>{formatDate(shop.created_at)}</strong>
          </div>
        </div>
      </section>

      <div className="metric-grid compact-metrics">
        {usageCards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

export default AdminShopDetails
