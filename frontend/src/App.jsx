import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'

import AdminLayout from './components/AdminLayout.jsx'
import Layout from './components/Layout.jsx'
import OfflineNotice from './components/OfflineNotice.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import PwaInstallPrompt from './components/PwaInstallPrompt.jsx'
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
import LoginActivity from './pages/LoginActivity.jsx'
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
import { getHomePath } from './utils/permissions.js'

function App() {
  const hasToken = Boolean(localStorage.getItem('token'))
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const homePath = getHomePath(user)

  return (
    <BrowserRouter>
      <OfflineNotice />
      <PwaInstallPrompt />
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
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute permission="dashboard_view">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/products"
            element={
              <ProtectedRoute permission="products_view">
                <Products />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute permission="pos_access">
                <POS />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payment-verification"
            element={
              <ProtectedRoute permission="payment_verification_access">
                <PaymentVerification />
              </ProtectedRoute>
            }
          />
          <Route
            path="/credits"
            element={
              <ProtectedRoute permission="credit_book_access">
                <CreditBook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/credit-book"
            element={
              <ProtectedRoute permission="credit_book_access">
                <CreditBook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/suppliers"
            element={
              <ProtectedRoute permission="suppliers_access">
                <Suppliers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute permission="stock_access">
                <Stock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-suggestions"
            element={
              <ProtectedRoute permission="purchase_suggestions_access">
                <PurchaseSuggestions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute permission="expenses_access">
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute permission="staff_manage">
                <Staff />
              </ProtectedRoute>
            }
          />
          <Route
            path="/returns"
            element={
              <ProtectedRoute permission="returns_access">
                <Returns />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute permission="reports_access">
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute permission="audit_logs_access">
                <AuditLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/backup-export"
            element={
              <ProtectedRoute permission="backup_export_access">
                <BackupExport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute permission="settings_access">
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/login-activity"
            element={
              <ProtectedRoute roles={['owner']}>
                <LoginActivity />
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
          <Route path="/admin/login-activity" element={<LoginActivity />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
