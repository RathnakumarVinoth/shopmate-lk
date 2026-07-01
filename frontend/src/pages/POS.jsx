import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

function POS() {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [savingSale, setSavingSale] = useState(false)

  const loadProducts = async () => {
    setLoadingProducts(true)
    setError('')

    try {
      const response = await api.get('/products')
      setProducts(getProductsFromResponse(response.data))
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load products'))
    } finally {
      setLoadingProducts(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return products

    return products.filter((product) =>
      `${product.product_name} ${product.category || ''}`.toLowerCase().includes(term),
    )
  }, [products, search])

  const cartItems = useMemo(
    () =>
      Object.values(cart).map((item) => ({
        ...item,
        subtotal: Number(item.selling_price) * item.quantity,
      })),
    [cart],
  )

  const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0)
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  const addToCart = (product) => {
    setMessage('')
    setError('')

    if (Number(product.stock_quantity) <= 0) {
      setError(`${product.product_name} is out of stock`)
      return
    }

    setCart((currentCart) => {
      const current = currentCart[product.id]
      const nextQuantity = Math.min(
        Number(product.stock_quantity),
        current ? current.quantity + 1 : 1,
      )

      return {
        ...currentCart,
        [product.id]: { ...product, quantity: nextQuantity },
      }
    })
  }

  const setQuantity = (productId, value) => {
    const quantity = Math.max(1, Number(value || 1))

    setCart((currentCart) => {
      const item = currentCart[productId]
      if (!item) return currentCart

      return {
        ...currentCart,
        [productId]: {
          ...item,
          quantity: Math.min(quantity, Number(item.stock_quantity)),
        },
      }
    })
  }

  const removeFromCart = (productId) => {
    setCart((currentCart) => {
      const nextCart = { ...currentCart }
      delete nextCart[productId]
      return nextCart
    })
  }

  const completeSale = async () => {
    setMessage('')
    setError('')

    if (cartItems.length === 0) {
      setError('Add products to cart first')
      return
    }

    setSavingSale(true)

    try {
      await api.post('/sales', {
        payment_type: 'cash',
        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        })),
      })
      setCart({})
      setMessage('Sale completed successfully')
      notifyDashboardChanged()
      await loadProducts()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to complete sale'))
    } finally {
      setSavingSale(false)
    }
  }

  return (
    <section className="pos-layout">
      <section className="panel">
        <div className="section-heading">
          <h2>Products</h2>
          <button type="button" className="ghost-button" onClick={loadProducts} disabled={loadingProducts}>
            {loadingProducts ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <label className="search-field">
          Search products
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or category"
          />
        </label>

        {loadingProducts ? (
          <div className="loading-panel">Loading products...</div>
        ) : (
          <div className="product-list">
            {filteredProducts.map((product) => (
              <button
                type="button"
                className="product-tile"
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={Number(product.stock_quantity) <= 0}
              >
                <strong>{product.product_name}</strong>
                <span>{formatMoney(product.selling_price)}</span>
                <small>
                  {product.category || 'Uncategorized'} - Stock {product.stock_quantity}
                </small>
              </button>
            ))}
            {filteredProducts.length === 0 && <p className="muted">No products match your search.</p>}
          </div>
        )}
      </section>

      <aside className="panel cart-panel">
        <div className="section-heading">
          <h2>Cart</h2>
          <span className="cart-count">{totalItems} items</span>
        </div>
        {error && <div className="alert">{error}</div>}
        {message && <div className="success">{message}</div>}

        <div className="cart-list">
          {cartItems.map((item) => (
            <div className="cart-row" key={item.id}>
              <div>
                <strong>{item.product_name}</strong>
                <span>
                  {formatMoney(item.selling_price)} x {item.quantity} = {formatMoney(item.subtotal)}
                </span>
              </div>
              <input
                type="number"
                min="1"
                max={item.stock_quantity}
                value={item.quantity}
                onChange={(event) => setQuantity(item.id, event.target.value)}
              />
              <button type="button" className="danger-button" onClick={() => removeFromCart(item.id)}>
                Remove
              </button>
            </div>
          ))}
          {cartItems.length === 0 && <p className="muted">Cart is empty.</p>}
        </div>

        <div className="cart-total">
          <span>Total</span>
          <strong>{formatMoney(total)}</strong>
        </div>
        <button type="button" onClick={completeSale} disabled={savingSale}>
          {savingSale ? 'Saving sale...' : 'Complete Cash Sale'}
        </button>
      </aside>
    </section>
  )
}

export default POS
