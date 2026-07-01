import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'

import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import CreditBook from './pages/CreditBook.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import POS from './pages/POS.jsx'
import Products from './pages/Products.jsx'
import Register from './pages/Register.jsx'

function App() {
  const hasToken = Boolean(localStorage.getItem('token'))

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={hasToken ? '/dashboard' : '/login'} replace />}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/credits" element={<CreditBook />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
