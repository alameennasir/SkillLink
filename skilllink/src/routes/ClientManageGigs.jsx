import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeDollarSign, Clock3, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { subscribeToClientGigs, updateGigStatus } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'

const gigFilters = [
  { id: 'all', label: 'All Gigs' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
]

const sortOptions = [
  { id: 'newest', label: 'Newest First' },
  { id: 'oldest', label: 'Oldest First' },
  { id: 'az', label: 'A to Z' },
]

const ClientManageGigs = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [gigs, setGigs] = useState([])
  const [status, setStatus] = useState('loading')
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [pendingGigId, setPendingGigId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.uid) return

    if (!isFirebaseConfigured) {
      setStatus('error')
      setError(new Error('Add Firebase (.env VITE_FIREBASE_*) to load your Nigerian gig postings.'))
      setGigs([])
      return () => {}
    }

    setStatus('loading')
    setError(null)
    const unsubscribe = subscribeToClientGigs(user.uid, (nextGigs) => {
      setGigs(nextGigs)
      setStatus('ready')
    })

    return () => {
      unsubscribe?.()
    }
  }, [user?.uid])


  const resolveBudget = (gig) =>
    gig.budget || `${gig.currency || '₦'}${gig.budgetMin || '0'} - ${gig.currency || '₦'}${gig.budgetMax || '0'}`

  const categoryCounts = useMemo(
    () => ({
      all: gigs.length,
      active: gigs.filter((gig) => isActiveGig(gig)).length,
      paused: gigs.filter((gig) => isPausedGig(gig)).length,
    }),
    [gigs],
  )

  const visibleGigs = useMemo(() => {
    const scoped = gigs.filter((gig) => {
      if (activeFilter === 'all') return true
      if (activeFilter === 'active') return isActiveGig(gig)
      if (activeFilter === 'paused') return isPausedGig(gig)
      return true
    })

    return scoped.sort((a, b) => {
      if (sortOrder === 'az') {
        return a.title.localeCompare(b.title)
      }

      const dateA = toDateValue(a.createdAt || a.postedDate) || new Date(0)
      const dateB = toDateValue(b.createdAt || b.postedDate) || new Date(0)
      if (sortOrder === 'oldest') {
        return dateA - dateB
      }
      return dateB - dateA
    })
  }, [gigs, activeFilter, sortOrder])

  const handleCreateGig = () => {
    navigate('/client/post-gig')
  }

  const handleEditGig = (gig) => {
    if (!gig?.id) return
    navigate(`/client/post-gig?gigId=${gig.id}`, { state: { gig } })
  }

  const handleViewApplicants = (gig) => {
    if (!gig?.id) return
    navigate(`/client/manage-gigs/${gig.id}/applicants`)
  }

  const handlePauseGig = async (gig) => {
    if (!gig?.id) return
    setPendingGigId(gig.id)
    const currentlyPaused = isPausedGig(gig)
    const nextStatus = currentlyPaused ? gig.pausedPreviousStatus || 'Active' : 'Paused'
    const updates = {
      status: nextStatus,
      pausedAt: currentlyPaused ? null : new Date().toISOString(),
      pausedPreviousStatus: currentlyPaused ? null : gig.status || 'Active',
    }

    try {
      await updateGigStatus(gig.id, updates)
    } catch (error) {
      console.error('Unable to update gig status', error)
    } finally {
      setPendingGigId(null)
    }
  }
  return (
    <div className="gigs-page">
      <div className="gigs-breadcrumb">My Gigs</div>

      <header className="gigs-header">
        <div>
          <p className="eyebrow">My Gigs</p>
          <h1>My Gigs Dashboard</h1>
        </div>
        <div className="gig-controls">
          <label className="sort-control">
            <span>Sort by:</span>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              {sortOptions.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="cta cta-primary" onClick={handleCreateGig}>
            Post New Gig
          </button>
        </div>
      </header>

      <div className="gig-tabs" role="tablist" aria-label="Gig filters">
        {gigFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            className={['gig-tab', activeFilter === filter.id && 'gig-tab-active'].filter(Boolean).join(' ')}
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label} <span>({categoryCounts[filter.id] || 0})</span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="gig-empty">
          <p>{error.message}</p>
        </div>
      ) : status === 'loading' && gigs.length === 0 ? (
        <div className="gig-empty">Loading gigs...</div>
      ) : visibleGigs.length === 0 ? (
        <div className="gig-empty">No gigs in this view.</div>
      ) : (
        <div className="gig-cards">
          {visibleGigs.map((gig) => (
            <article className="gig-dashboard-card" key={gig.id}>
              <div className="gig-card-header">
                <span className={`status-pill status-${getStatusTone(gig.status)}`}>{normalizeStatusLabel(gig.status)}</span>
                <p>
                  Posted: {formatPostedDate(gig)}
                  {gig.pausedAt ? ` - Paused: ${formatDateValue(gig.pausedAt)}` : ''}
                </p>
              </div>
              <h3>{gig.title}</h3>
              <p className="gig-summary">{gig.summary || 'Awaiting summary details.'}</p>
              <div className="gig-card-meta">
                <div>
                  <BadgeDollarSign size={18} aria-hidden="true" />
                  <span>{resolveBudget(gig)}</span>
                </div>
                <div>
                  <Clock3 size={18} aria-hidden="true" />
                  <span>{gig.duration || gig.timeline || gig.projectLength || 'Ongoing'}</span>
                </div>
                <div>
                  <Users size={18} aria-hidden="true" />
                  <span>{gig.applicants || gig.pendingApplicants || 0} New Applicants</span>
                </div>
              </div>
              <div className="gig-card-actions">
                <button type="button" className="cta cta-primary" onClick={() => handleEditGig(gig)}>
                  Edit Gig
                </button>
                <button type="button" className="gig-secondary" onClick={() => handleViewApplicants(gig)}>
                  View Applicants
                </button>
                <button
                  type="button"
                  className={[
                    'gig-pause',
                    isPausedGig(gig) ? 'gig-pause-resume' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handlePauseGig(gig)}
                  disabled={pendingGigId === gig.id}
                  aria-busy={pendingGigId === gig.id}
                >
                  {isPausedGig(gig) ? 'Resume Hiring' : 'Pause Hiring'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <footer className="gig-pagination">
        <button type="button" className="pager-btn" aria-label="Previous page">
          <ChevronLeft size={18} aria-hidden="true" /> Previous
        </button>
        <div className="pager-pages">
          <button type="button" className="pager-page pager-page-active">
            1
          </button>
          <button type="button" className="pager-page">2</button>
          <span>...</span>
          <button type="button" className="pager-page">14</button>
        </div>
        <button type="button" className="pager-btn" aria-label="Next page">
          Next <ChevronRight size={18} aria-hidden="true" />
        </button>
      </footer>

    </div>
  )
}

export default ClientManageGigs

const normalizeStatus = (status) => status?.toLowerCase?.() ?? ''

const isPausedGig = (gig) => normalizeStatus(gig.status) === 'paused'

const isActiveGig = (gig) => !isPausedGig(gig)

const getStatusTone = (status) => {
  const normalized = normalizeStatus(status)
  if (normalized === 'paused') return 'paused'
  return 'active'
}

const normalizeStatusLabel = (status) => {
  if (!status) return 'Active'
  const normalized = normalizeStatus(status)
  if (normalized === 'paused') return 'Paused'
  if (normalized === 'draft') return 'Draft'
  return status
}

const formatPostedDate = (gig) => {
  if (gig.postedLabel) return gig.postedLabel
  const dateValue = gig.postedDate || gig.createdAt
  return dateValue ? formatDateValue(dateValue) : 'Just now'
}

const formatDateValue = (value) => {
  const parsed = toDateValue(value)
  if (!parsed) {
    return '—'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

const toDateValue = (value) => {
  if (!value) return null
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate()
    } catch (error) {
      return null
    }
  }
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

