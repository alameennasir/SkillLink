import { ShieldCheck, Activity, AlertTriangle, LayoutDashboard, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import UserMenu from '../components/UserMenu'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/admin' },
  { label: 'Accounts', icon: Users, to: '/admin/users' },
]

const AdminLayout = () => {
  const navigate = useNavigate()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <button type="button" className="admin-brand" onClick={() => navigate('/admin')}>
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <strong>SkillLink</strong>
          </div>
        </button>

        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                ['admin-nav-link', isActive ? 'admin-nav-link-active' : 'admin-nav-link-idle']
                  .filter(Boolean)
                  .join(' ')
              }
            >
              <item.icon size={18} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
          {/* <div className="admin-nav-disabled" aria-disabled="true">
            <AlertTriangle size={16} aria-hidden="true" />
            Reports (soon)
          </div> */}
          {/* <div className="admin-nav-disabled" aria-disabled="true">
            <Activity size={16} aria-hidden="true" />
            Security (soon)
          </div> */}
        </nav>
      </aside>

      <div className="admin-main-panel">
        <header className="admin-topbar">
          <div>
            <h1>Admin console</h1>
          </div>
          <UserMenu variant="light" />
        </header>

        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
