import { NavLink, useNavigate } from 'react-router-dom'

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/pos', label: 'POS Billing' },
  { to: '/credits', label: 'Credit Book' },
]

function Sidebar() {
  const navigate = useNavigate()

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SM</div>
        <div>
          <strong>ShopMate LK</strong>
          <span>POS and Stock</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <button type="button" className="ghost-button sidebar-logout" onClick={logout}>
        Logout
      </button>
    </aside>
  )
}

export default Sidebar
