import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

function Layout() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">ShopMate LK</p>
            <h1>{user?.name ? `Welcome, ${user.name}` : 'Point of Sale'}</h1>
          </div>
          <div className="user-pill">
            <span>{user?.role || 'owner'}</span>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
