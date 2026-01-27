import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Link2,
  Loader2,
  MessageSquare,
  Paperclip,
  PenLine,
  Upload,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  createMessagingThread,
  fetchFreelancerProposal,
  fetchGigById,
  subscribeToFreelancerProposal,
  upsertFreelancerProposal,
} from '../services/firestoreClient'
import { uploadProposalAsset } from '../services/storageClient'
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

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB

const mapProposalRecordToGig = (record = {}, fallbackId) => ({
  id: record.gigId || fallbackId,
  clientId: record.clientId || record.clientUserId || record.client?.id || null,
  title: record.gigTitle || 'Untitled gig',
  summary: record.gigSummary || '',
  priceRange: record.gigBudget || '',
  priceType: record.gigType || '',
  deadline: record.gigDeadline || '',
  tokens: record.gigTokens || 0,
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
  const [attachments, setAttachments] = useState([])
  const [samples, setSamples] = useState([])
  const [interviewLink, setInterviewLink] = useState('')
  const [decisionNotes, setDecisionNotes] = useState('')
  const [alert, setAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploadingCategory, setUploadingCategory] = useState(null)
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
          setAttachments(existing.attachments || [])
          setSamples(existing.samples || [])
          setInterviewLink(existing.interviewLink || '')
          setDecisionNotes(existing.decisionNotes || '')
          setIsEditing(existing.status === 'draft')
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
            attachments: [],
            samples: [],
          })
          if (!active) return
          setCoverLetter(created.coverLetter || gigRecord.coverLetterTemplate || '')
          setStage(created.status || 'draft')
          setMilestones({ ...defaultMilestones, ...(created.milestones || {}) })
          setAttachments(created.attachments || [])
          setSamples(created.samples || [])
          setInterviewLink('')
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
        setDecisionNotes(record.decisionNotes || '')
        setAttachments(record.attachments || [])
        setSamples(record.samples || [])
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

  const formatFileMeta = (file) => {
    if (!file) return ''
    const sizeKb = file.size ? `${Math.round(file.size / 1024)} KB` : ''
    const type = file.type || 'File'
    return sizeKb ? `${sizeKb} · ${type}` : type
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
        attachments,
        samples,
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

  const handleFileChange = async (event, category) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length || !user?.uid || !gigData?.id) return

    const oversize = files.find((file) => file.size > MAX_FILE_SIZE)
    if (oversize) {
      setAlert({ tone: 'error', message: `${oversize.name} exceeds the 15MB limit.` })
      return
    }

    setUploadingCategory(category)
    try {
      const uploads = []
      for (const file of files) {
        const asset = await uploadProposalAsset({ userId: user.uid, gigId: gigData.id, file, category })
        uploads.push(asset)
      }

      const nextAttachments = category === 'attachments' ? [...attachments, ...uploads] : attachments
      const nextSamples = category === 'samples' ? [...samples, ...uploads] : samples

      if (category === 'attachments') {
        setAttachments(nextAttachments)
      } else {
        setSamples(nextSamples)
      }

      await upsertFreelancerProposal(user.uid, gigData, {
        attachments: nextAttachments,
        samples: nextSamples,
      })

      setAlert({
        tone: 'info',
        message: `${uploads.length} file${uploads.length > 1 ? 's' : ''} uploaded successfully.`,
      })
    } catch (error) {
      setAlert({ tone: 'error', message: error.message || 'Unable to upload files right now.' })
    } finally {
      setUploadingCategory(null)
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

  const handleRemoveFile = async (category, fileId) => {
    if (!user?.uid || !gigData?.id) return
    const nextAttachments = category === 'attachments' ? attachments.filter((file) => file.id !== fileId) : attachments
    const nextSamples = category === 'samples' ? samples.filter((file) => file.id !== fileId) : samples

    setAttachments(nextAttachments)
    setSamples(nextSamples)

    try {
      await upsertFreelancerProposal(user.uid, gigData, {
        attachments: nextAttachments,
        samples: nextSamples,
      })
    } catch (error) {
      setAlert({ tone: 'error', message: error.message || 'Unable to update files right now.' })
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
          <button
            type="button"
            className="ghost-button"
            onClick={handleMessageClient}
            disabled={!gigData?.clientId || startingThread}
          >
            {startingThread ? <Loader2 size={16} className="icon-spin" aria-hidden="true" /> : <MessageSquare size={16} aria-hidden="true" />}
            Message Client
          </button>
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

      {(interviewLink || stage === 'interview') && (
        <section className={`proposal-interview-card ${interviewLink ? '' : 'is-pending'}`}>
          <div>
            <p className="eyebrow">Interview status</p>
            <h3>{interviewLink ? 'Interview confirmed' : 'Interview pending'}</h3>
            <span>
              {interviewLink
                ? 'Use the link below at your scheduled time.'
                : 'Sit tight — the client is finalizing your Google Meet link.'}
            </span>
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
          <aside className="proposal-sidebar">
            <article className="proposal-card">
              <h3>Gig Overview</h3>
              <dl>
                <div>
                  <dt>Job Title</dt>
                  <dd>{gigData?.title || 'Untitled gig'}</dd>
                </div>
                <div>
                  <dt>Client</dt>
                  <dd>
                    {gigData?.client?.name || 'SkillLink client'}{' '}
                    {gigData?.client?.verified && <span className="gig-verified">Verified</span>}
                  </dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>
                    {gigData?.priceRange || '₦—'} · {gigData?.priceType || 'Fixed/Hourly'}
                  </dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>{gigData?.deadline || 'Flexible'}</dd>
                </div>
              </dl>
              <p className="proposal-sidebar-description">{gigData?.summary || 'Client did not add a summary yet.'}</p>
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
                <p>Attachments</p>
                <span>{attachments.length ? `${attachments.length} files` : 'No attachments yet'}</span>
              </div>
              <div className="proposal-upload">
                <label className="ghost-button ghost-compact proposal-upload-trigger">
                  <Upload size={16} aria-hidden="true" />
                  Add attachment
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip"
                    onChange={(event) => handleFileChange(event, 'attachments')}
                  />
                </label>
                <small>PDF, DOCX, or image files up to 15MB.</small>
                {uploadingCategory === 'attachments' && (
                  <span className="proposal-upload-status">
                    <Loader2 size={16} className="icon-spin" aria-hidden="true" /> Uploading...
                  </span>
                )}
              </div>
              {attachments.length === 0 && <p>No files uploaded yet.</p>}
              <ul className="proposal-attachments">
                {attachments.map((file) => (
                  <li key={file.id}>
                    <Paperclip size={16} aria-hidden="true" />
                    <div>
                      <strong>{file.name}</strong>
                      <span>{formatFileMeta(file)}</span>
                    </div>
                    <div className="proposal-file-actions">
                      <a href={file.url} target="_blank" rel="noreferrer" download={file.name}>
                        Download
                      </a>
                      <button type="button" onClick={() => handleRemoveFile('attachments', file.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </aside>

          <div className="proposal-main">
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

            <article className="proposal-card">
              <div className="proposal-card-head">
                <div>
                  <p>Portfolio Samples</p>
                  <span>{samples.length ? `${samples.length} files attached` : 'No samples added'}</span>
                </div>
              </div>
              <div className="proposal-upload">
                <label className="ghost-button ghost-compact proposal-upload-trigger">
                  <ImagePlus size={16} aria-hidden="true" />
                  Add samples
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={(event) => handleFileChange(event, 'samples')}
                  />
                </label>
                {uploadingCategory === 'samples' && (
                  <span className="proposal-upload-status">
                    <Loader2 size={16} className="icon-spin" aria-hidden="true" /> Uploading...
                  </span>
                )}
              </div>
              <div className="proposal-samples">
                {samples.map((sample) => (
                  <figure key={sample.id}>
                    {sample.type?.startsWith('image/') && sample.url ? (
                      <img src={sample.url} alt={sample.name} />
                    ) : (
                      <div className="proposal-sample-file">{sample.name}</div>
                    )}
                    <figcaption>{sample.name}</figcaption>
                    <div className="proposal-file-actions">
                      <a href={sample.url} target="_blank" rel="noreferrer">
                        View
                      </a>
                      <button type="button" onClick={() => handleRemoveFile('samples', sample.id)}>
                        Remove
                      </button>
                    </div>
                  </figure>
                ))}
                {!samples.length && <p>Add visuals or PDFs to help the client review your work.</p>}
              </div>
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
