import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { t } from '../i18n/translations'
import api from '../services/api'
import { formatMoney, getApiMessage } from '../utils/formatters'

const chartColors = ['#0f766e', '#2563eb', '#c2413d', '#7c3aed', '#ca8a04', '#0f172a']

const getMonthRange = () => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const formatDate = (date) => date.toISOString().slice(0, 10)

  return {
    start_date: formatDate(firstDay),
    end_date: formatDate(lastDay),
    group_by: 'daily',
  }
}

const withFilters = (filters) => ({
  params: {
    start_date: filters.start_date,
    end_date: filters.end_date,
    from: filters.start_date,
    to: filters.end_date,
    group_by: filters.group_by,
  },
})

const asArray = (data) => (Array.isArray(data) ? data : [])

function Reports() {
  const [filters, setFilters] = useState(getMonthRange)
  const [appliedFilters, setAppliedFilters] = useState(getMonthRange)
  const [summary, setSummary] = useState({})
  const [salesChart, setSalesChart] = useState([])
  const [profitChart, setProfitChart] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [expensesChart, setExpensesChart] = useState([])
  const [monthlyComparison, setMonthlyComparison] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReports = useCallback(async (nextFilters) => {
    setLoading(true)
    setError('')

    try {
      const [
        overviewResponse,
        salesResponse,
        profitResponse,
        productsResponse,
        paymentsResponse,
        expensesResponse,
        monthlyResponse,
      ] = await Promise.all([
        api.get('/reports/overview', withFilters(nextFilters)),
        api.get('/reports/sales-chart', withFilters(nextFilters)),
        api.get('/reports/profit-chart', withFilters(nextFilters)),
        api.get('/reports/top-products', withFilters(nextFilters)),
        api.get('/reports/payment-methods', withFilters(nextFilters)),
        api.get('/reports/expenses-chart', withFilters(nextFilters)),
        api.get('/reports/monthly-comparison', withFilters(nextFilters)),
      ])

      setSummary(overviewResponse.data || {})
      setSalesChart(asArray(salesResponse.data))
      setProfitChart(asArray(profitResponse.data))
      setTopProducts(asArray(productsResponse.data))
      setPaymentMethods(asArray(paymentsResponse.data))
      setExpensesChart(asArray(expensesResponse.data))
      setMonthlyComparison(asArray(monthlyResponse.data))
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

  const clearFilters = () => {
    const nextFilters = getMonthRange()
    setFilters(nextFilters)
    setAppliedFilters(nextFilters)
  }

  const summaryCards = useMemo(
    () => [
      { label: t('Total Sales'), value: formatMoney(summary.total_sales) },
      { label: t('Total Profit'), value: formatMoney(summary.total_profit) },
      { label: t('Total Expenses'), value: formatMoney(summary.total_expenses) },
      { label: t('Net Profit'), value: formatMoney(summary.net_profit) },
      { label: t('Bill Count'), value: summary.total_bills || 0 },
      { label: t('Average Bill'), value: formatMoney(summary.average_bill_value) },
      { label: t('Discounts'), value: formatMoney(summary.total_discounts) },
      { label: t('Tax'), value: formatMoney(summary.total_tax) },
    ],
    [summary],
  )

  const paymentSummary = useMemo(
    () => [
      { label: t('Cash'), value: formatMoney(summary.cash_sales) },
      { label: t('Card'), value: formatMoney(summary.card_sales) },
      { label: t('QR'), value: formatMoney(summary.qr_sales) },
      { label: t('Credit'), value: formatMoney(summary.credit_sales) },
    ],
    [summary],
  )

  const exportRows = useMemo(
    () => ({
      summary: summaryCards.map((card) => ({ Metric: card.label, Value: card.value })),
      paymentSummary: paymentSummary.map((card) => ({ Method: card.label, Value: card.value })),
      salesChart,
      profitChart,
      expensesChart,
      topProducts,
      paymentMethods,
      monthlyComparison,
    }),
    [expensesChart, monthlyComparison, paymentMethods, paymentSummary, profitChart, salesChart, summaryCards, topProducts],
  )

  const exportPdf = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(t('ShopMate LK Reports'), 14, 16)
    doc.setFontSize(10)
    doc.text(`${appliedFilters.start_date} to ${appliedFilters.end_date} (${appliedFilters.group_by})`, 14, 24)

    autoTable(doc, {
      startY: 32,
      head: [['Metric', 'Value']],
      body: exportRows.summary.map((row) => [row.Metric, row.Value]),
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Payment Method', 'Value']],
      body: exportRows.paymentSummary.map((row) => [row.Method, row.Value]),
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Period', 'Sales', 'Profit', 'Bills']],
      body: salesChart.map((row) => [
        row.period || row.date,
        formatMoney(row.total_sales),
        formatMoney(row.total_profit),
        row.total_bills,
      ]),
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Product', 'Quantity', 'Sales', 'Profit']],
      body: topProducts.map((row) => [
        row.product_name,
        row.total_quantity_sold,
        formatMoney(row.total_sales_amount),
        formatMoney(row.total_profit),
      ]),
    })

    doc.save(`shopmate_reports_${appliedFilters.start_date}_${appliedFilters.end_date}.pdf`)
  }

  const exportExcel = () => {
    const workbook = XLSX.utils.book_new()
    Object.entries(exportRows).forEach(([name, rows]) => {
      const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ empty: 'No data' }])
      XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31))
    })
    XLSX.writeFile(workbook, `shopmate_reports_${appliedFilters.start_date}_${appliedFilters.end_date}.xlsx`)
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Reports')}</h2>
          <div className="report-actions">
            <button type="button" className="ghost-button" onClick={exportPdf} disabled={loading}>
              {t('Export PDF')}
            </button>
            <button type="button" className="ghost-button" onClick={exportExcel} disabled={loading}>
              {t('Export Excel')}
            </button>
          </div>
        </div>
        <form className="form-grid report-filter enhanced-report-filter" onSubmit={applyFilters}>
          <label>
            {t('From Date')}
            <input
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters({ ...filters, start_date: event.target.value })}
              required
            />
          </label>
          <label>
            {t('To Date')}
            <input
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters({ ...filters, end_date: event.target.value })}
              required
            />
          </label>
          <label>
            {t('Group By')}
            <select
              value={filters.group_by}
              onChange={(event) => setFilters({ ...filters, group_by: event.target.value })}
            >
              <option value="daily">{t('Daily')}</option>
              <option value="weekly">{t('Weekly')}</option>
              <option value="monthly">{t('Monthly')}</option>
            </select>
          </label>
          <div className="report-actions report-filter-actions">
            <button type="submit" disabled={loading}>
              {loading ? t('Loading...') : t('Apply Filters')}
            </button>
            <button type="button" className="ghost-button" onClick={clearFilters} disabled={loading}>
              {t('Clear Filters')}
            </button>
          </div>
        </form>
      </section>

      {error && <div className="alert">{error}</div>}

      {loading ? (
        <div className="panel loading-panel">{t('Loading reports...')}</div>
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

          <div className="metric-grid compact-metrics">
            {paymentSummary.map((card) => (
              <article className="metric-card" key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>

          <section className="report-grid">
            <section className="panel chart-panel">
              <div className="section-heading">
                <h2>{t('Sales Over Time')}</h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={salesChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="total_sales" name={t('Total Sales')} stroke="#0f766e" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </section>

            <section className="panel chart-panel">
              <div className="section-heading">
                <h2>{t('Profit Over Time')}</h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={profitChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Legend />
                  <Bar dataKey="total_profit" name={t('Total Profit')} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </section>

          <section className="report-grid">
            <section className="panel chart-panel">
              <div className="section-heading">
                <h2>{t('Expenses By Category')}</h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={expensesChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Bar dataKey="total_amount" name={t('Total Expenses')} fill="#c2413d" />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="panel chart-panel">
              <div className="section-heading">
                <h2>{t('Top Products')}</h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="product_name" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Bar dataKey="total_sales_amount" name={t('Total Sales')} fill="#7c3aed" />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </section>

          <section className="report-grid">
            <section className="panel chart-panel">
              <div className="section-heading">
                <h2>{t('Payment Methods')}</h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={paymentMethods}
                    dataKey="total_amount"
                    nameKey="payment_type"
                    outerRadius={94}
                    label
                  >
                    {paymentMethods.map((entry, index) => (
                      <Cell key={entry.payment_type} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </section>

            <section className="panel chart-panel">
              <div className="section-heading">
                <h2>{t('Monthly Sales Comparison')}</h2>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyComparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Legend />
                  <Bar dataKey="total_sales" name={t('Total Sales')} fill="#0f766e" />
                  <Bar dataKey="total_expenses" name={t('Total Expenses')} fill="#c2413d" />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>{t('Report Data')}</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Period')}</th>
                    <th>{t('Total Sales')}</th>
                    <th>{t('Total Profit')}</th>
                    <th>{t('Bills')}</th>
                    <th>{t('Discounts')}</th>
                    <th>{t('Tax')}</th>
                  </tr>
                </thead>
                <tbody>
                  {salesChart.map((row) => (
                    <tr key={row.period}>
                      <td>{row.period}</td>
                      <td>{formatMoney(row.total_sales)}</td>
                      <td>{formatMoney(row.total_profit)}</td>
                      <td>{row.total_bills}</td>
                      <td>{formatMoney(row.total_discounts)}</td>
                      <td>{formatMoney(row.total_tax)}</td>
                    </tr>
                  ))}
                  {salesChart.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-cell">
                        {t('No sales found for this period.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  )
}

export default Reports
