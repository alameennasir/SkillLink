import { useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { subscribeToOpenGigs } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'
const fallbackGigThumbnail = 'https://placehold.co/320x180?text=SkillLink'

const normalizeText = (value) => (typeof value === 'string' ? value.toLowerCase() : '')

const resolveGigTags = (gig) => {
  if (Array.isArray(gig?.tags) && gig.tags.length) {
    return gig.tags
  }
  if (Array.isArray(gig?.skills) && gig.skills.length) {
    return gig.skills.filter(Boolean)
  }
  if (typeof gig?.skills === 'string' && gig.skills.trim()) {
    return gig.skills
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
  return ['General']
}

const quickFilters = [
  {
    id: 'verified-clients',
    label: 'Verified clients',
    predicate: (gig) => Boolean(gig.client?.verified),
  },
  {
    id: 'token-boost',
    label: 'Token boost (2+)',
    predicate: (gig) => (gig.tokens ?? 0) >= 2,
  },
  {
    id: 'fixed-price',
    label: 'Fixed price',
    predicate: (gig) => normalizeText(gig.priceType).includes('fixed'),
  },
  {
    id: 'remote-friendly',
    label: 'Remote friendly',
    predicate: (gig) => normalizeText(gig.client?.location).includes('remote'),
  },
]

const FreelancerOpportunities = () => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState([])
  const [records, setRecords] = useState([])
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'error')
  const [error, setError] = useState(
    isFirebaseConfigured
      ? null
      : new Error('Connect Firebase (VITE_FIREBASE_*) to pull live gigs posted by Nigerian clients.'),
  )

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return () => {}
    }

    setStatus('loading')
    setError(null)
    const unsubscribe = subscribeToOpenGigs((gigs = []) => {
      setRecords(gigs)
      setStatus('ready')
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const filteredGigs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const matchesQuery = (gig) => {
      if (!normalizedQuery) return true
      const haystack = [gig.title, gig.summary, gig.client?.name, gig.client?.sector, ...(gig.tags || [])]
      return haystack.some((text) => text?.toLowerCase().includes(normalizedQuery))
    }

    const matchesFilters = (gig) => {
      if (!activeFilters.length) return true
      return activeFilters.every((filterId) => {
        const filter = quickFilters.find((item) => item.id === filterId)
        return filter ? filter.predicate(gig) : true
      })
    }

    return records.filter((gig) => matchesQuery(gig) && matchesFilters(gig))
  }, [records, query, activeFilters])

  const toggleFilter = (filterId) => {
    setActiveFilters((current) =>
      current.includes(filterId) ? current.filter((id) => id !== filterId) : [...current, filterId],
    )
  }

  const clearFilters = () => {
    setQuery('')
    setActiveFilters([])
  }

  const clearSearch = () => setQuery('')
  const hasActiveFilters = Boolean(query || activeFilters.length)
  const isLoading = status === 'loading'
  const showEmptyState = !isLoading && !filteredGigs.length

  const handleViewDetails = (gigId) => {
    navigate(`/freelancer/opportunities/${gigId}`)
  }

  return (
    <div className="freelancer-opportunities">
      <header className="opportunities-hero">
        <p>Browse Gigs</p>
        <h1>Find your next gig</h1>
        <span>Explore vetted briefs from Nigerian startups, NGOs, and creative teams.</span>
      </header>

      <div className="opportunities-search">
        <div className="opportunities-search-input">
          <Search size={18} aria-hidden="true" />
          <input
            placeholder="Search for gigs, keywords, or industries…"
            aria-label="Search gigs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button type="button" className="opportunities-search-action" onClick={clearSearch} disabled={!query}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Clear search
        </button>
      </div>

      <div className="opportunities-filters">
        {quickFilters.map((chip) => (
          <button
            type="button"
            key={chip.id}
            className={`opportunities-chip ${activeFilters.includes(chip.id) ? 'is-active' : ''}`}
            onClick={() => toggleFilter(chip.id)}
            aria-pressed={activeFilters.includes(chip.id)}
          >
            {chip.label}
          </button>
        ))}
        <button type="button" className="opportunities-clear" onClick={clearFilters} disabled={!hasActiveFilters}>
          Clear all filters
        </button>
      </div>

      {error ? (
        <div className="opportunities-empty">
          <h3>Firebase setup required</h3>
          <p>{error.message}</p>
        </div>
      ) : isLoading ? (
        <div className="opportunities-empty">
          <h3>Loading live gigs…</h3>
          <p>Hang tight while we sync briefs from Firebase.</p>
        </div>
      ) : !showEmptyState ? (
        <>
          <div className="opportunities-grid">
            {filteredGigs.map((gig) => {
              const thumbnail = gig.thumbnail || fallbackGigThumbnail
              const priceType = gig.priceType || 'Flexible budget'
              const priceRange = gig.priceRange || gig.budget || 'Budget shared privately'
              const clientName = gig.client?.name || 'SkillLink client'
              const clientRating = gig.client?.rating || 'New'
              const tags = resolveGigTags(gig)

              return (
                <article className="opportunities-card" key={gig.id}>
                  <div className="opportunities-card-media" aria-hidden="true">
                    <img src={thumbnail} alt="" />
                    <span className="opportunities-card-badge">{priceType}</span>
                  </div>
                  <div className="opportunities-card-body">
                    <div className="opportunities-card-head">
                      <h3>{gig.title || 'Untitled gig'}</h3>
                      <span>{priceRange}</span>
                    </div>
                    <p>
                      {clientName} • {clientRating} rating
                    </p>
                    <div className="opportunities-card-tags">
                      {tags.map((tag) => (
                        <span key={`${gig.id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                    <button type="button" onClick={() => handleViewDetails(gig.id)}>
                      View Details
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="opportunities-pagination" aria-label="Pagination">
            <button type="button" aria-label="Previous page">
              ‹
            </button>
            <button type="button" className="is-active">
              1
            </button>
            <button type="button">2</button>
            <button type="button">3</button>
            <span>…</span>
            <button type="button">12</button>
            <button type="button" aria-label="Next page">
              ›
            </button>
          </div>
        </>
      ) : (
        <div className="opportunities-empty">
          <h3>No gigs match your filters</h3>
          <p>Adjust your search or ask a client to publish a new brief from their dashboard.</p>
          <button type="button" className="cta" onClick={clearFilters}>
            Reset filters
          </button>
        </div>
      )}
    </div>
  )
}

export default FreelancerOpportunities
