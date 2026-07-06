import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/translations'
import api from '../services/api'
import { getApiMessage } from '../utils/formatters'

const channelLabels = {
  in_app: 'In App',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
}

function NotificationPreferences() {
  const [preferences, setPreferences] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadPreferences = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get('/notifications/preferences')
      setPreferences(response.data.preferences || [])
      setChannels(response.data.channels || [])
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load notification preferences'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  const toggleChannel = (templateKey, channelName) => {
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

  if (loading) {
    return <div className="panel loading-panel">{t('Loading notification preferences...')}</div>
  }

  return (
    <section className="page-stack">
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">{t('Notifications')}</p>
          <h2>{t('Notification Preferences')}</h2>
        </div>
        <button type="button" onClick={savePreferences} disabled={saving}>
          {saving ? t('Saving...') : t('Save')}
        </button>
      </section>

      {message && <div className="success">{message}</div>}
      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Notification')}</th>
                {channels.map((channel) => (
                  <th key={channel}>{t(channelLabels[channel] || channel)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preferences.map((template) => (
                <tr key={template.template_key}>
                  <td>{template.name}</td>
                  {channels.map((channelName) => {
                    const channel = template.channels.find(
                      (item) => item.channel === channelName,
                    )
                    return (
                      <td key={channelName}>
                        <input
                          type="checkbox"
                          checked={Boolean(channel?.enabled)}
                          onChange={() =>
                            toggleChannel(template.template_key, channelName)
                          }
                          aria-label={`${template.name} ${channelLabels[channelName] || channelName}`}
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
    </section>
  )
}

export default NotificationPreferences
