import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const asArray = (data, key) => {
  if (Array.isArray(data)) return data
  return data?.[key] || []
}

const formatAverage = (value) => Number(value || 0).toFixed(2)

function PurchaseSuggestions() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [fastMovingProducts, setFastMovingProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadSuggestions = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const [summaryResponse, suggestionsResponse, fastMovingResponse] =
        await Promise.all([
          api.get('/purchase-suggestions/summary'),
          api.get('/purchase-suggestions'),
          api.get('/purchase-suggestions/fast-moving'),
        ])

      setSummary(summaryResponse.data.summary || {})
      setSuggestions(asArray(suggestionsResponse.data, 'suggestions'))
      setFastMovingProducts(asArray(fastMovingResponse.data, 'products'))
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load purchase suggestions'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  const restockProduct = (product) => {
    navigate('/stock', {
      state: {
        productId: product.product_id,
        suggestedQuantity: product.suggested_reorder_quantity,
        supplierId: product.preferred_supplier_id,
      },
    })
  }

  const summaryCards = [
    { label: t('Low Stock Products'), value: summary.low_stock_count || 0 },
    { label: t('Out of Stock Products'), value: summary.out_of_stock_count || 0 },
    {
      label: t('Estimated Purchase Cost'),
      value: formatMoney(summary.total_estimated_purchase_cost),
    },
    {
      label: t('Fast-Moving Low Stock'),
      value: summary.fast_moving_low_stock_count || 0,
    },
  ]

  if (loading) {
    return <div className="panel loading-panel">{t('Loading purchase suggestions...')}</div>
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Purchase Suggestions')}</h2>
          <button
            type="button"
            className="ghost-button"
            onClick={() => loadSuggestions(true)}
            disabled={refreshing}
          >
            {refreshing ? t('Refreshing...') : t('Refresh')}
          </button>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {refreshing && <div className="info-banner">{t('Refreshing purchase suggestions...')}</div>}

      <div className="metric-grid compact-metrics">
        {summaryCards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Suggested Purchases')}</h2>
        </div>
        <div className="table-wrap">
          <table className="purchase-suggestion-table">
            <thead>
              <tr>
                <th>{t('Product')}</th>
                <th>{t('Code / SKU')}</th>
                <th>{t('Category')}</th>
                <th>{t('Current Stock')}</th>
                <th>{t('Default Low Stock Limit')}</th>
                <th>{t('Sales Last 30 Days')}</th>
                <th>{t('Average Daily Sales')}</th>
                <th>{t('Suggested Quantity')}</th>
                <th>{t('Estimated Cost')}</th>
                <th>{t('Preferred Supplier')}</th>
                <th>{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((product) => (
                <tr key={product.product_id} className="low-stock-row">
                  <td>
                    <strong>{product.product_name}</strong>
                  </td>
                  <td>
                    <span>{product.product_code || '-'}</span>
                    <span className="table-subtext">{product.barcode || '-'}</span>
                  </td>
                  <td>{product.category || '-'}</td>
                  <td>{product.stock_quantity}</td>
                  <td>{product.low_stock_limit}</td>
                  <td>{product.sales_last_30_days}</td>
                  <td>{formatAverage(product.average_daily_sales)}</td>
                  <td>
                    <strong>{product.suggested_reorder_quantity}</strong>
                  </td>
                  <td>{formatMoney(product.estimated_purchase_cost)}</td>
                  <td>{product.preferred_supplier_name || '-'}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => restockProduct(product)}
                    >
                      {t('Restock')}
                    </button>
                  </td>
                </tr>
              ))}
              {suggestions.length === 0 && (
                <tr>
                  <td colSpan="11" className="empty-cell">
                    {t('No low-stock products need purchase suggestions.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Fast-Moving Products')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Product')}</th>
                <th>{t('Category')}</th>
                <th>{t('Stock')}</th>
                <th>{t('Sold Last 30 Days')}</th>
                <th>{t('Average Daily Sales')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {fastMovingProducts.map((product) => (
                <tr key={product.product_id}>
                  <td>
                    <strong>{product.product_name}</strong>
                  </td>
                  <td>{product.category || '-'}</td>
                  <td>{product.stock_quantity}</td>
                  <td>{product.total_quantity_sold}</td>
                  <td>{formatAverage(product.average_daily_sales)}</td>
                  <td>
                    <span className={`status ${product.stock_status}`}>
                      {product.stock_status === 'low_stock' ? t('Low Stock') : t('Normal')}
                    </span>
                  </td>
                </tr>
              ))}
              {fastMovingProducts.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    {t('No fast-moving products found for the last 30 days.')}
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

export default PurchaseSuggestions
