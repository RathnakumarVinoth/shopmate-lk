import { useEffect, useRef, useState } from 'react'
import ProductScannerModal from '../components/ProductScannerModal.jsx'
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
  unit: 'PCS',
  item_type: 'product',
  default_selling_unit: 'PCS',
  default_purchase_unit: 'PCS',
  base_unit: 'PCS',
  allow_decimal_qty: false,
  quantity_precision: '0',
  tracking_method: 'SIMPLE_STOCK',
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

const fallbackUnits = [
  { code: 'PCS', name: 'Pieces', allows_decimal: false, default_precision: 0 },
  { code: 'KG', name: 'Kilogram', allows_decimal: true, default_precision: 3 },
  { code: 'G', name: 'Gram', allows_decimal: true, default_precision: 2 },
  { code: 'L', name: 'Litre', allows_decimal: true, default_precision: 3 },
  { code: 'ML', name: 'Millilitre', allows_decimal: true, default_precision: 2 },
  { code: 'PACK', name: 'Pack', allows_decimal: false, default_precision: 0 },
  { code: 'BOX', name: 'Box', allows_decimal: false, default_precision: 0 },
  { code: 'SERVICE', name: 'Service', allows_decimal: false, default_precision: 0 },
  { code: 'HOUR', name: 'Hour', allows_decimal: true, default_precision: 2 },
  { code: 'JOB', name: 'Job', allows_decimal: false, default_precision: 0 },
]

const itemTypeOptions = [
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'non_stock', label: 'Non-stock' },
]

const trackingMethodOptions = [
  'SIMPLE_STOCK',
  'VARIANT_STOCK',
  'BATCH_STOCK',
  'SERIAL_STOCK',
  'WEIGHT_STOCK',
  'LENGTH_STOCK',
  'AREA_STOCK',
  'SERVICE_ONLY',
  'BUNDLE_KIT',
]

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

const productToForm = (product) => ({
  product_name: product.product_name || '',
  product_code: product.product_code ?? '',
  barcode: product.barcode ?? '',
  category_id: product.category_id ? String(product.category_id) : '',
  unit: product.default_selling_unit || product.unit || 'PCS',
  item_type: product.item_type || 'product',
  default_selling_unit: product.default_selling_unit || product.unit || 'PCS',
  default_purchase_unit:
    product.default_purchase_unit || product.default_selling_unit || product.unit || 'PCS',
  base_unit: product.base_unit || product.default_selling_unit || product.unit || 'PCS',
  allow_decimal_qty: Boolean(Number(product.allow_decimal_qty || 0)),
  quantity_precision: String(product.quantity_precision ?? 0),
  tracking_method: product.tracking_method || 'SIMPLE_STOCK',
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

const toFormValue = (value) =>
  value === undefined || value === null ? '' : String(value)

const parseScannedValue = (rawValue, unitCodes = fallbackUnits.map((unit) => unit.code)) => {
  const raw = String(rawValue || '').trim()
  const looksLikeJson = raw.startsWith('{')

  if (!looksLikeJson) {
    return {
      raw,
      isJson: false,
      draft: { barcode: raw },
      categoryName: '',
      lookupCodes: [raw],
    }
  }

  let data

  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(t('Invalid QR product JSON.'))
  }

  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error(t('Invalid QR product JSON.'))
  }

  const scannedUnit = toFormValue(data.unit)
  const matchedUnit = unitCodes.find(
    (unit) => unit.toLowerCase() === scannedUnit.toLowerCase(),
  )
  const draft = {
    product_name: toFormValue(data.name ?? data.product_name),
    barcode: toFormValue(data.barcode),
    product_code: toFormValue(data.product_code ?? data.sku),
    category_name: toFormValue(data.category ?? data.category_name),
    unit: matchedUnit || (scannedUnit ? 'PCS' : ''),
    default_selling_unit: matchedUnit || (scannedUnit ? 'PCS' : ''),
    wholesale_price: toFormValue(
      data.wholesale_price ?? data.buying_price ?? data.cost_price,
    ),
    selling_price: toFormValue(data.retail_price ?? data.selling_price),
    stock_quantity: toFormValue(data.stock_quantity),
    low_stock_limit: toFormValue(data.low_stock_limit),
  }
  const hasProductData = Object.values(draft).some((value) => value !== '')

  if (!hasProductData) {
    throw new Error(t('No supported product details were found in the QR code.'))
  }

  return {
    raw,
    isJson: true,
    draft,
    categoryName: draft.category_name,
    lookupCodes: [draft.barcode, draft.product_code].filter(Boolean),
  }
}

function Products() {
  const user = getSessionUser()
  const canManageProducts = hasPermission(user, 'products_manage')
  const canManageCategories = user.role === 'owner' && canManageProducts
  const shopSettings = getShopSettings()
  const defaultLowStockLimit = Number(shopSettings.default_low_stock_limit ?? 5)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [units, setUnits] = useState(fallbackUnits)
  const [form, setForm] = useState(initialForm)
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAdvancedUnits, setShowAdvancedUnits] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [categoryMessage, setCategoryMessage] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerProcessing, setScannerProcessing] = useState(false)
  const [scannerApplying, setScannerApplying] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const [scanPreview, setScanPreview] = useState(null)
  const [createMissingCategory, setCreateMissingCategory] = useState(false)
  const productFormRef = useRef(null)
  const unitCodes = units.map((unit) => unit.code)

  const getUnitMeta = (unitCode) =>
    units.find((unit) => unit.code === unitCode) ||
    fallbackUnits.find((unit) => unit.code === unitCode) ||
    fallbackUnits[0]

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
      const unitsResponse = await api.get('/units')
      const nextUnits = unitsResponse.data.units || []
      setUnits(nextUnits.length > 0 ? nextUnits : fallbackUnits)
    } catch {
      setUnits(fallbackUnits)
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
    const { checked, name, type, value } = event.target

    setForm((current) => {
      if (name === 'default_selling_unit' || name === 'unit') {
        const unitMeta = getUnitMeta(value)
        const nextForm = {
          ...current,
          unit: value,
          default_selling_unit: value,
          allow_decimal_qty: Boolean(unitMeta.allows_decimal),
          quantity_precision: String(unitMeta.default_precision ?? 0),
        }

        if (!showAdvancedUnits) {
          nextForm.default_purchase_unit = value
          nextForm.base_unit = value
        }

        return nextForm
      }

      if (name === 'item_type') {
        const serviceOnly = value === 'service' || value === 'non_stock'
        return {
          ...current,
          item_type: value,
          tracking_method: serviceOnly ? 'SERVICE_ONLY' : current.tracking_method,
        }
      }

      if (name === 'allow_decimal_qty') {
        return {
          ...current,
          allow_decimal_qty: checked,
          quantity_precision: checked
            ? current.quantity_precision || String(getUnitMeta(current.default_selling_unit).default_precision ?? 0)
            : '0',
        }
      }

      return {
        ...current,
        [name]: type === 'checkbox' ? checked : value,
      }
    })
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
    setShowAdvancedUnits(false)
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
      unit: form.default_selling_unit || form.unit || 'PCS',
      item_type: form.item_type || 'product',
      default_selling_unit: form.default_selling_unit || form.unit || 'PCS',
      default_purchase_unit: form.default_purchase_unit || form.default_selling_unit || 'PCS',
      base_unit: form.base_unit || form.default_selling_unit || 'PCS',
      allow_decimal_qty: Boolean(form.allow_decimal_qty),
      quantity_precision: Number(form.quantity_precision || 0),
      tracking_method: form.tracking_method || 'SIMPLE_STOCK',
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
    setShowAdvancedUnits(
      Boolean(
        product.default_purchase_unit &&
          product.default_selling_unit &&
          product.default_purchase_unit !== product.default_selling_unit,
      ) ||
        Boolean(
          product.base_unit &&
            product.default_selling_unit &&
            product.base_unit !== product.default_selling_unit,
        ),
    )
  }

  const openScanner = () => {
    setScannerError('')
    setScanPreview(null)
    setCreateMissingCategory(false)
    setScannerOpen(true)
  }

  const closeScanner = () => {
    setScannerOpen(false)
    setScannerError('')
    setScanPreview(null)
    setCreateMissingCategory(false)
  }

  const findProductByCode = async (codes) => {
    for (const code of [...new Set(codes.filter(Boolean))]) {
      try {
        const response = await api.get(
          `/products/search-code/${encodeURIComponent(code)}`,
        )
        return response.data
      } catch (lookupError) {
        if (lookupError.response?.status !== 404) throw lookupError
      }
    }

    return null
  }

  const processScannedValue = async (rawValue) => {
    setScannerProcessing(true)
    setScannerError('')
    setScanPreview(null)
    setCreateMissingCategory(false)

    try {
      const parsed = parseScannedValue(rawValue, unitCodes)
      const existingProduct = await findProductByCode(parsed.lookupCodes)
      const matchingCategory = parsed.categoryName
        ? categories.find(
            (category) =>
              category.name.trim().toLowerCase() ===
              parsed.categoryName.trim().toLowerCase(),
          )
        : null

      setScanPreview({
        ...parsed,
        existingProduct,
        matchingCategory,
        missingCategory: Boolean(parsed.categoryName && !matchingCategory),
      })
    } catch (scanError) {
      setScannerError(getApiMessage(scanError, scanError.message || t('Failed to check scanned code.')))
    } finally {
      setScannerProcessing(false)
    }
  }

  const applyScanPreview = async () => {
    if (!scanPreview) return

    setScannerApplying(true)
    setScannerError('')

    try {
      let categoryId = scanPreview.matchingCategory
        ? String(scanPreview.matchingCategory.id)
        : ''

      if (
        scanPreview.missingCategory &&
        createMissingCategory &&
        canManageCategories
      ) {
        const response = await api.post('/categories', {
          name: scanPreview.categoryName.trim(),
          description: null,
          is_active: true,
        })
        categoryId = String(response.data.category_id)
        setCategories((current) => [
          ...current,
          {
            id: response.data.category_id,
            name: scanPreview.categoryName.trim(),
            description: null,
            is_active: true,
          },
        ])
      }

      const nextForm = scanPreview.existingProduct
        ? productToForm(scanPreview.existingProduct)
        : { ...initialForm }

      Object.entries(scanPreview.draft).forEach(([field, value]) => {
        if (field !== 'category_name' && value !== '') {
          nextForm[field] = value
        }
      })

      if (nextForm.default_selling_unit) {
        const unitMeta = getUnitMeta(nextForm.default_selling_unit)
        nextForm.unit = nextForm.default_selling_unit
        nextForm.default_purchase_unit = nextForm.default_purchase_unit || nextForm.default_selling_unit
        nextForm.base_unit = nextForm.base_unit || nextForm.default_selling_unit
        nextForm.allow_decimal_qty = Boolean(unitMeta.allows_decimal)
        nextForm.quantity_precision = String(unitMeta.default_precision ?? 0)
      }

      if (categoryId) {
        nextForm.category_id = categoryId
      }

      setEditingId(scanPreview.existingProduct?.id || null)
      setForm(nextForm)
      setMessage(
        scanPreview.existingProduct
          ? t('Existing product opened for editing. Review and save the product.')
          : t('Scanned data added. Review and save the product.'),
      )
      setError('')
      closeScanner()
      window.requestAnimationFrame(() => {
        productFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (applyError) {
      setScannerError(getApiMessage(applyError, t('Failed to apply scanned data.')))
    } finally {
      setScannerApplying(false)
    }
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

  const precision = Number(form.quantity_precision || 0)
  const quantityStep =
    form.allow_decimal_qty && precision > 0
      ? `0.${'0'.repeat(Math.max(precision - 1, 0))}1`
      : '1'

  return (
    <>
      <section className={canManageProducts ? 'page-grid' : 'page-stack'}>
      {canManageProducts && (
        <section className="panel" ref={productFormRef}>
          <div className="section-heading">
            <h2>{editingId ? t('editProduct') : t('addProduct')}</h2>
            <div className="section-heading-actions">
              <button type="button" className="ghost-button" onClick={openScanner}>
                {t('Scan Barcode / QR')}
              </button>
              {editingId && (
                <button type="button" className="ghost-button" onClick={resetForm}>
                  {t('Cancel')}
                </button>
              )}
            </div>
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
              {t('Item Type')}
              <select name="item_type" value={form.item_type} onChange={updateField}>
                {itemTypeOptions.map((itemType) => (
                  <option key={itemType.value} value={itemType.value}>
                    {t(itemType.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Selling Unit')}
              <select name="default_selling_unit" value={form.default_selling_unit} onChange={updateField}>
                {units.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.code} - {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input
                name="allow_decimal_qty"
                type="checkbox"
                checked={Boolean(form.allow_decimal_qty)}
                onChange={updateField}
              />
              {t('Allow decimal quantity')}
            </label>
            <label>
              {t('Quantity Precision')}
              <input
                name="quantity_precision"
                type="number"
                min="0"
                max="4"
                step="1"
                value={form.quantity_precision}
                onChange={updateField}
                disabled={!form.allow_decimal_qty}
              />
            </label>
            <label>
              {t('Tracking Method')}
              <select name="tracking_method" value={form.tracking_method} onChange={updateField}>
                {trackingMethodOptions.map((trackingMethod) => (
                  <option key={trackingMethod} value={trackingMethod}>
                    {trackingMethod}
                  </option>
                ))}
              </select>
            </label>
            <div className="full-width">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowAdvancedUnits((current) => !current)}
              >
                {showAdvancedUnits ? t('Hide advanced units') : t('Advanced units')}
              </button>
            </div>
            {showAdvancedUnits && (
              <>
                <label>
                  {t('Purchase Unit')}
                  <select name="default_purchase_unit" value={form.default_purchase_unit} onChange={updateField}>
                    {units.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.code} - {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Base Unit')}
                  <select name="base_unit" value={form.base_unit} onChange={updateField}>
                    {units.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.code} - {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
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
                step={quantityStep}
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
                step={quantityStep}
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
                  <th>{t('Type')}</th>
                  <th>{t('Tracking')}</th>
                  <th>{t('Wholesale')}</th>
                  <th>{t('Retail')}</th>
                  <th>{t('Stock')}</th>
                  <th>{t('Low Limit')}</th>
                  {canManageProducts && <th>{t('Action')}</th>}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const tracksStock =
                    product.item_type !== 'service' &&
                    product.item_type !== 'non_stock' &&
                    product.tracking_method !== 'SERVICE_ONLY'
                  const isLowStock =
                    tracksStock && Number(product.stock_quantity) <= Number(product.low_stock_limit)

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
                      <td>{product.default_selling_unit || product.unit || 'PCS'}</td>
                      <td>{product.item_type || 'product'}</td>
                      <td>{product.tracking_method || 'SIMPLE_STOCK'}</td>
                      <td>{formatMoney(product.wholesale_price ?? product.buying_price)}</td>
                      <td>{formatMoney(product.selling_price)}</td>
                      <td>{tracksStock ? Number(product.stock_quantity) : '-'}</td>
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
                    <td colSpan={canManageProducts ? 13 : 12} className="empty-cell">
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

      {scannerOpen && (
        <ProductScannerModal
          applying={scannerApplying}
          canCreateCategory={canManageCategories}
          createMissingCategory={createMissingCategory}
          error={scannerError}
          onApply={applyScanPreview}
          onClose={closeScanner}
          onDetected={processScannedValue}
          preview={scanPreview}
          processing={scannerProcessing}
          setCreateMissingCategory={setCreateMissingCategory}
        />
      )}
    </>
  )
}

export default Products
