import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Link2, Loader2, MessageSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  createMessagingThread,
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
  resolveApplicantLanguage,
  resolveApplicantLocalTime,
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
  const [notice, setNotice] = useState(null)
  const [action, setAction] = useState(null)

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

  const applicantSkills = useMemo(() => {
    if (!Array.isArray(applicantSnapshot.skills)) return []
    return applicantSnapshot.skills.filter(Boolean)
  }, [applicantSnapshot.skills])

  const portfolioPreview = useMemo(() => {
    if (!applicantRecord) return []
    const samples = Array.isArray(applicantRecord.samples) ? applicantRecord.samples : []
    const attachments = Array.isArray(applicantRecord.attachments) ? applicantRecord.attachments : []
    return [...samples, ...attachments].filter(Boolean).slice(0, 2)
  }, [applicantRecord])

  const handleShareInterviewLink = async () => {
    if (!gigId || !applicantId) return
    setAction('interview')
    setNotice(null)
    try {
      await updateGigApplicantInterviewLink({
        gigId,
        freelancerId: applicantId,
        interviewLink: interviewDraft,
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

  const statusTone = resolveApplicantTone(applicantRecord?.status)
  const relativeUpdate = applicantRecord?.proposalUpdatedAt
    ? formatApplicantRelative(applicantRecord.proposalUpdatedAt)
    : 'Updated recently'

  const showLoading = recordState.status === 'loading'
  const showError = recordState.status === 'error'
  const showEmpty = recordState.status === 'empty'

  return (
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

      {(notice || (gigStatus === 'error' && gigError)) && (
        <div className={`gig-applicants-alert is-${notice ? notice.tone : 'negative'}`} role="alert">
          {notice ? notice.message : gigError?.message}
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
                <div className="proposal-review-meta">
                  <span>{resolveApplicantLocalTime(applicantRecord)}</span>
                  <span>{resolveApplicantLanguage(applicantRecord, applicantSnapshot)}</span>
                  <span>{relativeUpdate}</span>
                </div>
              </div>
            </div>
            <div className="proposal-review-actions">
              {applicantSnapshot.portfolioUrl ? (
                <a className="ghost-button" href={applicantSnapshot.portfolioUrl} target="_blank" rel="noreferrer">
                  View full profile <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : (
                <button type="button" className="ghost-button" disabled>
                  View full profile
                </button>
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
              {applicantSnapshot.portfolioUrl && (
                <a className="link-button" href={applicantSnapshot.portfolioUrl} target="_blank" rel="noreferrer">
                  View all portfolio items
                </a>
              )}
            </div>
            <div className="proposal-review-portfolio-grid">
              {portfolioPreview.length ? (
                portfolioPreview.map((item, index) => (
                  <article className="portfolio-preview-card" key={item.id || item.name || `preview-${index}`}>
                    <div className="portfolio-preview-media" aria-hidden="true" />
                    <div>
                      <strong>{item.name || item.title || 'Project asset'}</strong>
                      <p>{item.description || item.type || 'Uploaded deliverable'}</p>
                    </div>
                    {item.url || item.downloadUrl ? (
                      <a href={item.url || item.downloadUrl} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      <span className="gig-applicant-portfolio-missing">No link provided</span>
                    )}
                  </article>
                ))
              ) : (
                <div className="portfolio-preview-empty">No portfolio attachments yet.</div>
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
            <div className="proposal-review-interview-row">
              <input
                type="url"
                placeholder="https://meet.google.com/room"
                value={interviewDraft}
                onChange={(event) => setInterviewDraft(event.target.value)}
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
    </div>
  )
}

export default ClientApplicantOverview

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
