import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MapPin, ExternalLink, ChevronDown, Linkedin, Twitter, Dribbble, ShieldCheck, X } from 'lucide-react'
import { searchFreelancers, createMessagingThread } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'
import { useAuth } from '../context/AuthContext'
import { getInitials } from './clientApplicantHelpers'

const footerSocialLinks = [
  { label: 'LinkedIn', icon: Linkedin, href: 'https://linkedin.com/company/skilllink' },
  { label: 'Twitter', icon: Twitter, href: 'https://twitter.com/skilllink' },
  { label: 'Dribbble', icon: Dribbble, href: 'https://dribbble.com/skilllink' },
]

const TalentPortfolioPreview = ({ media = [], initials, name, variant = 'grid' }) => {
  const primaryMedia = useMemo(() => (Array.isArray(media) ? media[0] : null), [media])
  const copy = variant === 'grid' ? 'View case study' : 'Case files coming soon'
  const previewSrc = primaryMedia?.thumbnail || primaryMedia?.previewUrl || primaryMedia?.url || ''

  return (
    <div className={`talent-portfolio-preview ${variant === 'modal' ? 'modal' : ''}`} aria-hidden={!previewSrc}>
      {previewSrc ? (
        <img src={previewSrc} alt={primaryMedia?.title || `${name} preview`} />
      ) : (
        <div className="talent-portfolio-fallback" aria-label={`No media uploaded for ${name} yet`}>
          <span>{initials}</span>
          <small>{copy}</small>
        </div>
      )}
    </div>
  )
}

const ClientTalentSearch = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All Talent')
  const [visibleCount, setVisibleCount] = useState(12)
  const [talent, setTalent] = useState([])
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'error')
  const [error, setError] = useState(
    isFirebaseConfigured ? null : new Error('Provide Firebase credentials to surface real Nigerian talent.'),
  )
  const [selectedCase, setSelectedCase] = useState(null)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    let active = true
    const load = async () => {
      setStatus('loading')
      setError(null)
      try {
        const results = await searchFreelancers({ limit: 48, visibleOnly: true })
        if (active) {
          setTalent(results)
          setStatus('ready')
        }
      } catch (err) {
        if (active) {
          setError(err)
          setStatus('error')
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])


  const portfolioCases = useMemo(() => {
    return talent.flatMap((person) => {
      if (!Array.isArray(person.featured) || !person.featured.length) return []
      const freelancerName = person.displayName || person.fullName || 'Freelancer'
      const freelancerTitle = person.title || 'Independent talent'
      const freelancerLocation = person.location || person.state || 'Remote'
      const freelancerLanguages = []
      const freelancerSkills = Array.isArray(person.skills) ? person.skills.filter(Boolean) : []
      const freelancerInitials = getInitials(freelancerName)
      return person.featured.map((caseItem, index) => ({
        id: caseItem.id || `${person.id}-portfolio-${index}`,
        title: caseItem.title || 'Untitled project',
        description: caseItem.description || '',
        previewUrl: caseItem.previewUrl || caseItem.media?.previewUrl || caseItem.media?.url || '',
        tags: Array.isArray(caseItem.tags) ? caseItem.tags.filter(Boolean) : [],
        url: caseItem.url || '',
        freelancerId: person.id,
        freelancerName,
        freelancerTitle,
        freelancerLocation,
        
        freelancerSkills,
        freelancerInitials,
        isVerified: person.verificationStatus === 'verified',
        media: Array.isArray(caseItem.media) ? caseItem.media : caseItem.media ? [caseItem.media] : [],
      }))
    })
  }, [talent])

  const categories = useMemo(() => {
    const tagSet = new Set()
    portfolioCases.forEach((item) => {
      item.tags?.forEach((tag) => tagSet.add(tag))
      item.freelancerSkills?.forEach((skill) => tagSet.add(skill))
    })
    return ['All Talent', ...Array.from(tagSet).sort((a, b) => a.localeCompare(b))]
  }, [portfolioCases])

  const filteredCases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return portfolioCases.filter((item) => {
      const searchable = [
        item.title,
        item.description,
        item.freelancerName,
        item.freelancerTitle,
        item.freelancerLocation,
        ...(item.tags || []),
        ...(item.freelancerSkills || []),
      ]
      const matchesQuery = normalizedQuery
        ? searchable.some((value) => value?.toLowerCase().includes(normalizedQuery))
        : true
      const matchesCategory =
        activeCategory === 'All Talent'
          ? true
          : [...(item.tags || []), ...(item.freelancerSkills || [])].some(
              (value) => value?.toLowerCase() === activeCategory.toLowerCase(),
            )
      return matchesQuery && matchesCategory
    })
  }, [portfolioCases, query, activeCategory])

  const visibleCases = useMemo(() => filteredCases.slice(0, visibleCount), [filteredCases, visibleCount])

  useEffect(() => {
    setVisibleCount(12)
  }, [activeCategory, query])

  const handleSelectCase = (caseItem) => {
    setSelectedCase(caseItem)
  }

  const handleCloseCase = () => {
    setSelectedCase(null)
  }

  const handleMessageFreelancer = async (caseItem) => {
    if (!user?.uid) {
      navigate('/auth/login', { state: { redirect: '/client/talent-search' } })
      throw new Error('Sign in as a client to message freelancers.')
    }
    const thread = await createMessagingThread({
      participants: [user.uid, caseItem.freelancerId],
      createdBy: user.uid,
      participantsInfo: {
        [user.uid]: { displayName: user.displayName || 'Client' },
        [caseItem.freelancerId]: {
          displayName: caseItem.freelancerName,
          title: caseItem.freelancerTitle,
        },
      },
      subject: `${caseItem.title} | Portfolio intro`,
      metadata: { source: 'talent-search', portfolioId: caseItem.id },
      reuseExisting: true,
    })
    navigate('/client/messages', { state: { threadId: thread.id } })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    // Future enhancement: hook into Firestore search.
  }

  return (
    <div className="talent-page">
      <header className="talent-hero">
        <h1>Discover Creative Talent</h1>
        <p className="talent-hero-copy">
          Source verified Nigerian designers, engineers, and storytellers. Every profile is reviewed before landing in
          your shortlist.
        </p>
        <form className="talent-search-bar" onSubmit={handleSubmit} role="search">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search for creative talent, skills, or roles"
            aria-label="Search for creative talent"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
        <div className="talent-filter-row">
          <div className="talent-filter-group">
            {categories.map((label) => (
              <button
                type="button"
                className={`talent-filter ${activeCategory === label ? 'talent-filter-active' : ''}`}
                key={label}
                onClick={() => setActiveCategory(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="talent-results">
        {error ? (
          <div className="talent-empty">
            <h3>Firebase setup required</h3>
            <p>{error.message}</p>
          </div>
        ) : status === 'loading' ? (
          <div className="talent-empty">
            <h3>Loading freelancer portfolios…</h3>
            <p>Give us a moment to sync case studies from Firestore.</p>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="talent-empty">
            <h3>No portfolio cases yet</h3>
            <p>Invite freelancers to publish case studies or adjust your filters.</p>
          </div>
        ) : (
          <>
            <p className="results-count">{filteredCases.length} portfolio cases ready to explore</p>
            <div className="talent-portfolio-grid">
              {visibleCases.map((item) => (
                <button
                  type="button"
                  className="talent-portfolio-card compact"
                  key={`${item.freelancerId}-${item.id}`}
                  onClick={() => handleSelectCase(item)}
                >
                  <TalentPortfolioPreview
                    media={item.media}
                    initials={item.freelancerInitials}
                    name={item.freelancerName}
                    variant="grid"
                  />
                  <div className="talent-portfolio-body compact">
                    <h3>{item.title}</h3>
                    <p className="talent-card-author">{item.freelancerName}</p>
                    <small>{item.freelancerTitle}</small>
                  </div>
                </button>
              ))}
            </div>
            {visibleCases.length < filteredCases.length && (
              <button type="button" className="load-more" onClick={() => setVisibleCount((prev) => prev + 12)}>
                Load More Results <ChevronDown size={18} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </section>

      {selectedCase && (
        <PortfolioCaseModal
          caseItem={selectedCase}
          onClose={handleCloseCase}
          onMessage={handleMessageFreelancer}
          canManageChats={Boolean(user?.uid)}
        />
      )}

      {/* <div className="talent-footer-shell">
        <footer className="talent-footer">
          <div className="talent-footer-bottom">
            <p className="footer-legal">© 2024 SkillLink Inc. All rights reserved.</p>
            <div className="footer-socials">
              {footerSocialLinks.map(({ label, icon: Icon, href }) => (
                <a key={label} href={href} aria-label={label} target="_blank" rel="noreferrer">
                  <Icon size={16} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div> */}
    </div>
  )
}

const PortfolioCaseModal = ({ caseItem, onClose, onMessage, canManageChats }) => {
  const [messageStatus, setMessageStatus] = useState('idle')
  const [feedback, setFeedback] = useState('')

  const handleMessage = async () => {
    if (!canManageChats) {
      setFeedback('Sign in as a client to message freelancers.')
      return
    }
    setMessageStatus('loading')
    setFeedback('')
    try {
      await onMessage(caseItem)
      setFeedback('Private chat ready in Messages.')
      onClose()
    } catch (error) {
      setFeedback(error?.message || 'Unable to start the chat right now.')
    } finally {
      setMessageStatus('idle')
    }
  }

  const languageCopy = 'Languages not shared'

  return (
    <>
      <div className="talent-case-modal-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="talent-case-modal" role="dialog" aria-modal="true" aria-label="Portfolio case study detail">
        <header className="talent-modal-head">
          <div>
            <p className="eyebrow">Portfolio case study</p>
            <h2>{caseItem.title}</h2>
            <small>
              {caseItem.freelancerName} · {caseItem.freelancerTitle}
            </small>
          </div>
          <button type="button" className="talent-modal-close" onClick={onClose} aria-label="Close portfolio detail">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="talent-modal-body">
          <div className="talent-modal-overview">
            <div className="talent-modal-preview">
              <TalentPortfolioPreview
                media={caseItem.media}
                initials={caseItem.freelancerInitials}
                name={caseItem.freelancerName}
                variant="modal"
              />
            </div>
            <div className="talent-modal-copy">
              <p>{caseItem.description || 'This freelancer has not added additional details yet.'}</p>
              {caseItem.tags?.length ? (
                <div className="talent-portfolio-tags">
                  {caseItem.tags.slice(0, 6).map((tag) => (
                    <span key={`${caseItem.id}-${tag}`}>{tag}</span>
                  ))}
                </div>
              ) : null}
              <div className="talent-modal-meta">
                <span>
                  <MapPin size={14} aria-hidden="true" /> {caseItem.freelancerLocation || 'Remote'}
                </span>
                {/* Languages removed from profile details */}
                {caseItem.isVerified && (
                  <span className="talent-verified">
                    <ShieldCheck size={14} aria-hidden="true" /> Verified
                  </span>
                )}
              </div>
              <div className="talent-modal-primary-actions">
                <button
                  type="button"
                  className="talent-primary"
                  onClick={handleMessage}
                  disabled={messageStatus === 'loading'}
                >
                  {messageStatus === 'loading' ? 'Opening chat…' : 'Message privately'}
                </button>
                {caseItem.url ? (
                  <a className="talent-ghost" href={caseItem.url} target="_blank" rel="noreferrer">
                    View case study <ExternalLink size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <button type="button" className="talent-ghost" disabled>
                    Case study link missing
                  </button>
                )}
              </div>
            </div>
          </div>

          

          {feedback && <p className="talent-modal-feedback">{feedback}</p>}
          {!canManageChats && <p className="talent-modal-hint">Sign in as a client to start a private chat.</p>}
        </div>
      </div>
    </>
  )
}

export default ClientTalentSearch


