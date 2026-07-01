import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

const paymentTypes = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'qr', label: 'QR' },
  { value: 'credit', label: 'Credit' },
]

function POS() {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [search, setSearch] = useState('')
  const [paymentType, setPaymentType] = useState('cash')
  const [discountAmount, setDiscountAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [receipt, setReceipt] = useState(null)
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

  useEffect(() => {
    if (paymentType === 'credit') {
      setPaidAmount((current) => current || '0')
    }
  }, [paymentType])

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

  const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0)
  const discount = Math.max(0, Number(discountAmount || 0))
  const total = Math.max(0, subtotal - discount)
  const paid = Math.max(0, Number(paidAmount || 0))
  const balance = paid - total
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const discountInvalid = discount > subtotal
  const paidRequired = paymentType !== 'credit'
  const paidInvalid = paidRequired && paidAmount === ''

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

  const changeQuantity = (productId, change) => {
    setCart((currentCart) => {
      const item = currentCart[productId]
      if (!item) return currentCart

      const nextQuantity = item.quantity + change

      if (nextQuantity <= 0) {
        const nextCart = { ...currentCart }
        delete nextCart[productId]
        return nextCart
      }

      return {
        ...currentCart,
        [productId]: {
          ...item,
          quantity: Math.min(nextQuantity, Number(item.stock_quantity)),
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

    if (discountInvalid) {
      setError('Discount cannot be greater than subtotal')
      return
    }

    if (paidInvalid) {
      setError(`Paid amount is required for ${paymentType} payments`)
      return
    }

    setSavingSale(true)

    try {
      const response = await api.post('/sales', {
        payment_type: paymentType,
        discount_amount: discount,
        paid_amount: paymentType === 'credit' ? paid : Number(paidAmount),
        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        })),
      })

      setReceipt(response.data.receipt)
      setCart({})
      setDiscountAmount('')
      setPaidAmount(paymentType === 'credit' ? '0' : '')
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
    <section className="pos-layout pro-pos">
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
            placeholder="Search by product name or category"
          />
        </label>

        {loadingProducts ? (
          <div className="loading-panel">Loading products...</div>
        ) : (
          <div className="product-list pos-product-list">
            {filteredProducts.map((product) => {
              const stock = Number(product.stock_quantity)
              const lowStock = stock <= Number(product.low_stock_limit)

              return (
                <button
                  type="button"
                  className={`product-tile ${lowStock ? 'low-stock-tile' : ''}`}
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={stock <= 0}
                >
                  <strong>{product.product_name}</strong>
                  <span>{formatMoney(product.selling_price)}</span>
                  <small>{product.category || 'Uncategorized'}</small>
                  <small className={lowStock ? 'stock-warning' : ''}>
                    Stock {stock}
                    {lowStock ? ' - Low stock' : ''}
                  </small>
                </button>
              )
            })}
            {filteredProducts.length === 0 && <p className="muted">No products match your search.</p>}
          </div>
        )}
      </section>

      <aside className="panel cart-panel receipt-surface">
        <div className="section-heading">
          <h2>Cart</h2>
          <span className="cart-count">{totalItems} items</span>
        </div>
        {error && <div className="alert">{error}</div>}
        {message && <div className="success">{message}</div>}

        <div className="cart-list">
          {cartItems.map((item) => (
            <div className="cart-row pro-cart-row" key={item.id}>
              <div>
                <strong>{item.product_name}</strong>
                <span>
                  {formatMoney(item.selling_price)} x {item.quantity} = {formatMoney(item.subtotal)}
                </span>
                <small className="muted">Available stock {item.stock_quantity}</small>
              </div>
              <div className="quantity-control">
                <button type="button" onClick={() => changeQuantity(item.id, -1)}>
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max={item.stock_quantity}
                  value={item.quantity}
                  onChange={(event) => setQuantity(item.id, event.target.value)}
                />
                <button type="button" onClick={() => changeQuantity(item.id, 1)}>
                  +
                </button>
              </div>
              <button type="button" className="danger-button" onClick={() => removeFromCart(item.id)}>
                Remove
              </button>
            </div>
          ))}
          {cartItems.length === 0 && <p className="muted">Cart is empty.</p>}
        </div>

        <section className="payment-box">
          <h3>Payment</h3>
          <div className="form-grid compact-form">
            <label>
              Payment Type
              <select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
                {paymentTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Discount
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                className={discountInvalid ? 'input-error' : ''}
              />
            </label>
            <label className="full-width">
              Paid Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                required={paidRequired}
              />
            </label>
          </div>
        </section>

        <section className="summary-box">
          <div>
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          <div>
            <span>Discount</span>
            <strong>- {formatMoney(discount)}</strong>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>{formatMoney(paid)}</strong>
          </div>
          <div className={balance < 0 ? 'balance-due' : 'balance-change'}>
            <span>{balance < 0 ? 'Balance Due' : 'Change'}</span>
            <strong>{formatMoney(Math.abs(balance))}</strong>
          </div>
        </section>

        <button type="button" onClick={completeSale} disabled={savingSale || cartItems.length === 0}>
          {savingSale ? 'Saving sale...' : 'Complete Sale'}
        </button>
      </aside>

      {receipt && (
        <div className="modal-backdrop">
          <section className="receipt-modal">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Receipt</p>
                <h2>{receipt.invoice_no}</h2>
              </div>
              <button type="button" className="ghost-button no-print" onClick={() => setReceipt(null)}>
                Close
              </button>
            </div>

            <div className="receipt-print-area">
              <div className="receipt-header">
                <strong>{receipt.shop_name || 'ShopMate LK'}</strong>
                <span>{new Date(receipt.created_at).toLocaleString()}</span>
                <span>Invoice: {receipt.invoice_no}</span>
              </div>

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr key={item.product_id}>
                      <td>{item.product_name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.selling_price)}</td>
                      <td>{formatMoney(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatMoney(receipt.total_before_discount)}</strong>
                </div>
                <div>
                  <span>Discount</span>
                  <strong>{formatMoney(receipt.discount_amount)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatMoney(receipt.final_total)}</strong>
                </div>
                <div>
                  <span>Paid</span>
                  <strong>{formatMoney(receipt.paid_amount)}</strong>
                </div>
                <div>
                  <span>{Number(receipt.balance_amount) < 0 ? 'Balance Due' : 'Change'}</span>
                  <strong>{formatMoney(Math.abs(Number(receipt.balance_amount)))}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>{receipt.payment_type}</strong>
                </div>
              </div>
            </div>

            <button type="button" className="no-print" onClick={() => window.print()}>
              Print Receipt
            </button>
          </section>
        </div>
      )}
    </section>
  )
}

export default POS
