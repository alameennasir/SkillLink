import { useNavigate } from 'react-router-dom'
import { FolderOpen, Users, ClipboardList, Workflow } from 'lucide-react'
import { useClientDashboardData } from '../hooks/useClientDashboardData'
import { useAuth } from '../context/AuthContext'

const ClientDashboard = () => {
  const { user } = useAuth()
  const { status, data, error, refresh } = useClientDashboardData()
  const navigate = useNavigate()
  const isLoading = status === 'loading' || status === 'idle'
  const friendlyName = getFriendlyName(user)

  if (!data && isLoading) {
    return <div className="loading-panel">Loading client dashboard...</div>
  }

  if (!data && error) {
    return (
      <div className="protected-state protected-state-error">
        <p>We could not load dashboard data.</p>
        <button type="button" className="cta cta-secondary" onClick={refresh}>
          Retry
        </button>
      </div>
    )
  }

  const { stats = [] } = data || {}

  const summaryStats = buildSummaryStats(stats)

  const goToManageGigs = () => navigate('/client/manage-gigs')

  return (
    <div className="dashboard-simple">
      <section className="hero-copy">
        <h1>Welcome back, {friendlyName}</h1>
        <p>Here is what's happening with your creative gigs today.</p>
      </section>

      {error && data && (
        <div className="inline-alert inline-alert-error">
          <p>Live refresh failed: {error.message}</p>
          <button type="button" className="link-button" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      <section className="stat-row" aria-label="Gig overview stats">
        {summaryStats.map((stat) => (
          <article className="summary-card" key={stat.id}>
            <div className="stat-icon" aria-hidden="true">
              <stat.Icon size={22} strokeWidth={2.2} />
            </div>
            <p className="stat-label">{stat.label}</p>
            <div className="stat-value-row">
              <p className="stat-value">{isLoading ? '--' : stat.value}</p>
              {stat.trend && <span className={`trend-pill trend-${stat.tone}`}>{stat.trend}</span>}
            </div>
          </article>
        ))}
      </section>

      <article className="workflow-card">
        <div className="workflow-icon" aria-hidden="true">
          <Workflow size={28} strokeWidth={2.4} />
        </div>
        <h3>Manage your hiring workflow</h3>
        <p>
          Access active gig listings, review incoming applications, and track your ongoing creative
          collaborations from the navigation.
        </p>
        <button type="button" className="workflow-link" onClick={goToManageGigs}>
          View all your active gigs
        </button>
      </article>
    </div>
  )
}

export default ClientDashboard

const summaryConfig = [
  { id: 'open', label: 'Open Gigs', match: 'open', Icon: FolderOpen },
  { id: 'applicants', label: 'Total Applicants', match: 'applicant', Icon: Users },
  { id: 'active', label: 'Active Gigs', match: 'active', Icon: ClipboardList },
]

const buildSummaryStats = (stats) =>
  summaryConfig.map((config) => {
    const stat = stats.find((tile) => tile.label?.toLowerCase().includes(config.match))
    return {
      ...config,
      value: stat?.value ?? '0',
      trend: formatTrend(stat?.trend),
      tone: stat?.tone ?? 'neutral',
    }
  })

const formatTrend = (trend) => {
  if (!trend) return ''
  const percentMatch = trend.match(/[+-]?\d+%/)
  if (percentMatch) {
    return percentMatch[0]
  }
  return trend
}

const getFriendlyName = (user) => {
  if (!user) return 'there'
  if (user.displayName) {
    return user.displayName.split(' ')[0]
  }
  if (user.email) {
    return user.email.split('@')[0]
  }
  return 'there'
}
