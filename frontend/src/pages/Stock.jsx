import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'

const initialForm = {
  product_id: '',
  supplier_id: '',
  quantity: '',
  buying_price: '',
  paid_amount: '',
  note: '',
}

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null

  if (!date || Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString()
}

function Stock() {
  const location = useLocation()
  const appliedSuggestionRef = useRef(false)
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [movements, setMovements] = useState([])
  const [summary, setSummary] = useState({})
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastRestock, setLastRestock] = useState(null)

  const selectedProduct = useMemo(
    () => products.find((product) => Number(product.id) === Number(form.product_id)),
    [products, form.product_id],
  )

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => Number(supplier.id) === Number(form.supplier_id)),
    [suppliers, form.supplier_id],
  )

  const quantity = Number(form.quantity || 0)
  const buyingPrice = Number(form.buying_price || 0)
  const paidAmount = Number(form.paid_amount || 0)
  const totalCost = quantity * buyingPrice
  const overpaid = paidAmount > totalCost && totalCost >= 0
  const currentStock = selectedProduct ? Number(selectedProduct.stock_quantity || 0) : 0
  const newStock = selectedProduct ? currentStock + quantity : 0
  const supplierBalance = Math.max(totalCost - paidAmount, 0)

  const preview = selectedProduct
    ? {
        title: 'Restock Preview',
        productName: selectedProduct.product_name,
        supplierName: selectedSupplier?.supplier_name || 'No supplier',
        currentStock,
        quantity,
        newStock,
        buyingPrice,
        totalCost,
        paidAmount,
        supplierBalance,
      }
    : lastRestock

  const loadStockData = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const [productsResponse, suppliersResponse, summaryResponse, movementsResponse] =
        await Promise.all([
          api.get('/products'),
          api.get('/suppliers'),
          api.get('/stock/summary'),
          api.get('/stock/movements'),
        ])

      setProducts(getProductsFromResponse(productsResponse.data))
      setSuppliers(suppliersResponse.data.suppliers || [])
      setSummary(summaryResponse.data.summary || {})
      setMovements(movementsResponse.data.movements || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load stock data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStockData()
  }, [])

  useEffect(() => {
    const suggestion = location.state

    if (appliedSuggestionRef.current || !suggestion?.productId || products.length === 0) {
      return
    }

    const product = products.find((item) => Number(item.id) === Number(suggestion.productId))

    if (!product) {
      return
    }

    appliedSuggestionRef.current = true
    setForm((current) => ({
      ...current,
      product_id: String(product.id),
      supplier_id: suggestion.supplierId ? String(suggestion.supplierId) : '',
      quantity: suggestion.suggestedQuantity ? String(suggestion.suggestedQuantity) : current.quantity,
      buying_price: String(product.buying_price ?? ''),
    }))
    setMessage('Purchase suggestion loaded for restock')
  }, [location.state, products])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const chooseProduct = (event) => {
    const productId = event.target.value
    const product = products.find((item) => Number(item.id) === Number(productId))

    setForm((current) => ({
      ...current,
      product_id: productId,
      buying_price: product ? String(product.buying_price ?? '') : current.buying_price,
    }))
  }

  const restockProduct = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!form.product_id) {
      setError('Select a product')
      return
    }

    if (quantity <= 0) {
      setError('Quantity must be greater than 0')
      return
    }

    if (buyingPrice < 0 || Number.isNaN(buyingPrice)) {
      setError('Buying price must be greater than or equal to 0')
      return
    }

    if (paidAmount < 0 || Number.isNaN(paidAmount)) {
      setError('Paid amount must be greater than or equal to 0')
      return
    }

    if (overpaid) {
      setError(`Paid amount cannot exceed total cost of ${formatMoney(totalCost)}`)
      return
    }

    setSaving(true)

    try {
      const completedRestock = {
        title: 'Last Restock Summary',
        productName: selectedProduct.product_name,
        supplierName: selectedSupplier?.supplier_name || 'No supplier',
        currentStock,
        quantity,
        newStock,
        buyingPrice,
        totalCost,
        paidAmount,
        supplierBalance,
      }

      await api.post('/stock/restock', {
        product_id: Number(form.product_id),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        quantity,
        buying_price: buyingPrice,
        paid_amount: paidAmount,
        note: form.note.trim() || null,
      })

      setForm(initialForm)
      setLastRestock(completedRestock)
      setMessage('Product restocked successfully')
      notifyDashboardChanged()
      await loadStockData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to restock product'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">Loading stock...</div>
  }

  return (
    <section className="page-stack">
      <div className="metric-grid compact-metrics">
        <article className="metric-card">
          <span>Total Products</span>
          <strong>{summary.total_products || 0}</strong>
        </article>
        <article className="metric-card">
          <span>Low Stock Count</span>
          <strong>{summary.low_stock_count || 0}</strong>
        </article>
        <article className="metric-card">
          <span>Total Stock Value</span>
          <strong>{formatMoney(summary.total_stock_value)}</strong>
        </article>
        <article className="metric-card">
          <span>Restock Cost This Month</span>
          <strong>{formatMoney(summary.total_restock_cost_this_month)}</strong>
        </article>
        <article className="metric-card">
          <span>Restock Items This Month</span>
          <strong>{summary.total_restock_items_this_month || 0}</strong>
        </article>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Restock Product</h2>
          </div>
          <form onSubmit={restockProduct} className="form-grid">
            <label className="full-width">
              Product
              <select value={form.product_id} onChange={chooseProduct} required>
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.product_name} - Stock {product.stock_quantity}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Supplier Optional
              <select name="supplier_id" value={form.supplier_id} onChange={updateField}>
                <option value="">No supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplier_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                name="quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Buying Price
              <input
                name="buying_price"
                type="number"
                min="0"
                step="0.01"
                value={form.buying_price}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Paid Amount
              <input
                name="paid_amount"
                type="number"
                min="0"
                max={totalCost || undefined}
                step="0.01"
                value={form.paid_amount}
                onChange={updateField}
                className={overpaid ? 'input-error' : ''}
              />
            </label>
            <label>
              Total Cost
              <input value={formatMoney(totalCost)} readOnly />
            </label>
            <label className="full-width">
              Note
              <input name="note" value={form.note} onChange={updateField} />
            </label>
            {selectedProduct && (
              <p className="muted full-width">
                Current stock {selectedProduct.stock_quantity}. New stock will be{' '}
                {Number(selectedProduct.stock_quantity) + quantity}.
              </p>
            )}
            <button type="submit" className="full-width" disabled={saving || overpaid}>
              {saving ? 'Restocking...' : 'Restock Product'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>{preview?.title || 'Restock Preview'}</h2>
            <button type="button" className="ghost-button" onClick={() => loadStockData()}>
              Refresh
            </button>
          </div>
          {preview ? (
            <div className="summary-box">
              <div>
                <span>Selected Product</span>
                <strong>{preview.productName}</strong>
              </div>
              <div>
                <span>Supplier</span>
                <strong>{preview.supplierName}</strong>
              </div>
              <div>
                <span>Current Stock</span>
                <strong>{preview.currentStock}</strong>
              </div>
              <div>
                <span>Restock Quantity</span>
                <strong>{preview.quantity || 0}</strong>
              </div>
              <div>
                <span>New Stock After Restock</span>
                <strong>{preview.newStock}</strong>
              </div>
              <div>
                <span>Buying Price</span>
                <strong>{formatMoney(preview.buyingPrice)}</strong>
              </div>
              <div>
                <span>Total Cost</span>
                <strong>{formatMoney(preview.totalCost)}</strong>
              </div>
              <div>
                <span>Paid Amount</span>
                <strong>{formatMoney(preview.paidAmount)}</strong>
              </div>
              <div>
                <span>Supplier Balance</span>
                <strong>{formatMoney(preview.supplierBalance)}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              Select a product to preview restock details.
            </div>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Stock Movement History</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Supplier</th>
                <th>Quantity</th>
                <th>Previous Stock</th>
                <th>New Stock</th>
                <th>Buying Price</th>
                <th>Total Cost</th>
                <th>Added By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.created_at)}</td>
                  <td>{movement.product_name}</td>
                  <td>{movement.supplier_name || '-'}</td>
                  <td>{movement.quantity}</td>
                  <td>{movement.previous_stock}</td>
                  <td>{movement.new_stock}</td>
                  <td>{formatMoney(movement.buying_price)}</td>
                  <td>{formatMoney(movement.total_cost)}</td>
                  <td>{movement.user_name || '-'}</td>
                  <td>{movement.note || '-'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan="10" className="empty-cell">
                    No stock movements found.
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

export default Stock
