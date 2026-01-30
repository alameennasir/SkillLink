import { Building2, Loader2, MapPin, NotebookPen, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { requestVerificationReview, saveUserProfile } from '../services/firestoreClient'

const companyTypeOptions = [
  { value: 'company', label: 'Company' },
  { value: 'individual', label: 'Individual' },
  { value: 'agency', label: 'Agency' },
]

const defaultProfile = {
  companyName: '',
  companyType: 'company',
  industry: '',
  location: '',
  nin: '',
}

const sanitizeNinInput = (value) => (value ? String(value).replace(/[^0-9]/g, '').slice(0, 11) : '')

const buildProfileSnapshot = (source = {}) => ({
  companyName: source.companyName || source.displayName || defaultProfile.companyName,
  companyType: companyTypeOptions.some((option) => option.value === source.companyType)
    ? source.companyType
    : defaultProfile.companyType,
  industry: source.industry || defaultProfile.industry,
  location: source.location || source.state || defaultProfile.location,
  nin: sanitizeNinInput(source.nin),
})

const ClientProfile = () => {
  const { user, refresh } = useAuth()
  const [profile, setProfile] = useState(buildProfileSnapshot(user))
  const [draft, setDraft] = useState(buildProfileSnapshot(user))
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [verificationNotice, setVerificationNotice] = useState(null)
  const [verificationStatusLoading, setVerificationStatusLoading] = useState(false)

  useEffect(() => {
    const snapshot = buildProfileSnapshot(user)
    setProfile(snapshot)
    setDraft(snapshot)
    setError('')
    setFeedback('')
    setVerificationNotice(null)
  }, [user])

  const handleFieldChange = (event) => {
    const { name, value } = event.target
    if (name === 'nin') {
      setDraft((prev) => ({ ...prev, nin: sanitizeNinInput(value) }))
      return
    }
    setDraft((prev) => ({ ...prev, [name]: value }))
  }

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(profile), [draft, profile])

  const memberSinceLabel = useMemo(() => {
    const raw = user?.createdAt
    if (!raw) return 'Member since —'
    const parsed = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw)
    if (Number.isNaN(parsed.getTime())) return 'Member since —'
    return `Member since ${parsed.getFullYear()}`
  }, [user?.createdAt])

  const companyTypeLabel = useMemo(() => {
    return companyTypeOptions.find((option) => option.value === draft.companyType)?.label || 'Company'
  }, [draft.companyType])

  const verificationStatus = (user?.verificationStatus || 'unverified').toLowerCase()
  const verificationNotes = user?.verificationNotes || user?.verificationRejectionReason || ''
  const ninReady = (draft.nin || '').length === 11
  const verificationStatusLabel =
    verificationStatus === 'verified'
      ? 'Verified'
      : verificationStatus === 'pending'
        ? 'Pending review'
        : verificationStatus === 'rejected'
          ? 'Rejected'
          : 'Not verified'
  const verificationHelperCopy =
    verificationStatus === 'verified'
      ? 'Your workspace is verified. Keep your contact information current.'
      : verificationStatus === 'pending'
        ? 'Our admin team is currently reviewing your submission.'
        : verificationStatus === 'rejected'
          ? verificationNotes || 'We could not verify this NIN. Update and try again.'
          : 'Provide your National Identification Number to request a verification badge.'
  const verificationStatusLoadingDisabled = verificationStatus === 'pending' || verificationStatus === 'verified'
  const verificationButtonDisabled = verificationStatusLoading || verificationStatusLoadingDisabled || !ninReady
  const verificationButtonLabel =
    verificationStatus === 'verified'
      ? 'Verified'
      : verificationStatus === 'pending'
        ? 'Awaiting review'
        : verificationStatusLoading
          ? 'Submitting…'
          : 'Submit for verification'

  const resetDraft = () => {
    setDraft(profile)
    setError('')
    setFeedback('')
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!user?.uid || !hasChanges) return

    setStatus('saving')
    setError('')
    setFeedback('')
    const payload = {
      displayName: draft.companyName?.trim() || user.displayName || user.email,
      companyName: draft.companyName?.trim(),
      companyType: draft.companyType,
      industry: draft.industry?.trim() || '',
      location: draft.location?.trim() || '',
      nin: sanitizeNinInput(draft.nin),
    }

    try {
      await saveUserProfile(user.uid, payload)
      const snapshot = buildProfileSnapshot({ ...user, ...payload })
      setProfile(snapshot)
      setDraft(snapshot)
      setFeedback('Profile updated successfully.')
      await refresh().catch(() => {})
    } catch (err) {
      setError(err?.message || 'Unable to save your profile right now.')
    } finally {
      setStatus('idle')
    }
  }

  const handleVerificationRequest = async () => {
    if (!user?.uid) {
      setVerificationNotice({ tone: 'negative', message: 'Sign in again to request verification.' })
      return
    }
    const ninValue = sanitizeNinInput(draft.nin)
    if (ninValue.length !== 11) {
      setVerificationNotice({ tone: 'negative', message: 'Enter your 11-digit NIN before submitting.' })
      return
    }

    setVerificationStatusLoading(true)
    setVerificationNotice(null)
    try {
      await requestVerificationReview({ userId: user.uid, nin: ninValue })
      setVerificationNotice({
        tone: 'positive',
        message: 'Verification request submitted. We will notify you once it has been reviewed.',
      })
      await refresh().catch(() => {})
    } catch (err) {
      setVerificationNotice({ tone: 'negative', message: err?.message || 'Unable to submit verification.' })
    } finally {
      setVerificationStatusLoading(false)
    }
  }

  return (
    <div className="client-page">
      <div className="profile-stack client-profile-page">
        <section className="profile-card">
          <div className="profile-card-header">
            <div>
              <p className="eyebrow">Client workspace</p>
              <h1>{draft.companyName || 'Name your workspace'}</h1>
              {user?.verificationStatus === 'verified' && (
                <span className="profile-verified">
                  <ShieldCheck size={14} aria-hidden="true" /> Verified
                </span>
              )}
              <p>{companyTypeLabel}</p>
            </div>
            <div className="profile-identity-meta">
              <span>{memberSinceLabel}</span>
            </div>
          </div>
          <div className="client-profile-meta">
            <div>
              <strong>Industry</strong>
              <p>{draft.industry || 'Add your industry to help with matching.'}</p>
            </div>
          </div>
        </section>

        <form className="profile-card profile-form-shell" onSubmit={handleSave}>
          <div className="client-profile-form-head">
            <div>
              <h2>Company details</h2>
              <p>Edit the information shared during registration.</p>
            </div>
            {hasChanges ? <p className="profile-tip">Unsaved changes</p> : null}
          </div>

          <div className="profile-field-grid">
            <label>
              <span>Company / Individual name</span>
              <input
                name="companyName"
                value={draft.companyName}
                onChange={handleFieldChange}
                placeholder="SkillLink Labs"
                required
              />
            </label>
            <label>
              <span>Entity type</span>
              <select name="companyType" value={draft.companyType} onChange={handleFieldChange}>
                {companyTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Industry</span>
              <input
                name="industry"
                value={draft.industry}
                onChange={handleFieldChange}
                placeholder="Fintech, Media, Ecommerce"
              />
            </label>
            <label>
              <span>Location</span>
              <input
                name="location"
                value={draft.location}
                onChange={handleFieldChange}
                placeholder="Lagos, NG"
              />
            </label>
          </div>

          {error ? <p className="profile-error-copy">{error}</p> : null}
          {feedback ? <p className="profile-success-copy">{feedback}</p> : null}

          <div className="client-profile-actions">
            <button type="button" className="profile-ghost-btn" onClick={resetDraft} disabled={!hasChanges || status === 'saving'}>
              Reset
            </button>
            <button type="submit" className="profile-primary-btn" disabled={!hasChanges || status === 'saving'}>
              {status === 'saving' ? (
                <>
                  <Loader2 size={18} className="icon-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </form>

        <section className="profile-card profile-verification-card">
          <div className="profile-card-header">
            <div>
              <h2>Verification badge</h2>
              <p>Provide your National Identification Number (NIN) so admins can verify this workspace.</p>
            </div>
            <span className={`verification-status-chip is-${verificationStatus}`}>
              {verificationStatusLabel}
            </span>
          </div>

          <div className="profile-field-grid">
            <label>
              <span>NIN (11 digits)</span>
              <input
                name="nin"
                value={draft.nin}
                onChange={handleFieldChange}
                placeholder="12345678901"
                inputMode="numeric"
                maxLength={11}
              />
            </label>
          </div>

          <p className={`verification-helper${verificationStatus === 'rejected' ? ' is-alert' : ''}`}>
            {verificationHelperCopy}
          </p>

          {verificationNotice && (
            <p className={`verification-feedback is-${verificationNotice.tone}`}>
              {verificationNotice.message}
            </p>
          )}

          <div className="profile-verification-actions">
            <button
              type="button"
              className="profile-primary-btn"
              onClick={handleVerificationRequest}
              disabled={verificationButtonDisabled}
            >
              {verificationButtonLabel}
            </button>
          </div>
        </section>

        {/* <section className="profile-card client-profile-sidecard">
          <h3>Workspace context</h3>
          <p className="profile-empty-copy">
            Keep this information current so our curation team can recommend the right freelancers faster.
          </p>
          <ul className="client-profile-list">
            <li>
              <Building2 size={18} aria-hidden="true" /> {companyTypeLabel}
            </li>
            <li>
              <NotebookPen size={18} aria-hidden="true" /> {draft.industry || 'Add your industry'}
            </li>
            <li>
              <MapPin size={18} aria-hidden="true" /> {draft.location || 'Location pending'}
            </li>
          </ul>
        </section> */}
      </div>
    </div>
  )
}

export default ClientProfile
