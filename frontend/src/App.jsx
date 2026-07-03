import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'

import AdminLayout from './components/AdminLayout.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import AdminLogin from './pages/AdminLogin.jsx'
import AdminShopDetails from './pages/AdminShopDetails.jsx'
import AdminShops from './pages/AdminShops.jsx'
import AuditLogs from './pages/AuditLogs.jsx'
import BackupExport from './pages/BackupExport.jsx'
import CreditBook from './pages/CreditBook.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Expenses from './pages/Expenses.jsx'
import Login from './pages/Login.jsx'
import PaymentVerification from './pages/PaymentVerification.jsx'
import POS from './pages/POS.jsx'
import Products from './pages/Products.jsx'
import PurchaseSuggestions from './pages/PurchaseSuggestions.jsx'
import Register from './pages/Register.jsx'
import Reports from './pages/Reports.jsx'
import Returns from './pages/Returns.jsx'
import Settings from './pages/Settings.jsx'
import Staff from './pages/Staff.jsx'
import Stock from './pages/Stock.jsx'
import Suppliers from './pages/Suppliers.jsx'

function App() {
  const hasToken = Boolean(localStorage.getItem('token'))
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const homePath = user.role === 'admin' ? '/admin/dashboard' : '/dashboard'

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={hasToken ? homePath : '/login'} replace />}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/register" element={<Register />} />
        <Route
          element={
            <ProtectedRoute roles={['owner', 'staff']}>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/pos" element={<POS />} />
          <Route
            path="/payment-verification"
            element={
              <ProtectedRoute roles={['owner', 'staff']}>
                <PaymentVerification />
              </ProtectedRoute>
            }
          />
          <Route
            path="/credits"
            element={
              <ProtectedRoute roles={['owner']}>
                <CreditBook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute roles={['owner']}>
                <Suppliers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute roles={['owner']}>
                <Stock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-suggestions"
            element={
              <ProtectedRoute roles={['owner']}>
                <PurchaseSuggestions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute roles={['owner']}>
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute roles={['owner']}>
                <Staff />
              </ProtectedRoute>
            }
          />
          <Route
            path="/returns"
            element={
              <ProtectedRoute roles={['owner']}>
                <Returns />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute roles={['owner']}>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute roles={['owner']}>
                <AuditLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/backup-export"
            element={
              <ProtectedRoute roles={['owner']}>
                <BackupExport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute roles={['owner']}>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/shops" element={<AdminShops />} />
          <Route path="/admin/shops/:id" element={<AdminShopDetails />} />
          <Route path="/admin/audit-logs" element={<AuditLogs />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
