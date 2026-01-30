import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchFreelancerProposals } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'

const tabConfig = [
  { id: 'applications', label: 'Applications', statuses: ['draft', 'submitted'] },
  { id: 'active', label: 'Active Gigs', statuses: ['under_review', 'interview'] },
  { id: 'completed', label: 'Completed', statuses: ['hired'] },
]

const statusLabel = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  interview: 'Interview',
  hired: 'Hired',
}

const FreelancerMyGigs = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('active')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.uid) return
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      if (!isFirebaseConfigured) {
        if (active) {
          setRecords([])
          setLoading(false)
          setError(new Error('Provide Firebase credentials to load proposal/gig statuses.'))
        }
        return
      }
      try {
        const data = await fetchFreelancerProposals(user.uid)
        if (active) {
          setRecords(data)
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

  const grouped = useMemo(() => {
    return tabConfig.reduce((acc, tab) => {
      acc[tab.id] = records.filter((proposal) => tab.statuses.includes(proposal.status))
      return acc
    }, {})
  }, [records])

  const activeRecords = grouped[activeTab] || []

  const goToMarketplace = () => navigate('/freelancer/opportunities')
  const goToProposal = (proposalId) => navigate(`/freelancer/proposals/${proposalId}`)

  return (
    <div className="freelancer-my-gigs">
      <section className="freelancer-my-gigs-hero">
        <div>
          <h1>Manage My Gigs</h1>
          <p>See where your Nigerian client work sits in the pipeline.</p>
        </div>
        <button type="button" onClick={goToMarketplace}>
          Browse Marketplace
        </button>
      </section>

      <div className="freelancer-my-gigs-tabs" role="tablist">
        {tabConfig.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={tab.id === activeTab ? 'is-active' : ''}
            role="tab"
            aria-selected={tab.id === activeTab}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label} ({grouped[tab.id]?.length ?? 0})
          </button>
        ))}
      </div>

      {error ? (
        <div className="freelancer-my-gigs-empty">
          <p>{error.message || 'Unable to load gigs right now.'}</p>
          <button type="button" className="cta" onClick={goToMarketplace}>
            Browse gigs
          </button>
        </div>
      ) : loading ? (
        <div className="freelancer-my-gigs-empty">
          <p>Syncing your latest gigs…</p>
        </div>
      ) : activeRecords.length ? (
        <div className="freelancer-my-gigs-cards">
          {activeRecords.map((proposal) => (
            <article className="freelancer-my-gig-card" key={proposal.id}>
              <header>
                <div>
                  <p>{proposal.gigClient}</p>
                  <h3>{proposal.gigTitle}</h3>
                  {/* <span>{proposal.gigType || 'Fixed scope'}</span> */}
                </div>
                <span className="freelancer-my-gig-status">{statusLabel[proposal.status] || proposal.status}</span>
              </header>
              <footer>
                <div className="freelancer-my-gig-date">{proposal.gigDeadline || ''}</div>
                <button type="button" onClick={() => goToProposal(proposal.id)}>
                  View details
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="freelancer-my-gigs-empty">
          <p>No gigs in this stage yet.</p>
          <button type="button" onClick={goToMarketplace}>
            Find opportunities
          </button>
        </div>
      )}
    </div>
  )
}

export default FreelancerMyGigs
