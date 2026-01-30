import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeDollarSign, Clock3, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { deleteGig, subscribeToClientGigs, updateGigStatus } from '../services/firestoreClient'
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
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 6

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


  const resolveApplicantCount = (gig) => {
    // Show the total applicants on gig cards by default. Fall back to other
    // fields if the total is not available.
    if (typeof gig?.applicantsCount === 'number') return gig.applicantsCount
    if (typeof gig?.applicants === 'number') return gig.applicants
    if (typeof gig?.pendingApplicants === 'number') return gig.pendingApplicants
    const byStatus = gig?.applicantsByStatus || null
    const underReview = byStatus?.under_review
    if (typeof underReview === 'number') return underReview
    return 0
  }

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

  const totalPages = Math.max(1, Math.ceil(visibleGigs.length / pageSize))
  const pagedGigs = useMemo(() => {
    const start = (page - 1) * pageSize
    return visibleGigs.slice(start, start + pageSize)
  }, [page, pageSize, visibleGigs])

  useEffect(() => {
    try {
      console.debug('ClientManageGigs: gigs updated', gigs.map((g) => ({ id: g.id, applicants: g.applicants, applicantsCount: g.applicantsCount })))
    } catch (err) {}
  }, [gigs])

  useEffect(() => {
    try {
      console.debug('ClientManageGigs: pagedGigs', pagedGigs.map((g) => ({ id: g.id, applicants: g.applicants, applicantsCount: g.applicantsCount })))
    } catch (err) {}
  }, [pagedGigs])

  useEffect(() => {
    setPage(1)
  }, [activeFilter, sortOrder])

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

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

  const handleDeleteGig = async (gig) => {
    if (!gig?.id) return
    const confirmDelete = window.confirm('Delete this gig? This will close hiring for all applicants.')
    if (!confirmDelete) return
    setPendingDeleteId(gig.id)
    try {
      await deleteGig(gig.id, user?.uid)
    } catch (error) {
      console.error('Unable to delete gig', error)
    } finally {
      setPendingDeleteId(null)
    }
  }
  return (
    <div className="gigs-page">

      <header className="gigs-header">
        <div>
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
          {pagedGigs.map((gig) => (
            <article className="gig-dashboard-card" key={gig.id}>
              <div className="gig-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={`status-pill status-${getStatusTone(gig.status)}`}>{normalizeStatusLabel(gig.status)}</span>
                  <span className="applicant-status-pill" title={`${resolveApplicantCount(gig)} applicants`} aria-label={`${resolveApplicantCount(gig)} applicants`}>
                    <Users size={14} aria-hidden="true" /> {resolveApplicantCount(gig)}
                  </span>
                </div>
                <p>
                  Posted: {formatPostedDate(gig)}
                  {gig.pausedAt ? ` - Paused: ${formatDateValue(gig.pausedAt)}` : ''}
                </p>
              </div>
              <h3>{gig.title}</h3>
              <p className="gig-summary">{gig.summary || 'Awaiting summary details.'}</p>
              <div className="gig-card-meta">
                {/* <div>
                  <BadgeDollarSign size={18} aria-hidden="true" />
                  <span>{resolveBudget(gig)}</span>
                </div> */}
                <div>
                  <small>Project Deadline</small>
                  <Clock3 size={18} aria-hidden="true" />
                  <span>{gig.duration || gig.timeline || gig.projectLength || 'Ongoing'}</span>
                </div>
                {/* <div>
                  <Users size={18} aria-hidden="true" />
                  <span>{resolveApplicantCount(gig)} New Applicants</span>
                </div> */}
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
                <button
                  type="button"
                  className="gig-secondary"
                  onClick={() => handleDeleteGig(gig)}
                  disabled={pendingDeleteId === gig.id}
                  aria-busy={pendingDeleteId === gig.id}
                >
                  {pendingDeleteId === gig.id ? 'Deleting…' : 'Delete Gig'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <footer className="gig-pagination">
          <button
            type="button"
            className="pager-btn"
            aria-label="Previous page"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            <ChevronLeft size={18} aria-hidden="true" /> Previous
          </button>
          <div className="pager-pages">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                className={['pager-page', pageNumber === page && 'pager-page-active']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pager-btn"
            aria-label="Next page"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
          >
            Next <ChevronRight size={18} aria-hidden="true" />
          </button>
        </footer>
      )}

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

