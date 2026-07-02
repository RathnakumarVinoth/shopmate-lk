import { Navigate } from 'react-router-dom'

function ProtectedRoute({ children, roles }) {
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login'

  if (!token) {
    return <Navigate to={loginPath} replace />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />
  }

  return children
}

export default ProtectedRoute
