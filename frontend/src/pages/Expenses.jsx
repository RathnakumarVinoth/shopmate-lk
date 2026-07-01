import { useEffect, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage, notifyDashboardChanged } from '../utils/formatters'

const today = () => new Date().toISOString().slice(0, 10)

const initialForm = {
  expense_name: '',
  category: '',
  amount: '',
  expense_date: today(),
  note: '',
}

const toForm = (expense) => ({
  expense_name: expense.expense_name || '',
  category: expense.category || '',
  amount: expense.amount ?? '',
  expense_date: expense.expense_date ? String(expense.expense_date).slice(0, 10) : today(),
  note: expense.note || '',
})

function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [summary, setSummary] = useState({})
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadExpenseData = async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const [expenseResponse, summaryResponse] = await Promise.all([
        api.get('/expenses'),
        api.get('/expenses/summary'),
      ])

      setExpenses(expenseResponse.data.expenses || [])
      setSummary(summaryResponse.data.summary || {})
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load expenses'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenseData()
  }, [])

  const updateField = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const resetForm = () => {
    setForm(initialForm)
    setEditingId(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)

    const payload = {
      ...form,
      amount: Number(form.amount),
    }

    try {
      if (editingId) {
        await api.put(`/expenses/${editingId}`, payload)
        setMessage('Expense updated successfully')
      } else {
        await api.post('/expenses', payload)
        setMessage('Expense added successfully')
      }

      resetForm()
      notifyDashboardChanged()
      await loadExpenseData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to save expense'))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (expense) => {
    setError('')
    setMessage('')
    setEditingId(expense.id)
    setForm(toForm(expense))
  }

  const deleteExpense = async (expense) => {
    const confirmed = window.confirm(`Delete expense ${expense.expense_name}?`)
    if (!confirmed) return

    setError('')
    setMessage('')
    setDeletingId(expense.id)

    try {
      await api.delete(`/expenses/${expense.id}`)
      setMessage('Expense deleted successfully')
      if (editingId === expense.id) resetForm()
      notifyDashboardChanged()
      await loadExpenseData(false)
    } catch (err) {
      setError(getApiMessage(err, 'Failed to delete expense'))
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <div className="panel loading-panel">Loading expenses...</div>
  }

  return (
    <section className="page-stack">
      <div className="metric-grid compact-metrics">
        <article className="metric-card">
          <span>Today Expenses</span>
          <strong>{formatMoney(summary.today_expenses)}</strong>
        </article>
        <article className="metric-card">
          <span>Month Expenses</span>
          <strong>{formatMoney(summary.month_expenses)}</strong>
        </article>
        <article className="metric-card">
          <span>Total Expenses</span>
          <strong>{formatMoney(summary.total_expenses)}</strong>
        </article>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="page-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{editingId ? 'Edit Expense' : 'Add Expense'}</h2>
            {editingId && (
              <button type="button" className="ghost-button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
          <form onSubmit={submit} className="form-grid">
            <label>
              Expense Name
              <input name="expense_name" value={form.expense_name} onChange={updateField} required />
            </label>
            <label>
              Category
              <input name="category" value={form.category} onChange={updateField} />
            </label>
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={updateField}
                required
              />
            </label>
            <label>
              Date
              <input
                name="expense_date"
                type="date"
                value={form.expense_date}
                onChange={updateField}
              />
            </label>
            <label className="full-width">
              Note
              <input name="note" value={form.note} onChange={updateField} />
            </label>
            <button type="submit" className="full-width" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Add Expense'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <h2>Expenses by Category</h2>
          </div>
          <div className="category-list">
            {(summary.expenses_by_category || []).map((item) => (
              <div className="category-row" key={item.category}>
                <span>{item.category}</span>
                <strong>{formatMoney(item.total_amount)}</strong>
              </div>
            ))}
            {(summary.expenses_by_category || []).length === 0 && (
              <p className="muted">No category totals yet.</p>
            )}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Expense List</h2>
          <button type="button" className="ghost-button" onClick={() => loadExpenseData()}>
            Refresh
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.expense_name}</td>
                  <td>{expense.category || '-'}</td>
                  <td>{formatMoney(expense.amount)}</td>
                  <td>{expense.expense_date ? String(expense.expense_date).slice(0, 10) : '-'}</td>
                  <td>{expense.note || '-'}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="ghost-button" onClick={() => startEdit(expense)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => deleteExpense(expense)}
                        disabled={deletingId === expense.id}
                      >
                        {deletingId === expense.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-cell">
                    No expenses found.
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

export default Expenses
