import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { t } from '../i18n/translations'
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
    return <div className="panel loading-panel">{t('Loading shop details...')}</div>
  }

  if (error) {
    return <div className="alert">{error}</div>
  }

  if (!shop) {
    return <div className="empty-state">{t('Shop not found.')}</div>
  }

  const usageCards = [
    { label: t('Total Products'), value: usage.total_products || 0 },
    { label: t('Total Sales'), value: usage.total_sales || 0 },
    { label: t('Total Staff'), value: usage.total_staff || 0 },
    { label: t('Total Customers'), value: usage.total_customers || 0 },
    { label: t('Total Revenue'), value: formatMoney(usage.total_revenue) },
  ]

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{shop.shop_name}</h2>
          <button type="button" className="ghost-button" onClick={() => navigate('/admin/shops')}>
            {t('Back to Shops')}
          </button>
        </div>
        <div className="summary-box admin-detail-grid">
          <div>
            <span>{t('Owner')}</span>
            <strong>{shop.owner_name || '-'}</strong>
          </div>
          <div>
            <span>{t('Email')}</span>
            <strong>{shop.owner_email || '-'}</strong>
          </div>
          <div>
            <span>{t('Phone')}</span>
            <strong>{shop.phone || '-'}</strong>
          </div>
          <div>
            <span>{t('Address')}</span>
            <strong>{shop.address || '-'}</strong>
          </div>
          <div>
            <span>{t('Plan')}</span>
            <strong>{shop.subscription_plan || '-'}</strong>
          </div>
          <div>
            <span>{t('Status')}</span>
            <strong className={`status ${shop.subscription_status || 'trial'}`}>
              {shop.subscription_status || 'trial'}
            </strong>
          </div>
          <div>
            <span>{t('Start Date')}</span>
            <strong>{formatDate(shop.subscription_start_date)}</strong>
          </div>
          <div>
            <span>{t('Expiry Date')}</span>
            <strong>{formatDate(shop.subscription_expiry_date)}</strong>
          </div>
          <div>
            <span>{t('Monthly Fee')}</span>
            <strong>{formatMoney(shop.monthly_fee)}</strong>
          </div>
          <div>
            <span>{t('Enabled')}</span>
            <strong>{shop.is_enabled ? t('Yes') : t('No')}</strong>
          </div>
          <div>
            <span>{t('Created')}</span>
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
