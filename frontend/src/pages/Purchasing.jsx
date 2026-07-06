import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'
import { getSessionUser } from '../utils/session'
import { hasPermission } from '../utils/permissions'

const emptyPoForm = {
  supplier_id: '',
  expected_date: '',
  notes: '',
}

const emptyPoItem = {
  product_id: '',
  ordered_quantity: '',
  buying_price: '',
  selling_price: '',
}

const emptyGrnForm = {
  purchase_order_id: '',
  supplier_invoice_number: '',
  received_date: '',
  notes: '',
}

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString()
}

function Purchasing() {
  const user = getSessionUser()
  const canManagePurchasing = hasPermission(user, 'purchasing_manage')
  const canViewProducts = hasPermission(user, 'products_view')
  const canViewSuppliers = hasPermission(user, 'suppliers_access')
  const [activeTab, setActiveTab] = useState('orders')
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [grns, setGrns] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [poForm, setPoForm] = useState(emptyPoForm)
  const [poItems, setPoItems] = useState([{ ...emptyPoItem }])
  const [grnForm, setGrnForm] = useState(emptyGrnForm)
  const [grnItems, setGrnItems] = useState([])
  const [batchProductId, setBatchProductId] = useState('')
  const [batches, setBatches] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const productMap = useMemo(
    () =>
      products.reduce((map, product) => {
        map[product.id] = product
        return map
      }, {}),
    [products],
  )

  const orderedPurchaseOrders = purchaseOrders.filter((order) =>
    ['ordered', 'partially_received'].includes(order.status),
  )

  const loadPurchasingData = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const [poResponse, grnResponse] = await Promise.all([
        api.get('/purchasing/purchase-orders'),
        api.get('/purchasing/grns'),
      ])
      const [productsResponse, suppliersResponse] = await Promise.all([
        canViewProducts ? api.get('/products') : Promise.resolve({ data: [] }),
        canViewSuppliers ? api.get('/suppliers') : Promise.resolve({ data: { suppliers: [] } }),
      ])

      setProducts(getProductsFromResponse(productsResponse.data))
      setSuppliers(suppliersResponse.data.suppliers || [])
      setPurchaseOrders(poResponse.data.purchase_orders || [])
      setGrns(grnResponse.data.grns || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load purchasing data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPurchasingData()
  }, [])

  const updatePoItem = (index, field, value) => {
    setPoItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  const choosePoProduct = (index, productId) => {
    const product = productMap[Number(productId)]
    updatePoItem(index, 'product_id', productId)

    if (product) {
      setPoItems((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                product_id: productId,
                buying_price: String(product.wholesale_price ?? product.buying_price ?? ''),
                selling_price: String(product.selling_price ?? ''),
              }
            : item,
        ),
      )
    }
  }

  const addPoItem = () => setPoItems((current) => [...current, { ...emptyPoItem }])

  const removePoItem = (index) => {
    setPoItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const resetPoForm = () => {
    setPoForm(emptyPoForm)
    setPoItems([{ ...emptyPoItem }])
  }

  const createPurchaseOrder = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const items = poItems.map((item) => ({
      product_id: Number(item.product_id),
      ordered_quantity: Number(item.ordered_quantity),
      buying_price: Number(item.buying_price),
      selling_price: item.selling_price === '' ? null : Number(item.selling_price),
    }))

    if (items.some((item) => !item.product_id || item.ordered_quantity <= 0)) {
      setError('Select products and enter valid quantities')
      return
    }

    setSaving(true)

    try {
      await api.post('/purchasing/purchase-orders', {
        supplier_id: Number(poForm.supplier_id),
        expected_date: poForm.expected_date || null,
        notes: poForm.notes.trim() || null,
        items,
      })
      resetPoForm()
      setMessage('Purchase order created successfully')
      await loadPurchasingData(false)
      setActiveTab('orders')
    } catch (err) {
      setError(getApiMessage(err, 'Failed to create purchase order'))
    } finally {
      setSaving(false)
    }
  }

  const submitPurchaseOrder = async (order) => {
    setError('')
    setMessage('')
    setSaving(true)

    try {
      await api.post(`/purchasing/purchase-orders/${order.id}/submit`)
      setMessage('Purchase order submitted successfully')
      await loadPurchasingData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to submit purchase order'))
    } finally {
      setSaving(false)
    }
  }

  const cancelPurchaseOrder = async (order) => {
    const confirmed = window.confirm(`Cancel purchase order ${order.po_number}?`)
    if (!confirmed) return

    setError('')
    setMessage('')
    setSaving(true)

    try {
      await api.post(`/purchasing/purchase-orders/${order.id}/cancel`)
      setMessage('Purchase order cancelled successfully')
      await loadPurchasingData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to cancel purchase order'))
    } finally {
      setSaving(false)
    }
  }

  const selectOrderForGrn = async (purchaseOrderId) => {
    setGrnForm((current) => ({ ...current, purchase_order_id: purchaseOrderId }))
    setSelectedOrder(null)
    setGrnItems([])

    if (!purchaseOrderId) return

    try {
      const response = await api.get(`/purchasing/purchase-orders/${purchaseOrderId}`)
      const order = response.data.purchase_order
      setSelectedOrder(order)
      setGrnItems(
        (order.items || [])
          .filter((item) => Number(item.remaining_quantity) > 0)
          .map((item) => ({
            purchase_order_item_id: item.id,
            product_name: item.product_name,
            remaining_quantity: Number(item.remaining_quantity),
            received_quantity: '',
            buying_price: String(item.buying_price ?? ''),
            selling_price: item.selling_price === null ? '' : String(item.selling_price ?? ''),
            expiry_date: '',
            batch_code: '',
          })),
      )
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load purchase order'))
    }
  }

  const updateGrnItem = (index, field, value) => {
    setGrnItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    )
  }

  const resetGrnForm = () => {
    setGrnForm(emptyGrnForm)
    setSelectedOrder(null)
    setGrnItems([])
  }

  const createGrn = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const items = grnItems
      .filter((item) => Number(item.received_quantity) > 0)
      .map((item) => ({
        purchase_order_item_id: item.purchase_order_item_id,
        received_quantity: Number(item.received_quantity),
        buying_price: Number(item.buying_price),
        selling_price: item.selling_price === '' ? null : Number(item.selling_price),
        expiry_date: item.expiry_date || null,
        batch_code: item.batch_code.trim() || null,
      }))

    if (!items.length) {
      setError('Enter at least one received quantity')
      return
    }

    setSaving(true)

    try {
      await api.post('/purchasing/grns', {
        purchase_order_id: Number(grnForm.purchase_order_id),
        supplier_invoice_number: grnForm.supplier_invoice_number.trim(),
        received_date: grnForm.received_date || null,
        notes: grnForm.notes.trim() || null,
        items,
      })
      resetGrnForm()
      setMessage('GRN created successfully')
      await loadPurchasingData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to create GRN'))
    } finally {
      setSaving(false)
    }
  }

  const postGrn = async (grn) => {
    setError('')
    setMessage('')
    setSaving(true)

    try {
      await api.post(`/purchasing/grns/${grn.id}/post`)
      setMessage('GRN posted successfully')
      notifyDashboardChanged()
      await loadPurchasingData(false)
      if (batchProductId) await loadBatches(batchProductId)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to post GRN'))
    } finally {
      setSaving(false)
    }
  }

  const loadBatches = async (productId = batchProductId) => {
    setBatchProductId(productId)
    setBatches([])

    if (!productId) return

    try {
      const response = await api.get(`/purchasing/products/${productId}/batches`)
      setBatches(response.data.batches || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load batches'))
    }
  }

  if (loading) {
    return <div className="panel loading-panel">{t('Loading purchasing...')}</div>
  }

  return (
    <section className="page-stack">
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">{t('Purchasing')}</p>
          <h2>{t('Purchase Orders and GRN')}</h2>
          <p>{t('Create purchase orders, receive supplier invoices, and track batch stock.')}</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => loadPurchasingData(false)}>
          {t('Refresh')}
        </button>
      </section>

      <div className="tabs">
        {[
          ['orders', 'Purchase Orders'],
          ['create', 'Create Purchase Order'],
          ['grn', 'GRN / Receive Stock'],
          ['batches', 'Batch Stock'],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={activeTab === key ? 'active' : 'ghost-button'}
            onClick={() => setActiveTab(key)}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      {activeTab === 'orders' && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Purchase Orders')}</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Invoice No')}</th>
                  <th>{t('Supplier')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Quantity')}</th>
                  <th>{t('Total')}</th>
                  <th>{t('Date')}</th>
                  {canManagePurchasing && <th>{t('Action')}</th>}
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.po_number}</td>
                    <td>{order.supplier_name}</td>
                    <td><span className={`status ${order.status}`}>{order.status}</span></td>
                    <td>{order.total_received_quantity} / {order.total_ordered_quantity}</td>
                    <td>{formatMoney(order.total_amount)}</td>
                    <td>{formatDate(order.created_at)}</td>
                    {canManagePurchasing && (
                      <td>
                        <div className="table-actions">
                          {order.status === 'draft' && (
                            <button type="button" onClick={() => submitPurchaseOrder(order)} disabled={saving}>
                              {t('Submit')}
                            </button>
                          )}
                          {['draft', 'ordered'].includes(order.status) && (
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() => cancelPurchaseOrder(order)}
                              disabled={saving}
                            >
                              {t('Cancel')}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!purchaseOrders.length && (
                  <tr>
                    <td colSpan={canManagePurchasing ? 7 : 6} className="empty-cell">
                      {t('No purchase orders found.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'create' && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Create Purchase Order')}</h2>
          </div>
          {!canManagePurchasing ? (
            <div className="alert">{t('You do not have permission to access this page.')}</div>
          ) : (
            <form className="form-stack" onSubmit={createPurchaseOrder}>
              <div className="form-grid">
                <label>
                  {t('Supplier')}
                  {canViewSuppliers ? (
                    <select
                      value={poForm.supplier_id}
                      onChange={(event) => setPoForm({ ...poForm, supplier_id: event.target.value })}
                      required
                    >
                      <option value="">{t('Select supplier')}</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.supplier_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      value={poForm.supplier_id}
                      onChange={(event) => setPoForm({ ...poForm, supplier_id: event.target.value })}
                      required
                    />
                  )}
                </label>
                <label>
                  {t('Expected Date')}
                  <input
                    type="date"
                    value={poForm.expected_date}
                    onChange={(event) => setPoForm({ ...poForm, expected_date: event.target.value })}
                  />
                </label>
                <label className="full-width">
                  {t('Note')}
                  <input
                    value={poForm.notes}
                    onChange={(event) => setPoForm({ ...poForm, notes: event.target.value })}
                  />
                </label>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Product')}</th>
                      <th>{t('Quantity')}</th>
                      <th>{t('Buying Price')}</th>
                      <th>{t('Retail Price')}</th>
                      <th>{t('Action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poItems.map((item, index) => (
                      <tr key={`${index}-${item.product_id}`}>
                        <td>
                          {canViewProducts ? (
                            <select
                              value={item.product_id}
                              onChange={(event) => choosePoProduct(index, event.target.value)}
                              required
                            >
                              <option value="">{t('Select product')}</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.product_name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min="1"
                              value={item.product_id}
                              onChange={(event) => updatePoItem(index, 'product_id', event.target.value)}
                              required
                            />
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.ordered_quantity}
                            onChange={(event) => updatePoItem(index, 'ordered_quantity', event.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.buying_price}
                            onChange={(event) => updatePoItem(index, 'buying_price', event.target.value)}
                            required
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.selling_price}
                            onChange={(event) => updatePoItem(index, 'selling_price', event.target.value)}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => removePoItem(index)}
                            disabled={poItems.length === 1}
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
                <button type="button" className="ghost-button" onClick={addPoItem}>
                  {t('Add Item')}
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? t('Saving...') : t('Create Purchase Order')}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {activeTab === 'grn' && (
        <section className="page-grid">
          <section className="panel">
            <div className="section-heading">
              <h2>{t('GRN / Receive Stock')}</h2>
            </div>
            {!canManagePurchasing ? (
              <div className="alert">{t('You do not have permission to access this page.')}</div>
            ) : (
              <form className="form-stack" onSubmit={createGrn}>
                <label>
                  {t('Purchase Order')}
                  <select
                    value={grnForm.purchase_order_id}
                    onChange={(event) => selectOrderForGrn(event.target.value)}
                    required
                  >
                    <option value="">{t('Select purchase order')}</option>
                    {orderedPurchaseOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.po_number} - {order.supplier_name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    {t('Supplier Invoice Number')}
                    <input
                      value={grnForm.supplier_invoice_number}
                      onChange={(event) =>
                        setGrnForm({ ...grnForm, supplier_invoice_number: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    {t('Received Date')}
                    <input
                      type="date"
                      value={grnForm.received_date}
                      onChange={(event) => setGrnForm({ ...grnForm, received_date: event.target.value })}
                    />
                  </label>
                  <label className="full-width">
                    {t('Note')}
                    <input
                      value={grnForm.notes}
                      onChange={(event) => setGrnForm({ ...grnForm, notes: event.target.value })}
                    />
                  </label>
                </div>

                {selectedOrder && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Product')}</th>
                          <th>{t('Remaining')}</th>
                          <th>{t('Receive')}</th>
                          <th>{t('Buying Price')}</th>
                          <th>{t('Expiry Date')}</th>
                          <th>{t('Batch Code')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grnItems.map((item, index) => (
                          <tr key={item.purchase_order_item_id}>
                            <td>{item.product_name}</td>
                            <td>{item.remaining_quantity}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max={item.remaining_quantity}
                                value={item.received_quantity}
                                onChange={(event) => updateGrnItem(index, 'received_quantity', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.buying_price}
                                onChange={(event) => updateGrnItem(index, 'buying_price', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={item.expiry_date}
                                onChange={(event) => updateGrnItem(index, 'expiry_date', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                value={item.batch_code}
                                onChange={(event) => updateGrnItem(index, 'batch_code', event.target.value)}
                                placeholder={t('Auto generated')}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button type="submit" disabled={saving || !selectedOrder}>
                  {saving ? t('Saving...') : t('Create GRN')}
                </button>
              </form>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>{t('GRNs')}</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Invoice No')}</th>
                    <th>{t('Supplier')}</th>
                    <th>{t('Supplier Invoice Number')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Quantity')}</th>
                    {canManagePurchasing && <th>{t('Action')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {grns.map((grn) => (
                    <tr key={grn.id}>
                      <td>{grn.grn_number}</td>
                      <td>{grn.supplier_name}</td>
                      <td>{grn.supplier_invoice_number}</td>
                      <td><span className={`status ${grn.status}`}>{grn.status}</span></td>
                      <td>{grn.total_received_quantity}</td>
                      {canManagePurchasing && (
                        <td>
                          {grn.status === 'draft' ? (
                            <button type="button" onClick={() => postGrn(grn)} disabled={saving}>
                              {t('Post GRN')}
                            </button>
                          ) : (
                            <span className="muted">{t('Posted')}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {!grns.length && (
                    <tr>
                      <td colSpan={canManagePurchasing ? 6 : 5} className="empty-cell">
                        {t('No GRNs found.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      )}

      {activeTab === 'batches' && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Batch Stock')}</h2>
          </div>
          {canViewProducts ? (
            <label>
              {t('Product')}
              <select value={batchProductId} onChange={(event) => loadBatches(event.target.value)}>
                <option value="">{t('Select product')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.product_name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="form-grid">
              <label>
                {t('Product')}
                <input
                  type="number"
                  min="1"
                  value={batchProductId}
                  onChange={(event) => setBatchProductId(event.target.value)}
                />
              </label>
              <div className="table-actions">
                <button type="button" onClick={() => loadBatches(batchProductId)}>
                  {t('Load Batches')}
                </button>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Batch Code')}</th>
                  <th>{t('Supplier')}</th>
                  <th>{t('Received')}</th>
                  <th>{t('Remaining')}</th>
                  <th>{t('Buying Price')}</th>
                  <th>{t('Expiry Date')}</th>
                  <th>{t('Supplier Invoice Number')}</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.batch_code}</td>
                    <td>{batch.supplier_name}</td>
                    <td>{batch.quantity_received}</td>
                    <td>{batch.quantity_remaining}</td>
                    <td>{formatMoney(batch.buying_price)}</td>
                    <td>{formatDate(batch.expiry_date)}</td>
                    <td>{batch.supplier_invoice_number}</td>
                  </tr>
                ))}
                {!batches.length && (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      {t('No batches found.')}
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

export default Purchasing
