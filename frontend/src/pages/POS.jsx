import { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from '../services/api'
import { formatMoney, getApiMessage, getShopSettings, notifyDashboardChanged } from '../utils/formatters'

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

const formatCurrency = (value, currency) => formatMoney(value, currency)

const formatDateTime = (value) => {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString()
  }

  return date.toLocaleString()
}

const getReceiptDetails = (receipt) => {
  const settings = getShopSettings()
  const saleId = receipt?.sale_id || receipt?.id || 'receipt'
  const invoiceNo = receipt?.invoice_no || `SALE-${saleId}`
  const shopName = receipt?.shop_name || settings.shop_name || 'ShopMate LK'
  const items = Array.isArray(receipt?.items) ? receipt.items : []
  const totalBeforeDiscount = Number(receipt?.total_before_discount || 0)
  const discountAmount = Number(receipt?.discount_amount || 0)
  const finalTotal = Number(receipt?.final_total || receipt?.total_amount || 0)
  const paidAmount = Number(receipt?.paid_amount || 0)
  const balanceAmount = Number(receipt?.balance_amount || 0)
  const paymentType = receipt?.payment_type || 'cash'
  const createdAt = receipt?.created_at || new Date().toISOString()
  const currency = receipt?.currency || settings.currency || 'LKR'
  const receiptFooter =
    receipt?.receipt_footer || settings.receipt_footer || 'Thank you for shopping with us.'

  return {
    invoiceNo,
    saleId,
    shopName,
    shopPhone: receipt?.shop_phone || settings.phone || '',
    shopEmail: receipt?.shop_email || settings.email || '',
    shopAddress: receipt?.shop_address || settings.address || '',
    logoUrl: receipt?.logo_url || settings.logo_url || '',
    receiptFooter,
    currency,
    items,
    totalBeforeDiscount,
    discountAmount,
    finalTotal,
    paidAmount,
    balanceAmount,
    paymentType,
    createdAt,
  }
}

const generateInvoicePDF = (receipt) => {
  const details = getReceiptDetails(receipt)
  const doc = new jsPDF()
  const safeInvoiceNo = String(details.invoiceNo).replace(/[^a-zA-Z0-9-_]/g, '_')

  doc.setFontSize(18)
  doc.text('ShopMate LK Invoice', 14, 18)
  doc.setFontSize(11)
  let metaY = 28
  doc.text(details.shopName, 14, metaY)
  metaY += 8
  if (details.shopAddress) {
    doc.text(details.shopAddress, 14, metaY)
    metaY += 8
  }
  if (details.shopPhone) {
    doc.text(`Phone: ${details.shopPhone}`, 14, metaY)
    metaY += 8
  }
  if (details.shopEmail) {
    doc.text(`Email: ${details.shopEmail}`, 14, metaY)
    metaY += 8
  }
  doc.text(`Invoice: ${details.invoiceNo}`, 14, metaY)
  metaY += 8
  doc.text(`Date: ${formatDateTime(details.createdAt)}`, 14, metaY)
  metaY += 8
  doc.text(`Payment Type: ${details.paymentType}`, 14, metaY)

  autoTable(doc, {
    startY: metaY + 10,
    head: [['Item', 'Qty', 'Unit Price', 'Subtotal']],
    body: details.items.map((item) => [
      item.product_name || 'Item',
      Number(item.quantity || 0),
      formatCurrency(item.selling_price, details.currency),
      formatCurrency(item.subtotal, details.currency),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] },
  })

  const finalY = doc.lastAutoTable?.finalY || 70
  const totals = [
    ['Subtotal', formatCurrency(details.totalBeforeDiscount, details.currency)],
    ['Discount', formatCurrency(details.discountAmount, details.currency)],
    ['Total', formatCurrency(details.finalTotal, details.currency)],
    ['Paid', formatCurrency(details.paidAmount, details.currency)],
    [details.balanceAmount < 0 ? 'Balance Due' : 'Change', formatCurrency(Math.abs(details.balanceAmount), details.currency)],
  ]

  autoTable(doc, {
    startY: finalY + 10,
    body: totals,
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
    },
  })

  doc.setFontSize(10)
  doc.text(details.receiptFooter, 14, 285)
  doc.save(`invoice_${safeInvoiceNo}.pdf`)
}

const shareInvoiceWhatsApp = (receipt) => {
  const details = getReceiptDetails(receipt)
  const itemLines = details.items
    .slice(0, 8)
    .map(
      (item) =>
        `- ${item.product_name || 'Item'} x ${Number(item.quantity || 0)} = ${formatCurrency(
          item.subtotal,
          details.currency,
        )}`,
    )
    .join('\n')
  const moreItems = details.items.length > 8 ? `\n- ...and ${details.items.length - 8} more item(s)` : ''
  const message = [
    details.shopName,
    details.shopAddress,
    details.shopPhone ? `Phone: ${details.shopPhone}` : '',
    `Invoice: ${details.invoiceNo}`,
    `Date: ${formatDateTime(details.createdAt)}`,
    `Payment: ${details.paymentType}`,
    '',
    'Items:',
    itemLines || '- No items',
    moreItems,
    '',
    `Total: ${formatCurrency(details.finalTotal, details.currency)}`,
    `Paid: ${formatCurrency(details.paidAmount, details.currency)}`,
    `${details.balanceAmount < 0 ? 'Balance Due' : 'Change'}: ${formatCurrency(
      Math.abs(details.balanceAmount),
      details.currency,
    )}`,
    details.receiptFooter,
  ]
    .filter(Boolean)
    .join('\n')

  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

const printReceipt = (receipt) => {
  const details = getReceiptDetails(receipt)
  const rows = details.items
    .map(
      (item) => `
        <tr>
          <td>${item.product_name || 'Item'}</td>
          <td>${Number(item.quantity || 0)}</td>
          <td>${formatCurrency(item.selling_price, details.currency)}</td>
          <td>${formatCurrency(item.subtotal, details.currency)}</td>
        </tr>
      `,
    )
    .join('')

  const printWindow = window.open('', '_blank', 'width=420,height=700')

  if (!printWindow) {
    window.print()
    return
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${details.invoiceNo}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 18px; }
          .header { text-align: center; margin-bottom: 16px; }
          .header strong { display: block; font-size: 18px; margin-bottom: 6px; }
          .meta { color: #4b5563; font-size: 12px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 7px 4px; text-align: left; }
          th { color: #4b5563; text-transform: uppercase; font-size: 10px; }
          .totals { margin-top: 14px; font-size: 13px; }
          .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
          .total { border-top: 1px solid #111827; margin-top: 6px; padding-top: 8px !important; font-weight: 700; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #4b5563; }
        </style>
      </head>
      <body>
        <div class="header">
          <strong>${details.shopName}</strong>
          ${details.shopAddress ? `<div class="meta">${details.shopAddress}</div>` : ''}
          ${details.shopPhone ? `<div class="meta">Phone: ${details.shopPhone}</div>` : ''}
          ${details.shopEmail ? `<div class="meta">Email: ${details.shopEmail}</div>` : ''}
          <div class="meta">Invoice: ${details.invoiceNo}</div>
          <div class="meta">Date: ${formatDateTime(details.createdAt)}</div>
          <div class="meta">Payment: ${details.paymentType}</div>
        </div>
        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div><span>Subtotal</span><strong>${formatCurrency(details.totalBeforeDiscount, details.currency)}</strong></div>
          <div><span>Discount</span><strong>${formatCurrency(details.discountAmount, details.currency)}</strong></div>
          <div class="total"><span>Total</span><strong>${formatCurrency(details.finalTotal, details.currency)}</strong></div>
          <div><span>Paid</span><strong>${formatCurrency(details.paidAmount, details.currency)}</strong></div>
          <div><span>${details.balanceAmount < 0 ? 'Balance Due' : 'Change'}</span><strong>${formatCurrency(
            Math.abs(details.balanceAmount),
            details.currency,
          )}</strong></div>
        </div>
        <div class="footer">${details.receiptFooter}</div>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

function POS() {
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [search, setSearch] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [paymentType, setPaymentType] = useState('cash')
  const [discountAmount, setDiscountAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [savingSale, setSavingSale] = useState(false)
  const [scanningCode, setScanningCode] = useState(false)
  const codeInputRef = useRef(null)

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
    codeInputRef.current?.focus()
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
  const receiptDetails = receipt ? getReceiptDetails(receipt) : null

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

  const addScannedProductToCart = (product) => {
    const stock = Number(product.stock_quantity)
    const current = cart[product.id]

    if (stock <= 0) {
      setError('Product out of stock')
      codeInputRef.current?.focus()
      return false
    }

    if (current && current.quantity >= stock) {
      setError(`Stock limit reached for ${product.product_name}`)
      codeInputRef.current?.focus()
      return false
    }

    setCart((currentCart) => ({
      ...currentCart,
      [product.id]: {
        ...product,
        quantity: currentCart[product.id] ? currentCart[product.id].quantity + 1 : 1,
      },
    }))

    setMessage(`${product.product_name} added to cart`)
    setError('')
    setCodeInput('')
    codeInputRef.current?.focus()
    return true
  }

  const addByCode = async () => {
    const code = codeInput.trim()

    if (!code) {
      setError('Scan barcode or enter product code')
      codeInputRef.current?.focus()
      return
    }

    setScanningCode(true)
    setError('')
    setMessage('')

    try {
      const response = await api.get(`/products/search-code/${encodeURIComponent(code)}`)
      addScannedProductToCart(response.data)
    } catch (err) {
      setError(getApiMessage(err, 'Product not found'))
      codeInputRef.current?.focus()
    } finally {
      setScanningCode(false)
    }
  }

  const handleCodeKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addByCode()
    }
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

        <section className="barcode-scanner">
          <label>
            Barcode / Product Code
            <div className="scanner-row">
              <input
                ref={codeInputRef}
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value)}
                onKeyDown={handleCodeKeyDown}
                placeholder="Scan barcode or enter product code"
                autoFocus
              />
              <button type="button" onClick={addByCode} disabled={scanningCode}>
                {scanningCode ? 'Adding...' : 'Add by Code'}
              </button>
            </div>
          </label>
        </section>

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
                  {(product.product_code || product.barcode) && (
                    <small className="product-code-line">
                      {product.product_code ? `SKU ${product.product_code}` : ''}
                      {product.product_code && product.barcode ? ' | ' : ''}
                      {product.barcode ? `Barcode ${product.barcode}` : ''}
                    </small>
                  )}
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
                <h2>{receiptDetails.invoiceNo}</h2>
              </div>
              <div className="receipt-actions no-print">
                <button type="button" onClick={() => generateInvoicePDF(receipt)}>
                  Download PDF
                </button>
                <button type="button" className="ghost-button" onClick={() => shareInvoiceWhatsApp(receipt)}>
                  Share WhatsApp
                </button>
                <button type="button" className="ghost-button" onClick={() => printReceipt(receipt)}>
                  Print
                </button>
                <button type="button" className="ghost-button" onClick={() => setReceipt(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="receipt-print-area">
              <div className="receipt-header">
                <strong>{receiptDetails.shopName}</strong>
                {receiptDetails.shopAddress && <span>{receiptDetails.shopAddress}</span>}
                {receiptDetails.shopPhone && <span>Phone: {receiptDetails.shopPhone}</span>}
                {receiptDetails.shopEmail && <span>Email: {receiptDetails.shopEmail}</span>}
                <span>{formatDateTime(receiptDetails.createdAt)}</span>
                <span>Invoice: {receiptDetails.invoiceNo}</span>
                <span>Payment: {receiptDetails.paymentType}</span>
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
                  {(receiptDetails.items || []).map((item, index) => (
                    <tr key={item.product_id || index}>
                      <td>{item.product_name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(item.selling_price, receiptDetails.currency)}</td>
                      <td>{formatCurrency(item.subtotal, receiptDetails.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(receiptDetails.totalBeforeDiscount, receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>Discount</span>
                  <strong>{formatCurrency(receiptDetails.discountAmount, receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatCurrency(receiptDetails.finalTotal, receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>Paid</span>
                  <strong>{formatCurrency(receiptDetails.paidAmount, receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>{receiptDetails.balanceAmount < 0 ? 'Balance Due' : 'Change'}</span>
                  <strong>{formatCurrency(Math.abs(receiptDetails.balanceAmount), receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>{receiptDetails.paymentType}</strong>
                </div>
                <div>
                  <span>Footer</span>
                  <strong>{receiptDetails.receiptFooter}</strong>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default POS
