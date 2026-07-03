import { useState } from 'react'
import * as XLSX from 'xlsx'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const datedExports = new Set(['sales', 'sale-items', 'expenses'])

const exportDefinitions = [
  {
    key: 'products',
    label: 'Export Products',
    endpoint: '/export/products',
    fileName: 'products_export.xlsx',
    sheetName: 'Products',
  },
  {
    key: 'sales',
    label: 'Export Sales',
    endpoint: '/export/sales',
    fileName: 'sales_export.xlsx',
    sheetName: 'Sales',
  },
  {
    key: 'sale-items',
    label: 'Export Sale Items',
    endpoint: '/export/sale-items',
    fileName: 'sale_items_export.xlsx',
    sheetName: 'Sale Items',
  },
  {
    key: 'expenses',
    label: 'Export Expenses',
    endpoint: '/export/expenses',
    fileName: 'expenses_export.xlsx',
    sheetName: 'Expenses',
  },
  {
    key: 'credits',
    label: 'Export Credits',
    endpoint: '/export/credits',
    fileName: 'credits_export.xlsx',
    sheetName: 'Credits',
  },
  {
    key: 'suppliers',
    label: 'Export Suppliers',
    endpoint: '/export/suppliers',
    fileName: 'suppliers_export.xlsx',
    sheetName: 'Suppliers',
  },
  {
    key: 'supplier-transactions',
    label: 'Export Supplier Transactions',
    endpoint: '/export/supplier-transactions',
    fileName: 'supplier_transactions_export.xlsx',
    sheetName: 'Supplier Transactions',
  },
  {
    key: 'stock-movements',
    label: 'Export Stock Movements',
    endpoint: '/export/stock-movements',
    fileName: 'stock_movements_export.xlsx',
    sheetName: 'Stock Movements',
  },
]

const emptyFilters = {
  start_date: '',
  end_date: '',
}

const getRows = (data) => {
  if (Array.isArray(data)) return data
  return data.rows || []
}

const getRequestConfig = (definition, filters) => {
  if (!datedExports.has(definition.key)) return undefined

  const params = {}
  if (filters.start_date) params.start_date = filters.start_date
  if (filters.end_date) params.end_date = filters.end_date

  return { params }
}

const addSheet = (workbook, sheetName, rows) => {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: 'No records found' }])
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
}

const fetchExportRows = async (definition, filters) => {
  try {
    const response = await api.get(definition.endpoint, getRequestConfig(definition, filters))
    return getRows(response.data)
  } catch (error) {
    console.error(`Failed export endpoint: ${definition.endpoint}`, error.response?.data || error)
    throw error
  }
}

function BackupExport() {
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [exportingKey, setExportingKey] = useState('')

  const applyDates = (event) => {
    event.preventDefault()
    setAppliedFilters(filters)
    setMessage('Date filter applied for sales, sale items, and expenses exports')
    setError('')
  }

  const exportSingle = async (definition) => {
    setExportingKey(definition.key)
    setMessage('')
    setError('')

    try {
      const rows = await fetchExportRows(definition, appliedFilters)
      const workbook = XLSX.utils.book_new()

      addSheet(workbook, definition.sheetName, rows)
      XLSX.writeFile(workbook, definition.fileName)
      setMessage(`${definition.sheetName} exported successfully`)
    } catch (err) {
      console.error(err)
      setError(getApiMessage(err, `Failed to export ${definition.sheetName}`))
    } finally {
      setExportingKey('')
    }
  }

  const exportFullBackup = async () => {
    setExportingKey('full')
    setMessage('')
    setError('')

    try {
      const workbook = XLSX.utils.book_new()
      const responses = await Promise.all(
        exportDefinitions.map((definition) => fetchExportRows(definition, appliedFilters)),
      )

      exportDefinitions.forEach((definition, index) => {
        addSheet(workbook, definition.sheetName, responses[index])
      })

      XLSX.writeFile(workbook, 'shopmate_full_backup.xlsx')
      setMessage('Full business backup exported successfully')
    } catch (err) {
      console.error(err)
      setError('Failed to export full backup. Check console for details.')
    } finally {
      setExportingKey('')
    }
  }

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('backupExport')}</h2>
        </div>
        <form className="form-grid report-filter" onSubmit={applyDates}>
          <label>
            Start Date
            <input
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters({ ...filters, start_date: event.target.value })}
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters({ ...filters, end_date: event.target.value })}
            />
          </label>
          <button type="submit" disabled={Boolean(exportingKey)}>
            Apply Dates
          </button>
        </form>
        <p className="muted">
          Date filters apply only to sales, sale items, and expenses. Leave dates empty to export all records.
        </p>
      </section>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        <div className="section-heading">
          <h2>Excel Exports</h2>
        </div>
        <div className="export-grid">
          {exportDefinitions.map((definition) => (
            <button
              type="button"
              key={definition.key}
              className="ghost-button export-button"
              onClick={() => exportSingle(definition)}
              disabled={Boolean(exportingKey)}
            >
              {exportingKey === definition.key ? 'Exporting...' : definition.label}
            </button>
          ))}
          <button
            type="button"
            className="export-button"
            onClick={exportFullBackup}
            disabled={Boolean(exportingKey)}
          >
            {exportingKey === 'full' ? 'Exporting...' : 'Export Full Business Backup'}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Database Backup Guide</h2>
        </div>
        <div className="backup-guide">
          <div>
            <span>Backup command</span>
            <code>mysqldump -u root -p shopmate_lk &gt; shopmate_lk_backup.sql</code>
          </div>
          <div>
            <span>Restore command</span>
            <code>mysql -u root -p shopmate_lk &lt; shopmate_lk_backup.sql</code>
          </div>
        </div>
      </section>
    </section>
  )
}

export default BackupExport
