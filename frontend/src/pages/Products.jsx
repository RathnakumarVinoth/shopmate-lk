import { useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage, getShopSettings } from '../utils/formatters'
import { hasPermission } from '../utils/permissions'

const initialForm = {
  product_name: '',
  product_code: '',
  barcode: '',
  category: '',
  buying_price: '',
  selling_price: '',
  stock_quantity: '',
  low_stock_limit: '',
}

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

const productToForm = (product) => ({
  product_name: product.product_name || '',
  product_code: product.product_code ?? '',
  barcode: product.barcode ?? '',
  category: product.category || '',
  buying_price: product.buying_price ?? '',
  selling_price: product.selling_price ?? '',
  stock_quantity: product.stock_quantity ?? '',
  low_stock_limit: product.low_stock_limit ?? '',
})

const optionalText = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function Products() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const canManageProducts = hasPermission(user, 'products_manage')
  const shopSettings = getShopSettings()
  const defaultLowStockLimit = Number(shopSettings.default_low_stock_limit ?? 5)
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadProducts = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/products')
      setProducts(getProductsFromResponse(response.data))
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load products'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const resetForm = () => {
    setForm(initialForm)
    setEditingId(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)

    const payload = {
      product_name: form.product_name.trim(),
      product_code: optionalText(form.product_code),
      barcode: optionalText(form.barcode),
      category: optionalText(form.category),
      buying_price: Number(form.buying_price),
      selling_price: Number(form.selling_price),
      stock_quantity: Number(form.stock_quantity || 0),
      low_stock_limit:
        form.low_stock_limit === '' ? defaultLowStockLimit : Number(form.low_stock_limit),
    }

    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, payload)
        setMessage('Product updated successfully')
      } else {
        await api.post('/products', payload)
        setMessage('Product added successfully')
      }

      resetForm()
      await loadProducts()
    } catch (err) {
      setError(getApiMessage(err, editingId ? 'Failed to update product' : 'Failed to add product'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (product) => {
    setMessage('')
    setError('')
    setEditingId(product.id)
    setForm(productToForm(product))
  }

  const deleteProduct = async (product) => {
    const confirmed = window.confirm(`Delete ${product.product_name}? This cannot be undone.`)
    if (!confirmed) return

    setError('')
    setMessage('')
    setDeletingId(product.id)

    try {
      await api.delete(`/products/${product.id}`)
      setMessage('Product deleted successfully')
      if (editingId === product.id) resetForm()
      await loadProducts()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to delete product'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className={canManageProducts ? 'page-grid' : 'page-stack'}>
      {canManageProducts && (
        <section className="panel">
          <div className="section-heading">
            <h2>{editingId ? t('editProduct') : t('addProduct')}</h2>
            {editingId && (
              <button type="button" className="ghost-button" onClick={resetForm}>
                {t('Cancel')}
              </button>
            )}
          </div>
          <form onSubmit={submit} className="form-grid">
            {error && <div className="alert full-width">{error}</div>}
            {message && <div className="success full-width">{message}</div>}
            <label>
              {t('Product Name')}
              <input name="product_name" value={form.product_name} onChange={updateField} required />
            </label>
            <label>
              {t('Product Code / SKU')}
              <input name="product_code" value={form.product_code} onChange={updateField} />
            </label>
            <label>
              {t('Barcode')}
              <input name="barcode" value={form.barcode} onChange={updateField} />
            </label>
            <label>
              {t('Category')}
              <input name="category" value={form.category} onChange={updateField} />
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
              {t('Price')}
              <input
                name="selling_price"
                type="number"
                min="0"
                step="0.01"
                value={form.selling_price}
                onChange={updateField}
                required
              />
            </label>
            <label>
              {t('Stock Quantity')}
              <input
                name="stock_quantity"
                type="number"
                min="0"
                value={form.stock_quantity}
                onChange={updateField}
              />
            </label>
            <label>
              {t('Default Low Stock Limit')}
              <input
                name="low_stock_limit"
                type="number"
                min="0"
                value={form.low_stock_limit}
                onChange={updateField}
                placeholder={`Default ${defaultLowStockLimit}`}
              />
            </label>
            <button type="submit" className="full-width" disabled={saving}>
              {saving ? t('saving') : editingId ? t('updateProduct') : t('addProduct')}
            </button>
          </form>
        </section>
      )}

      <section className="panel wide-panel">
        <div className="section-heading">
          <h2>{t('products')}</h2>
          <button type="button" className="ghost-button" onClick={loadProducts} disabled={loading}>
            {loading ? t('refreshing') : t('refresh')}
          </button>
        </div>
        {loading ? (
          <div className="loading-panel">{t('Loading products...')}</div>
        ) : (
          <div className="table-wrap">
            {!canManageProducts && error && <div className="alert">{error}</div>}
            {!canManageProducts && message && <div className="success">{message}</div>}
            <table>
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Code / SKU')}</th>
                  <th>{t('Barcode')}</th>
                  <th>{t('Category')}</th>
                  <th>{t('Buy')}</th>
                  <th>{t('Price')}</th>
                  <th>{t('Stock')}</th>
                  <th>{t('Low Limit')}</th>
                  {canManageProducts && <th>{t('Action')}</th>}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const isLowStock =
                    Number(product.stock_quantity) <= Number(product.low_stock_limit)

                  return (
                    <tr key={product.id} className={isLowStock ? 'low-stock-row' : ''}>
                      <td>
                        <strong>{product.product_name}</strong>
                        {isLowStock && <span className="warning-badge">{t('Low stock')}</span>}
                      </td>
                      <td>{product.product_code || '-'}</td>
                      <td>{product.barcode || '-'}</td>
                      <td>{product.category || '-'}</td>
                      <td>{formatMoney(product.buying_price)}</td>
                      <td>{formatMoney(product.selling_price)}</td>
                      <td>{product.stock_quantity}</td>
                      <td>{product.low_stock_limit}</td>
                      {canManageProducts && (
                        <td>
                          <div className="table-actions">
                            <button type="button" className="ghost-button" onClick={() => startEdit(product)}>
                              {t('edit')}
                            </button>
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() => deleteProduct(product)}
                              disabled={deletingId === product.id}
                            >
                              {deletingId === product.id ? t('deleting') : t('delete')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={canManageProducts ? 9 : 8} className="empty-cell">
                      {t('No products found.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

export default Products
