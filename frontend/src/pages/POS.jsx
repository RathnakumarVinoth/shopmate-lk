import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from '../services/api'
import { formatMoney, getApiMessage, getShopSettings, notifyDashboardChanged } from '../utils/formatters'

const getProductsFromResponse = (data) => {
  if (Array.isArray(data)) return data
  return data.products || []
}

const initialCustomerForm = {
  customer_name: '',
  phone: '',
  address: '',
}

const initialPaymentDetails = {
  payment_reference: '',
  approval_code: '',
  card_last_four: '',
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
  const customerName = receipt?.customer_name || ''
  const customerPhone = receipt?.customer_phone || ''
  const customerAddress = receipt?.customer_address || ''
  const items = Array.isArray(receipt?.items) ? receipt.items : []
  const totalBeforeDiscount = Number(receipt?.total_before_discount || 0)
  const discountAmount = Number(receipt?.discount_amount || 0)
  const finalTotal = Number(receipt?.final_total || receipt?.total_amount || 0)
  const paidAmount = Number(receipt?.paid_amount || 0)
  const balanceAmount = Number(receipt?.balance_amount || 0)
  const paymentType = receipt?.payment_type || 'cash'
  const paymentStatus = receipt?.payment_status || 'verified'
  const createdAt = receipt?.created_at || new Date().toISOString()
  const currency = receipt?.currency || settings.currency || 'LKR'
  const receiptFooter =
    receipt?.receipt_footer || settings.receipt_footer || 'Thank you for shopping with us.'
  const balanceLabel =
    paymentType === 'credit' ? 'Credit Balance' : balanceAmount < 0 ? 'Balance Due' : 'Change'

  return {
    invoiceNo,
    saleId,
    shopName,
    customerId: receipt?.customer_id || null,
    customerName,
    customerPhone,
    customerAddress,
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
    balanceLabel,
    paymentType,
    paymentStatus,
    paymentReference: receipt?.payment_reference || '',
    approvalCode: receipt?.approval_code || '',
    cardLastFour: receipt?.card_last_four || '',
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
  if (details.customerName) {
    doc.text(`Customer: ${details.customerName}`, 14, metaY)
    metaY += 8
    if (details.customerPhone) {
      doc.text(`Customer Phone: ${details.customerPhone}`, 14, metaY)
      metaY += 8
    }
    if (details.customerAddress) {
      doc.text(`Customer Address: ${details.customerAddress}`, 14, metaY)
      metaY += 8
    }
  }
  doc.text(`Invoice: ${details.invoiceNo}`, 14, metaY)
  metaY += 8
  doc.text(`Date: ${formatDateTime(details.createdAt)}`, 14, metaY)
  metaY += 8
  doc.text(`Payment Type: ${details.paymentType}`, 14, metaY)
  metaY += 8
  doc.text(`Payment Status: ${details.paymentStatus}`, 14, metaY)
  if (details.paymentReference) {
    metaY += 8
    doc.text(`Reference: ${details.paymentReference}`, 14, metaY)
  }

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
    [details.balanceLabel, formatCurrency(Math.abs(details.balanceAmount), details.currency)],
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
    details.customerName ? `Customer: ${details.customerName}` : '',
    details.customerPhone ? `Customer Phone: ${details.customerPhone}` : '',
    `Invoice: ${details.invoiceNo}`,
    `Date: ${formatDateTime(details.createdAt)}`,
    `Payment: ${details.paymentType}`,
    `Payment Status: ${details.paymentStatus}`,
    details.paymentReference ? `Reference: ${details.paymentReference}` : '',
    '',
    'Items:',
    itemLines || '- No items',
    moreItems,
    '',
    `Total: ${formatCurrency(details.finalTotal, details.currency)}`,
    `Paid: ${formatCurrency(details.paidAmount, details.currency)}`,
    `${details.balanceLabel}: ${formatCurrency(
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
          ${details.customerName ? `<div class="meta">Customer: ${details.customerName}</div>` : ''}
          ${details.customerPhone ? `<div class="meta">Customer Phone: ${details.customerPhone}</div>` : ''}
          ${details.customerAddress ? `<div class="meta">Customer Address: ${details.customerAddress}</div>` : ''}
          <div class="meta">Invoice: ${details.invoiceNo}</div>
          <div class="meta">Date: ${formatDateTime(details.createdAt)}</div>
          <div class="meta">Payment: ${details.paymentType}</div>
          <div class="meta">Payment Status: ${details.paymentStatus}</div>
          ${details.paymentReference ? `<div class="meta">Reference: ${details.paymentReference}</div>` : ''}
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
          <div><span>${details.balanceLabel}</span><strong>${formatCurrency(
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
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [cart, setCart] = useState({})
  const [search, setSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [customerForm, setCustomerForm] = useState(initialCustomerForm)
  const [codeInput, setCodeInput] = useState('')
  const [paymentType, setPaymentType] = useState('cash')
  const [paymentDetails, setPaymentDetails] = useState(initialPaymentDetails)
  const [discountAmount, setDiscountAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [savingSale, setSavingSale] = useState(false)
  const [scanningCode, setScanningCode] = useState(false)
  const codeInputRef = useRef(null)

  const loadProducts = useCallback(async () => {
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
  }, [])

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true)

    try {
      const response = await api.get('/credits/customers')
      setCustomers(response.data.customers || [])
    } catch (err) {
      if (user.role === 'owner') {
        setError(getApiMessage(err, 'Failed to load customers'))
      }
    } finally {
      setLoadingCustomers(false)
    }
  }, [user.role])

  useEffect(() => {
    loadProducts()
    loadCustomers()
  }, [loadProducts, loadCustomers])

  useEffect(() => {
    codeInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (paymentType === 'credit') {
      setPaidAmount((current) => current || '0')
    }

    if (paymentType === 'cash' || paymentType === 'credit') {
      setPaymentDetails(initialPaymentDetails)
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
  const isCardPayment = paymentType === 'card'
  const needsReference = ['card', 'qr', 'bank_transfer'].includes(paymentType)
  const paidInvalid = paidRequired && paidAmount === ''
  const selectedCustomer = customers.find(
    (customer) => Number(customer.id) === Number(selectedCustomerId),
  )
  const creditBalance = Math.max(total - paid, 0)
  const saleBalance = paymentType === 'credit' ? creditBalance : balance

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase()
    if (!term) return customers

    return customers.filter((customer) =>
      `${customer.customer_name} ${customer.phone || ''}`.toLowerCase().includes(term),
    )
  }, [customers, customerSearch])

  const addCustomer = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSavingCustomer(true)

    try {
      const response = await api.post('/credits/customers', customerForm)
      const customer = response.data.customer
      setCustomers((current) => [customer, ...current])
      setSelectedCustomerId(String(customer.id))
      setCustomerForm(initialCustomerForm)
      setShowCustomerForm(false)
      setMessage('Customer added successfully')
    } catch (err) {
      setError(getApiMessage(err, 'Failed to add customer'))
    } finally {
      setSavingCustomer(false)
    }
  }
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

    if (paymentType === 'credit' && !selectedCustomerId) {
      setError('Select a customer for credit sales')
      return
    }

    if (paymentType === 'credit' && paid > total) {
      setError('Paid amount cannot be greater than total for credit sales')
      return
    }

    if (paymentType !== 'credit' && paid < total) {
      setError('Paid amount must be greater than or equal to total')
      return
    }

    if (
      paymentDetails.card_last_four &&
      !/^\d{4}$/.test(paymentDetails.card_last_four.trim())
    ) {
      setError('Card last 4 digits must contain exactly 4 digits')
      return
    }

    setSavingSale(true)

    try {
      const response = await api.post('/sales', {
        customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
        payment_type: paymentType,
        discount_amount: discount,
        paid_amount: paymentType === 'credit' ? paid : Number(paidAmount),
        payment_reference: paymentDetails.payment_reference.trim() || null,
        approval_code: paymentDetails.approval_code.trim() || null,
        card_last_four: paymentDetails.card_last_four.trim() || null,
        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        })),
      })

      const saleReceipt = response.data.receipt || {}
      const customerReceiptDetails = selectedCustomer
        ? {
            customer_id: saleReceipt.customer_id || Number(selectedCustomer.id),
            customer_name: saleReceipt.customer_name || selectedCustomer.customer_name,
            customer_phone: saleReceipt.customer_phone || selectedCustomer.phone || '',
            customer_address: saleReceipt.customer_address || selectedCustomer.address || '',
          }
        : {}

      setReceipt({
        ...saleReceipt,
        ...customerReceiptDetails,
      })
      setCart({})
      setSelectedCustomerId('')
      setDiscountAmount('')
      setPaidAmount(paymentType === 'credit' ? '0' : '')
      setPaymentDetails(initialPaymentDetails)
      setMessage(
        paymentType === 'credit'
          ? 'Credit sale created and added to Credit Book.'
          : saleReceipt.payment_status === 'pending'
            ? 'Sale completed with pending payment verification.'
            : 'Sale completed successfully',
      )
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

        <section className="customer-picker">
          <div className="section-heading">
            <h2>Customer</h2>
            {user.role === 'owner' && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowCustomerForm((current) => !current)}
              >
                {showCustomerForm ? 'Close' : 'Add New Customer'}
              </button>
            )}
          </div>
          <div className="form-grid compact-form">
            <label>
              Search Customer
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search by name or phone"
              />
            </label>
            <label>
              Customer
              <select
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.target.value)}
                disabled={loadingCustomers}
              >
                <option value="">Walk-in customer</option>
                {filteredCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customer_name} {customer.phone ? `- ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedCustomer && (
            <p className="muted">
              Selected: {selectedCustomer.customer_name}
              {selectedCustomer.phone ? `, ${selectedCustomer.phone}` : ''}
              {selectedCustomer.address ? `, ${selectedCustomer.address}` : ''}
            </p>
          )}
          {showCustomerForm && (
            <form className="form-grid compact-form quick-customer-form" onSubmit={addCustomer}>
              <label>
                Customer Name
                <input
                  value={customerForm.customer_name}
                  onChange={(event) =>
                    setCustomerForm({ ...customerForm, customer_name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Phone
                <input
                  value={customerForm.phone}
                  onChange={(event) =>
                    setCustomerForm({ ...customerForm, phone: event.target.value })
                  }
                />
              </label>
              <label className="full-width">
                Address
                <input
                  value={customerForm.address}
                  onChange={(event) =>
                    setCustomerForm({ ...customerForm, address: event.target.value })
                  }
                />
              </label>
              <button type="submit" className="full-width" disabled={savingCustomer}>
                {savingCustomer ? 'Adding customer...' : 'Save Customer'}
              </button>
            </form>
          )}
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
            {needsReference && (
              <label className={isCardPayment ? '' : 'full-width'}>
                Transaction Reference No
                <input
                  value={paymentDetails.payment_reference}
                  onChange={(event) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      payment_reference: event.target.value,
                    })
                  }
                />
              </label>
            )}
            {isCardPayment && (
              <>
                <label>
                  Approval Code
                  <input
                    value={paymentDetails.approval_code}
                    onChange={(event) =>
                      setPaymentDetails({
                        ...paymentDetails,
                        approval_code: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Card Last 4 Digits
                  <input
                    inputMode="numeric"
                    maxLength="4"
                    value={paymentDetails.card_last_four}
                    onChange={(event) =>
                      setPaymentDetails({
                        ...paymentDetails,
                        card_last_four: event.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                  />
                </label>
              </>
            )}
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
            <span>
              {paymentType === 'credit'
                ? 'Credit Balance'
                : balance < 0
                  ? 'Balance Due'
                  : 'Change'}
            </span>
            <strong>{formatMoney(Math.abs(saleBalance))}</strong>
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
                <span>Payment Status: {receiptDetails.paymentStatus}</span>
                {receiptDetails.paymentReference && (
                  <span>Reference: {receiptDetails.paymentReference}</span>
                )}
              </div>

              {receiptDetails.customerName && (
                <div className="receipt-customer">
                  <strong>Customer</strong>
                  <span>Name: {receiptDetails.customerName}</span>
                  {receiptDetails.customerPhone && <span>Phone: {receiptDetails.customerPhone}</span>}
                  {receiptDetails.customerAddress && (
                    <span>Address: {receiptDetails.customerAddress}</span>
                  )}
                </div>
              )}

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
                  <span>{receiptDetails.balanceLabel}</span>
                  <strong>{formatCurrency(Math.abs(receiptDetails.balanceAmount), receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>{receiptDetails.paymentType}</strong>
                </div>
                <div>
                  <span>Payment Status</span>
                  <strong className={`status ${receiptDetails.paymentStatus}`}>
                    {receiptDetails.paymentStatus}
                  </strong>
                </div>
                {receiptDetails.paymentReference && (
                  <div>
                    <span>Reference</span>
                    <strong>{receiptDetails.paymentReference}</strong>
                  </div>
                )}
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
