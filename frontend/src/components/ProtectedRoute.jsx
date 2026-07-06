import { Navigate } from 'react-router-dom'
import { t } from '../i18n/translations'
import { hasPermission, roleAllowed } from '../utils/permissions'
import {
  clearSession,
  getShopSession,
  getShopSessionId,
  getSessionToken,
  getSessionUser,
  isTokenExpired,
} from '../utils/session'

function ProtectedRoute({ children, roles, permission }) {
  const token = getSessionToken()
  const shopSession = getShopSession()
  const shopSessionId = getShopSessionId(shopSession)
  const user = getSessionUser()
  const isAdminPath = window.location.pathname.startsWith('/admin')
  const loginPath = isAdminPath ? '/admin/login' : shopSessionId ? '/role-login' : '/shop-login'

  if (!token) {
    return <Navigate to={loginPath} replace />
  }

  if (isTokenExpired(token)) {
    clearSession('Session expired. Please login again.', {
      recordReason: 'Session expired',
    })
    return <Navigate to={loginPath} replace />
  }

  if (user.role !== 'admin' && !shopSessionId) {
    clearSession('Shop session expired. Please login again.', {
      broadcast: false,
      clearShop: true,
    })
    return <Navigate to="/shop-login" replace />
  }

  if (
    user.role !== 'admin' &&
    user.shop_id &&
    shopSessionId &&
    String(user.shop_id) !== String(shopSessionId)
  ) {
    clearSession('Session expired. Please login again.', { broadcast: false })
    return <Navigate to="/role-login" replace />
  }

  if (roles && !roleAllowed(user.role, roles)) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />
  }

  const allowedPermissions = Array.isArray(permission)
    ? permission
    : permission
      ? [permission]
      : []

  if (
    allowedPermissions.length > 0 &&
    !allowedPermissions.some((permissionName) => hasPermission(user, permissionName))
  ) {
    return (
      <div className="panel">
        <div className="alert">{t('You do not have permission to access this page.')}</div>
      </div>
    )
  }

  return children
}

export default ProtectedRoute
