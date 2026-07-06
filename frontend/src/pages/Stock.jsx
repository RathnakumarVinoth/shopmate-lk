import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'
import { hasPermission } from '../utils/permissions'
import { getSessionUser } from '../utils/session'

const initialForm = {
  product_id: '',
  supplier_id: '',
  quantity: '',
  buying_price: '',
  paid_amount: '',
  note: '',
}

const initialAdjustmentForm = {
  product_id: '',
  batch_id: '',
  adjustment_type: 'damaged',
  quantity: '',
  reason: '',
}

const initialReconciliationForm = {
  reason: '',
  notes: '',
}

const emptyReconciliationItem = {
  product_id: '',
  batch_id: '',
  physical_quantity: '',
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
  const user = getSessionUser()
  const canAccessStock = hasPermission(user, 'stock_access')
  const canViewProducts = hasPermission(user, 'products_view')
  const canViewSuppliers = hasPermission(user, 'suppliers_access')
  const canManageAdjustments = hasPermission(user, 'stock_adjustments_manage')
  const canManageReconciliation = hasPermission(user, 'stock_reconciliation_manage')
  const appliedSuggestionRef = useRef(false)
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [movements, setMovements] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [reconciliations, setReconciliations] = useState([])
  const [selectedReconciliation, setSelectedReconciliation] = useState(null)
  const [summary, setSummary] = useState({})
  const [form, setForm] = useState(initialForm)
  const [adjustmentForm, setAdjustmentForm] = useState(initialAdjustmentForm)
  const [reconciliationForm, setReconciliationForm] = useState(initialReconciliationForm)
  const [reconciliationItems, setReconciliationItems] = useState([{ ...emptyReconciliationItem }])
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
      const [
        productsResponse,
        suppliersResponse,
        summaryResponse,
        movementsResponse,
        adjustmentsResponse,
        reconciliationsResponse,
      ] =
        await Promise.all([
          canViewProducts ? api.get('/products') : Promise.resolve({ data: [] }),
          canViewSuppliers ? api.get('/suppliers') : Promise.resolve({ data: { suppliers: [] } }),
          canAccessStock ? api.get('/stock/summary') : Promise.resolve({ data: { summary: {} } }),
          canAccessStock ? api.get('/stock/movements') : Promise.resolve({ data: { movements: [] } }),
          canManageAdjustments
            ? api.get('/stock/adjustments')
            : Promise.resolve({ data: { adjustments: [] } }),
          canManageReconciliation
            ? api.get('/stock/reconciliations')
            : Promise.resolve({ data: { reconciliations: [] } }),
        ])

      setProducts(getProductsFromResponse(productsResponse.data))
      setSuppliers(suppliersResponse.data.suppliers || [])
      setSummary(summaryResponse.data.summary || {})
      setMovements(movementsResponse.data.movements || [])
      setAdjustments(adjustmentsResponse.data.adjustments || [])
      setReconciliations(reconciliationsResponse.data.reconciliations || [])
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

  const updateAdjustmentField = (event) => {
    const { name, value } = event.target
    setAdjustmentForm((current) => ({ ...current, [name]: value }))
  }

  const createAdjustment = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!adjustmentForm.product_id || Number(adjustmentForm.quantity) <= 0) {
      setError('Select a product and enter a valid adjustment quantity')
      return
    }

    if (!adjustmentForm.reason.trim()) {
      setError('Reason is required')
      return
    }

    setSaving(true)

    try {
      await api.post('/stock/adjustments', {
        product_id: Number(adjustmentForm.product_id),
        batch_id: adjustmentForm.batch_id ? Number(adjustmentForm.batch_id) : null,
        adjustment_type: adjustmentForm.adjustment_type,
        quantity: Number(adjustmentForm.quantity),
        reason: adjustmentForm.reason.trim(),
      })

      setAdjustmentForm(initialAdjustmentForm)
      setMessage('Stock adjustment created successfully')
      notifyDashboardChanged()
      await loadStockData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to create stock adjustment'))
    } finally {
      setSaving(false)
    }
  }

  const updateReconciliationField = (event) => {
    const { name, value } = event.target
    setReconciliationForm((current) => ({ ...current, [name]: value }))
  }

  const updateReconciliationItem = (index, field, value) => {
    setReconciliationItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  const addReconciliationItem = () => {
    setReconciliationItems((current) => [...current, { ...emptyReconciliationItem }])
  }

  const removeReconciliationItem = (index) => {
    setReconciliationItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const createReconciliation = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!reconciliationForm.reason.trim()) {
      setError('Reason is required')
      return
    }

    const items = reconciliationItems
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: Number(item.product_id),
        batch_id: item.batch_id ? Number(item.batch_id) : null,
        physical_quantity: Number(item.physical_quantity),
      }))

    if (!items.length || items.some((item) => Number.isNaN(item.physical_quantity) || item.physical_quantity < 0)) {
      setError('Enter at least one product with a valid physical quantity')
      return
    }

    setSaving(true)

    try {
      const response = await api.post('/stock/reconciliations', {
        reason: reconciliationForm.reason.trim(),
        notes: reconciliationForm.notes.trim() || null,
        items,
      })

      setReconciliationForm(initialReconciliationForm)
      setReconciliationItems([{ ...emptyReconciliationItem }])
      setSelectedReconciliation(response.data.reconciliation)
      setMessage('Stock reconciliation created successfully')
      await loadStockData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to create stock reconciliation'))
    } finally {
      setSaving(false)
    }
  }

  const loadReconciliationDetail = async (reconciliationId) => {
    setError('')

    try {
      const response = await api.get(`/stock/reconciliations/${reconciliationId}`)
      setSelectedReconciliation(response.data.reconciliation)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load reconciliation details'))
    }
  }

  const postReconciliation = async (reconciliation) => {
    setError('')
    setMessage('')
    setSaving(true)

    try {
      const response = await api.post(`/stock/reconciliations/${reconciliation.id}/post`)
      setSelectedReconciliation(response.data.reconciliation)
      setMessage('Stock reconciliation posted successfully')
      notifyDashboardChanged()
      await loadStockData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to post stock reconciliation'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">{t('Loading stock...')}</div>
  }

  return (
    <section className="page-stack">
      {canAccessStock && (
      <div className="metric-grid compact-metrics">
        <article className="metric-card">
          <span>{t('Total Products')}</span>
          <strong>{summary.total_products || 0}</strong>
        </article>
        <article className="metric-card">
          <span>{t('Low Stock Count')}</span>
          <strong>{summary.low_stock_count || 0}</strong>
        </article>
        <article className="metric-card">
          <span>{t('Total Stock Value')}</span>
          <strong>{formatMoney(summary.total_stock_value)}</strong>
        </article>
        <article className="metric-card">
          <span>{t('Restock Cost This Month')}</span>
          <strong>{formatMoney(summary.total_restock_cost_this_month)}</strong>
        </article>
        <article className="metric-card">
          <span>{t('Restock Items This Month')}</span>
          <strong>{summary.total_restock_items_this_month || 0}</strong>
        </article>
      </div>
      )}

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      {canAccessStock && (
      <section className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Restock Product')}</h2>
          </div>
          <form onSubmit={restockProduct} className="form-grid">
            <label className="full-width">
              {t('Product')}
              <select value={form.product_id} onChange={chooseProduct} required>
                <option value="">{t('Select product')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.product_name} - {t('Stock')} {product.stock_quantity}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              {t('Supplier')} {t('Optional')}
              <select name="supplier_id" value={form.supplier_id} onChange={updateField}>
                <option value="">{t('No supplier')}</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplier_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Quantity')}
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
              {t('Buying Price')}
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
              {t('Paid Amount')}
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
              {t('Total Cost')}
              <input value={formatMoney(totalCost)} readOnly />
            </label>
            <label className="full-width">
              {t('Note')}
              <input name="note" value={form.note} onChange={updateField} />
            </label>
            {selectedProduct && (
              <p className="muted full-width">
                {t('Current stock')} {selectedProduct.stock_quantity}. {t('New stock will be')}{' '}
                {Number(selectedProduct.stock_quantity) + quantity}.
              </p>
            )}
            <button type="submit" className="full-width" disabled={saving || overpaid}>
              {saving ? t('Restocking...') : t('Restock Product')}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>{preview?.title ? t(preview.title) : t('Restock Preview')}</h2>
            <button type="button" className="ghost-button" onClick={() => loadStockData()}>
              {t('Refresh')}
            </button>
          </div>
          {preview ? (
            <div className="summary-box">
              <div>
                <span>{t('Selected Product')}</span>
                <strong>{preview.productName}</strong>
              </div>
              <div>
                <span>{t('Supplier')}</span>
                <strong>{preview.supplierName}</strong>
              </div>
              <div>
                <span>{t('Current Stock')}</span>
                <strong>{preview.currentStock}</strong>
              </div>
              <div>
                <span>{t('Restock Quantity')}</span>
                <strong>{preview.quantity || 0}</strong>
              </div>
              <div>
                <span>{t('New Stock After Restock')}</span>
                <strong>{preview.newStock}</strong>
              </div>
              <div>
                <span>{t('Buying Price')}</span>
                <strong>{formatMoney(preview.buyingPrice)}</strong>
              </div>
              <div>
                <span>{t('Total Cost')}</span>
                <strong>{formatMoney(preview.totalCost)}</strong>
              </div>
              <div>
                <span>{t('Paid Amount')}</span>
                <strong>{formatMoney(preview.paidAmount)}</strong>
              </div>
              <div>
                <span>{t('Supplier Balance')}</span>
                <strong>{formatMoney(preview.supplierBalance)}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              {t('Select a product to preview restock details.')}
            </div>
          )}
        </section>
      </section>
      )}

      <section className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Stock Adjustments')}</h2>
          </div>
          {canManageAdjustments ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Date')}</th>
                    <th>{t('Product')}</th>
                    <th>{t('Batch')}</th>
                    <th>{t('Type')}</th>
                    <th>{t('Quantity')}</th>
                    <th>{t('Previous Stock')}</th>
                    <th>{t('New Stock')}</th>
                    <th>{t('Reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adjustment) => (
                    <tr key={adjustment.id}>
                      <td>{formatDateTime(adjustment.created_at)}</td>
                      <td>{adjustment.product_name}</td>
                      <td>{adjustment.batch_code || '-'}</td>
                      <td>{adjustment.adjustment_type}</td>
                      <td>{adjustment.quantity}</td>
                      <td>{adjustment.previous_stock}</td>
                      <td>{adjustment.new_stock}</td>
                      <td>{adjustment.reason}</td>
                    </tr>
                  ))}
                  {!adjustments.length && (
                    <tr>
                      <td colSpan="8" className="empty-cell">
                        {t('No stock adjustments found.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert">{t('You do not have permission to access this page.')}</div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>{t('Create Adjustment')}</h2>
          </div>
          {canManageAdjustments ? (
            <form className="form-grid" onSubmit={createAdjustment}>
              <label>
                {t('Product')}
                {canViewProducts ? (
                  <select
                    name="product_id"
                    value={adjustmentForm.product_id}
                    onChange={updateAdjustmentField}
                    required
                  >
                    <option value="">{t('Select product')}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.product_name} - {t('Stock')} {product.stock_quantity}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="product_id"
                    type="number"
                    min="1"
                    value={adjustmentForm.product_id}
                    onChange={updateAdjustmentField}
                    required
                  />
                )}
              </label>
              <label>
                {t('Batch ID')} {t('Optional')}
                <input
                  name="batch_id"
                  type="number"
                  min="1"
                  value={adjustmentForm.batch_id}
                  onChange={updateAdjustmentField}
                />
              </label>
              <label>
                {t('Adjustment Type')}
                <select
                  name="adjustment_type"
                  value={adjustmentForm.adjustment_type}
                  onChange={updateAdjustmentField}
                  required
                >
                  {['damaged', 'expired', 'lost', 'correction', 'other'].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Quantity')}
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  value={adjustmentForm.quantity}
                  onChange={updateAdjustmentField}
                  required
                />
              </label>
              <label className="full-width">
                {t('Reason')}
                <input
                  name="reason"
                  value={adjustmentForm.reason}
                  onChange={updateAdjustmentField}
                  required
                />
              </label>
              <button type="submit" className="full-width" disabled={saving}>
                {saving ? t('Saving...') : t('Create Adjustment')}
              </button>
            </form>
          ) : (
            <div className="alert">{t('You do not have permission to access this page.')}</div>
          )}
        </section>
      </section>

      <section className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Stock Reconciliation')}</h2>
          </div>
          {canManageReconciliation ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Reference')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Items')}</th>
                    <th>{t('Variance')}</th>
                    <th>{t('Reason')}</th>
                    <th>{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((reconciliation) => (
                    <tr key={reconciliation.id}>
                      <td>{reconciliation.reconciliation_number}</td>
                      <td>{reconciliation.status}</td>
                      <td>{reconciliation.item_count}</td>
                      <td>{reconciliation.total_variance}</td>
                      <td>{reconciliation.reason}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => loadReconciliationDetail(reconciliation.id)}
                          >
                            {t('View Details')}
                          </button>
                          {reconciliation.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => postReconciliation(reconciliation)}
                              disabled={saving}
                            >
                              {t('Post')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!reconciliations.length && (
                    <tr>
                      <td colSpan="6" className="empty-cell">
                        {t('No stock reconciliations found.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert">{t('You do not have permission to access this page.')}</div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>{t('Create Reconciliation')}</h2>
          </div>
          {canManageReconciliation ? (
            <form className="form-stack" onSubmit={createReconciliation}>
              <div className="form-grid">
                <label>
                  {t('Reason')}
                  <input
                    name="reason"
                    value={reconciliationForm.reason}
                    onChange={updateReconciliationField}
                    required
                  />
                </label>
                <label>
                  {t('Note')}
                  <input
                    name="notes"
                    value={reconciliationForm.notes}
                    onChange={updateReconciliationField}
                  />
                </label>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Product')}</th>
                      <th>{t('Batch ID')}</th>
                      <th>{t('Physical Count')}</th>
                      <th>{t('Action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationItems.map((item, index) => (
                      <tr key={index}>
                        <td>
                          {canViewProducts ? (
                            <select
                              value={item.product_id}
                              onChange={(event) =>
                                updateReconciliationItem(index, 'product_id', event.target.value)
                              }
                              required
                            >
                              <option value="">{t('Select product')}</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.product_name} - {t('Stock')} {product.stock_quantity}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min="1"
                              value={item.product_id}
                              onChange={(event) =>
                                updateReconciliationItem(index, 'product_id', event.target.value)
                              }
                              required
                            />
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.batch_id}
                            onChange={(event) =>
                              updateReconciliationItem(index, 'batch_id', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={item.physical_quantity}
                            onChange={(event) =>
                              updateReconciliationItem(index, 'physical_quantity', event.target.value)
                            }
                            required
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => removeReconciliationItem(index)}
                            disabled={reconciliationItems.length === 1}
                          >
                            {t('Remove')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-actions">
                <button type="button" className="ghost-button" onClick={addReconciliationItem}>
                  {t('Add Item')}
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? t('Saving...') : t('Create Reconciliation')}
                </button>
              </div>
            </form>
          ) : (
            <div className="alert">{t('You do not have permission to access this page.')}</div>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Reconciliation Details')}</h2>
          {selectedReconciliation?.status === 'draft' && canManageReconciliation && (
            <button
              type="button"
              onClick={() => postReconciliation(selectedReconciliation)}
              disabled={saving}
            >
              {t('Post')}
            </button>
          )}
        </div>
        {selectedReconciliation ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Product')}</th>
                  <th>{t('Batch')}</th>
                  <th>{t('System Stock')}</th>
                  <th>{t('Physical Count')}</th>
                  <th>{t('Variance')}</th>
                  <th>{t('Previous Stock')}</th>
                  <th>{t('New Stock')}</th>
                </tr>
              </thead>
              <tbody>
                {(selectedReconciliation.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.batch_code || item.batch_id || '-'}</td>
                    <td>{item.system_quantity}</td>
                    <td>{item.physical_quantity}</td>
                    <td>{item.variance}</td>
                    <td>{item.previous_stock ?? '-'}</td>
                    <td>{item.new_stock ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">{t('Select a reconciliation to view details.')}</div>
        )}
      </section>

      {canAccessStock && (
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Stock Movement History')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Product')}</th>
                <th>{t('Supplier')}</th>
                <th>{t('Quantity')}</th>
                <th>{t('Previous Stock')}</th>
                <th>{t('New Stock')}</th>
                <th>{t('Buying Price')}</th>
                <th>{t('Total Cost')}</th>
                <th>{t('Added By')}</th>
                <th>{t('Note')}</th>
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
                    {t('No stock movements found.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </section>
  )
}

export default Stock
