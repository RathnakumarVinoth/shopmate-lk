import { useCallback, useEffect, useMemo, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null

  if (!date || Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString()
}

function Returns() {
  const [saleLookup, setSaleLookup] = useState('')
  const [sale, setSale] = useState(null)
  const [returnQuantities, setReturnQuantities] = useState({})
  const [reason, setReason] = useState('')
  const [returns, setReturns] = useState([])
  const [selectedReturn, setSelectedReturn] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadingSale, setLoadingSale] = useState(false)
  const [loadingReturns, setLoadingReturns] = useState(true)
  const [savingReturn, setSavingReturn] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  const loadReturns = useCallback(async (showLoader = true) => {
    if (showLoader) setLoadingReturns(true)

    try {
      const response = await api.get('/returns')
      setReturns(response.data.returns || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load return history'))
    } finally {
      setLoadingReturns(false)
    }
  }, [])

  useEffect(() => {
    loadReturns()
  }, [loadReturns])

  const loadSale = async (event) => {
    event.preventDefault()
    const lookup = saleLookup.trim()

    setMessage('')
    setError('')

    if (!lookup) {
      setError('Enter a sale ID or invoice number')
      return
    }

    setLoadingSale(true)

    try {
      const response = await api.get(`/returns/sale/${encodeURIComponent(lookup)}`)
      setSale(response.data.sale)
      setReturnQuantities({})
      setReason('')
    } catch (err) {
      setSale(null)
      setReturnQuantities({})
      setError(getApiMessage(err, 'Failed to load sale'))
    } finally {
      setLoadingSale(false)
    }
  }

  const updateReturnQuantity = (item, value) => {
    const availableQuantity = Number(item.available_return_quantity || 0)
    const requestedQuantity = Math.max(0, Math.min(Number(value || 0), availableQuantity))

    setReturnQuantities((current) => ({
      ...current,
      [item.sale_item_id]: value === '' ? '' : String(requestedQuantity),
    }))
  }

  const selectedItems = useMemo(() => {
    if (!sale?.items) return []

    return sale.items
      .map((item) => {
        const quantity = Number(returnQuantities[item.sale_item_id] || 0)
        const refundPrice = Number(item.selling_price || 0)

        return {
          ...item,
          quantity,
          refund_subtotal: quantity * refundPrice,
        }
      })
      .filter((item) => item.quantity > 0)
  }, [returnQuantities, sale])

  const totalRefund = selectedItems.reduce((sum, item) => sum + item.refund_subtotal, 0)

  const processReturn = async (event) => {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!sale) {
      setError('Load a sale before processing a return')
      return
    }

    if (selectedItems.length === 0) {
      setError('Enter a return quantity for at least one item')
      return
    }

    setSavingReturn(true)

    try {
      await api.post('/returns', {
        sale_id: sale.id,
        reason: reason.trim() || null,
        items: selectedItems.map((item) => ({
          sale_item_id: item.sale_item_id,
          quantity: item.quantity,
        })),
      })

      setMessage('Return processed successfully')
      setSale(null)
      setSaleLookup('')
      setReturnQuantities({})
      setReason('')
      notifyDashboardChanged()
      await loadReturns(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to process return'))
    } finally {
      setSavingReturn(false)
    }
  }

  const viewReturn = async (returnId) => {
    setLoadingDetails(true)
    setError('')

    try {
      const response = await api.get(`/returns/${returnId}`)
      setSelectedReturn(response.data.return)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load return details'))
    } finally {
      setLoadingDetails(false)
    }
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Sales Returns')}</h2>
        </div>
        <form className="form-grid report-filter" onSubmit={loadSale}>
          <label>
            {t('Sale ID or Invoice No')}
            <input
              value={saleLookup}
              onChange={(event) => setSaleLookup(event.target.value)}
              placeholder="1 or INV-20260702-0001"
            />
          </label>
          <button type="submit" disabled={loadingSale}>
            {loadingSale ? t('Loading...') : t('Load Sale')}
          </button>
        </form>
      </section>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      {sale && (
        <form className="page-stack" onSubmit={processReturn}>
          <section className="panel">
            <div className="section-heading">
              <h2>{t('Sale Details')}</h2>
            </div>
            <div className="summary-box return-summary">
              <div>
                <span>{t('Invoice')}</span>
                <strong>{sale.invoice_no || sale.id}</strong>
              </div>
              <div>
                <span>{t('Date')}</span>
                <strong>{formatDateTime(sale.created_at)}</strong>
              </div>
              <div>
                <span>{t('Customer')}</span>
                <strong>{sale.customer_name || 'Walk-in customer'}</strong>
              </div>
              <div>
                <span>{t('Total Amount')}</span>
                <strong>{formatMoney(sale.total_amount)}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>{t('Return Items')}</h2>
              <strong>{formatMoney(totalRefund)}</strong>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Product')}</th>
                    <th>{t('Sold')}</th>
                    <th>{t('Returned')}</th>
                    <th>{t('Available')}</th>
                    <th>{t('Return Qty')}</th>
                    <th>{t('Refund Price')}</th>
                    <th>{t('Refund Subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => {
                    const quantity = Number(returnQuantities[item.sale_item_id] || 0)
                    const availableQuantity = Number(item.available_return_quantity || 0)

                    return (
                      <tr key={item.sale_item_id}>
                        <td>{item.product_name}</td>
                        <td>{item.sold_quantity}</td>
                        <td>{item.already_returned_quantity}</td>
                        <td>{availableQuantity}</td>
                        <td>
                          <input
                            className="return-qty-input"
                            type="number"
                            min="0"
                            max={availableQuantity}
                            value={returnQuantities[item.sale_item_id] || ''}
                            onChange={(event) => updateReturnQuantity(item, event.target.value)}
                            disabled={availableQuantity <= 0}
                          />
                        </td>
                        <td>{formatMoney(item.selling_price)}</td>
                        <td>{formatMoney(quantity * Number(item.selling_price || 0))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <label className="return-reason">
              {t('Reason')}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows="3"
                placeholder="Customer returned damaged product"
              />
            </label>
            <button type="submit" disabled={savingReturn || selectedItems.length === 0}>
              {savingReturn ? t('Processing...') : t('Process Return')}
            </button>
          </section>
        </form>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Return History')}</h2>
          <button type="button" className="ghost-button" onClick={() => loadReturns()}>
            {t('Refresh')}
          </button>
        </div>
        {loadingReturns ? (
          <div className="loading-panel">{t('Loading returns...')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Invoice No')}</th>
                  <th>{t('Refund Amount')}</th>
                  <th>{t('Reason')}</th>
                  <th>{t('Returned By')}</th>
                  <th>{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((returnRow) => (
                  <tr key={returnRow.id}>
                    <td>{formatDateTime(returnRow.created_at)}</td>
                    <td>{returnRow.invoice_no || returnRow.sale_id}</td>
                    <td>{formatMoney(returnRow.refund_amount)}</td>
                    <td>{returnRow.reason || '-'}</td>
                    <td>{returnRow.user_name || '-'}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => viewReturn(returnRow.id)}
                        disabled={loadingDetails}
                      >
                        {t('View Details')}
                      </button>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-cell">
                      {t('No returns found.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedReturn && (
        <div className="modal-backdrop">
          <section className="receipt-modal history-modal">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t('Return Details')}</p>
                <h2>{selectedReturn.invoice_no || selectedReturn.sale_id}</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setSelectedReturn(null)}>
                {t('Close')}
              </button>
            </div>
            <div className="summary-box return-summary">
              <div>
                <span>{t('Date')}</span>
                <strong>{formatDateTime(selectedReturn.created_at)}</strong>
              </div>
              <div>
                <span>{t('Refund Amount')}</span>
                <strong>{formatMoney(selectedReturn.refund_amount)}</strong>
              </div>
              <div>
                <span>{t('Returned By')}</span>
                <strong>{selectedReturn.user_name || '-'}</strong>
              </div>
              <div>
                <span>{t('Reason')}</span>
                <strong>{selectedReturn.reason || '-'}</strong>
              </div>
            </div>
            <div className="table-wrap history-section">
              <table>
                <thead>
                  <tr>
                    <th>{t('Product')}</th>
                    <th>{t('Quantity')}</th>
                    <th>{t('Refund Price')}</th>
                    <th>{t('Subtotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReturn.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.product_name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.refund_price)}</td>
                      <td>{formatMoney(item.refund_subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default Returns
