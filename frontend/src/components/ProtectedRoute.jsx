import { Navigate } from 'react-router-dom'
import { hasPermission, roleAllowed } from '../utils/permissions'

function ProtectedRoute({ children, roles, permission }) {
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login'

  if (!token) {
    return <Navigate to={loginPath} replace />
  }

  if (roles && !roleAllowed(user.role, roles)) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />
  }

  if (permission && !hasPermission(user, permission)) {
    return (
      <div className="panel">
        <div className="alert">You do not have permission to access this page.</div>
      </div>
    )
  }

  return children
}

export default ProtectedRoute
