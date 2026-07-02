import { useEffect, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'

function CreditBook() {
  const [customers, setCustomers] = useState([])
  const [credits, setCredits] = useState([])
  const [summary, setSummary] = useState({})
  const [customerForm, setCustomerForm] = useState({
    customer_name: '',
    phone: '',
    address: '',
  })
  const [creditForm, setCreditForm] = useState({ customer_id: '', credit_amount: '' })
  const [payments, setPayments] = useState({})
  const [customerHistory, setCustomerHistory] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [savingCredit, setSavingCredit] = useState(false)
  const [payingId, setPayingId] = useState(null)
  const [loadingHistoryId, setLoadingHistoryId] = useState(null)

  const loadCreditData = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const [customerResponse, creditResponse, summaryResponse] = await Promise.all([
        api.get('/credits/customers'),
        api.get('/credits'),
        api.get('/credits/summary'),
      ])

      setCustomers(customerResponse.data.customers || [])
      setCredits(creditResponse.data.credits || [])
      setSummary(summaryResponse.data.summary || {})
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load credit book'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCreditData()
  }, [])

  const addCustomer = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSavingCustomer(true)

    try {
      await api.post('/credits/customers', customerForm)
      setCustomerForm({ customer_name: '', phone: '', address: '' })
      setMessage('Customer added successfully')
      notifyDashboardChanged()
      await loadCreditData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to add customer'))
    } finally {
      setSavingCustomer(false)
    }
  }

  const addCredit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSavingCredit(true)

    try {
      await api.post('/credits', {
        customer_id: Number(creditForm.customer_id),
        credit_amount: Number(creditForm.credit_amount),
      })
      setCreditForm({ customer_id: '', credit_amount: '' })
      setMessage('Credit record added successfully')
      notifyDashboardChanged()
      await loadCreditData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to add credit'))
    } finally {
      setSavingCredit(false)
    }
  }

  const payCredit = async (credit) => {
    setError('')
    setMessage('')

    const amount = Number(payments[credit.id])
    const balance = Number(credit.balance_amount)

    if (!amount || amount <= 0) {
      setError('Enter a valid payment amount')
      return
    }

    if (amount > balance) {
      setError(`Payment cannot exceed the balance of ${formatMoney(balance)}`)
      return
    }

    setPayingId(credit.id)

    try {
      await api.put(`/credits/${credit.id}/pay`, {
        paid_amount: amount,
      })
      setPayments({ ...payments, [credit.id]: '' })
      setMessage('Payment recorded successfully')
      notifyDashboardChanged()
      await loadCreditData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to record payment'))
    } finally {
      setPayingId(null)
    }
  }

  const viewCustomerHistory = async (customer) => {
    setError('')
    setMessage('')
    setLoadingHistoryId(customer.id)

    try {
      const response = await api.get(`/credits/customers/${customer.id}/history`)
      setCustomerHistory(response.data)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load customer history'))
    } finally {
      setLoadingHistoryId(null)
    }
  }

  return (
    <section className="page-stack">
      {loading ? (
        <div className="panel loading-panel">Loading credit book...</div>
      ) : (
        <>
          <div className="metric-grid compact-metrics">
            <article className="metric-card">
              <span>Total Credit</span>
              <strong>{formatMoney(summary.total_credit_amount)}</strong>
            </article>
            <article className="metric-card">
              <span>Total Paid</span>
              <strong>{formatMoney(summary.total_paid_amount)}</strong>
            </article>
            <article className="metric-card">
              <span>Total Balance</span>
              <strong>{formatMoney(summary.total_balance_amount)}</strong>
            </article>
            <article className="metric-card">
              <span>Open Records</span>
              <strong>{summary.unpaid_or_partial_count || 0}</strong>
            </article>
          </div>

          {error && <div className="alert">{error}</div>}
          {message && <div className="success">{message}</div>}

          <section className="page-grid">
            <section className="panel">
              <div className="section-heading">
                <h2>Add Customer</h2>
              </div>
              <form onSubmit={addCustomer} className="form-stack">
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
                <label>
                  Address
                  <input
                    value={customerForm.address}
                    onChange={(event) =>
                      setCustomerForm({ ...customerForm, address: event.target.value })
                    }
                  />
                </label>
                <button type="submit" disabled={savingCustomer}>
                  {savingCustomer ? 'Adding customer...' : 'Add Customer'}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>Add Credit</h2>
              </div>
              <form onSubmit={addCredit} className="form-stack">
                <label>
                  Customer
                  <select
                    value={creditForm.customer_id}
                    onChange={(event) =>
                      setCreditForm({ ...creditForm, customer_id: event.target.value })
                    }
                    required
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.customer_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Credit Amount
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={creditForm.credit_amount}
                    onChange={(event) =>
                      setCreditForm({ ...creditForm, credit_amount: event.target.value })
                    }
                    required
                  />
                </label>
                <button type="submit" disabled={savingCredit || customers.length === 0}>
                  {savingCredit ? 'Adding credit...' : 'Add Credit'}
                </button>
              </form>
            </section>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Customers</h2>
              <button type="button" className="ghost-button" onClick={() => loadCreditData()}>
                Refresh
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.customer_name}</td>
                      <td>{customer.phone || '-'}</td>
                      <td>{customer.address || '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => viewCustomerHistory(customer)}
                          disabled={loadingHistoryId === customer.id}
                        >
                          {loadingHistoryId === customer.id ? 'Loading...' : 'View History'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {customers.length === 0 && (
                    <tr>
                      <td colSpan="4" className="empty-cell">
                        No customers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Credit Records</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Credit</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((credit) => {
                    const paymentAmount = Number(payments[credit.id] || 0)
                    const balance = Number(credit.balance_amount)
                    const invalidPayment = paymentAmount <= 0 || paymentAmount > balance

                    return (
                      <tr key={credit.id}>
                        <td>{credit.customer_name}</td>
                        <td>{credit.phone || '-'}</td>
                        <td>{formatMoney(credit.credit_amount)}</td>
                        <td>{formatMoney(credit.paid_amount)}</td>
                        <td>{formatMoney(credit.balance_amount)}</td>
                        <td>
                          <span className={`status ${credit.status}`}>{credit.status}</span>
                        </td>
                        <td>
                          {credit.status === 'paid' ? (
                            <span className="muted">Paid</span>
                          ) : (
                            <div className="inline-action">
                              <input
                                type="number"
                                min="0"
                                max={balance}
                                step="0.01"
                                value={payments[credit.id] || ''}
                                onChange={(event) =>
                                  setPayments({ ...payments, [credit.id]: event.target.value })
                                }
                                placeholder="Amount"
                              />
                              <button
                                type="button"
                                onClick={() => payCredit(credit)}
                                disabled={invalidPayment || payingId === credit.id}
                              >
                                {payingId === credit.id ? 'Paying...' : 'Pay'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {credits.length === 0 && (
                    <tr>
                      <td colSpan="7" className="empty-cell">
                        No credit records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {customerHistory && (
            <div className="modal-backdrop">
              <section className="receipt-modal history-modal">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Customer History</p>
                    <h2>{customerHistory.customer?.customer_name}</h2>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setCustomerHistory(null)}
                  >
                    Close
                  </button>
                </div>

                <div className="summary-box">
                  <div>
                    <span>Phone</span>
                    <strong>{customerHistory.customer?.phone || '-'}</strong>
                  </div>
                  <div>
                    <span>Address</span>
                    <strong>{customerHistory.customer?.address || '-'}</strong>
                  </div>
                  <div>
                    <span>Total Purchases</span>
                    <strong>{formatMoney(customerHistory.summary?.total_purchases)}</strong>
                  </div>
                  <div>
                    <span>Total Credit</span>
                    <strong>{formatMoney(customerHistory.summary?.total_credit)}</strong>
                  </div>
                  <div>
                    <span>Total Paid</span>
                    <strong>{formatMoney(customerHistory.summary?.total_paid)}</strong>
                  </div>
                  <div>
                    <span>Total Balance</span>
                    <strong>{formatMoney(customerHistory.summary?.total_balance)}</strong>
                  </div>
                </div>

                <section className="history-section">
                  <h3>Sales History</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Total</th>
                          <th>Paid</th>
                          <th>Balance</th>
                          <th>Payment</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(customerHistory.sales || []).map((sale) => (
                          <tr key={sale.id}>
                            <td>{sale.invoice_no || sale.id}</td>
                            <td>{formatMoney(sale.total_amount)}</td>
                            <td>{formatMoney(sale.paid_amount)}</td>
                            <td>{formatMoney(Math.abs(Number(sale.balance_amount || 0)))}</td>
                            <td>{sale.payment_type}</td>
                            <td>{String(sale.created_at).slice(0, 10)}</td>
                          </tr>
                        ))}
                        {(customerHistory.sales || []).length === 0 && (
                          <tr>
                            <td colSpan="6" className="empty-cell">
                              No sales found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="history-section">
                  <h3>Credit Records</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Sale</th>
                          <th>Credit</th>
                          <th>Paid</th>
                          <th>Balance</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(customerHistory.credits || []).map((credit) => (
                          <tr key={credit.id}>
                            <td>{credit.sale_id || '-'}</td>
                            <td>{formatMoney(credit.credit_amount)}</td>
                            <td>{formatMoney(credit.paid_amount)}</td>
                            <td>{formatMoney(credit.balance_amount)}</td>
                            <td>
                              <span className={`status ${credit.status}`}>{credit.status}</span>
                            </td>
                            <td>{String(credit.created_at).slice(0, 10)}</td>
                          </tr>
                        ))}
                        {(customerHistory.credits || []).length === 0 && (
                          <tr>
                            <td colSpan="6" className="empty-cell">
                              No credit records found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default CreditBook
