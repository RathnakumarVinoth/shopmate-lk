import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const getMonthRange = () => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const formatDate = (date) => date.toISOString().slice(0, 10)

  return {
    start_date: formatDate(firstDay),
    end_date: formatDate(lastDay),
  }
}

const withFilters = (filters) => ({
  params: {
    start_date: filters.start_date,
    end_date: filters.end_date,
  },
})

function Reports() {
  const [filters, setFilters] = useState(getMonthRange)
  const [appliedFilters, setAppliedFilters] = useState(getMonthRange)
  const [summary, setSummary] = useState({})
  const [dailySales, setDailySales] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [expensesByCategory, setExpensesByCategory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReports = useCallback(async (nextFilters) => {
    setLoading(true)
    setError('')

    try {
      const [summaryResponse, dailyResponse, productsResponse, paymentsResponse, expensesResponse] =
        await Promise.all([
          api.get('/reports/summary', withFilters(nextFilters)),
          api.get('/reports/daily-sales', withFilters(nextFilters)),
          api.get('/reports/top-products', withFilters(nextFilters)),
          api.get('/reports/payment-methods', withFilters(nextFilters)),
          api.get('/reports/expenses-by-category', withFilters(nextFilters)),
        ])

      setSummary(summaryResponse.data || {})
      setDailySales(Array.isArray(dailyResponse.data) ? dailyResponse.data : [])
      setTopProducts(Array.isArray(productsResponse.data) ? productsResponse.data : [])
      setPaymentMethods(Array.isArray(paymentsResponse.data) ? paymentsResponse.data : [])
      setExpensesByCategory(Array.isArray(expensesResponse.data) ? expensesResponse.data : [])
    } catch (err) {
      console.error('Failed to load report API calls:', err.response?.data || err)
      setError(getApiMessage(err, 'Failed to load reports'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports(appliedFilters)
  }, [appliedFilters, loadReports])

  const applyFilters = (event) => {
    event.preventDefault()
    setAppliedFilters(filters)
  }

  const maxTopProductSales = useMemo(
    () => Math.max(...topProducts.map((product) => Number(product.total_sales_amount || 0)), 0),
    [topProducts],
  )

  const maxPaymentSales = useMemo(
    () => Math.max(...paymentMethods.map((method) => Number(method.total_amount || 0)), 0),
    [paymentMethods],
  )

  const maxCategoryExpenses = useMemo(
    () => Math.max(...expensesByCategory.map((item) => Number(item.total_amount || 0)), 0),
    [expensesByCategory],
  )

  const summaryCards = [
    { label: 'Total Sales', value: formatMoney(summary.total_sales) },
    { label: 'Total Profit', value: formatMoney(summary.total_profit) },
    { label: 'Total Expenses', value: formatMoney(summary.total_expenses) },
    { label: 'Net Profit', value: formatMoney(summary.net_profit) },
    { label: 'Total Bills', value: summary.total_bills || 0 },
    { label: 'Average Bill Value', value: formatMoney(summary.average_bill_value) },
    { label: 'Credit Balance', value: formatMoney(summary.total_credit_balance) },
    { label: 'Supplier Balance', value: formatMoney(summary.total_supplier_balance) },
    { label: 'Low Stock Count', value: summary.low_stock_count || 0 },
  ]

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>Reports</h2>
        </div>
        <form className="form-grid report-filter" onSubmit={applyFilters}>
          <label>
            Start Date
            <input
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters({ ...filters, start_date: event.target.value })}
              required
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters({ ...filters, end_date: event.target.value })}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Loading...' : 'Apply'}
          </button>
        </form>
      </section>

      {error && <div className="alert">{error}</div>}

      {loading ? (
        <div className="panel loading-panel">Loading reports...</div>
      ) : (
        <>
          <div className="metric-grid report-metrics">
            {summaryCards.map((card) => (
              <article className="metric-card" key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>

          <section className="panel">
            <div className="section-heading">
              <h2>Daily Sales</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Total Sales</th>
                    <th>Total Profit</th>
                    <th>Bills</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySales.map((row) => (
                    <tr key={row.date}>
                      <td>{String(row.date).slice(0, 10)}</td>
                      <td>{formatMoney(row.total_sales)}</td>
                      <td>{formatMoney(row.total_profit)}</td>
                      <td>{row.total_bills}</td>
                    </tr>
                  ))}
                  {dailySales.length === 0 && (
                    <tr>
                      <td colSpan="4" className="empty-cell">
                        No sales found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="report-grid">
            <section className="panel">
              <div className="section-heading">
                <h2>Top Products</h2>
              </div>
              <div className="table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Sales</th>
                      <th>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((product) => (
                      <tr key={product.product_id}>
                        <td>
                          <strong>{product.product_name}</strong>
                          <span
                            className="bar"
                            style={{
                              '--bar-width': `${
                                maxTopProductSales
                                  ? (Number(product.total_sales_amount) / maxTopProductSales) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </td>
                        <td>{product.total_quantity_sold}</td>
                        <td>{formatMoney(product.total_sales_amount)}</td>
                        <td>{formatMoney(product.total_profit)}</td>
                      </tr>
                    ))}
                    {topProducts.length === 0 && (
                      <tr>
                        <td colSpan="4" className="empty-cell">
                          No product sales found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <h2>Payment Methods</h2>
              </div>
              <div className="table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Total</th>
                      <th>Bills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethods.map((method) => (
                      <tr key={method.payment_type}>
                        <td>
                          <strong>{method.payment_type}</strong>
                          <span
                            className="bar alt-bar"
                            style={{
                              '--bar-width': `${
                                maxPaymentSales
                                  ? (Number(method.total_amount) / maxPaymentSales) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </td>
                        <td>{formatMoney(method.total_amount)}</td>
                        <td>{method.bill_count}</td>
                      </tr>
                    ))}
                    {paymentMethods.length === 0 && (
                      <tr>
                        <td colSpan="3" className="empty-cell">
                          No payment data found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>Expenses By Category</h2>
            </div>
            <div className="category-list">
              {expensesByCategory.map((item) => (
                <div className="category-row report-category-row" key={item.category}>
                  <span>
                    {item.category}
                    <span
                      className="bar expense-bar"
                      style={{
                        '--bar-width': `${
                          maxCategoryExpenses
                            ? (Number(item.total_amount) / maxCategoryExpenses) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </span>
                  <strong>{formatMoney(item.total_amount)}</strong>
                </div>
              ))}
              {expensesByCategory.length === 0 && (
                <p className="muted">No expense categories found for this period.</p>
              )}
            </div>
          </section>
        </>
      )}
    </section>
  )
}

export default Reports
