import { useEffect, useState } from 'react'
import { ArrowLeft, BookmarkPlus, Clock3, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchGigById } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'

const FreelancerGigDetail = () => {
  const navigate = useNavigate()
  const { gigId } = useParams()
  const [gig, setGig] = useState(null)
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'error')
  const [error, setError] = useState(
    isFirebaseConfigured ? null : new Error('Connect Firebase to fetch gig details.'),
  )

  useEffect(() => {
    let active = true
    const loadGig = async () => {
      if (!gigId || !isFirebaseConfigured) {
        return
      }
      setStatus('loading')
      try {
        const record = await fetchGigById(gigId)
        if (!active) return
        setGig(record || null)
        setStatus('ready')
      } catch (err) {
        if (!active) return
        setError(err)
        setStatus('error')
      }
    }

    loadGig()
    return () => {
      active = false
    }
  }, [gigId])

  const handleApply = () => {
    if (!gig?.id) return
    navigate(`/freelancer/proposals/${gig.id}`)
  }

  const handleBack = () => {
    navigate('/freelancer/opportunities')
  }

  if (status === 'loading') {
    return (
      <div className="freelancer-gig-detail">
        <p>Loading gig details…</p>
      </div>
    )
  }

  if (!gig) {
    return (
      <div className="freelancer-gig-detail">
        <p>{error ? error.message : 'Gig not found or no longer available.'}</p>
        <button type="button" onClick={handleBack} className="ghost-button">
          Back to opportunities
        </button>
      </div>
    )
  }

  const projectOverview = gig.description || gig.projectOverview || gig.summary || ''
  const responsibilities = ensureList(gig.responsibilities)
  const requirements = ensureList(gig.requirements)
  const timelineLabel = gig.timeline || gig.deadline || 'Flexible'
  // client languages removed from frontend
  const clientLocation = gig.client?.location || gig.client?.state || 'Nigeria (remote)'

  return (
    <div className="freelancer-gig-detail">
      <button type="button" className="gig-back" onClick={handleBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to opportunities
      </button>

      <section className="freelancer-gig-hero">
        <div>
          {/* <p className="gig-breadcrumb">Browse Gigs · {gig.client?.sector || 'Nigerian teams'}</p> */}
          <h1>{gig.title}</h1>
          <p className="gig-hero-summary">{gig.summary}</p>
          <div className="gig-hero-tags">
            {(gig.tags || []).map((tag) => (
              <span key={`hero-${gig.id}-${tag}`}>{tag}</span>
            ))}
          </div>
          <div className="gig-hero-actions">
            <button type="button" className="cta cta-primary" onClick={handleApply}>
              Apply to this gig
            </button>
            {/* <button type="button" className="ghost-button">
              Save gig
              <BookmarkPlus size={16} aria-hidden="true" />
            </button> */}
          </div>
        </div>
          <div className="gig-hero-panel">
          <div className="gig-hero-row">
            <Clock3 size={18} aria-hidden="true" />
            <div>
              <p>Timeline</p>
              <strong>{timelineLabel}</strong>
            </div>
          </div>
          <div className="gig-hero-row">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <p>Client</p>
              <strong>
                {gig.client?.name || 'SkillLink client'}{' '}
                {gig.client?.verified && <span className="gig-verified">Verified</span>}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="gig-detail-layout">
        <div className="gig-detail-main">
          <article className="gig-card">
            <h2>Project overview</h2>
            <p>{projectOverview || 'Client will add a detailed overview soon.'}</p>
            <div className="gig-detail-pills">
              {(gig.deliverables || []).map((item) => (
                <span key={`deliverable-${gig.id}-${item}`}>{item}</span>
              ))}
            </div>
          </article>

          <article className="gig-card">
            <h2>Responsibilities</h2>
            {responsibilities.length ? (
              <ul>
                {responsibilities.map((responsibility) => (
                  <li key={`resp-${gig.id}-${responsibility}`}>{responsibility}</li>
                ))}
              </ul>
            ) : (
              <p>Responsibilities coming soon.</p>
            )}
          </article>

          <article className="gig-card">
            <h2>Requirements</h2>
            {requirements.length ? (
              <ul>
                {requirements.map((requirement) => (
                  <li key={`req-${gig.id}-${requirement}`}>{requirement}</li>
                ))}
              </ul>
            ) : (
              <p>Requirements coming soon.</p>
            )}
          </article>

          {gig.attachments?.length > 0 && (
            <article className="gig-card">
              <h2>Attachments</h2>
              <div className="gig-attachments">
                {gig.attachments.map((file) => (
                  <div key={file.id} className="gig-attachment">
                    <div>
                      <strong>{file.name}</strong>
                      <p>
                        {file.size} · {file.type}
                      </p>
                    </div>
                    <button type="button">Download</button>
                  </div>
                ))}
              </div>
            </article>
          )}
        </div>

        <aside className="gig-detail-side">
          <article className="gig-card">
            <h3>Client insights</h3>
            <dl>
              <div>
                <dt>Industry</dt>
                <dd>{gig.client?.sector || '—'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{clientLocation}</dd>
              </div>
              {/* Languages removed from client snapshot */}
              <div>
                {/* <dt>Jobs posted</dt> */}
                {/* <dd>{gig.client?.jobsPosted ?? '—'}</dd> */}
              </div>
              {/* <div>
                <dt>Average rating</dt>
                <dd>{gig.client?.rating ?? '—'}</dd>
              </div> */}
            </dl>
          </article>

          <article className="gig-card">
            <h3>Ready to apply?</h3>
            <p>Review the brief, tailor your cover letter, and submit a thoughtful proposal.</p>
            <button type="button" className="cta cta-primary" onClick={handleApply}>
              Start application
            </button>
          </article>
        </aside>
      </section>
    </div>
  )
}

export default FreelancerGigDetail

function ensureList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}
