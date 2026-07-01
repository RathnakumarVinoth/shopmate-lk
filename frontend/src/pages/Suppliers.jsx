import { useEffect, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'

const initialSupplierForm = {
  supplier_name: '',
  phone: '',
  address: '',
}

const initialTransactionForm = {
  supplier_id: '',
  description: '',
  total_amount: '',
  paid_amount: '',
}

function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState({})
  const [supplierForm, setSupplierForm] = useState(initialSupplierForm)
  const [transactionForm, setTransactionForm] = useState(initialTransactionForm)
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [payments, setPayments] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [savingTransaction, setSavingTransaction] = useState(false)
  const [payingId, setPayingId] = useState(null)
  const [deletingSupplierId, setDeletingSupplierId] = useState(null)

  const loadSupplierData = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const [supplierResponse, transactionResponse, summaryResponse] = await Promise.all([
        api.get('/suppliers'),
        api.get('/suppliers/transactions'),
        api.get('/suppliers/summary'),
      ])

      setSuppliers(supplierResponse.data.suppliers || [])
      setTransactions(transactionResponse.data.transactions || [])
      setSummary(summaryResponse.data.summary || {})
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load suppliers'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSupplierData()
  }, [])

  const resetSupplierForm = () => {
    setSupplierForm(initialSupplierForm)
    setEditingSupplierId(null)
  }

  const saveSupplier = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSavingSupplier(true)

    try {
      if (editingSupplierId) {
        await api.put(`/suppliers/${editingSupplierId}`, supplierForm)
        setMessage('Supplier updated successfully')
      } else {
        await api.post('/suppliers', supplierForm)
        setMessage('Supplier added successfully')
      }

      resetSupplierForm()
      await loadSupplierData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to save supplier'))
    } finally {
      setSavingSupplier(false)
    }
  }

  const startEditSupplier = (supplier) => {
    setError('')
    setMessage('')
    setEditingSupplierId(supplier.id)
    setSupplierForm({
      supplier_name: supplier.supplier_name || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
    })
  }

  const deleteSupplier = async (supplier) => {
    const confirmed = window.confirm(`Delete supplier ${supplier.supplier_name}?`)
    if (!confirmed) return

    setError('')
    setMessage('')
    setDeletingSupplierId(supplier.id)

    try {
      await api.delete(`/suppliers/${supplier.id}`)
      setMessage('Supplier deleted successfully')
      if (editingSupplierId === supplier.id) resetSupplierForm()
      await loadSupplierData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to delete supplier'))
    } finally {
      setDeletingSupplierId(null)
    }
  }

  const addTransaction = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const totalAmount = Number(transactionForm.total_amount)
    const paidAmount = Number(transactionForm.paid_amount || 0)

    if (paidAmount > totalAmount) {
      setError('Paid amount cannot exceed total amount')
      return
    }

    setSavingTransaction(true)

    try {
      await api.post('/suppliers/transactions', {
        supplier_id: Number(transactionForm.supplier_id),
        description: transactionForm.description,
        total_amount: totalAmount,
        paid_amount: paidAmount,
      })
      setTransactionForm(initialTransactionForm)
      setMessage('Supplier transaction added successfully')
      notifyDashboardChanged()
      await loadSupplierData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to add supplier transaction'))
    } finally {
      setSavingTransaction(false)
    }
  }

  const payTransaction = async (transaction) => {
    setError('')
    setMessage('')

    const amount = Number(payments[transaction.id])
    const balance = Number(transaction.balance_amount)

    if (!amount || amount <= 0) {
      setError('Enter a valid payment amount')
      return
    }

    if (amount > balance) {
      setError(`Payment cannot exceed the balance of ${formatMoney(balance)}`)
      return
    }

    setPayingId(transaction.id)

    try {
      await api.put(`/suppliers/transactions/${transaction.id}/pay`, {
        paid_amount: amount,
      })
      setPayments({ ...payments, [transaction.id]: '' })
      setMessage('Supplier payment recorded successfully')
      notifyDashboardChanged()
      await loadSupplierData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to record supplier payment'))
    } finally {
      setPayingId(null)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">Loading suppliers...</div>
  }

  return (
    <section className="page-stack">
      <div className="metric-grid compact-metrics">
        <article className="metric-card">
          <span>Total Purchases</span>
          <strong>{formatMoney(summary.total_supplier_purchase_amount)}</strong>
        </article>
        <article className="metric-card">
          <span>Total Paid</span>
          <strong>{formatMoney(summary.total_supplier_paid_amount)}</strong>
        </article>
        <article className="metric-card">
          <span>Supplier Balance</span>
          <strong>{formatMoney(summary.total_supplier_balance_amount)}</strong>
        </article>
        <article className="metric-card">
          <span>Suppliers</span>
          <strong>{summary.total_suppliers || 0}</strong>
        </article>
        <article className="metric-card">
          <span>Open Transactions</span>
          <strong>{summary.unpaid_or_partial_count || 0}</strong>
        </article>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{editingSupplierId ? 'Edit Supplier' : 'Add Supplier'}</h2>
            {editingSupplierId && (
              <button type="button" className="ghost-button" onClick={resetSupplierForm}>
                Cancel
              </button>
            )}
          </div>
          <form onSubmit={saveSupplier} className="form-stack">
            <label>
              Supplier Name
              <input
                value={supplierForm.supplier_name}
                onChange={(event) =>
                  setSupplierForm({ ...supplierForm, supplier_name: event.target.value })
                }
                required
              />
            </label>
            <label>
              Phone
              <input
                value={supplierForm.phone}
                onChange={(event) =>
                  setSupplierForm({ ...supplierForm, phone: event.target.value })
                }
              />
            </label>
            <label>
              Address
              <input
                value={supplierForm.address}
                onChange={(event) =>
                  setSupplierForm({ ...supplierForm, address: event.target.value })
                }
              />
            </label>
            <button type="submit" disabled={savingSupplier}>
              {savingSupplier ? 'Saving...' : editingSupplierId ? 'Update Supplier' : 'Add Supplier'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Add Supplier Transaction</h2>
          </div>
          <form onSubmit={addTransaction} className="form-grid">
            <label className="full-width">
              Supplier
              <select
                value={transactionForm.supplier_id}
                onChange={(event) =>
                  setTransactionForm({ ...transactionForm, supplier_id: event.target.value })
                }
                required
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplier_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Description
              <input
                value={transactionForm.description}
                onChange={(event) =>
                  setTransactionForm({ ...transactionForm, description: event.target.value })
                }
              />
            </label>
            <label>
              Total Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={transactionForm.total_amount}
                onChange={(event) =>
                  setTransactionForm({ ...transactionForm, total_amount: event.target.value })
                }
                required
              />
            </label>
            <label>
              Paid Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={transactionForm.paid_amount}
                onChange={(event) =>
                  setTransactionForm({ ...transactionForm, paid_amount: event.target.value })
                }
              />
            </label>
            <button
              type="submit"
              className="full-width"
              disabled={savingTransaction || suppliers.length === 0}
            >
              {savingTransaction ? 'Saving...' : 'Add Transaction'}
            </button>
          </form>
        </section>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Supplier List</h2>
          <button type="button" className="ghost-button" onClick={() => loadSupplierData()}>
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
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.supplier_name}</td>
                  <td>{supplier.phone || '-'}</td>
                  <td>{supplier.address || '-'}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="ghost-button" onClick={() => startEditSupplier(supplier)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => deleteSupplier(supplier)}
                        disabled={deletingSupplierId === supplier.id}
                      >
                        {deletingSupplierId === supplier.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    No suppliers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Supplier Transactions</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Description</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const amount = Number(payments[transaction.id] || 0)
                const balance = Number(transaction.balance_amount)
                const invalidPayment = amount <= 0 || amount > balance

                return (
                  <tr key={transaction.id}>
                    <td>
                      <strong>{transaction.supplier_name}</strong>
                      <span className="table-subtext">{transaction.phone || '-'}</span>
                    </td>
                    <td>{transaction.description || '-'}</td>
                    <td>{formatMoney(transaction.total_amount)}</td>
                    <td>{formatMoney(transaction.paid_amount)}</td>
                    <td>{formatMoney(transaction.balance_amount)}</td>
                    <td>
                      <span className={`status ${transaction.status}`}>{transaction.status}</span>
                    </td>
                    <td>
                      {transaction.status === 'paid' ? (
                        <span className="muted">Paid</span>
                      ) : (
                        <div className="inline-action">
                          <input
                            type="number"
                            min="0"
                            max={balance}
                            step="0.01"
                            value={payments[transaction.id] || ''}
                            onChange={(event) =>
                              setPayments({ ...payments, [transaction.id]: event.target.value })
                            }
                            placeholder="Amount"
                          />
                          <button
                            type="button"
                            onClick={() => payTransaction(transaction)}
                            disabled={invalidPayment || payingId === transaction.id}
                          >
                            {payingId === transaction.id ? 'Paying...' : 'Pay'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-cell">
                    No supplier transactions found.
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

export default Suppliers
