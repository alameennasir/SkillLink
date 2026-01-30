import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import UserMenu from '../components/UserMenu'

const navLinks = [
  { label: 'Dashboard', to: '/freelancer' },
  { label: 'Browse Gigs', to: '/freelancer/opportunities' },
  { label: 'My Gigs', to: '/freelancer/my-gigs' },
  { label: 'My Proposals', to: '/freelancer/my-proposals' },
  { label: 'Inbox', to: '/freelancer/messages' },
]

const FreelancerLayout = () => {
  const navigate = useNavigate()

  return (
    <div className="freelancer-shell">
      <header className="freelancer-header" role="navigation" aria-label="Freelancer workspace">
        <button type="button" className="freelancer-brand" onClick={() => navigate('/freelancer')}>
          <span>SkillLink</span>
        </button>

        <nav className="freelancer-nav">
          {navLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/freelancer'}
              className={({ isActive }) =>
                ['freelancer-nav-link', isActive ? 'freelancer-nav-link-active' : 'freelancer-nav-link-idle']
                  .filter(Boolean)
                  .join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="freelancer-header-actions">
          {/* <button type="button" className="freelancer-icon-button" aria-label="Notifications">
            <Bell size={18} aria-hidden="true" />
          </button> */}
          <UserMenu variant="light" />
        </div>
      </header>

      <main className="freelancer-main">
        <div className="freelancer-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default FreelancerLayout
