import { Briefcase, FileText, Search, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchFreelancerProposals } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'

const FreelancerDashboard = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const firstName = user?.displayName?.split(' ')?.[0] || 'Friend'
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.uid) return
    let active = true

    const load = async () => {
      if (!isFirebaseConfigured) {
        if (active) {
          setLoading(false)
          setError(new Error('Provide Firebase credentials to load your SkillLink pipeline.'))
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        const records = await fetchFreelancerProposals(user.uid)
        if (active) {
          setProposals(records)
        }
      } catch (err) {
        if (active) {
          setError(err)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [user?.uid])

  const statCards = useMemo(() => buildStatCards(proposals), [proposals])
  const quickActions = useMemo(() => buildQuickActions(proposals), [proposals])

  return (
    <div className="freelancer-dashboard">
      <section className="freelancer-welcome">
        <h1>Welcome back, {firstName}</h1>
        <p>Stay on top of your SkillLink Journey and keep clients informed.</p>
      </section>

      {error && (
        <div className="inline-alert inline-alert-error">
          <p>{error.message || 'Unable to load your proposals right now.'}</p>
        </div>
      )}

      <div className="freelancer-stat-grid">
        {statCards.map((card) => (
          <article className="freelancer-stat-card-simple" key={card.label}>
            <div className="freelancer-stat-card-head">
              <div>
                <p>{card.label}</p>
                <h3>{loading ? '—' : card.value}</h3>
                <span className="freelancer-stat-change">{card.change}</span>
              </div>
              <div className="freelancer-stat-icon-pill">
                <card.icon size={18} aria-hidden="true" />
              </div>
            </div>
            <button type="button" className="freelancer-link" onClick={() => navigate(card.target)}>
              {card.cta}
            </button>
          </article>
        ))}
      </div>

      <section className="freelancer-quick-actions">
        <h2>Quick Actions</h2>
        <div className="freelancer-quick-grid">
          {quickActions.map((action) => (
            <button
              type="button"
              className="freelancer-quick-card"
              key={action.title}
              onClick={() => navigate(action.target)}
            >
              <div className="freelancer-quick-icon">
                <action.icon size={18} aria-hidden="true" />
              </div>
              <div>
                <strong>{action.title}</strong>
                <p>{loading ? 'Checking activity…' : action.detail}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

const buildStatCards = (proposals) => {
  const active = proposals.filter((proposal) => ['under_review', 'interview'].includes(proposal.status)).length
  const submitted = proposals.filter((proposal) => ['draft', 'submitted'].includes(proposal.status)).length
  const wins = proposals.filter((proposal) => proposal.status === 'hired').length

  return [
    {
      label: 'Active Gigs',
      value: `${active}`,
      change: '', // wins ? `${wins} win${wins === 1 ? '' : 's'} this month` : '',
      cta: 'View active projects',
      icon: Briefcase,
      target: '/freelancer/my-gigs',
    },
    {
      label: 'Applications Sent',
      value: `${submitted}`,
      change: submitted ? 'Follow up within 48hrs' : '',
      cta: 'Track proposals',
      icon: Send,
      target: '/freelancer/my-proposals',
    },
  ]
}

const buildQuickActions = (proposals) => {
  const interviews = proposals.filter((proposal) => proposal.status === 'interview').length
  const drafts = proposals.filter((proposal) => proposal.status === 'draft').length

  return [
    {
      title: 'Find New Gigs',
      detail: 'Curated Lagos, Abuja, and remote briefs updated hourly',
      icon: Search,
      target: '/freelancer/opportunities',
    },
    {
      title: 'Manage Proposals',
      detail:
        interviews > 0
          ? `${interviews} interview${interviews === 1 ? '' : 's'} waiting`
          : drafts > 0
            ? `${drafts} draft${drafts === 1 ? '' : 's'} to finish`
            : 'All proposals up to date',
      icon: FileText,
      target: '/freelancer/my-proposals',
    },
  ]
}

export default FreelancerDashboard
