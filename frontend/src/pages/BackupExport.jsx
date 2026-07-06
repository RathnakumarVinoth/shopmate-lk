import { useEffect, useState } from 'react'
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
    key: 'categories',
    label: 'Export Categories',
    endpoint: '/export/categories',
    fileName: 'categories_export.xlsx',
    sheetName: 'Categories',
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
    key: 'customers',
    label: 'Export Customers',
    endpoint: '/export/customers',
    fileName: 'customers_export.xlsx',
    sheetName: 'Customers',
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
  {
    key: 'payment-verifications',
    label: 'Export Payment Verifications',
    endpoint: '/export/payment-verifications',
    fileName: 'payment_verifications_export.xlsx',
    sheetName: 'Payment Verifications',
  },
  {
    key: 'audit-logs',
    label: 'Export Audit Logs',
    endpoint: '/export/audit-logs',
    fileName: 'audit_logs_export.xlsx',
    sheetName: 'Audit Logs',
  },
  {
    key: 'login-activity',
    label: 'Export Login Activity',
    endpoint: '/export/login-activity',
    fileName: 'login_activity_export.xlsx',
    sheetName: 'Login Activity',
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
  const [backupStatus, setBackupStatus] = useState(null)
  const [backupHistory, setBackupHistory] = useState([])
  const [restoreHistory, setRestoreHistory] = useState([])
  const [backupLoading, setBackupLoading] = useState(true)
  const [backupBusy, setBackupBusy] = useState('')
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)

  const loadBackupData = async () => {
    setBackupLoading(true)

    try {
      const [statusResponse, historyResponse] = await Promise.all([
        api.get('/backups/status'),
        api.get('/backups/history'),
      ])
      setBackupStatus(statusResponse.data.status || null)
      setBackupHistory(historyResponse.data.backups || [])
      setRestoreHistory(historyResponse.data.restores || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load backup status'))
    } finally {
      setBackupLoading(false)
    }
  }

  useEffect(() => {
    loadBackupData()
  }, [])

  const applyDates = (event) => {
    event.preventDefault()
    setAppliedFilters(filters)
    setMessage(t('Date filter applied for sales, sale items, and expenses exports'))
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
      setMessage(t('Full business backup exported successfully'))
    } catch (err) {
      console.error(err)
      setError(getApiMessage(err, t('Failed to export full backup. Check console for details.')))
    } finally {
      setExportingKey('')
    }
  }

  const downloadBackup = async (backup) => {
    setBackupBusy(`download-${backup.id}`)
    setMessage('')
    setError('')

    try {
      const response = await api.get(`/backups/${backup.id}/download`, {
        responseType: 'blob',
      })
      const blob = new Blob([response.data], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = backup.file_name || `shopmate-backup-${backup.id}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setMessage('Backup downloaded successfully')
    } catch (err) {
      setError(getApiMessage(err, 'Failed to download backup'))
    } finally {
      setBackupBusy('')
    }
  }

  const createManualBackup = async () => {
    setBackupBusy('manual')
    setMessage('')
    setError('')

    try {
      const response = await api.post('/backups/manual')
      const backup = response.data.backup
      setMessage('Backup created successfully')
      await loadBackupData()

      if (backup?.id) {
        await downloadBackup(backup)
      }
    } catch (err) {
      setError(getApiMessage(err, 'Failed to create backup'))
    } finally {
      setBackupBusy('')
    }
  }

  const restoreBackup = async (event) => {
    event.preventDefault()

    if (!restoreFile) {
      setError('Select a backup file to restore')
      return
    }

    if (!restoreConfirmed) {
      setError('Confirm that you understand restore will replace current business data')
      return
    }

    setBackupBusy('restore')
    setMessage('')
    setError('')

    try {
      const backupText = await restoreFile.text()
      await api.post('/backups/restore', {
        backup: backupText,
        file_name: restoreFile.name,
      })
      setMessage('Backup restored successfully')
      setRestoreFile(null)
      setRestoreConfirmed(false)
      event.target.reset()
      await loadBackupData()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to restore backup'))
    } finally {
      setBackupBusy('')
    }
  }

  const latestBackup = backupStatus?.latest_backup
  const latestRestore = backupStatus?.latest_restore

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <h2>{t('Backup / Restore')}</h2>
          <button type="button" className="ghost-button" onClick={loadBackupData} disabled={backupLoading}>
            {backupLoading ? t('Refreshing...') : t('Refresh')}
          </button>
        </div>
        <div className="metric-grid report-metrics">
          <article className="metric-card">
            <div className="metric-card-heading">
              <span>{t('Last Backup')}</span>
              <i aria-hidden="true">B</i>
            </div>
            <strong>{latestBackup?.status || t('No records found')}</strong>
            <span>{latestBackup?.completed_at || latestBackup?.created_at || '-'}</span>
          </article>
          <article className="metric-card">
            <div className="metric-card-heading">
              <span>{t('Last Restore')}</span>
              <i aria-hidden="true">R</i>
            </div>
            <strong>{latestRestore?.status || t('No records found')}</strong>
            <span>{latestRestore?.completed_at || latestRestore?.created_at || '-'}</span>
          </article>
          <article className="metric-card">
            <div className="metric-card-heading">
              <span>{t('Failed Backups')}</span>
              <i aria-hidden="true">!</i>
            </div>
            <strong>{backupStatus?.failed_backup_count || 0}</strong>
          </article>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={createManualBackup} disabled={Boolean(backupBusy)}>
            {backupBusy === 'manual' ? t('Saving...') : t('Create Manual Backup')}
          </button>
          {latestBackup?.id && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => downloadBackup(latestBackup)}
              disabled={Boolean(backupBusy)}
            >
              {backupBusy === `download-${latestBackup.id}` ? t('Downloading...') : t('Download Latest Backup')}
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Restore Backup')}</h2>
        </div>
        <form className="form-grid" onSubmit={restoreBackup}>
          <label>
            {t('Backup File')}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => setRestoreFile(event.target.files?.[0] || null)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={restoreConfirmed}
              onChange={(event) => setRestoreConfirmed(event.target.checked)}
            />
            {t('I understand restore replaces current shop business data.')}
          </label>
          <button type="submit" disabled={Boolean(backupBusy)}>
            {backupBusy === 'restore' ? t('Restoring...') : t('Restore Backup')}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Backup History')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Status')}</th>
                <th>{t('Records')}</th>
                <th>{t('File')}</th>
                <th>{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {backupHistory.map((backup) => (
                <tr key={backup.id}>
                  <td>{backup.completed_at || backup.created_at}</td>
                  <td>{backup.status}</td>
                  <td>{backup.record_count}</td>
                  <td>{backup.file_name || '-'}</td>
                  <td>
                    {backup.status === 'completed' ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => downloadBackup(backup)}
                        disabled={Boolean(backupBusy)}
                      >
                        {t('Download')}
                      </button>
                    ) : (
                      backup.error_message || '-'
                    )}
                  </td>
                </tr>
              ))}
              {backupHistory.length === 0 && (
                <tr>
                  <td colSpan="5">{t('No records found')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {restoreHistory.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t('Restore History')}</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Records')}</th>
                  <th>{t('File')}</th>
                </tr>
              </thead>
              <tbody>
                {restoreHistory.map((restore) => (
                  <tr key={restore.id}>
                    <td>{restore.completed_at || restore.created_at}</td>
                    <td>{restore.status}</td>
                    <td>{restore.record_count}</td>
                    <td>{restore.source_file_name || restore.error_message || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>{t('backupExport')}</h2>
        </div>
        <form className="form-grid report-filter" onSubmit={applyDates}>
          <label>
            {t('Start Date')}
            <input
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilters({ ...filters, start_date: event.target.value })}
            />
          </label>
          <label>
            {t('End Date')}
            <input
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilters({ ...filters, end_date: event.target.value })}
            />
          </label>
          <button type="submit" disabled={Boolean(exportingKey)}>
            {t('Apply Filters')}
          </button>
        </form>
        <p className="muted">
          {t('Date filters apply only to sales, sale items, and expenses. Leave dates empty to export all records.')}
        </p>
      </section>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Excel Exports')}</h2>
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
              {exportingKey === definition.key ? t('Exporting...') : t(definition.label)}
            </button>
          ))}
          <button
            type="button"
            className="export-button"
            onClick={exportFullBackup}
            disabled={Boolean(exportingKey)}
          >
            {exportingKey === 'full' ? t('Exporting...') : t('Export Full Business Backup')}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Database Backup Guide')}</h2>
        </div>
        <div className="backup-guide">
          <div>
            <span>{t('Backup command')}</span>
            <code>mysqldump -u root -p shopmate_lk &gt; shopmate_lk_backup.sql</code>
          </div>
          <div>
            <span>{t('Restore command')}</span>
            <code>mysql -u root -p shopmate_lk &lt; shopmate_lk_backup.sql</code>
          </div>
        </div>
      </section>
    </section>
  )
}

export default BackupExport
