import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import UserMenu from '../components/UserMenu'

const navLinks = [
  { label: 'Dashboard', to: '/client' },
  { label: 'Gigs', to: '/client/manage-gigs' },
  { label: 'Talent', to: '/client/talent-search' },
  { label: 'Inbox', to: '/client/messages' },
]

const ClientLayout = () => {
  const navigate = useNavigate()

  return (
    <div className="client-shell client-shell-light">
      <header className="client-topbar" role="navigation" aria-label="Primary">
        <div className="brand-mark" onClick={() => navigate('/client')}>
          <div>
            <p>SkillLink</p>
          </div>
        </div>

        <nav className="top-nav-links">
          {navLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'top-nav-link',
                  isActive ? 'top-nav-link-active' : 'top-nav-link-idle',
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              end={item.to === '/client'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <button type="button" className="cta cta-primary" onClick={() => navigate('/client/post-gig')}>
            Post a New Gig
          </button>
          {/* <button type="button" className="topbar-icon" aria-label="Notifications">
            <Bell size={20} aria-hidden="true" />
          </button> */}
          <UserMenu variant="light" />
        </div>
      </header>

      <main className="client-main">
        <div className="client-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default ClientLayout
