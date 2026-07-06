import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const PAGE_SIZE = 20
const channels = ['in_app', 'email', 'sms', 'whatsapp']

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const statusClass = (status) => {
  if (status === 'sent') return 'paid'
  if (status === 'skipped' || status === 'pending') return 'pending'
  return 'failed'
}

function AdminNotifications() {
  const [logs, setLogs] = useState([])
  const [preferences, setPreferences] = useState([])
  const [preferenceChannels, setPreferenceChannels] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [selectedChannels, setSelectedChannels] = useState(['in_app'])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [logResponse, preferenceResponse] = await Promise.all([
        api.get('/admin/notification-logs', {
          params: { page, limit: PAGE_SIZE },
        }),
        api.get('/notifications/preferences'),
      ])
      setLogs(logResponse.data.logs || [])
      setPagination(logResponse.data.pagination || null)
      setPreferences(preferenceResponse.data.preferences || [])
      setPreferenceChannels(preferenceResponse.data.channels || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load notification logs'))
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const toggleChannel = (channel) => {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    )
  }

  const sendTest = async () => {
    if (selectedChannels.length === 0) return
    setSending(true)
    setMessage('')
    setError('')

    try {
      await api.post('/admin/notifications/test', {
        channels: selectedChannels,
      })
      setMessage(t('Test notification processed'))
      await loadLogs()
    } catch (err) {
      setError(getApiMessage(err, 'Failed to send test notification'))
    } finally {
      setSending(false)
    }
  }

  const togglePreference = (templateKey, channelName) => {
    setPreferences((current) =>
      current.map((template) =>
        template.template_key !== templateKey
          ? template
          : {
              ...template,
              channels: template.channels.map((channel) =>
                channel.channel === channelName
                  ? { ...channel, enabled: !channel.enabled }
                  : channel,
              ),
            },
      ),
    )
  }

  const savePreferences = async () => {
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const payload = preferences.flatMap((template) =>
        template.channels.map((channel) => ({
          template_key: template.template_key,
          channel: channel.channel,
          enabled: channel.enabled,
        })),
      )
      const response = await api.put('/notifications/preferences', {
        preferences: payload,
      })
      setPreferences(response.data.preferences || [])
      setMessage(t('Notification preferences saved'))
    } catch (err) {
      setError(getApiMessage(err, 'Failed to save notification preferences'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-stack">
      <section className="dashboard-welcome admin-welcome">
        <div>
          <p className="eyebrow">{t('Administration overview')}</p>
          <h2>{t('Notification Delivery')}</h2>
        </div>
        <button type="button" className="ghost-button" onClick={loadLogs} disabled={loading}>
          {loading ? t('Refreshing...') : t('Refresh')}
        </button>
      </section>

      {message && <div className="success">{message}</div>}
      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Test Notification')}</h2>
          <button
            type="button"
            onClick={sendTest}
            disabled={sending || selectedChannels.length === 0}
          >
            {sending ? t('Sending...') : t('Send Test')}
          </button>
        </div>
        <div className="form-grid">
          {channels.map((channel) => (
            <label className="checkbox-row" key={channel}>
              <input
                type="checkbox"
                checked={selectedChannels.includes(channel)}
                onChange={() => toggleChannel(channel)}
              />
              {t(channel === 'in_app' ? 'In App' : channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email')}
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Notification Preferences')}</h2>
          <button type="button" onClick={savePreferences} disabled={saving}>
            {saving ? t('Saving...') : t('Save')}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Notification')}</th>
                {preferenceChannels.map((channel) => (
                  <th key={channel}>
                    {t(channel === 'in_app' ? 'In App' : channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preferences.map((template) => (
                <tr key={template.template_key}>
                  <td>{template.name}</td>
                  {preferenceChannels.map((channelName) => {
                    const channel = template.channels.find(
                      (item) => item.channel === channelName,
                    )
                    return (
                      <td key={channelName}>
                        <input
                          type="checkbox"
                          checked={Boolean(channel?.enabled)}
                          onChange={() =>
                            togglePreference(template.template_key, channelName)
                          }
                          aria-label={`${template.name} ${channelName}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>{t('Delivery Logs')}</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Date/Time')}</th>
                <th>{t('Template')}</th>
                <th>{t('Channel')}</th>
                <th>{t('Status')}</th>
                <th>{t('Shop')}</th>
                <th>{t('Recipient')}</th>
                <th>{t('Provider')}</th>
                <th>{t('Message')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.template_key}</td>
                  <td>{log.channel}</td>
                  <td>
                    <span className={`status ${statusClass(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td>{log.shop_name || t('Global')}</td>
                  <td>{log.recipient_name || log.destination || '-'}</td>
                  <td>{log.provider || '-'}</td>
                  <td>{log.error_message || '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="8">{t('No records found')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination?.total_pages > 1 && (
          <div className="table-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t('Previous')}
            </button>
            <span>
              {t('Page')} {pagination.page} {t('of')} {pagination.total_pages}
            </span>
            <button
              type="button"
              className="ghost-button"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('Next')}
            </button>
          </div>
        )}
      </section>
    </section>
  )
}

export default AdminNotifications
