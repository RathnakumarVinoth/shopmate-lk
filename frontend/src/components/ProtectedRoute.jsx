import { Navigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import { hasPermission, roleAllowed } from '../utils/permissions'
import {
  clearSession,
  getShopSession,
  getSessionToken,
  getSessionUser,
  isTokenExpired,
} from '../utils/session'

function ProtectedRoute({ children, roles, permission }) {
  const token = getSessionToken()
  const shopSession = getShopSession()
  const user = getSessionUser()
  const loginPath = window.location.pathname.startsWith('/admin')
    ? '/admin/login'
    : shopSession?.shopToken
      ? '/role-login'
      : '/shop-login'

  if (!token) {
    return <Navigate to={loginPath} replace />
  }

  if (isTokenExpired(token)) {
    clearSession('Session expired. Please login again.', {
      recordReason: 'Session expired',
    })
    return <Navigate to={loginPath} replace />
  }

  if (user.role !== 'admin' && !shopSession?.shopToken) {
    clearSession('Shop session expired. Please login again.', { broadcast: false })
    return <Navigate to="/shop-login" replace />
  }

  if (roles && !roleAllowed(user.role, roles)) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />
  }

  if (permission && !hasPermission(user, permission)) {
    return (
      <div className="panel">
        <div className="alert">{t('You do not have permission to access this page.')}</div>
      </div>
    )
  }

  return children
}

export default ProtectedRoute
