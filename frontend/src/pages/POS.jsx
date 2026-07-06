import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage, getShopSettings, notifyDashboardChanged } from '../utils/formatters'
import {
  getShopSession,
  getSessionUser,
  getStoredSettings,
  isTokenExpired,
} from '../utils/session'
import {
  cachePosData,
  getCachedPosData,
  getOfflineSales,
  saveOfflineSale,
  syncPendingOfflineSales,
} from '../utils/offlinePos'

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

const receiptSizes = ['58mm', '80mm']
const receiptBrandingLine = 'Powered by ShopMate LK'
const receiptBrandingSubline = 'POS & Stock Management'

const normalizeReceiptSize = (value) => (receiptSizes.includes(value) ? value : '80mm')

const normalizeReceiptFlag = (value, fallback = true) => {
  if (value === undefined || value === null) return fallback
  return ![false, 0, '0', 'false'].includes(value)
}

const getSafeLogoUrl = (value) => {
  if (!value || typeof window === 'undefined') return ''

  try {
    const url = new URL(String(value), window.location.origin)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const formatCurrency = (value, currency) => formatMoney(value, currency)

const formatDateTime = (value) => {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString()
  }

  return date.toLocaleString()
}

const formatCompactDateTime = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

const createOfflineInvoiceNo = (date = new Date()) => `OFFLINE-${formatCompactDateTime(date)}`

const createLocalOfflineId = () =>
  `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const formatQuantity = (item) => {
  const quantity = Number(item.quantity || 0)
  return item.unit ? `${quantity} ${item.unit}` : String(quantity)
}

const roundMoney = (value) => Number(Number(value || 0).toFixed(2))

const getReceiptDetails = (receipt) => {
  const settings = getShopSettings()
  const saleId = receipt?.sale_id || receipt?.id || 'receipt'
  const invoiceNo = receipt?.invoice_no || `SALE-${saleId}`
  const offlinePending = Boolean(
    receipt?.offline_pending ||
      receipt?.sync_status === 'pending' ||
      String(invoiceNo).startsWith('OFFLINE-'),
  )
  const shopName = receipt?.shop_name || settings.shop_name || 'ShopMate LK'
  const customerName = receipt?.customer_name || ''
  const customerPhone = receipt?.customer_phone || ''
  const customerAddress = receipt?.customer_address || ''
  const items = Array.isArray(receipt?.items) ? receipt.items : []
  const subtotal = Number(receipt?.subtotal ?? receipt?.total_before_discount ?? 0)
  const totalBeforeDiscount = subtotal
  const itemDiscountTotal = Number(receipt?.item_discount_total || 0)
  const billDiscount = Number(receipt?.bill_discount ?? receipt?.discount_amount ?? 0)
  const discountAmount = Number(receipt?.discount_amount || 0)
  const taxPercentage = Number(receipt?.tax_percentage || 0)
  const taxAmount = Number(receipt?.tax_amount || 0)
  const totalBeforeTax = Number(
    receipt?.total_before_tax ?? Math.max(0, subtotal - discountAmount),
  )
  const finalTotal = Number(receipt?.final_total || receipt?.total_amount || 0)
  const paidAmount = Number(receipt?.paid_amount || 0)
  const balanceAmount = Number(receipt?.balance_amount || 0)
  const paymentType = receipt?.payment_type || 'cash'
  const createdAt = receipt?.created_at || new Date().toISOString()
  const currency = receipt?.currency || settings.currency || 'LKR'
  const receiptFooter =
    receipt?.receipt_footer || settings.receipt_footer || 'Thank you for shopping with us.'
  const defaultReceiptSize = normalizeReceiptSize(
    receipt?.default_receipt_size || settings.default_receipt_size,
  )
  const showLogo = normalizeReceiptFlag(
    receipt?.receipt_show_logo,
    normalizeReceiptFlag(settings.receipt_show_logo),
  )
  const showTax = normalizeReceiptFlag(
    receipt?.receipt_show_tax,
    normalizeReceiptFlag(settings.receipt_show_tax),
  )
  const showDiscounts = normalizeReceiptFlag(
    receipt?.receipt_show_discounts,
    normalizeReceiptFlag(settings.receipt_show_discounts),
  )
  const showCashier = normalizeReceiptFlag(
    receipt?.receipt_show_cashier,
    normalizeReceiptFlag(settings.receipt_show_cashier),
  )
  const balanceLabel =
    paymentType === 'credit' ? t('creditBalance') : balanceAmount < 0 ? t('balanceDue') : t('change')

  return {
    invoiceNo,
    offlinePending,
    temporaryInvoiceNo: receipt?.temporary_invoice_no || (offlinePending ? invoiceNo : ''),
    saleId,
    shopName,
    customerId: receipt?.customer_id || null,
    customerName,
    customerPhone,
    customerAddress,
    shopPhone: receipt?.shop_phone || settings.phone || '',
    shopEmail: receipt?.shop_email || settings.email || '',
    shopAddress: receipt?.shop_address || settings.address || '',
    logoUrl: showLogo
      ? getSafeLogoUrl(receipt?.logo_url || settings.logo_url || '')
      : '',
    showLogo,
    showTax,
    showDiscounts,
    showCashier,
    receiptFooter,
    defaultReceiptSize,
    currency,
    items,
    subtotal,
    totalBeforeDiscount,
    itemDiscountTotal,
    billDiscount,
    discountAmount,
    taxPercentage,
    taxAmount,
    totalBeforeTax,
    finalTotal,
    paidAmount,
    balanceAmount,
    balanceLabel,
    paymentType,
    paymentReference: receipt?.payment_reference || '',
    approvalCode: receipt?.approval_code || '',
    cardLastFour: receipt?.card_last_four || receipt?.card_last4 || '',
    billedBy: receipt?.billed_by || receipt?.cashier_name || receipt?.user_name || '',
    createdAt,
  }
}

const generateInvoicePDF = (receipt) => {
  const details = getReceiptDetails(receipt)
  const doc = new jsPDF()
  const safeInvoiceNo = String(details.invoiceNo).replace(/[^a-zA-Z0-9-_]/g, '_')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFontSize(18)
  doc.text('ShopMate LK Invoice', 14, 18)
  if (typeof doc.GState === 'function') {
    doc.setGState(new doc.GState({ opacity: 0.1 }))
  }
  doc.setTextColor(15, 118, 110)
  doc.setFontSize(32)
  doc.text('ShopMate LK', pageWidth / 2, pageHeight - 36, { align: 'center' })
  if (typeof doc.GState === 'function') {
    doc.setGState(new doc.GState({ opacity: 1 }))
  }
  doc.setTextColor(0, 0, 0)
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
  doc.text(`Sale ID: ${details.saleId}`, 14, metaY)
  metaY += 8
  if (details.offlinePending) {
    doc.text('OFFLINE SALE - Pending Sync', 14, metaY)
    metaY += 8
  }
  doc.text(`Date: ${formatDateTime(details.createdAt)}`, 14, metaY)
  metaY += 8
  doc.text(`${t('paymentMethod')}: ${details.paymentType}`, 14, metaY)
  if (details.showCashier && details.billedBy) {
    metaY += 8
    doc.text(`${t('Billed by')}: ${details.billedBy}`, 14, metaY)
  }
  if (details.paymentReference) {
    metaY += 8
    doc.text(`Reference: ${details.paymentReference}`, 14, metaY)
  }
  if (details.paymentType === 'card' && details.cardLastFour) {
    metaY += 8
    doc.text(`Card Last 4: ${details.cardLastFour}`, 14, metaY)
  }

  autoTable(doc, {
    startY: metaY + 10,
    head: [[
      'Item',
      'Qty',
      'Unit Price',
      ...(details.showDiscounts ? ['Discount'] : []),
      'Subtotal',
    ]],
    body: details.items.map((item) => [
      item.product_name || 'Item',
      formatQuantity(item),
      formatCurrency(item.selling_price, details.currency),
      ...(details.showDiscounts
        ? [formatCurrency(item.item_discount, details.currency)]
        : []),
      formatCurrency(item.subtotal, details.currency),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] },
  })

  const finalY = doc.lastAutoTable?.finalY || 70
  const totals = [
    [t('Subtotal'), formatCurrency(details.subtotal, details.currency)],
    ...(details.showDiscounts
      ? [
          [t('Item Discount Total'), formatCurrency(details.itemDiscountTotal, details.currency)],
          [t('Bill Discount'), formatCurrency(details.billDiscount, details.currency)],
        ]
      : []),
    ...(details.showTax
      ? [
          [t('Total Before Tax'), formatCurrency(details.totalBeforeTax, details.currency)],
          [t('Tax Percentage'), `${details.taxPercentage}%`],
          [t('Tax Amount'), formatCurrency(details.taxAmount, details.currency)],
        ]
      : []),
    [t('Final Total'), formatCurrency(details.finalTotal, details.currency)],
    [t('paid'), formatCurrency(details.paidAmount, details.currency)],
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
  doc.text(details.receiptFooter, 14, pageHeight - 18)
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(t(receiptBrandingLine), pageWidth / 2, pageHeight - 11, { align: 'center' })
  doc.text(t(receiptBrandingSubline), pageWidth / 2, pageHeight - 7, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  doc.save(`invoice_${safeInvoiceNo}.pdf`)
}

const shareInvoiceWhatsApp = (receipt) => {
  const details = getReceiptDetails(receipt)
  const itemLines = details.items
    .slice(0, 8)
    .map(
      (item) =>
        `- ${item.product_name || 'Item'} x ${formatQuantity(item)}${
          details.showDiscounts && Number(item.item_discount || 0) > 0
            ? `, Discount ${formatCurrency(item.item_discount, details.currency)}`
            : ''
        } = ${formatCurrency(
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
    `Sale ID: ${details.saleId}`,
    details.offlinePending ? 'OFFLINE SALE - Pending Sync' : '',
    `Date: ${formatDateTime(details.createdAt)}`,
    `Payment: ${details.paymentType}`,
    details.showCashier && details.billedBy ? `Billed by: ${details.billedBy}` : '',
    details.paymentReference ? `Reference: ${details.paymentReference}` : '',
    details.paymentType === 'card' && details.cardLastFour
      ? `Card Last 4: ${details.cardLastFour}`
      : '',
    '',
    'Items:',
    itemLines || '- No items',
    moreItems,
    '',
    `Subtotal: ${formatCurrency(details.subtotal, details.currency)}`,
    details.showDiscounts
      ? `Item Discount Total: ${formatCurrency(details.itemDiscountTotal, details.currency)}`
      : '',
    details.showDiscounts
      ? `Bill Discount: ${formatCurrency(details.billDiscount, details.currency)}`
      : '',
    details.showTax
      ? `Total Before Tax: ${formatCurrency(details.totalBeforeTax, details.currency)}`
      : '',
    details.showTax
      ? `Tax (${details.taxPercentage}%): ${formatCurrency(details.taxAmount, details.currency)}`
      : '',
    `Final Total: ${formatCurrency(details.finalTotal, details.currency)}`,
    `Paid: ${formatCurrency(details.paidAmount, details.currency)}`,
    `${details.balanceLabel}: ${formatCurrency(
      Math.abs(details.balanceAmount),
      details.currency,
    )}`,
    details.receiptFooter,
    t(receiptBrandingLine),
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
          <td>${escapeHtml(item.product_name || 'Item')}</td>
          <td>${escapeHtml(formatQuantity(item))}</td>
          <td>${escapeHtml(formatCurrency(item.selling_price, details.currency))}</td>
          ${
            details.showDiscounts
              ? `<td>${escapeHtml(
                  formatCurrency(item.item_discount, details.currency),
                )}</td>`
              : ''
          }
          <td>${escapeHtml(formatCurrency(item.subtotal, details.currency))}</td>
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
        <title>${escapeHtml(details.invoiceNo)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; padding: 18px; }
          .header { text-align: center; margin-bottom: 16px; }
          .header strong { display: block; font-size: 18px; margin-bottom: 6px; }
          .logo { display: block; width: auto; max-width: 92px; max-height: 64px; margin: 0 auto 8px; object-fit: contain; }
          .meta { color: #4b5563; font-size: 12px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 7px 4px; text-align: left; }
          th { color: #4b5563; text-transform: uppercase; font-size: 10px; }
          .totals { margin-top: 14px; font-size: 13px; }
          .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
          .total { border-top: 1px solid #111827; margin-top: 6px; padding-top: 8px !important; font-weight: 700; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #4b5563; }
          .powered { margin-top: 8px; font-size: 10px; color: #64748b; }
          .powered span { display: block; font-size: 9px; }
        </style>
      </head>
      <body>
        <div class="header">
          ${
            details.showLogo && details.logoUrl
              ? `<img class="logo" src="${escapeHtml(details.logoUrl)}" alt="">`
              : ''
          }
          <strong>${escapeHtml(details.shopName)}</strong>
          ${details.shopAddress ? `<div class="meta">${escapeHtml(details.shopAddress)}</div>` : ''}
          ${details.shopPhone ? `<div class="meta">Phone: ${escapeHtml(details.shopPhone)}</div>` : ''}
          ${details.shopEmail ? `<div class="meta">Email: ${escapeHtml(details.shopEmail)}</div>` : ''}
          ${details.customerName ? `<div class="meta">Customer: ${escapeHtml(details.customerName)}</div>` : ''}
          ${details.customerPhone ? `<div class="meta">Customer Phone: ${escapeHtml(details.customerPhone)}</div>` : ''}
          ${details.customerAddress ? `<div class="meta">Customer Address: ${escapeHtml(details.customerAddress)}</div>` : ''}
          <div class="meta">Invoice: ${escapeHtml(details.invoiceNo)}</div>
          <div class="meta">Sale ID: ${escapeHtml(details.saleId)}</div>
          ${details.offlinePending ? '<div class="meta"><strong>OFFLINE SALE - Pending Sync</strong></div>' : ''}
          <div class="meta">Date: ${escapeHtml(formatDateTime(details.createdAt))}</div>
          <div class="meta">${escapeHtml(t('paymentMethod'))}: ${escapeHtml(details.paymentType)}</div>
          ${
            details.showCashier && details.billedBy
              ? `<div class="meta">${escapeHtml(t('Billed by'))}: ${escapeHtml(details.billedBy)}</div>`
              : ''
          }
          ${details.paymentReference ? `<div class="meta">Reference: ${escapeHtml(details.paymentReference)}</div>` : ''}
          ${
            details.paymentType === 'card' && details.cardLastFour
              ? `<div class="meta">Card Last 4: ${escapeHtml(details.cardLastFour)}</div>`
              : ''
          }
        </div>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t('Product'))}</th>
              <th>${escapeHtml(t('Quantity'))}</th>
              <th>${escapeHtml(t('Price'))}</th>
              ${details.showDiscounts ? `<th>${escapeHtml(t('Discount'))}</th>` : ''}
              <th>${escapeHtml(t('total'))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div><span>${escapeHtml(t('Subtotal'))}</span><strong>${escapeHtml(
            formatCurrency(details.subtotal, details.currency),
          )}</strong></div>
          ${
            details.showDiscounts
              ? `<div><span>${escapeHtml(t('Item Discount Total'))}</span><strong>${escapeHtml(
                  formatCurrency(details.itemDiscountTotal, details.currency),
                )}</strong></div>
                 <div><span>${escapeHtml(t('Bill Discount'))}</span><strong>${escapeHtml(
                   formatCurrency(details.billDiscount, details.currency),
                 )}</strong></div>`
              : ''
          }
          ${
            details.showTax
              ? `<div><span>${escapeHtml(t('Total Before Tax'))}</span><strong>${escapeHtml(
                  formatCurrency(details.totalBeforeTax, details.currency),
                )}</strong></div>
                 <div><span>${escapeHtml(t('Tax Percentage'))}</span><strong>${escapeHtml(
                   details.taxPercentage,
                 )}%</strong></div>
                 <div><span>${escapeHtml(t('Tax Amount'))}</span><strong>${escapeHtml(
                   formatCurrency(details.taxAmount, details.currency),
                 )}</strong></div>`
              : ''
          }
          <div class="total"><span>${escapeHtml(t('Final Total'))}</span><strong>${escapeHtml(
            formatCurrency(details.finalTotal, details.currency),
          )}</strong></div>
          <div><span>${escapeHtml(t('paid'))}</span><strong>${escapeHtml(
            formatCurrency(details.paidAmount, details.currency),
          )}</strong></div>
          <div><span>${escapeHtml(details.balanceLabel)}</span><strong>${escapeHtml(formatCurrency(
            Math.abs(details.balanceAmount),
            details.currency,
          ))}</strong></div>
        </div>
        <div class="footer">
          <div>${escapeHtml(details.receiptFooter)}</div>
          <div class="powered">${escapeHtml(t(receiptBrandingLine))}<span>${escapeHtml(t(receiptBrandingSubline))}</span></div>
        </div>
        <script>
          window.onload = function () {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

const thermalPrintReceipt = (receipt, receiptSize = '80mm') => {
  const details = getReceiptDetails(receipt)
  const width = normalizeReceiptSize(receiptSize || details.defaultReceiptSize)
  const rows = details.items
    .map(
      (item) => `
        <tr>
          <td class="item-name">
            ${escapeHtml(item.product_name || 'Item')}
            ${
              details.showDiscounts && Number(item.item_discount || 0) > 0
                ? `<div class="muted">${escapeHtml(t('Discount'))}: ${escapeHtml(
                    formatCurrency(item.item_discount, details.currency),
                  )}</div>`
                : ''
            }
          </td>
          <td class="num">${escapeHtml(formatQuantity(item))}</td>
          <td class="num">${escapeHtml(formatCurrency(item.selling_price, details.currency))}</td>
          <td class="num">${escapeHtml(formatCurrency(item.subtotal, details.currency))}</td>
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
        <title>${escapeHtml(details.invoiceNo)} Thermal Receipt</title>
        <style>
          @page { size: ${width} auto; margin: 0; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #fff;
            color: #000;
            font-family: "Courier New", monospace;
            font-size: ${width === '58mm' ? '10px' : '11px'};
            line-height: 1.3;
          }
          .receipt {
            width: ${width};
            padding: ${width === '58mm' ? '3mm' : '4mm'};
          }
          .center { text-align: center; }
          .shop-name { display: block; font-size: ${width === '58mm' ? '13px' : '15px'}; margin-bottom: 3px; }
          .logo { display: block; width: auto; max-width: ${width === '58mm' ? '32mm' : '42mm'}; max-height: 18mm; margin: 0 auto 4px; object-fit: contain; }
          .muted { font-size: ${width === '58mm' ? '9px' : '10px'}; }
          .powered { display: block; margin-top: 3px; font-size: ${width === '58mm' ? '8px' : '9px'}; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; gap: 8px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; vertical-align: top; }
          th { border-bottom: 1px dashed #000; font-weight: 700; text-align: left; }
          .item-name { width: 40%; word-break: break-word; }
          .num { text-align: right; white-space: nowrap; }
          .totals .row { padding: 2px 0; }
          .grand-total { font-weight: 700; font-size: ${width === '58mm' ? '11px' : '12px'}; }
          @media print {
            html, body { width: ${width}; margin: 0; }
            .receipt { width: ${width}; }
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="center">
            ${
              details.showLogo && details.logoUrl
                ? `<img class="logo" src="${escapeHtml(details.logoUrl)}" alt="">`
                : ''
            }
            <strong class="shop-name">${escapeHtml(details.shopName)}</strong>
            ${details.shopAddress ? `<div>${escapeHtml(details.shopAddress)}</div>` : ''}
            ${details.shopPhone ? `<div>Phone: ${escapeHtml(details.shopPhone)}</div>` : ''}
          </header>

          <div class="line"></div>
          <section>
            <div class="row"><span>${escapeHtml(t('Invoice'))}</span><strong>${escapeHtml(details.invoiceNo)}</strong></div>
            <div class="row"><span>${escapeHtml(t('Sale ID'))}</span><span>${escapeHtml(details.saleId)}</span></div>
            ${
              details.offlinePending
                ? `<div class="center"><strong>${escapeHtml('OFFLINE SALE - Pending Sync')}</strong></div>`
                : ''
            }
            <div class="row"><span>${escapeHtml(t('Date'))}</span><span>${escapeHtml(formatDateTime(details.createdAt))}</span></div>
            ${
              details.showCashier && details.billedBy
                ? `<div>${escapeHtml(t('Billed by'))}: ${escapeHtml(details.billedBy)}</div>`
                : ''
            }
            ${
              details.customerName
                ? `<div>Customer: ${escapeHtml(details.customerName)}</div>`
                : ''
            }
            ${
              details.customerPhone
                ? `<div>Phone: ${escapeHtml(details.customerPhone)}</div>`
                : ''
            }
          </section>

          <div class="line"></div>
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(t('Product'))}</th>
                <th class="num">${escapeHtml(t('Quantity'))}</th>
                <th class="num">${escapeHtml(t('Price'))}</th>
                <th class="num">${escapeHtml(t('total'))}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="line"></div>
          <section class="totals">
            <div class="row"><span>${escapeHtml(t('Subtotal'))}</span><span>${escapeHtml(
              formatCurrency(details.subtotal, details.currency),
            )}</span></div>
            ${
              details.showDiscounts
                ? `<div class="row"><span>${escapeHtml(t('Item Discount Total'))}</span><span>${escapeHtml(
                    formatCurrency(details.itemDiscountTotal, details.currency),
                  )}</span></div>
                   <div class="row"><span>${escapeHtml(t('Bill Discount'))}</span><span>${escapeHtml(
                     formatCurrency(details.billDiscount, details.currency),
                   )}</span></div>`
                : ''
            }
            ${
              details.showTax
                ? `<div class="row"><span>${escapeHtml(t('Total Before Tax'))}</span><span>${escapeHtml(
                    formatCurrency(details.totalBeforeTax, details.currency),
                  )}</span></div>
                   <div class="row"><span>${escapeHtml(t('Tax'))} ${escapeHtml(String(details.taxPercentage))}%</span><span>${escapeHtml(
                     formatCurrency(details.taxAmount, details.currency),
                   )}</span></div>`
                : ''
            }
            <div class="row grand-total"><span>${escapeHtml(t('Final Total'))}</span><span>${escapeHtml(
              formatCurrency(details.finalTotal, details.currency),
            )}</span></div>
            <div class="row"><span>${escapeHtml(t('paid'))}</span><span>${escapeHtml(
              formatCurrency(details.paidAmount, details.currency),
            )}</span></div>
            <div class="row"><span>${escapeHtml(details.balanceLabel)}</span><span>${escapeHtml(
              formatCurrency(Math.abs(details.balanceAmount), details.currency),
            )}</span></div>
          </section>

          <div class="line"></div>
          <section>
            <div>${escapeHtml(t('paymentMethod'))}: ${escapeHtml(details.paymentType)}</div>
            ${details.paymentReference ? `<div>Reference: ${escapeHtml(details.paymentReference)}</div>` : ''}
            ${
              details.paymentType === 'card' && details.cardLastFour
                ? `<div>Card Last 4: ${escapeHtml(details.cardLastFour)}</div>`
                : ''
            }
          </section>

          <div class="line"></div>
          <footer class="center muted">
            <div>${escapeHtml(details.receiptFooter)}</div>
            <strong class="powered">${escapeHtml(t(receiptBrandingLine))}</strong>
            <div class="powered">${escapeHtml(t(receiptBrandingSubline))}</div>
          </footer>
        </main>
        <script>
          window.onload = function () {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

function POS() {
  const user = getSessionUser()
  const shopSession = getShopSession()
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
  const [taxPercentage, setTaxPercentage] = useState(() =>
    String(Number(getShopSettings().tax_percentage || 0)),
  )
  const [paidAmount, setPaidAmount] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [thermalReceiptSize, setThermalReceiptSize] = useState('80mm')
  const [showSalesHistory, setShowSalesHistory] = useState(false)
  const [salesHistory, setSalesHistory] = useState([])
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false)
  const [loadingReceiptId, setLoadingReceiptId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [savingSale, setSavingSale] = useState(false)
  const [scanningCode, setScanningCode] = useState(false)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [offlineSales, setOfflineSales] = useState([])
  const [syncingOffline, setSyncingOffline] = useState(false)
  const codeInputRef = useRef(null)

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)
    setError('')

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await getCachedPosData()
        setProducts(cached?.products || [])
        return
      }

      const response = await api.get('/products')
      const nextProducts = getProductsFromResponse(response.data)
      setProducts(nextProducts)
    } catch (err) {
      const cached = await getCachedPosData()
      if (cached?.products?.length) {
        setProducts(cached.products)
        setMessage(t('Loaded cached products for Offline POS Lite.'))
      } else {
        setError(getApiMessage(err, 'Failed to load products'))
      }
    } finally {
      setLoadingProducts(false)
    }
  }, [])

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true)

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await getCachedPosData()
        setCustomers(cached?.customers || [])
        return
      }

      const response = await api.get('/credits/customers')
      setCustomers(response.data.customers || [])
    } catch (err) {
      const cached = await getCachedPosData()
      if (cached?.customers) {
        setCustomers(cached.customers)
      } else if (user.role === 'owner') {
        setError(getApiMessage(err, 'Failed to load customers'))
      }
    } finally {
      setLoadingCustomers(false)
    }
  }, [user.role])

  const openSalesHistory = async () => {
    if (!isOnline) {
      setError(t('Sales history is unavailable while offline.'))
      return
    }

    setShowSalesHistory(true)
    setLoadingSalesHistory(true)
    setError('')

    try {
      const response = await api.get('/sales')
      setSalesHistory((response.data.sales || []).slice(0, 50))
    } catch (err) {
      setShowSalesHistory(false)
      setError(getApiMessage(err, 'Failed to load sales history'))
    } finally {
      setLoadingSalesHistory(false)
    }
  }

  const loadReceiptForReprint = async (saleId) => {
    setLoadingReceiptId(saleId)
    setError('')

    try {
      const response = await api.get(`/sales/${saleId}`)
      setReceipt(response.data.receipt || null)
      setShowSalesHistory(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load receipt'))
    } finally {
      setLoadingReceiptId(null)
    }
  }

  useEffect(() => {
    loadProducts()
    loadCustomers()
  }, [loadProducts, loadCustomers])

  const refreshOfflineSales = useCallback(async () => {
    setOfflineSales(await getOfflineSales())
  }, [])

  const syncOfflineSales = useCallback(async () => {
    if (!isOnline || isTokenExpired()) return

    setSyncingOffline(true)
    setError('')

    try {
      const results = await syncPendingOfflineSales(api)
      await refreshOfflineSales()
      if (results.some((result) => result.sync_status === 'synced')) {
        setMessage(t('Offline sales synced successfully.'))
        notifyDashboardChanged()
        await loadProducts()
      }
      const failed = results.find((result) => result.sync_status === 'failed')
      if (failed) {
        const failureMessage = failed.message || 'Please retry.'
        setError(failureMessage.startsWith('Sync failed') ? failureMessage : `Sync failed: ${failureMessage}`)
      }
    } catch (err) {
      setError(getApiMessage(err, 'Failed to sync offline sales'))
      await refreshOfflineSales()
    } finally {
      setSyncingOffline(false)
    }
  }, [isOnline, loadProducts, refreshOfflineSales])

  useEffect(() => {
    refreshOfflineSales()
  }, [refreshOfflineSales])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (isOnline) {
      syncOfflineSales()
    }
  }, [isOnline, syncOfflineSales])

  useEffect(() => {
    if (!isOnline && paymentType !== 'cash') {
      setPaymentType('cash')
    }
  }, [isOnline, paymentType])

  useEffect(() => {
    if (!isOnline) return

    cachePosData({
      products,
      customers,
      settings: getStoredSettings(),
      user,
      shop: shopSession?.shop || null,
    }).catch(() => {})
  }, [products, customers, isOnline, user, shopSession?.shop])

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

  useEffect(() => {
    if (receipt) {
      setThermalReceiptSize(getReceiptDetails(receipt).defaultReceiptSize)
    }
  }, [receipt])

  const categories = useMemo(() => {
    const uniqueCategories = new Set(
      products.map((product) => product.category).filter(Boolean),
    )

    return [...uniqueCategories].sort((a, b) => a.localeCompare(b))
  }, [products])

  const quickProducts = useMemo(() => products.slice(0, 6), [products])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'all' || product.category === selectedCategory
      const matchesSearch =
        !term ||
        `${product.product_name} ${product.product_code || ''} ${product.barcode || ''} ${
          product.category || ''
        } ${product.unit || ''}`
          .toLowerCase()
          .includes(term)

      return matchesCategory && matchesSearch
    })
  }, [products, search, selectedCategory])

  const cartTotals = useMemo(() => {
    const billDiscount = Math.max(0, Number(discountAmount || 0))
    const billTaxPercentage = Math.max(0, Number(taxPercentage || 0))
    const baseItems = Object.values(cart).map((item) => {
      const quantity = Number(item.quantity || 0)
      const unitPrice = Number(item.selling_price || 0)
      const grossLineTotal = roundMoney(unitPrice * quantity)
      const discountType = item.item_discount_type || 'fixed'
      const discountValue = Math.max(0, Number(item.item_discount || 0))
      const itemDiscountAmount = roundMoney(
        discountType === 'percentage'
          ? (grossLineTotal * discountValue) / 100
          : discountValue,
      )
      const lineTotalBeforeTax = roundMoney(grossLineTotal - itemDiscountAmount)

      return {
        ...item,
        quantity,
        unit_price: unitPrice,
        item_discount: item.item_discount ?? '',
        item_discount_type: discountType,
        gross_line_total: grossLineTotal,
        item_discount_amount: itemDiscountAmount,
        line_total_before_tax: lineTotalBeforeTax,
        tax_percentage: billTaxPercentage,
        tax_amount: 0,
        line_total: lineTotalBeforeTax,
        subtotal: lineTotalBeforeTax,
        item_discount_invalid: itemDiscountAmount > grossLineTotal,
      }
    })
    const subtotalValue = roundMoney(
      baseItems.reduce((sum, item) => sum + item.gross_line_total, 0),
    )
    const itemDiscountTotalValue = roundMoney(
      baseItems.reduce((sum, item) => sum + item.item_discount_amount, 0),
    )
    const afterItemDiscount = roundMoney(subtotalValue - itemDiscountTotalValue)
    const totalBeforeTaxValue = roundMoney(afterItemDiscount - billDiscount)
    const taxAmountValue = roundMoney(Math.max(0, totalBeforeTaxValue) * billTaxPercentage / 100)
    const taxableLineTotal = baseItems.reduce(
      (sum, item) => sum + Math.max(0, item.line_total_before_tax),
      0,
    )
    let allocatedTax = 0
    const itemsWithTax = baseItems.map((item, index) => {
      const isLast = index === baseItems.length - 1
      const share = taxableLineTotal === 0 ? 0 : Math.max(0, item.line_total_before_tax) / taxableLineTotal
      const lineTax = isLast
        ? roundMoney(taxAmountValue - allocatedTax)
        : roundMoney(taxAmountValue * share)
      allocatedTax = roundMoney(allocatedTax + lineTax)

      return {
        ...item,
        tax_amount: lineTax,
        line_total: roundMoney(item.line_total_before_tax + lineTax),
        subtotal: roundMoney(item.line_total_before_tax + lineTax),
      }
    })

    return {
      items: itemsWithTax,
      subtotal: subtotalValue,
      itemDiscountTotal: itemDiscountTotalValue,
      billDiscount,
      totalBeforeTax: Math.max(0, totalBeforeTaxValue),
      taxPercentage: billTaxPercentage,
      taxAmount: taxAmountValue,
      total: roundMoney(Math.max(0, totalBeforeTaxValue) + taxAmountValue),
      billDiscountInvalid: billDiscount > afterItemDiscount,
      itemDiscountInvalid: baseItems.some((item) => item.item_discount_invalid),
    }
  }, [cart, discountAmount, taxPercentage])

  const cartItems = cartTotals.items
  const subtotal = cartTotals.subtotal
  const itemDiscountTotal = cartTotals.itemDiscountTotal
  const discount = cartTotals.billDiscount
  const totalBeforeTax = cartTotals.totalBeforeTax
  const tax = cartTotals.taxAmount
  const total = cartTotals.total
  const paid = Math.max(0, Number(paidAmount || 0))
  const balance = paid - total
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const discountInvalid = cartTotals.billDiscountInvalid
  const itemDiscountInvalid = cartTotals.itemDiscountInvalid
  const taxInvalid = Number(taxPercentage || 0) < 0
  const paidRequired = paymentType !== 'credit'
  const isCardPayment = paymentType === 'card'
  const needsReference = ['card', 'qr', 'bank_transfer'].includes(paymentType)
  const requiresReference = ['qr', 'bank_transfer'].includes(paymentType)
  const paidInvalid = paidRequired && paidAmount === ''
  const selectedCustomer = customers.find(
    (customer) => Number(customer.id) === Number(selectedCustomerId),
  )
  const creditBalance = Math.max(total - paid, 0)
  const saleBalance = paymentType === 'credit' ? creditBalance : balance
  const isOffline = !isOnline
  const pendingOfflineCount = offlineSales.filter((sale) =>
    ['pending', 'syncing', 'failed'].includes(sale.sync_status),
  ).length

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

    if (isOffline) {
      setError(t('Customer creation is disabled while offline.'))
      return
    }

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
        [product.id]: current
          ? { ...current, quantity: nextQuantity }
          : { ...product, quantity: nextQuantity, item_discount: '', item_discount_type: 'fixed' },
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
      [product.id]: currentCart[product.id]
        ? {
            ...currentCart[product.id],
            quantity: currentCart[product.id].quantity + 1,
          }
        : { ...product, quantity: 1, item_discount: '', item_discount_type: 'fixed' },
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
      if (isOffline) {
        const normalizedCode = code.toLowerCase()
        const product = products.find(
          (item) =>
            String(item.product_code || '').toLowerCase() === normalizedCode ||
            String(item.barcode || '').toLowerCase() === normalizedCode,
        )

        if (!product) {
          setError(t('Product not found in offline cache'))
          codeInputRef.current?.focus()
          return
        }

        addScannedProductToCart(product)
        return
      }

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

  const updateCartItem = (productId, changes) => {
    setCart((currentCart) => {
      const item = currentCart[productId]
      if (!item) return currentCart

      return {
        ...currentCart,
        [productId]: {
          ...item,
          ...changes,
        },
      }
    })
  }

  const clearCart = () => {
    setCart({})
    setMessage('')
    setError('')
    setMobileCartOpen(false)
  }

  const completeOfflineSale = async () => {
    if (isTokenExpired()) {
      setError(t('Session expired. Please login again before creating offline sales.'))
      return
    }

    if (paymentType !== 'cash') {
      setError(t('Only cash payment is available while offline.'))
      return
    }

    const createdAt = new Date()
    const localOfflineId = createLocalOfflineId()
    const temporaryInvoiceNo = createOfflineInvoiceNo(createdAt)
    const settings = getStoredSettings()
    const cashierName = user.name || user.username || (user.role === 'owner' ? 'Owner' : 'Cashier')
    const offlineItems = cartItems.map((item) => ({
      product_id: item.id,
      product_name: item.product_name,
      unit: item.unit || null,
      quantity: item.quantity,
      selling_price: Number(item.selling_price || 0),
      unit_price: Number(item.selling_price || 0),
      item_discount: Number(item.item_discount || 0),
      item_discount_type: item.item_discount_type || 'fixed',
      tax_percentage: cartTotals.taxPercentage,
      tax_amount: item.tax_amount,
      line_total_before_tax: item.line_total_before_tax,
      line_total: item.line_total,
      subtotal: item.subtotal,
    }))

    const offlineSale = {
      local_offline_id: localOfflineId,
      temporary_invoice_no: temporaryInvoiceNo,
      invoice_no: temporaryInvoiceNo,
      shop_id: user.shop_id,
      user_id: user.id,
      cashier_name: cashierName,
      billed_by: cashierName,
      customer_id: selectedCustomer ? Number(selectedCustomer.id) : null,
      customer_name: selectedCustomer?.customer_name || null,
      customer_phone: selectedCustomer?.phone || null,
      customer_address: selectedCustomer?.address || null,
      items: offlineItems,
      subtotal,
      item_discount_total: itemDiscountTotal,
      bill_discount: discount,
      discount_amount: itemDiscountTotal + discount,
      tax_percentage: cartTotals.taxPercentage,
      tax_amount: tax,
      total_before_tax: totalBeforeTax,
      total_amount: total,
      final_total: total,
      paid_amount: paid,
      balance_amount: balance,
      payment_method: 'cash',
      payment_type: 'cash',
      created_at: createdAt.toISOString(),
      sync_status: 'pending',
      offline_pending: true,
      shop_name: settings.shop_name || shopSession?.shop?.shop_name || 'ShopMate LK',
      shop_phone: settings.phone || '',
      shop_email: settings.email || '',
      shop_address: settings.address || '',
      receipt_footer: settings.receipt_footer || 'Thank you for shopping with us.',
      currency: settings.currency || 'LKR',
      default_receipt_size: settings.default_receipt_size || '80mm',
      logo_url: settings.logo_url || '',
    }

    await saveOfflineSale(offlineSale)

    const nextProducts = products.map((product) => {
      const soldItem = cartItems.find((item) => Number(item.id) === Number(product.id))
      if (!soldItem) return product

      return {
        ...product,
        stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - soldItem.quantity),
      }
    })

    setProducts(nextProducts)
    await cachePosData({
      products: nextProducts,
      customers,
      settings,
      user,
      shop: shopSession?.shop || null,
    })
    await refreshOfflineSales()

    setReceipt(offlineSale)
    setCart({})
    setMobileCartOpen(false)
    setSelectedCustomerId('')
    setDiscountAmount('')
    setPaidAmount('')
    setPaymentDetails(initialPaymentDetails)
    setMessage(t('Offline cash sale saved. It will sync when internet returns.'))
  }

  const completeSale = async () => {
    setMessage('')
    setError('')

    if (cartItems.length === 0) {
      setError('Add products to cart first')
      return
    }

    if (discountInvalid) {
      setError('Bill discount cannot be greater than total after item discounts')
      return
    }

    if (itemDiscountInvalid) {
      setError('Item discount cannot be greater than item total')
      return
    }

    if (taxInvalid) {
      setError('Tax percentage cannot be negative')
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
      isCardPayment &&
      !/^\d{4}$/.test(paymentDetails.card_last_four.trim())
    ) {
      setError(t('Card last 4 digits are required and must contain exactly 4 digits.'))
      return
    }

    if (requiresReference && !paymentDetails.payment_reference.trim()) {
      setError(t('Transaction reference number is required for QR and bank transfer payments.'))
      return
    }

    if (isOffline) {
      await completeOfflineSale()
      return
    }

    setSavingSale(true)

    try {
      const response = await api.post('/sales', {
        customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
        payment_type: paymentType,
        bill_discount: discount,
        discount_amount: discount,
        tax_percentage: cartTotals.taxPercentage,
        paid_amount: paymentType === 'credit' ? paid : Number(paidAmount),
        payment_reference: paymentDetails.payment_reference.trim() || null,
        approval_code: paymentDetails.approval_code.trim() || null,
        card_last_four: paymentDetails.card_last_four.trim() || null,
        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
          item_discount: Number(item.item_discount || 0),
          item_discount_type: item.item_discount_type || 'fixed',
        })),
      })

      const saleReceipt = response.data.receipt || {}
      const salePaymentStatus = response.data.sale?.payment_status || 'verified'
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
      setMobileCartOpen(false)
      setSelectedCustomerId('')
      setDiscountAmount('')
      setPaidAmount(paymentType === 'credit' ? '0' : '')
      setPaymentDetails(initialPaymentDetails)
      setMessage(
        paymentType === 'credit'
          ? 'Credit sale created and added to Credit Book.'
          : salePaymentStatus === 'pending'
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
          <h2>{t('products')}</h2>
          <div className="table-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={openSalesHistory}
              disabled={!isOnline}
            >
              {t('Sales History')}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={syncOfflineSales}
              disabled={syncingOffline || !isOnline || pendingOfflineCount === 0}
            >
              {syncingOffline ? t('Syncing...') : t('Sync Offline Sales')}
            </button>
            <button type="button" className="ghost-button" onClick={loadProducts} disabled={loadingProducts}>
              {loadingProducts ? t('refreshing') : t('refresh')}
            </button>
          </div>
        </div>

        <section className="offline-sync-panel">
          <div className="section-heading">
            <h3>{t('Offline Sales / Pending Sync')}</h3>
            <span className="status pending">{pendingOfflineCount} {t('pending')}</span>
          </div>
          {offlineSales.length > 0 ? (
            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('Invoice')}</th>
                    <th>{t('total')}</th>
                    <th>{t('Date')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Message')}</th>
                  </tr>
                </thead>
                <tbody>
                  {offlineSales.slice(0, 5).map((sale) => (
                    <tr key={sale.local_offline_id}>
                      <td>{sale.real_invoice_no || sale.temporary_invoice_no}</td>
                      <td>{formatMoney(sale.total_amount, sale.currency)}</td>
                      <td>{formatDateTime(sale.created_at)}</td>
                      <td>
                        <span className={`status ${sale.sync_status}`}>
                          {sale.sync_status}
                        </span>
                      </td>
                      <td>{sale.sync_error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{t('No offline sales pending sync.')}</p>
          )}
        </section>

        <section className="barcode-scanner">
          <label>
            {t('Barcode')} / {t('Product Code / SKU')}
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
                {scanningCode ? t('Adding...') : t('Add by Code')}
              </button>
            </div>
          </label>
        </section>

        <section className="customer-picker">
          <div className="section-heading">
            <h2>{t('Customer')}</h2>
            {user.role === 'owner' && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowCustomerForm((current) => !current)}
                disabled={isOffline}
              >
                {showCustomerForm ? t('Close') : t('Add New Customer')}
              </button>
            )}
          </div>
          <div className="form-grid compact-form">
            <label>
              {t('Search')} {t('Customer')}
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search by name or phone"
              />
            </label>
            <label>
              {t('Customer')}
              <select
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.target.value)}
                disabled={loadingCustomers}
              >
                <option value="">{t('Walk-in customer')}</option>
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
              {t('Selected')}: {selectedCustomer.customer_name}
              {selectedCustomer.phone ? `, ${selectedCustomer.phone}` : ''}
              {selectedCustomer.address ? `, ${selectedCustomer.address}` : ''}
            </p>
          )}
          {isOffline && (
            <p className="muted">
              {t('Offline POS Lite uses cached customers. New customers and credit sales are disabled.')}
            </p>
          )}
          {showCustomerForm && (
            <form className="form-grid compact-form quick-customer-form" onSubmit={addCustomer}>
              <label>
                {t('Customer Name')}
                <input
                  value={customerForm.customer_name}
                  onChange={(event) =>
                    setCustomerForm({ ...customerForm, customer_name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                {t('Phone')}
                <input
                  value={customerForm.phone}
                  onChange={(event) =>
                    setCustomerForm({ ...customerForm, phone: event.target.value })
                  }
                />
              </label>
              <label className="full-width">
                {t('Address')}
                <input
                  value={customerForm.address}
                  onChange={(event) =>
                    setCustomerForm({ ...customerForm, address: event.target.value })
                  }
                />
              </label>
              <button type="submit" className="full-width" disabled={savingCustomer}>
                {savingCustomer ? t('Adding customer...') : t('Save Customer')}
              </button>
            </form>
          )}
        </section>

        <label className="search-field">
          {t('Search products')}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, code, barcode, or category"
          />
        </label>

        {categories.length > 0 && (
          <div className="pos-filter-strip" aria-label="Product categories">
            <button
              type="button"
              className={selectedCategory === 'all' ? 'active' : ''}
              onClick={() => setSelectedCategory('all')}
            >
              {t('All')}
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={selectedCategory === category ? 'active' : ''}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {quickProducts.length > 0 && (
          <section className="quick-products">
            <div className="section-heading">
              <h3>{t('Quick Picks')}</h3>
            </div>
            <div className="quick-product-strip">
              {quickProducts.map((product) => (
                <button type="button" key={product.id} onClick={() => addToCart(product)}>
                  <span>{product.product_name}</span>
                  <strong>{formatMoney(product.selling_price)}</strong>
                </button>
              ))}
            </div>
          </section>
        )}

        {loadingProducts ? (
          <div className="loading-panel">{t('Loading products...')}</div>
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
                  <div className="product-card-media">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" loading="lazy" />
                    ) : (
                      <span>{product.product_name?.slice(0, 1) || 'P'}</span>
                    )}
                  </div>
                  <div className="product-card-body">
                    <strong>{product.product_name}</strong>
                    <span>{formatMoney(product.selling_price)} / {product.unit || 'pcs'}</span>
                    <small>
                      {product.category || t('Uncategorized')} | {product.unit || 'pcs'}
                    </small>
                  </div>
                  {(product.product_code || product.barcode) && (
                    <small className="product-code-line">
                      {product.product_code ? `SKU ${product.product_code}` : ''}
                      {product.product_code && product.barcode ? ' | ' : ''}
                      {product.barcode ? `Barcode ${product.barcode}` : ''}
                    </small>
                  )}
                  <small className={lowStock ? 'stock-warning' : ''}>
                    {t('Stock')} {stock}
                    {lowStock ? ` - ${t('Low stock')}` : ''}
                  </small>
                  <span className="product-add-pill">{t('Add')}</span>
                </button>
              )
            })}
            {filteredProducts.length === 0 && <p className="muted">{t('No products match your search.')}</p>}
          </div>
        )}
      </section>

      <aside className={`panel cart-panel receipt-surface ${mobileCartOpen ? 'mobile-open' : ''}`}>
        <div className="section-heading">
          <h2>{t('Cart')}</h2>
          <div className="cart-heading-actions">
            {cartItems.length > 0 && (
              <button type="button" className="ghost-button clear-cart-button" onClick={clearCart}>
                {t('Clear cart')}
              </button>
            )}
            <span className="cart-count">{totalItems} {t('items')}</span>
          </div>
        </div>
        {error && <div className="alert">{error}</div>}
        {message && <div className="success">{message}</div>}

        <div className="mobile-cart-summary">
          <div>
            <span>{totalItems} {t('items')}</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setMobileCartOpen((current) => !current)}
          >
            {mobileCartOpen ? t('Hide Cart') : t('View Cart')}
          </button>
          <button type="button" onClick={completeSale} disabled={savingSale || cartItems.length === 0}>
            {savingSale ? t('Saving sale...') : t('Checkout')}
          </button>
        </div>

        <div className="mobile-cart-content">
          <div className="cart-list">
            {cartItems.map((item) => (
              <div className="cart-row pro-cart-row" key={item.id}>
                <div>
                  <strong>{item.product_name}</strong>
                  <span>
                    {formatMoney(item.selling_price)} x {formatQuantity(item)} = {formatMoney(item.subtotal)}
                  </span>
                  <small className="muted">{t('Available')} {t('Stock').toLowerCase()} {item.stock_quantity}</small>
                </div>
                <div className="quantity-control">
                  <button type="button" aria-label={t('Decrease quantity')} onClick={() => changeQuantity(item.id, -1)}>
                    -
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={item.stock_quantity}
                    value={item.quantity}
                    onChange={(event) => setQuantity(item.id, event.target.value)}
                  />
                  <button type="button" aria-label={t('Increase quantity')} onClick={() => changeQuantity(item.id, 1)}>
                    +
                  </button>
                </div>
                <div className="cart-discount-row">
                  <label>
                    {t('Item Discount')}
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={item.item_discount}
                      onChange={(event) =>
                        updateCartItem(item.id, { item_discount: event.target.value })
                      }
                      className={item.item_discount_invalid ? 'input-error' : ''}
                    />
                  </label>
                  <label>
                    {t('Discount Type')}
                    <select
                      value={item.item_discount_type}
                      onChange={(event) =>
                        updateCartItem(item.id, { item_discount_type: event.target.value })
                      }
                    >
                      <option value="fixed">{t('Fixed')}</option>
                      <option value="percentage">{t('Percentage')}</option>
                    </select>
                  </label>
                  <small className="muted">
                    {t('Line Before Tax')}: {formatMoney(item.line_total_before_tax)}
                  </small>
                </div>
                <button type="button" className="danger-button" onClick={() => removeFromCart(item.id)}>
                  {t('Remove')}
                </button>
              </div>
            ))}
            {cartItems.length === 0 && <p className="muted">{t('Cart is empty.')}</p>}
          </div>

          <section className="payment-box">
          <h3>{t('Payment')}</h3>
          {isOffline && (
            <div className="info-banner">
              {t('Offline POS Lite accepts Cash only. Card, QR, Bank Transfer, and Credit are disabled.')}
            </div>
          )}
          <div className="payment-method-buttons" role="group" aria-label={t('Payment Method')}>
            {paymentTypes.map((type) => (
              <button
                type="button"
                key={type.value}
                className={paymentType === type.value ? 'active' : 'ghost-button'}
                onClick={() => setPaymentType(type.value)}
                disabled={isOffline && type.value !== 'cash'}
              >
                {t(type.label)}
              </button>
            ))}
          </div>
          <div className="form-grid compact-form">
            <label>
              {t('paymentMethod')}
              <select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
                {paymentTypes.map((type) => (
                  <option key={type.value} value={type.value} disabled={isOffline && type.value !== 'cash'}>
                    {t(type.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Bill Discount')}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                className={discountInvalid ? 'input-error' : ''}
              />
            </label>
            <label>
              {t('Tax Percentage')}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={taxPercentage}
                onChange={(event) => setTaxPercentage(event.target.value)}
                className={taxInvalid ? 'input-error' : ''}
              />
            </label>
            <label className="full-width">
              {t('paidAmount')}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                required={paidRequired}
              />
            </label>
            {needsReference && (
              <label className={isCardPayment ? '' : 'full-width'}>
                {t('Transaction Reference No')}
                <input
                  value={paymentDetails.payment_reference}
                  onChange={(event) =>
                    setPaymentDetails({
                      ...paymentDetails,
                      payment_reference: event.target.value,
                    })
                  }
                  required={requiresReference}
                />
              </label>
            )}
            {isCardPayment && (
              <>
                <label>
                  {t('Approval Code')}
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
                  {t('Card Last 4 Digits')}
                  <input
                    inputMode="numeric"
                    maxLength="4"
                    pattern="[0-9]{4}"
                    value={paymentDetails.card_last_four}
                    onChange={(event) =>
                      setPaymentDetails({
                        ...paymentDetails,
                        card_last_four: event.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                    required
                  />
                </label>
              </>
            )}
          </div>
          </section>

          <section className="summary-box">
          <div>
            <span>{t('Subtotal')}</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          <div>
            <span>{t('Item Discounts')}</span>
            <strong>- {formatMoney(itemDiscountTotal)}</strong>
          </div>
          <div>
            <span>{t('Bill Discount')}</span>
            <strong>- {formatMoney(discount)}</strong>
          </div>
          <div>
            <span>{t('Total Before Tax')}</span>
            <strong>{formatMoney(totalBeforeTax)}</strong>
          </div>
          <div>
            <span>{t('Tax')} ({cartTotals.taxPercentage}%)</span>
            <strong>{formatMoney(tax)}</strong>
          </div>
          <div className="summary-total">
            <span>{t('Final Total')}</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <div>
            <span>{t('paid')}</span>
            <strong>{formatMoney(paid)}</strong>
          </div>
          <div className={balance < 0 ? 'balance-due' : 'balance-change'}>
            <span>
              {paymentType === 'credit'
                ? t('creditBalance')
                : balance < 0
                  ? t('balanceDue')
                  : t('change')}
            </span>
            <strong>{formatMoney(Math.abs(saleBalance))}</strong>
          </div>
          </section>

          <button className="checkout-button" type="button" onClick={completeSale} disabled={savingSale || cartItems.length === 0}>
            {savingSale ? t('Saving sale...') : t('Complete Sale')}
          </button>
        </div>
      </aside>

      {showSalesHistory && (
        <div className="modal-backdrop">
          <section className="receipt-modal history-modal">
            <div className="section-heading">
              <h2>{t('Sales History')}</h2>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowSalesHistory(false)}
              >
                {t('Close')}
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Invoice')}</th>
                    <th>{t('Date')}</th>
                    <th>{t('Customer')}</th>
                    <th>{t('total')}</th>
                    <th>{t('Payment Method')}</th>
                    <th>{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {salesHistory.map((sale) => (
                    <tr key={sale.id}>
                      <td>{sale.invoice_no || `SALE-${sale.id}`}</td>
                      <td>{formatDateTime(sale.created_at)}</td>
                      <td>{sale.customer_name || t('Walk-in customer')}</td>
                      <td>{formatCurrency(sale.total_amount, getShopSettings().currency || 'LKR')}</td>
                      <td>{sale.payment_type}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => loadReceiptForReprint(sale.id)}
                          disabled={loadingReceiptId === sale.id}
                        >
                          {loadingReceiptId === sale.id ? t('Loading...') : t('Reprint Receipt')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loadingSalesHistory && salesHistory.length === 0 && (
                    <tr>
                      <td colSpan="6">{t('No records found')}</td>
                    </tr>
                  )}
                  {loadingSalesHistory && (
                    <tr>
                      <td colSpan="6">{t('Loading...')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {receipt && (
        <div className="modal-backdrop">
          <section className="receipt-modal">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {receiptDetails.offlinePending ? t('OFFLINE SALE - Pending Sync') : t('receipt')}
                </p>
                <h2>{receiptDetails.invoiceNo}</h2>
              </div>
              <div className="receipt-actions no-print">
                <button type="button" onClick={() => generateInvoicePDF(receipt)}>
                  {t('downloadPdf')}
                </button>
                <button type="button" className="ghost-button" onClick={() => shareInvoiceWhatsApp(receipt)}>
                  {t('Share WhatsApp')}
                </button>
                <select
                  value={thermalReceiptSize}
                  onChange={(event) => setThermalReceiptSize(event.target.value)}
                  aria-label="Thermal receipt size"
                >
                  {receiptSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => thermalPrintReceipt(receipt, thermalReceiptSize)}
                >
                  {t('Thermal Print')}
                </button>
                <button type="button" className="ghost-button" onClick={() => printReceipt(receipt)}>
                  {t('print')}
                </button>
                <button type="button" className="ghost-button" onClick={() => setReceipt(null)}>
                  {t('Close')}
                </button>
              </div>
            </div>

            <div className="receipt-print-area">
              <div className="receipt-header">
                {receiptDetails.showLogo && receiptDetails.logoUrl && (
                  <img
                    className="receipt-logo"
                    src={receiptDetails.logoUrl}
                    alt=""
                  />
                )}
                <strong>{receiptDetails.shopName}</strong>
                {receiptDetails.shopAddress && <span>{receiptDetails.shopAddress}</span>}
                {receiptDetails.shopPhone && <span>{t('Phone')}: {receiptDetails.shopPhone}</span>}
                {receiptDetails.shopEmail && <span>{t('Email')}: {receiptDetails.shopEmail}</span>}
                <span>{formatDateTime(receiptDetails.createdAt)}</span>
                <span>{t('Invoice')}: {receiptDetails.invoiceNo}</span>
                <span>{t('Sale ID')}: {receiptDetails.saleId}</span>
                {receiptDetails.offlinePending && (
                  <strong>{t('OFFLINE SALE - Pending Sync')}</strong>
                )}
                {receiptDetails.showCashier && receiptDetails.billedBy && (
                  <span>{t('Billed by')}: {receiptDetails.billedBy}</span>
                )}
                <span>{t('paymentMethod')}: {receiptDetails.paymentType}</span>
                {receiptDetails.paymentReference && (
                  <span>{t('Reference')}: {receiptDetails.paymentReference}</span>
                )}
                {receiptDetails.paymentType === 'card' && receiptDetails.cardLastFour && (
                  <span>{t('Card Last 4')}: {receiptDetails.cardLastFour}</span>
                )}
              </div>

              {receiptDetails.customerName && (
                <div className="receipt-customer">
                  <strong>{t('Customer')}</strong>
                  <span>{t('Name')}: {receiptDetails.customerName}</span>
                  {receiptDetails.customerPhone && <span>{t('Phone')}: {receiptDetails.customerPhone}</span>}
                  {receiptDetails.customerAddress && (
                    <span>{t('Address')}: {receiptDetails.customerAddress}</span>
                  )}
                </div>
              )}

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>{t('Product')}</th>
                    <th>{t('Quantity')}</th>
                    <th>{t('Price')}</th>
                    {receiptDetails.showDiscounts && <th>{t('Discount')}</th>}
                    <th>{t('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiptDetails.items || []).map((item, index) => (
                    <tr key={item.product_id || index}>
                      <td>{item.product_name}</td>
                      <td>{formatQuantity(item)}</td>
                      <td>{formatCurrency(item.selling_price, receiptDetails.currency)}</td>
                      {receiptDetails.showDiscounts && (
                        <td>{formatCurrency(item.item_discount, receiptDetails.currency)}</td>
                      )}
                      <td>{formatCurrency(item.subtotal, receiptDetails.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div>
                  <span>{t('Subtotal')}</span>
                  <strong>{formatCurrency(receiptDetails.subtotal, receiptDetails.currency)}</strong>
                </div>
                {receiptDetails.showDiscounts && (
                  <>
                    <div>
                      <span>{t('Item Discount Total')}</span>
                      <strong>{formatCurrency(receiptDetails.itemDiscountTotal, receiptDetails.currency)}</strong>
                    </div>
                    <div>
                      <span>{t('Bill Discount')}</span>
                      <strong>{formatCurrency(receiptDetails.billDiscount, receiptDetails.currency)}</strong>
                    </div>
                  </>
                )}
                {receiptDetails.showTax && (
                  <>
                    <div>
                      <span>{t('Total Before Tax')}</span>
                      <strong>{formatCurrency(receiptDetails.totalBeforeTax, receiptDetails.currency)}</strong>
                    </div>
                    <div>
                      <span>{t('Tax Percentage')}</span>
                      <strong>{receiptDetails.taxPercentage}%</strong>
                    </div>
                    <div>
                      <span>{t('Tax Amount')}</span>
                      <strong>{formatCurrency(receiptDetails.taxAmount, receiptDetails.currency)}</strong>
                    </div>
                  </>
                )}
                <div>
                  <span>{t('Final Total')}</span>
                  <strong>{formatCurrency(receiptDetails.finalTotal, receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>{t('paid')}</span>
                  <strong>{formatCurrency(receiptDetails.paidAmount, receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>{receiptDetails.balanceLabel}</span>
                  <strong>{formatCurrency(Math.abs(receiptDetails.balanceAmount), receiptDetails.currency)}</strong>
                </div>
                <div>
                  <span>{t('paymentMethod')}</span>
                  <strong>{receiptDetails.paymentType}</strong>
                </div>
                {receiptDetails.showCashier && receiptDetails.billedBy && (
                  <div>
                    <span>{t('Billed by')}</span>
                    <strong>{receiptDetails.billedBy}</strong>
                  </div>
                )}
                {receiptDetails.paymentReference && (
                  <div>
                    <span>{t('Reference')}</span>
                    <strong>{receiptDetails.paymentReference}</strong>
                  </div>
                )}
                {receiptDetails.paymentType === 'card' && receiptDetails.cardLastFour && (
                  <div>
                    <span>{t('Card Last 4')}</span>
                    <strong>{receiptDetails.cardLastFour}</strong>
                  </div>
                )}
              </div>
              <footer className="receipt-footer-branding">
                <span>{receiptDetails.receiptFooter}</span>
                <strong>{t(receiptBrandingLine)}</strong>
                <small>{t(receiptBrandingSubline)}</small>
              </footer>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default POS
