import { useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage, getShopSettings } from '../utils/formatters'
import { hasPermission } from '../utils/permissions'
import { getSessionUser } from '../utils/session'

const initialForm = {
  product_name: '',
  product_code: '',
  barcode: '',
  category_id: '',
  unit: 'pcs',
  buying_price: '',
  wholesale_price: '',
  selling_price: '',
  stock_quantity: '',
  low_stock_limit: '',
  image_url: '',
}

const initialCategoryForm = {
  name: '',
  description: '',
  is_active: true,
}

const unitOptions = ['pcs', 'kg', 'g', 'L', 'ml', 'packet', 'bottle', 'box']

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

const productToForm = (product) => ({
  product_name: product.product_name || '',
  product_code: product.product_code ?? '',
  barcode: product.barcode ?? '',
  category_id: product.category_id ? String(product.category_id) : '',
  unit: product.unit || 'pcs',
  buying_price: product.buying_price ?? product.wholesale_price ?? '',
  wholesale_price: product.wholesale_price ?? product.buying_price ?? '',
  selling_price: product.selling_price ?? '',
  stock_quantity: product.stock_quantity ?? '',
  low_stock_limit: product.low_stock_limit ?? '',
  image_url: product.image_url ?? '',
})

const optionalText = (value) => {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function Products() {
  const user = getSessionUser()
  const canManageProducts = hasPermission(user, 'products_manage')
  const canManageCategories = user.role === 'owner' && canManageProducts
  const shopSettings = getShopSettings()
  const defaultLowStockLimit = Number(shopSettings.default_low_stock_limit ?? 5)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(initialForm)
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [categoryMessage, setCategoryMessage] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState(null)

  const loadProducts = async () => {
    setLoading(true)
    setError('')
    setCategoryError('')

    try {
      const productsResponse = await api.get('/products')
      setProducts(getProductsFromResponse(productsResponse.data))
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load products'))
    } finally {
      setLoading(false)
    }

    try {
      const categoriesResponse = await api.get('/categories')
      setCategories(categoriesResponse.data.categories || [])
    } catch (err) {
      setCategories([])
      setCategoryError(getApiMessage(err, 'Failed to get categories'))
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const updateCategoryField = (event) => {
    const { name, type, checked, value } = event.target
    setCategoryForm({
      ...categoryForm,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  const resetForm = () => {
    setForm(initialForm)
    setEditingId(null)
  }

  const resetCategoryForm = () => {
    setCategoryForm(initialCategoryForm)
    setEditingCategoryId(null)
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
      category_id: form.category_id ? Number(form.category_id) : null,
      unit: form.unit || 'pcs',
      buying_price: Number(form.wholesale_price || form.buying_price),
      wholesale_price: Number(form.wholesale_price || form.buying_price),
      selling_price: Number(form.selling_price),
      stock_quantity: Number(form.stock_quantity || 0),
      low_stock_limit:
        form.low_stock_limit === '' ? defaultLowStockLimit : Number(form.low_stock_limit),
      image_url: optionalText(form.image_url),
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

  const submitCategory = async (event) => {
    event.preventDefault()
    setCategoryMessage('')
    setCategoryError('')
    setSavingCategory(true)

    const payload = {
      name: categoryForm.name.trim(),
      description: optionalText(categoryForm.description),
      is_active: categoryForm.is_active,
    }

    try {
      if (editingCategoryId) {
        await api.put(`/categories/${editingCategoryId}`, payload)
        setCategoryMessage('Category updated successfully')
      } else {
        await api.post('/categories', payload)
        setCategoryMessage('Category added successfully')
      }

      resetCategoryForm()
      await loadProducts()
    } catch (err) {
      setCategoryError(
        getApiMessage(err, editingCategoryId ? 'Failed to update category' : 'Failed to add category'),
      )
    } finally {
      setSavingCategory(false)
    }
  }

  const startCategoryEdit = (category) => {
    setCategoryMessage('')
    setCategoryError('')
    setEditingCategoryId(category.id)
    setCategoryForm({
      name: category.name || '',
      description: category.description || '',
      is_active: Boolean(category.is_active),
    })
  }

  const deleteCategory = async (category) => {
    const confirmed = window.confirm(`Delete ${category.name}? Products in this category will become uncategorized.`)
    if (!confirmed) return

    setCategoryMessage('')
    setCategoryError('')
    setDeletingCategoryId(category.id)

    try {
      await api.delete(`/categories/${category.id}`)
      setCategoryMessage('Category deleted successfully')
      if (editingCategoryId === category.id) resetCategoryForm()
      await loadProducts()
    } catch (err) {
      setCategoryError(getApiMessage(err, 'Failed to delete category'))
    } finally {
      setDeletingCategoryId(null)
    }
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
              <select name="category_id" value={form.category_id} onChange={updateField}>
                <option value="">{t('Uncategorized')}</option>
                {categories
                  .filter((category) => category.is_active || String(category.id) === form.category_id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('Unit')}
              <select name="unit" value={form.unit} onChange={updateField}>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Wholesale Price')}
              <input
                name="wholesale_price"
                type="number"
                min="0"
                step="0.01"
                value={form.wholesale_price}
                onChange={updateField}
                required
              />
            </label>
            <label>
              {t('Retail Price')}
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
            <label className="full-width">
              {t('Image URL')}
              <input name="image_url" type="url" value={form.image_url} onChange={updateField} />
            </label>
            <button type="submit" className="full-width" disabled={saving}>
              {saving ? t('saving') : editingId ? t('updateProduct') : t('addProduct')}
            </button>
          </form>

          {canManageCategories && (
            <section className="category-manager">
              <div className="section-heading">
                <h2>{editingCategoryId ? t('Edit Category') : t('Categories')}</h2>
                {editingCategoryId && (
                  <button type="button" className="ghost-button" onClick={resetCategoryForm}>
                    {t('Cancel')}
                  </button>
                )}
              </div>
              <form className="form-stack" onSubmit={submitCategory}>
                {categoryError && <div className="alert">{categoryError}</div>}
                {categoryMessage && <div className="success">{categoryMessage}</div>}
                <label>
                  {t('Category Name')}
                  <input
                    name="name"
                    value={categoryForm.name}
                    onChange={updateCategoryField}
                    required
                  />
                </label>
                <label>
                  {t('Description')}
                  <textarea
                    name="description"
                    value={categoryForm.description}
                    onChange={updateCategoryField}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    name="is_active"
                    type="checkbox"
                    checked={categoryForm.is_active}
                    onChange={updateCategoryField}
                  />
                  {t('Active')}
                </label>
                <button type="submit" disabled={savingCategory}>
                  {savingCategory ? t('saving') : editingCategoryId ? t('Save Category') : t('Add Category')}
                </button>
              </form>

              <div className="category-list product-category-list">
                {categories.map((category) => (
                  <div className="category-row" key={category.id}>
                    <div>
                      <strong>{category.name}</strong>
                      <span>{category.description || t('No description')}</span>
                      {!category.is_active && <span className="status suspended">{t('Inactive')}</span>}
                    </div>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => startCategoryEdit(category)}
                      >
                        {t('edit')}
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => deleteCategory(category)}
                        disabled={deletingCategoryId === category.id}
                      >
                        {deletingCategoryId === category.id ? t('deleting') : t('delete')}
                      </button>
                    </div>
                  </div>
                ))}
                {categories.length === 0 && <p className="muted">{t('No categories found.')}</p>}
              </div>
            </section>
          )}
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
                  <th>{t('Image')}</th>
                  <th>{t('Code / SKU')}</th>
                  <th>{t('Barcode')}</th>
                  <th>{t('Category')}</th>
                  <th>{t('Unit')}</th>
                  <th>{t('Wholesale')}</th>
                  <th>{t('Retail')}</th>
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
                      <td>
                        <div className="product-table-media">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" loading="lazy" />
                          ) : (
                            <span>{product.product_name?.slice(0, 1) || 'P'}</span>
                          )}
                        </div>
                      </td>
                      <td>{product.product_code || '-'}</td>
                      <td>{product.barcode || '-'}</td>
                      <td>{product.category || '-'}</td>
                      <td>{product.unit || 'pcs'}</td>
                      <td>{formatMoney(product.wholesale_price ?? product.buying_price)}</td>
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
                    <td colSpan={canManageProducts ? 11 : 10} className="empty-cell">
                      <div className="empty-copy">
                        <strong>{t('No products found.')}</strong>
                        <span>
                          {canManageProducts
                            ? t('Add your first product to start selling.')
                            : t('Products will appear here when available.')}
                        </span>
                      </div>
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
