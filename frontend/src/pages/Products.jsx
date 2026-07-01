import { useEffect, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const initialForm = {
  product_name: '',
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
  category: product.category || '',
  buying_price: product.buying_price ?? '',
  selling_price: product.selling_price ?? '',
  stock_quantity: product.stock_quantity ?? '',
  low_stock_limit: product.low_stock_limit ?? '',
})

function Products() {
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
      ...form,
      buying_price: Number(form.buying_price),
      selling_price: Number(form.selling_price),
      stock_quantity: Number(form.stock_quantity || 0),
      low_stock_limit: Number(form.low_stock_limit || 5),
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
    <section className="page-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>{editingId ? 'Edit Product' : 'Add Product'}</h2>
          {editingId && (
            <button type="button" className="ghost-button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
        <form onSubmit={submit} className="form-grid">
          {error && <div className="alert full-width">{error}</div>}
          {message && <div className="success full-width">{message}</div>}
          <label>
            Product Name
            <input name="product_name" value={form.product_name} onChange={updateField} required />
          </label>
          <label>
            Category
            <input name="category" value={form.category} onChange={updateField} />
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
            Selling Price
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
            Stock Quantity
            <input
              name="stock_quantity"
              type="number"
              min="0"
              value={form.stock_quantity}
              onChange={updateField}
            />
          </label>
          <label>
            Low Stock Limit
            <input
              name="low_stock_limit"
              type="number"
              min="0"
              value={form.low_stock_limit}
              onChange={updateField}
            />
          </label>
          <button type="submit" className="full-width" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update Product' : 'Add Product'}
          </button>
        </form>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <h2>Products</h2>
          <button type="button" className="ghost-button" onClick={loadProducts} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {loading ? (
          <div className="loading-panel">Loading products...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Buy</th>
                  <th>Sell</th>
                  <th>Stock</th>
                  <th>Low Limit</th>
                  <th>Action</th>
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
                        {isLowStock && <span className="warning-badge">Low stock</span>}
                      </td>
                      <td>{product.category || '-'}</td>
                      <td>{formatMoney(product.buying_price)}</td>
                      <td>{formatMoney(product.selling_price)}</td>
                      <td>{product.stock_quantity}</td>
                      <td>{product.low_stock_limit}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="ghost-button" onClick={() => startEdit(product)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => deleteProduct(product)}
                            disabled={deletingId === product.id}
                          >
                            {deletingId === product.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      No products found.
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
