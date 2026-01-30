import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Link2, Loader2, MessageSquare, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  createMessagingThread,
  fetchFreelancerProfile,
  fetchGigById,
  subscribeToGigApplicant,
  updateGigApplicantInterviewLink,
  updateGigApplicantStatus,
} from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'
import {
  formatApplicantRelative,
  formatApplicantStatus,
  getInitials,
  resolveApplicantTone,
  resolveApplicantId,
} from './clientApplicantHelpers'

const ClientApplicantOverview = () => {
  const { gigId, applicantId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [gig, setGig] = useState(null)
  const [gigStatus, setGigStatus] = useState('loading')
  const [gigError, setGigError] = useState(null)
  const [recordState, setRecordState] = useState({ status: 'loading', record: null, error: null })
  const [interviewDraft, setInterviewDraft] = useState('')
  const [interviewScheduleDraft, setInterviewScheduleDraft] = useState('')
  const [notice, setNotice] = useState(null)
  const [action, setAction] = useState(null)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [freelancerProfile, setFreelancerProfile] = useState(null)

  useEffect(() => {
    if (!gigId) return

    if (!isFirebaseConfigured) {
      setGigStatus('error')
      setGigError(new Error('Add Firebase (.env VITE_FIREBASE_*) to load gig context.'))
      setGig(null)
      return
    }

    let isMounted = true
    setGigStatus('loading')
    setGigError(null)

    fetchGigById(gigId)
      .then((payload) => {
        if (!isMounted) return
        if (!payload) {
          throw new Error('We could not find this gig. It may have been removed.')
        }
        setGig(payload)
        setGigStatus('ready')
      })
      .catch((error) => {
        if (!isMounted) return
        setGigStatus('error')
        setGigError(error)
      })

    return () => {
      isMounted = false
    }
  }, [gigId])

  useEffect(() => {
    if (!gigId || !applicantId) return () => {}

    if (!isFirebaseConfigured) {
      setRecordState({
        status: 'error',
        record: null,
        error: new Error('Add Firebase (.env VITE_FIREBASE_*) to load applicant details.'),
      })
      return () => {}
    }

    setRecordState({ status: 'loading', record: null, error: null })
    const unsubscribe = subscribeToGigApplicant(
      gigId,
      applicantId,
      (record) => {
        if (!record) {
          setRecordState({
            status: 'empty',
            record: null,
            error: new Error('We could not find this applicant. They may have withdrawn the proposal.'),
          })
          return
        }
        setRecordState({ status: 'ready', record, error: null })
        setInterviewDraft(record.interviewLink || '')
        setInterviewScheduleDraft(toLocalDatetimeInput(record.interviewSchedule || record.milestones?.interviewAt))
      },
      {
        onError: (error) => {
          setRecordState({ status: 'error', record: null, error })
        },
      },
    )

    return () => {
      unsubscribe?.()
    }
  }, [gigId, applicantId])

  const applicantRecord = recordState.record
  const applicantSnapshot = applicantRecord?.freelancerSnapshot || {}
  const applicantFreelancerId = useMemo(() => resolveApplicantId(applicantRecord) || applicantId || null, [applicantRecord, applicantId])

  useEffect(() => {
    if (!applicantRecord) {
      setIsProfileModalOpen(false)
    }
  }, [applicantRecord])

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setFreelancerProfile(null)
      return () => {}
    }
    if (!applicantFreelancerId) {
      setFreelancerProfile(null)
      return () => {}
    }
    let active = true
    fetchFreelancerProfile(applicantFreelancerId)
      .then((profile) => {
        if (!active) return
        setFreelancerProfile(profile ? { ...profile, uid: profile.uid || applicantFreelancerId } : null)
      })
      .catch((error) => {
        if (!active) return
        console.warn('Unable to fetch freelancer profile', error)
        setFreelancerProfile(null)
      })
    return () => {
      active = false
    }
  }, [applicantFreelancerId])

  const applicantSkills = useMemo(() => {
    const source = Array.isArray(freelancerProfile?.skills) && freelancerProfile.skills.length
      ? freelancerProfile.skills
      : applicantSnapshot.skills
    if (!Array.isArray(source)) return []
    return source.filter(Boolean)
  }, [freelancerProfile?.skills, applicantSnapshot.skills])

  const profilePortfolioItems = useMemo(() => {
    const featuredEntries = Array.isArray(freelancerProfile?.featured) && freelancerProfile.featured.length
      ? freelancerProfile.featured
      : applicantSnapshot.featured
    return mapPortfolioEntries(featuredEntries, 'profile')
  }, [freelancerProfile?.featured, applicantSnapshot.featured])

  const applicationPortfolioItems = useMemo(() => {
    if (!applicantRecord) return []
    const samples = mapPortfolioEntries(applicantRecord.samples, 'application')
    const attachments = mapPortfolioEntries(applicantRecord.attachments, 'application')
    return [...samples, ...attachments]
  }, [applicantRecord])

  const portfolioPreview = useMemo(() => {
    const limit = 2
    const preview = []
    if (profilePortfolioItems.length) {
      preview.push(...profilePortfolioItems.slice(0, limit))
    }
    if (preview.length < limit && applicationPortfolioItems.length) {
      preview.push(...applicationPortfolioItems.slice(0, limit - preview.length))
    }
    return preview
  }, [applicationPortfolioItems, profilePortfolioItems])

  const totalPortfolioItems = profilePortfolioItems.length + applicationPortfolioItems.length
  const hasAdditionalPortfolioEntries = totalPortfolioItems > portfolioPreview.length

  const profileSummary = (
    freelancerProfile?.summary || applicantSnapshot.summary || applicantRecord?.summary || ''
  ).trim()
  const profileAvailability = (
    freelancerProfile?.availability || applicantSnapshot.availability || applicantRecord?.availability || ''
  ).trim()

  const profileLanguages = []

  const hasProfileDetails = Boolean(
    profileSummary ||
      profileAvailability ||
      applicantSkills.length ||
      profilePortfolioItems.length ||
      applicationPortfolioItems.length,
  )

  const handleShareInterviewLink = async () => {
    if (!gigId || !applicantId) return
    setAction('interview')
    setNotice(null)
    try {
      await updateGigApplicantInterviewLink({
        gigId,
        freelancerId: applicantId,
        interviewLink: interviewDraft,
        interviewSchedule: toIsoFromLocalInput(interviewScheduleDraft),
        updatedBy: user?.uid,
      })
      setNotice({ tone: 'positive', message: 'Interview link shared with the freelancer.' })
    } catch (error) {
      setNotice({ tone: 'negative', message: error?.message || 'Unable to share interview link.' })
    } finally {
      setAction(null)
    }
  }

  const handleApplicantDecision = async (status) => {
    if (!gigId || !applicantId) return
    setAction(status)
    setNotice(null)
    try {
      await updateGigApplicantStatus({
        gigId,
        freelancerId: applicantId,
        status,
        updatedBy: user?.uid,
      })
      setNotice({
        tone: status === 'hired' ? 'positive' : 'neutral',
        message: status === 'hired' ? 'Great! We marked this freelancer as hired.' : 'Application marked as not selected.',
      })
    } catch (error) {
      setNotice({ tone: 'negative', message: error?.message || 'Unable to update applicant status.' })
    } finally {
      setAction(null)
    }
  }

  const handleMessageApplicant = async () => {
    if (!user?.uid) {
      setNotice({ tone: 'negative', message: 'You need to be signed in to start a conversation.' })
      return
    }
    if (!applicantRecord) {
      setNotice({ tone: 'negative', message: 'Applicant context is missing.' })
      return
    }

    const freelancerId = resolveApplicantId(applicantRecord) || applicantId
    setAction('message')
    setNotice(null)

    try {
      await createMessagingThread({
        participants: [user.uid, freelancerId],
        createdBy: user.uid,
        participantsInfo: {
          [user.uid]: { displayName: user.displayName || 'Client', role: 'client' },
          [freelancerId]: {
            displayName: applicantSnapshot.displayName || 'Freelancer',
            role: 'freelancer',
          },
        },
        gigId,
        gigTitle: gig?.title,
        proposalId: applicantRecord.id || applicantRecord.gigId,
        subject: gig?.title ? `${gig.title} · Proposal` : 'SkillLink proposal',
        metadata: {
          applicantId: freelancerId,
        },
        initialMessage: {
          senderId: user.uid,
          text: `Hi ${applicantSnapshot.displayName?.split(' ')[0] || 'there'}, thanks for applying to ${gig?.title || 'our gig'}!`,
        },
      })
      setNotice({ tone: 'positive', message: 'Conversation started in Messages.' })
    } catch (error) {
      setNotice({ tone: 'negative', message: error?.message || 'Unable to start chat.' })
    } finally {
      setAction(null)
    }
  }

  const handleOpenProfileModal = () => {
    if (!hasProfileDetails) return
    setIsProfileModalOpen(true)
  }

  const handleCloseProfileModal = () => {
    setIsProfileModalOpen(false)
  }

  const statusTone = resolveApplicantTone(applicantRecord?.status)
  const relativeUpdate = applicantRecord?.proposalUpdatedAt
    ? formatApplicantRelative(applicantRecord.proposalUpdatedAt)
    : 'Updated recently'

  const showLoading = recordState.status === 'loading'
  const showError = recordState.status === 'error'
  const showEmpty = recordState.status === 'empty'

  return (
    <>
      <div className="client-page applicant-overview-page">
      <button type="button" className="ghost-button" onClick={() => navigate(`/client/manage-gigs/${gigId}/applicants`)}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to applicants
      </button>

      <header className="applicants-page-hero">
        <div>
          <p className="eyebrow">{gig?.title || 'Gig applicants'}</p>
          <h1>Applicant overview</h1>
          <span>Review proposals, drop interview links, and move freelancers forward with confidence.</span>
        </div>
      </header>

      {(gigStatus === 'error' && gigError) && (
        <div className="gig-applicants-alert is-negative" role="alert">
          {gigError?.message}
        </div>
      )}

      {showLoading ? (
        <div className="gig-applicants-placeholder">
          <Loader2 size={22} className="icon-spin" aria-hidden="true" />
          <p>Loading applicant details…</p>
        </div>
      ) : showError ? (
        <div className="gig-applicants-placeholder">
          <p>{recordState.error?.message || 'Unable to load applicant data.'}</p>
        </div>
      ) : showEmpty ? (
        <div className="gig-applicants-placeholder">
          <p>{recordState.error?.message || 'Applicant not found.'}</p>
        </div>
      ) : applicantRecord ? (
        <article className="proposal-review-card">
          <header className="proposal-review-header">
            <div className="proposal-review-profile">
              <div className="proposal-review-avatar" aria-hidden="true">
                {applicantSnapshot.photoURL ? (
                  <img src={applicantSnapshot.photoURL} alt="Applicant avatar" />
                ) : (
                  <span>{getInitials(applicantSnapshot.displayName)}</span>
                )}
              </div>
              <div>
                <div className="proposal-review-headline">
                  <div>
                    <h3>{applicantSnapshot.displayName || 'Freelancer'}</h3>
                    <p>{applicantSnapshot.title || 'Senior Product Designer'}</p>
                  </div>
                  <span className={`applicant-status-pill is-${statusTone}`}>
                    {formatApplicantStatus(applicantRecord.status)}
                  </span>
                </div>
                <span className="proposal-review-location">
                  {applicantSnapshot.location || 'Nigeria · Remote friendly'}
                </span>
              </div>
            </div>
            <div className="proposal-review-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={handleOpenProfileModal}
                disabled={!hasProfileDetails}
              >
                View full profile <ExternalLink size={14} aria-hidden="true" />
              </button>
              {applicantSnapshot.portfolioUrl && (
                <a className="ghost-button" href={applicantSnapshot.portfolioUrl} target="_blank" rel="noreferrer">
                  Open external portfolio <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
            </div>
          </header>

          <section className="proposal-review-message">
            <h4>Proposal message</h4>
            {renderCoverLetter(applicantRecord.coverLetter)}
          </section>

          <section className="proposal-review-skills">
            <h5>Skills mentioned</h5>
            {applicantSkills.length ? (
              <div className="proposal-review-skill-tags">
                {applicantSkills.map((skill) => (
                  <span key={`${applicantId}-${skill}`}>{skill}</span>
                ))}
              </div>
            ) : (
              <p>No tagged skills yet.</p>
            )}
          </section>

          <section className="proposal-review-portfolio">
            <div className="proposal-review-portfolio-head">
              <h5>Portfolio preview</h5>
              {hasAdditionalPortfolioEntries && (
                <button type="button" className="link-button" onClick={handleOpenProfileModal}>
                  View all portfolio items
                </button>
              )}
            </div>
            <div className="proposal-review-portfolio-grid">
              {portfolioPreview.length ? (
                portfolioPreview.map((item, index) => (
                  <PortfolioCard item={item} key={item.id || `preview-${index}`} />
                ))
              ) : (
                <div className="portfolio-preview-empty">No portfolio entries yet.</div>
              )}
            </div>
          </section>

          <section className="proposal-review-interview">
            <div>
              <h5>Drop interview link</h5>
              <p>Share a Google Meet or Teams link — freelancers see it instantly.</p>
            </div>
            {applicantRecord.interviewLink && (
              <div className="gig-applicant-interview-heading">
                <small>Current link:</small>
                <a href={applicantRecord.interviewLink} target="_blank" rel="noreferrer">
                  {applicantRecord.interviewLink}
                </a>
              </div>
            )}
            {applicantRecord.interviewSchedule && (
              <div className="gig-applicant-interview-heading">
                <small>Scheduled for:</small>
                <span>{formatInterviewSchedule(applicantRecord.interviewSchedule)}</span>
              </div>
            )}
            <div className="proposal-review-interview-row">
              <input
                type="url"
                placeholder="https://meet.google.com/room"
                value={interviewDraft}
                onChange={(event) => setInterviewDraft(event.target.value)}
              />
              <input
                type="datetime-local"
                aria-label="Interview schedule"
                value={interviewScheduleDraft}
                onChange={(event) => setInterviewScheduleDraft(event.target.value)}
              />
              <button type="button" onClick={handleShareInterviewLink} disabled={action === 'interview'}>
                {action === 'interview' ? (
                  <Loader2 size={16} className="icon-spin" aria-hidden="true" />
                ) : (
                  <Link2 size={16} aria-hidden="true" />
                )}
                Send link
              </button>
            </div>
          </section>

          <footer className="proposal-review-cta">
            <button
              type="button"
              className="ghost-button ghost-danger"
              onClick={() => handleApplicantDecision('rejected')}
              disabled={action === 'rejected'}
            >
              {action === 'rejected' ? 'Updating…' : 'Reject'}
            </button>
            <button
              type="button"
              className="cta cta-primary"
              onClick={() => handleApplicantDecision('hired')}
              disabled={action === 'hired'}
            >
              {action === 'hired' ? 'Marking…' : 'Hire'}
            </button>
            <button type="button" className="ghost-button" onClick={handleMessageApplicant} disabled={action === 'message'}>
              {action === 'message' ? (
                <Loader2 size={16} className="icon-spin" aria-hidden="true" />
              ) : (
                <MessageSquare size={16} aria-hidden="true" />
              )}
              {action === 'message' ? 'Opening thread…' : 'Send message'}
            </button>
          </footer>
        </article>
      ) : null}

      {notice && (
        <div className={`gig-applicants-alert is-${notice.tone}`} role="alert">
          {notice.message}
        </div>
      )}

      </div>

      {isProfileModalOpen && (
        <ApplicantProfileModal
          applicant={freelancerProfile || applicantSnapshot}
          availability={profileAvailability}
          externalPortfolioUrl={freelancerProfile?.portfolioUrl || applicantSnapshot.portfolioUrl}
      
          onClose={handleCloseProfileModal}
          portfolioItems={
            profilePortfolioItems.length
              ? [...profilePortfolioItems, ...applicationPortfolioItems]
              : applicationPortfolioItems
          }
          skills={applicantSkills}
          summary={profileSummary}
        />
      )}
    </>
  )
}

export default ClientApplicantOverview

const toLocalDatetimeInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num) => String(num).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const toIsoFromLocalInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

const formatInterviewSchedule = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const mapPortfolioEntries = (entries, source) => {
  if (!Array.isArray(entries)) return []
  return entries
    .map((item, index) => normalizePortfolioEntry(item, index, source))
    .filter(Boolean)
}

const normalizePortfolioEntry = (item, index, source) => {
  if (!item) return null
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : []
  const media = item.media && typeof item.media === 'object' ? item.media : null
  const previewUrl = item.previewUrl || media?.previewUrl || media?.url || item.thumbnail || ''
  const url = item.url || item.projectUrl || item.link || item.downloadUrl || previewUrl || ''
  const name = item.title || item.name || item.fileName || 'Portfolio project'

  return {
    id: item.id || media?.id || item.storagePath || `${source}-portfolio-${index}`,
    title: name,
    description: item.description || item.type || item.role || 'Uploaded deliverable',
    url,
    previewUrl,
    tags,
    source,
  }
}

const PortfolioCard = ({ item }) => {
  if (!item) return null
  const hasPreviewImage = Boolean(item.previewUrl)
  return (
    <article className="portfolio-preview-card">
      <div className={`portfolio-preview-media ${hasPreviewImage ? 'has-media' : ''}`} aria-hidden="true">
        {hasPreviewImage ? (
          <img src={item.previewUrl} alt={`${item.title || 'Portfolio asset'} preview`} />
        ) : (
          <span>{item.source === 'profile' ? 'Profile asset' : 'Application asset'}</span>
        )}
      </div>
      <div>
        <strong>{item.title || 'Project asset'}</strong>
        <p>{item.description || 'Uploaded deliverable'}</p>
      </div>
      {item.tags?.length ? (
        <div className="portfolio-preview-tags">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={`${item.id}-${tag}`}>{tag}</span>
          ))}
        </div>
      ) : null}
      <small className="portfolio-preview-source">
        {item.source === 'profile' ? 'From freelancer profile' : 'From application'}
      </small>
      {item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer">
          Open
        </a>
      ) : (
        <span className="gig-applicant-portfolio-missing">No link provided</span>
      )}
    </article>
  )
}

const ApplicantProfileModal = ({
  applicant = {},
  availability,
  externalPortfolioUrl,
  
  onClose,
  portfolioItems = [],
  skills = [],
  summary,
}) => {
  const summaryCopy = summary?.trim() || 'This freelancer has not shared a bio yet.'
  const availabilityCopy = availability || applicant.availability || 'Not shared'
  const languagesCopy = 'Not shared'
  const timezoneCopy = applicant.localTimeLabel || 'Not shared'
  const locationCopy = applicant.location || applicant.state || 'Location not shared'

  return (
    <div className="applicant-profile-modal" role="dialog" aria-modal="true" aria-label="Freelancer profile">
      <div className="applicant-profile-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="applicant-profile-modal-card" role="document">
        <div className="applicant-profile-modal-head">
          <div>
            <p className="eyebrow">Freelancer profile</p>
            <h3>{applicant.displayName || 'Freelancer'}</h3>
            <p className="applicant-profile-modal-headline">{applicant.title || 'Independent talent'}</p>
            <small>{locationCopy}</small>
          </div>
          <button type="button" className="applicant-profile-modal-close" onClick={onClose} aria-label="Close profile view">
            <X size={16} aria-hidden="true" /> Close
          </button>
        </div>
        <section className="applicant-profile-modal-section">
          <h5>About</h5>
          <p>{summaryCopy}</p>
        </section>
        <section className="applicant-profile-modal-meta">
          <div>
            <span>Availability</span>
            <strong>{availabilityCopy}</strong>
          </div>
          {/* Languages removed from profile modal */}
          <div>
            <span>Timezone</span>
            <strong>{timezoneCopy}</strong>
          </div>
        </section>
        <section className="applicant-profile-modal-section">
          <h5>Skills &amp; Tools</h5>
          {skills.length ? (
            <div className="proposal-review-skill-tags">
              {skills.map((skill) => (
                <span key={`profile-modal-skill-${skill}`}>{skill}</span>
              ))}
            </div>
          ) : (
            <p>No skills shared yet.</p>
          )}
        </section>
        <section className="proposal-review-portfolio applicant-profile-modal-section">
          <div className="proposal-review-portfolio-head">
            <h5>Portfolio</h5>
            {externalPortfolioUrl && (
              <a className="link-button" href={externalPortfolioUrl} target="_blank" rel="noreferrer">
                Open external portfolio <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}
          </div>
          <div className="proposal-review-portfolio-grid">
            {portfolioItems.length ? (
              portfolioItems.map((item, index) => <PortfolioCard item={item} key={item.id || `full-portfolio-${index}`} />)
            ) : (
              <div className="portfolio-preview-empty">No portfolio entries yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

const renderCoverLetter = (text) => {
  if (!text) {
    return <p>No cover letter provided.</p>
  }

  const paragraphs = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (!paragraphs.length) {
    return <p>No cover letter provided.</p>
  }

  return paragraphs.map((paragraph, index) => <p key={`cover-${index}`}>{paragraph}</p>)
}
