import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const getInitialForm = (payment) => ({
  payment_reference: payment.payment_reference || '',
  approval_code: '',
  card_last_four: '',
})

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null

  if (!date || Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString()
}

function PaymentVerification() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [payments, setPayments] = useState([])
  const [forms, setForms] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadPayments = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const response = await api.get('/payments/pending')
      const nextPayments = response.data.payments || []

      setPayments(nextPayments)
      setForms((currentForms) =>
        nextPayments.reduce((nextForms, payment) => {
          nextForms[payment.sale_id] = currentForms[payment.sale_id] || getInitialForm(payment)
          return nextForms
        }, {}),
      )
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load pending payments'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const updateField = (saleId, field, value) => {
    setForms((current) => ({
      ...current,
      [saleId]: {
        ...(current[saleId] || {}),
        [field]: field === 'card_last_four' ? value.replace(/\D/g, '').slice(0, 4) : value,
      },
    }))
  }

  const verifyPayment = async (payment) => {
    const form = forms[payment.sale_id] || getInitialForm(payment)

    if (form.card_last_four && !/^\d{4}$/.test(form.card_last_four.trim())) {
      setError('Card last 4 digits must contain exactly 4 digits')
      return
    }

    setSavingId(payment.sale_id)
    setError('')
    setMessage('')

    try {
      await api.put(`/payments/${payment.sale_id}/verify`, {
        payment_reference: form.payment_reference.trim() || null,
        approval_code: form.approval_code.trim() || null,
        card_last_four: form.card_last_four.trim() || null,
      })

      setPayments((current) => current.filter((item) => item.sale_id !== payment.sale_id))
      setMessage(`${payment.invoice_no} verified successfully`)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to verify payment'))
    } finally {
      setSavingId(null)
    }
  }

  const failPayment = async (payment) => {
    setSavingId(payment.sale_id)
    setError('')
    setMessage('')

    try {
      await api.put(`/payments/${payment.sale_id}/fail`)
      setPayments((current) => current.filter((item) => item.sale_id !== payment.sale_id))
      setMessage(`${payment.invoice_no} marked as failed`)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to mark payment as failed'))
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">Loading pending payments...</div>
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('paymentVerification')}</h2>
          <button type="button" className="ghost-button" onClick={() => loadPayments(false)}>
            {t('refresh')}
          </button>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table className="payment-verification-table">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Amount</th>
                <th>Payment Type</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Approval Code</th>
                <th>Card Last 4</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const form = forms[payment.sale_id] || getInitialForm(payment)
                const saving = savingId === payment.sale_id

                return (
                  <tr key={payment.sale_id}>
                    <td>
                      <strong>{payment.invoice_no}</strong>
                    </td>
                    <td>{formatMoney(payment.total_amount)}</td>
                    <td>{payment.payment_type}</td>
                    <td>{payment.customer_name || 'Walk-in customer'}</td>
                    <td>
                      <span className={`status ${payment.payment_status}`}>
                        {payment.payment_status}
                      </span>
                    </td>
                    <td>
                      <input
                        value={form.payment_reference}
                        onChange={(event) =>
                          updateField(payment.sale_id, 'payment_reference', event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={form.approval_code}
                        onChange={(event) =>
                          updateField(payment.sale_id, 'approval_code', event.target.value)
                        }
                        disabled={payment.payment_type !== 'card'}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="numeric"
                        maxLength="4"
                        value={form.card_last_four}
                        onChange={(event) =>
                          updateField(payment.sale_id, 'card_last_four', event.target.value)
                        }
                        disabled={payment.payment_type !== 'card'}
                      />
                    </td>
                    <td>{formatDateTime(payment.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          onClick={() => verifyPayment(payment)}
                          disabled={saving}
                        >
                          {saving ? 'Saving...' : 'Verify'}
                        </button>
                        {user.role === 'owner' && (
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => failPayment(payment)}
                            disabled={saving}
                          >
                            Failed
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {payments.length === 0 && (
                <tr>
                  <td colSpan="10" className="empty-cell">
                    No pending payments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

export default PaymentVerification
