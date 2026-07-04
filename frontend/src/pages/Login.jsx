import { Navigate } from 'react-router-dom'
import { hasShopContext } from '../utils/session'

function Login() {
  return <Navigate to={hasShopContext() ? '/role-login' : '/shop-login'} replace />
}

export default Login
