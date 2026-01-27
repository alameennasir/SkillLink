import { ArrowUpRight, LogOut, UserCircle } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const roleLabel = {
  client: 'Client workspace',
  freelancer: 'Freelancer workspace',
  admin: 'Admin console',
}

const primaryActions = {
  client: { path: '/client/dashboard', label: 'Client dashboard' },
  freelancer: { path: '/freelancer/profile', label: 'My profile' },
  admin: { path: '/admin', label: 'Admin console' },
}

const UserMenu = ({ variant = 'light' }) => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const initials = useMemo(() => getInitials(user?.displayName || user?.email || 'SkillLink'), [user])
  const name = user?.displayName || user?.email || 'SkillLink user'
  const workspace = roleLabel[user?.role] || 'Workspace'

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      navigate('/auth/login', { replace: true })
    }
  }

  const handlePrimaryAction = () => {
    const action = primaryActions[user?.role]
    if (!action) return
    navigate(action.path)
  }

  return (
    <div className={`avatar-menu avatar-menu-${variant}`}>
      <button
        type="button"
        className="avatar-chip avatar-menu-trigger"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label={`Signed in as ${name}`}
      >
        {initials}
      </button>
      <div className="avatar-dropdown" role="menu">
        <div className="avatar-dropdown-info">
          <UserCircle size={18} aria-hidden="true" />
          <div>
            <strong>{name}</strong>
            <small>{workspace}</small>
          </div>
        </div>
        <div className="avatar-dropdown-actions">
          {primaryActions[user?.role] ? (
            <button type="button" className="avatar-dropdown-btn avatar-dropdown-btn-ghost" onClick={handlePrimaryAction}>
              <ArrowUpRight size={16} aria-hidden="true" />
              {primaryActions[user?.role].label}
            </button>
          ) : null}
          <button type="button" className="avatar-dropdown-btn" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" />
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

const getInitials = (value) => {
  if (!value) return 'SL'
  const parts = value.trim().split(' ')
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? 'S'
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export default UserMenu
