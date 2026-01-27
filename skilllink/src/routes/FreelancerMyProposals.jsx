import { useEffect, useState } from 'react'
import { ArrowRight, FileText, Link2, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchFreelancerProposals } from '../services/firestoreClient'

const statusCopy = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  interview: 'Interview',
  hired: 'Hired',
  rejected: 'Not selected',
}

const FreelancerMyProposals = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) return
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const records = await fetchFreelancerProposals(user.uid)
        if (active) {
          setProposals(records)
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

  const formatRelative = (value) => {
    if (!value) return 'just now'
    try {
      const updated = new Date(value)
      const diff = Date.now() - updated.getTime()
      if (diff < 60 * 1000) return 'just now'
      if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`
      if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`
      return updated.toLocaleDateString()
    } catch (error) {
      return value
    }
  }

  const handleView = (gigId) => navigate(`/freelancer/proposals/${gigId}`)

  return (
    <div className="freelancer-proposals">
      <section className="freelancer-proposals-hero">
        <div>
          <p>Proposal pipeline</p>
          <h2>
            {proposals.length} active proposal{proposals.length === 1 ? '' : 's'}
          </h2>
          <span>Keep tabs on cover letters, interview invites, and hires.</span>
        </div>
        <button type="button" className="cta cta-primary" onClick={() => navigate('/freelancer/opportunities')}>
          Browse gigs
        </button>
      </section>

      {loading ? (
        <div className="freelancer-proposals-loading">
          <Loader2 size={24} className="icon-spin" aria-hidden="true" />
          <p>Loading your proposals…</p>
        </div>
      ) : proposals.length ? (
        <div className="freelancer-proposals-list">
          {proposals.map((proposal) => (
            <article className="freelancer-proposal-card" key={proposal.id}>
              <header>
                <div>
                  <p>{proposal.gigClient}</p>
                  <h3>{proposal.gigTitle}</h3>
                </div>
                <span className={`status-pill status-pill--${proposal.status}`}>
                  {statusCopy[proposal.status] || proposal.status}
                </span>
              </header>
              <p>{proposal.gigSummary}</p>
              <div className="freelancer-proposal-meta">
                <span>
                  {proposal.gigBudget} · {proposal.gigType}
                </span>
                {proposal.gigTokens ? <span>{proposal.gigTokens} tokens</span> : null}
              </div>
              {proposal.interviewLink ? (
                <div className="freelancer-proposal-hint">
                  <Link2 size={14} aria-hidden="true" /> Interview link ready
                </div>
              ) : null}
              <footer>
                <small>Updated {formatRelative(proposal.updatedAt)}</small>
                <button type="button" className="ghost-button ghost-compact" onClick={() => handleView(proposal.id)}>
                  View details
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="freelancer-proposals-empty">
          <FileText size={32} aria-hidden="true" />
          <h3>No proposals yet</h3>
          <p>Once you apply to gigs, they’ll appear here with their latest status.</p>
          <button type="button" className="cta" onClick={() => navigate('/freelancer/opportunities')}>
            Start browsing
          </button>
        </div>
      )}
    </div>
  )
}

export default FreelancerMyProposals
