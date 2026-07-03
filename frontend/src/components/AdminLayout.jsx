import { NavLink, Outlet, useNavigate } from 'react-router-dom'

function AdminLayout() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('shopSettings')
    navigate('/admin/login')
  }

  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar admin-sidebar">
        <div className="brand">
          <div className="brand-mark">SA</div>
          <div>
            <strong>Super Admin</strong>
            <span>ShopMate Control</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/admin/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
            Admin Dashboard
          </NavLink>
          <NavLink to="/admin/shops" className={({ isActive }) => (isActive ? 'active' : '')}>
            Shops
          </NavLink>
          <NavLink
            to="/admin/audit-logs"
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            Audit Logs
          </NavLink>
        </nav>

        <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
          Logout
        </button>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">ShopMate LK</p>
            <h1>{user?.name ? `Welcome, ${user.name}` : 'Admin Console'}</h1>
          </div>
          <div className="user-pill">
            <span>{user?.role || 'admin'}</span>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
