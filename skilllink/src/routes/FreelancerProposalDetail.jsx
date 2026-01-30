import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, Link2, Loader2, MessageSquare, PenLine } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  createMessagingThread,
  fetchFreelancerProposal,
  fetchGigById,
  subscribeToFreelancerProposal,
  upsertFreelancerProposal,
} from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'

const stageOrder = ['draft', 'submitted', 'under_review', 'interview', 'hired', 'rejected']

const milestoneKeyByStep = {
  submitted: 'submittedAt',
  under_review: 'underReviewAt',
  interview: 'interviewAt',
  hired: 'hiredAt',
}

const stageLabels = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  interview: 'Interview scheduled',
  hired: 'Hired',
  rejected: 'Not selected',
}

const defaultMilestones = {
  submittedAt: null,
  underReviewAt: null,
  interviewAt: null,
  hiredAt: null,
  rejectedAt: null,
}

const mapProposalRecordToGig = (record = {}, fallbackId) => ({
  id: record.gigId || fallbackId,
  clientId: record.clientId || record.clientUserId || record.client?.id || null,
  title: record.gigTitle || 'Untitled gig',
  summary: record.gigSummary || '',
  deadline: record.gigDeadline || '',
  client: {
    name: record.gigClient || 'SkillLink client',
    verified: Boolean(record.clientVerified),
    rating: record.clientRating,
    jobsPosted: record.clientJobsPosted,
    sector: record.gigSector,
    location: record.gigLocation,
  },
})

const FreelancerProposalDetail = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { gigId } = useParams()

  const [gigData, setGigData] = useState(null)
  const [coverLetter, setCoverLetter] = useState('')
  const [stage, setStage] = useState('draft')
  const [milestones, setMilestones] = useState(defaultMilestones)
  const [isEditing, setIsEditing] = useState(true)
  const [interviewLink, setInterviewLink] = useState('')
  const [interviewSchedule, setInterviewSchedule] = useState('')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [startingThread, setStartingThread] = useState(false)

  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      if (!user?.uid || !gigId) return
      setLoading(true)
      try {
        const existing = await fetchFreelancerProposal(user.uid, gigId)
        if (!active) return

        if (existing) {
          const hydratedGig = mapProposalRecordToGig(existing, gigId)
          setGigData(hydratedGig)
          setCoverLetter(existing.coverLetter || '')
          setStage(existing.status || 'draft')
          setMilestones({ ...defaultMilestones, ...(existing.milestones || {}) })
          setInterviewLink(existing.interviewLink || '')
          setInterviewSchedule(existing.interviewSchedule || '')
          setDecisionNotes(existing.decisionNotes || '')
          const gigClosed = existing.gigStatus === 'deleted' || existing.gigIsActive === false
          if (gigClosed) {
            setAlert({ tone: 'error', message: 'This gig is no longer hiring. You can delete the proposal from your list.' })
            setIsEditing(false)
          } else {
            setIsEditing(existing.status === 'draft')
          }
        } else {
          const gigRecord = await fetchGigById(gigId)
          if (!active) return
          if (!gigRecord) {
            setAlert({ tone: 'error', message: 'This gig is no longer available.' })
            setGigData(null)
            setIsEditing(false)
            return
          }
          setGigData(gigRecord)
          const created = await upsertFreelancerProposal(user.uid, gigRecord, {
            status: 'draft',
            coverLetter: gigRecord.coverLetterTemplate || '',
            milestones: defaultMilestones,
          })
          if (!active) return
          setCoverLetter(created.coverLetter || gigRecord.coverLetterTemplate || '')
          setStage(created.status || 'draft')
          setMilestones({ ...defaultMilestones, ...(created.milestones || {}) })
          setInterviewLink('')
          setInterviewSchedule('')
          setDecisionNotes('')
          setIsEditing(true)
        }
      } catch (error) {
        if (active) {
          setAlert({ tone: 'error', message: error.message || 'Unable to load proposal right now.' })
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    bootstrap()
    return () => {
      active = false
    }
  }, [user?.uid, gigId])

  useEffect(() => {
    if (!user?.uid || !gigId || !isFirebaseConfigured) {
      return () => {}
    }

    const unsubscribe = subscribeToFreelancerProposal(
      user.uid,
      gigId,
      (record) => {
        if (!record) return
        setStage(record.status || 'draft')
        setMilestones({ ...defaultMilestones, ...(record.milestones || {}) })
        setInterviewLink(record.interviewLink || '')
        setInterviewSchedule(record.interviewSchedule || '')
        setDecisionNotes(record.decisionNotes || '')
        if (!isEditing) {
          setCoverLetter(record.coverLetter || '')
        }
      },
      {
        onError: (error) => {
          setAlert((prev) => prev || { tone: 'error', message: error?.message || 'Live updates unavailable.' })
        },
      },
    )

    return () => {
      unsubscribe?.()
    }
  }, [user?.uid, gigId, isEditing])

  const handleBack = () => {
    navigate('/freelancer/my-proposals')
  }

  const formatDate = (value) => {
    if (!value) return null
    try {
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
    } catch (error) {
      return value
    }
  }

  const formatDateTime = (value) => {
    if (!value) return ''
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    } catch (error) {
      return value
    }
  }

  const computeStepState = (stepId) => {
    const stepIndex = stageOrder.indexOf(stepId)
    const stageIndex = stageOrder.indexOf(stage)
    if (stepIndex === -1) return 'pending'
     if (stage === 'rejected' && stepId === 'hired') return 'rejected'
    if (stageIndex > stepIndex) return 'done'
    if (stageIndex === stepIndex && stage !== 'draft') return 'active'
    if (milestones[milestoneKeyByStep[stepId]]) return 'done'
    return 'pending'
  }

  const progressSteps = [
    {
      id: 'submitted',
      label: 'Submitted',
      meta: formatDate(milestones.submittedAt) || 'Awaiting submission',
    },
    {
      id: 'under_review',
      label: 'Under Review',
      meta: formatDate(milestones.underReviewAt) || 'Pending review',
    },
    {
      id: 'interview',
      label: 'Interview',
      meta: formatDate(milestones.interviewAt) || 'Pending invitation',
    },
    {
      id: 'hired',
      label: stage === 'rejected' ? 'Closed' : 'Hired/Closed',
      meta:
        stage === 'rejected'
          ? formatDate(milestones.rejectedAt) || 'Decision pending'
          : formatDate(milestones.hiredAt) || '--',
    },
  ]

  const renderLetter = () => {
    const segments = coverLetter?.split('\n').filter((text) => text.trim().length) || []
    if (!segments.length) {
      return <p>No cover letter added yet.</p>
    }
    return segments.map((paragraph, index) => (
      <p key={`${index}-${paragraph.slice(0, 8)}`}>{paragraph}</p>
    ))
  }

  const handleSubmit = async () => {
    if (!coverLetter.trim()) {
      setAlert({ tone: 'error', message: 'Please add a cover letter before submitting your proposal.' })
      return
    }
    if (!user?.uid || !gigData?.id) return

    const nowIso = new Date().toISOString()
    const nextMilestones = { ...milestones }
    let nextStage = stage

    if (stage === 'draft') {
      nextStage = 'under_review'
      nextMilestones.submittedAt = nextMilestones.submittedAt || nowIso
      nextMilestones.underReviewAt = nowIso
    }

    try {
      await upsertFreelancerProposal(user.uid, gigData, {
        status: nextStage,
        coverLetter,
        milestones: nextMilestones,
      })
      setStage(nextStage)
      setMilestones(nextMilestones)
      setIsEditing(false)
      setAlert({
        tone: 'info',
        message: nextStage === 'under_review' ? 'Proposal submitted. The client has been notified.' : 'Proposal updated.',
      })
    } catch (error) {
      setAlert({ tone: 'error', message: error.message || 'Unable to save your proposal right now.' })
    }
  }

  const handleMessageClient = async () => {
    if (!user?.uid) {
      setAlert({ tone: 'error', message: 'Sign in to start a conversation.' })
      return
    }
    if (!gigData?.clientId) {
      setAlert({ tone: 'error', message: 'Client contact is missing for this gig.' })
      return
    }
    setStartingThread(true)
    try {
      const clientName = gigData?.client?.name || 'the client'
      const friendlyName = clientName.split(' ')[0] || 'there'
      const thread = await createMessagingThread({
        participants: [user.uid, gigData.clientId],
        createdBy: user.uid,
        participantsInfo: {
          [user.uid]: {
            displayName: user.displayName || user.email || 'Freelancer',
            role: 'freelancer',
          },
          [gigData.clientId]: {
            displayName: clientName,
            role: 'client',
          },
        },
        gigId: gigData.id,
        gigTitle: gigData.title,
        proposalId: gigId,
        subject: gigData.title ? `${gigData.title} · Proposal` : 'SkillLink proposal',
        metadata: {
          proposalStage: stage,
        },
        initialMessage: {
          senderId: user.uid,
          text: `Hi ${friendlyName}, thanks for reviewing my proposal for ${gigData?.title || 'this project'}. Looking forward to next steps!`,
        },
      })
      navigate('/freelancer/messages', { state: { threadId: thread.id } })
    } catch (error) {
      setAlert({ tone: 'error', message: error.message || 'Unable to start a chat right now.' })
    } finally {
      setStartingThread(false)
    }
  }

  if (!gigData && !loading) {
    return (
      <div className="proposal-page">
        <p>Gig not found.</p>
        <button type="button" className="ghost-button" onClick={() => navigate('/freelancer/opportunities')}>
          Browse gigs
        </button>
      </div>
    )
  }

  return (
    <div className="proposal-page">
      <button type="button" className="gig-back" onClick={handleBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to opportunities
      </button>

      <header className="proposal-header">
        <div>
          <p className="proposal-breadcrumb">Back to My Proposals / Proposal Details</p>
          <h1>Proposal Details</h1>
          <span>{gigData?.title || 'Untitled gig'}</span>
        </div>
        <div className="proposal-header-actions">
          {/* <button
            type="button"
            className="ghost-button"
            onClick={handleMessageClient}
            disabled={!gigData?.clientId || startingThread}
          >
            {startingThread ? <Loader2 size={16} className="icon-spin" aria-hidden="true" /> : <MessageSquare size={16} aria-hidden="true" />}
            Message Client
          </button> */}
          <button
            type="button"
            className="ghost-button"
            onClick={() => setIsEditing(true)}
            disabled={stage === 'draft' && isEditing}
          >
            <PenLine size={16} aria-hidden="true" />
            Edit Proposal
          </button>
        </div>
      </header>

      <section className="proposal-progress">
        {progressSteps.map((step) => (
          <div className={`proposal-progress-step is-${computeStepState(step.id)}`} key={step.id}>
            <div className="proposal-progress-icon">
              <CheckCircle2 size={18} aria-hidden="true" />
            </div>
            <div>
              <p>{step.label}</p>
              <span>{step.meta}</span>
            </div>
          </div>
        ))}
      </section>

      {stage === 'rejected' && (
        <div className="proposal-alert proposal-alert-error">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Application not selected</strong>
            <p>
              The client chose a different freelancer{milestones.rejectedAt ? ` on ${formatDate(milestones.rejectedAt)}` : ''}.
            </p>
            {decisionNotes ? <p>{decisionNotes}</p> : null}
          </div>
        </div>
      )}

      {(interviewLink || interviewSchedule || stage === 'interview') && (
        <section className={`proposal-interview-card ${interviewLink ? '' : 'is-pending'}`}>
          <div>
            <p className="eyebrow">Interview status</p>
            <h3>{interviewLink ? 'Interview confirmed' : 'Interview pending'}</h3>
            <span>
              {interviewLink
                ? 'Use the link below at your scheduled time.'
                : 'Sit tight — the client is finalizing your Google Meet link.'}
            </span>
            {interviewSchedule && (
              <small>Scheduled for {formatDateTime(interviewSchedule)}</small>
            )}
          </div>
          {interviewLink ? (
            <a href={interviewLink} target="_blank" rel="noreferrer" className="cta cta-primary">
              <Link2 size={16} aria-hidden="true" /> Join interview
            </a>
          ) : (
            <small>We’ll notify you as soon as the link is shared.</small>
          )}
        </section>
      )}

      {alert && (
        <div
          className={`inline-alert ${alert.tone === 'error' ? 'inline-alert-error' : 'inline-alert-info'}`}
          role="status"
        >
          <div className="inline-alert-content">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{alert.message}</p>
          </div>
          <button type="button" className="ghost-button ghost-compact" onClick={() => setAlert(null)}>
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <article className="proposal-card proposal-loading">
          <Loader2 size={20} className="icon-spin" aria-hidden="true" />
          <p>Loading proposal...</p>
        </article>
      ) : (
        <section className="proposal-layout">
          <div className="proposal-main">
            <article className="proposal-card proposal-gig-summary">
              <p>{gigData?.summary || 'Client did not add a summary yet.'}</p>
              <button
                type="button"
                className="ghost-button ghost-compact"
                onClick={() => gigData?.id && navigate(`/freelancer/opportunities/${gigData.id}`)}
              >
                View full gig details
              </button>
            </article>

            <article className="proposal-card">
              <div className="proposal-card-head">
                <div>
                  <p>Cover Letter</p>
                  <span>{stageLabels[stage]}</span>
                </div>
                {!isEditing && <small>Last updated just now</small>}
              </div>
              {isEditing ? (
                <div className="proposal-editor">
                  <textarea value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} rows={10} />
                  <div className="proposal-editor-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setCoverLetter(gigData?.coverLetterTemplate || '')}
                    >
                      Reset
                    </button>
                    <button type="button" className="cta cta-primary" onClick={handleSubmit}>
                      {stage === 'draft' ? 'Submit proposal' : 'Save updates'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="proposal-letter">{renderLetter()}</div>
              )}
            </article>

            <article className="proposal-card proposal-alert">
              <div>
                <p>Waiting for Client Response</p>
                <span>The client typically responds within 3 days. We'll notify you via email when there is an update.</span>
              </div>
            </article>
          </div>
        </section>
      )}
    </div>
  )
}

export default FreelancerProposalDetail
