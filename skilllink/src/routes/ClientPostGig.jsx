import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { saveGigDraft } from '../services/firestoreClient'
import { uploadGigThumbnail } from '../services/storageClient'

const initialSkills = ['UI Design', 'Figma', 'Prototyping']
const skillSuggestions = ['User Research', 'Web Design', 'Interaction Design']

const initialForm = {
  title: '',
  description: '',
  projectOverview: '',
  responsibilities: '',
  requirements: '',
  budgetMin: '',
  budgetMax: '',
  currency: '$',
  deadline: '',
  skillInput: '',
}

const ClientPostGig = () => {
  const { user } = useAuth()
  const [formData, setFormData] = useState(initialForm)
  const [skills, setSkills] = useState(initialSkills)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [savedAt, setSavedAt] = useState(null)
  const [thumbnailAsset, setThumbnailAsset] = useState(null)
  const [thumbnailStatus, setThumbnailStatus] = useState('idle')
  const [thumbnailError, setThumbnailError] = useState('')

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const addSkill = (rawSkill) => {
    const skill = rawSkill?.trim()
    if (!skill) return
    if (skills.includes(skill)) return
    if (skills.length >= 5) return
    setSkills((prev) => [...prev, skill])
    setFormData((prev) => ({ ...prev, skillInput: '' }))
  }

  const handleSkillInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addSkill(formData.skillInput)
    }
  }

  const handleRemoveSkill = (skill) => {
    setSkills((prev) => prev.filter((item) => item !== skill))
  }

  const handleThumbnailChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    if (!user?.uid) {
      setThumbnailError('Sign in as a client to upload creatives.')
      return
    }
    if (!file.type?.startsWith('image/')) {
      setThumbnailError('Upload a valid image file (PNG, JPG, or GIF).')
      return
    }
    setThumbnailError('')
    try {
      setThumbnailStatus('uploading')
      const asset = await uploadGigThumbnail({ clientId: user.uid, file })
      setThumbnailAsset(asset)
      setThumbnailStatus('ready')
    } catch (error) {
      setThumbnailStatus('error')
      setThumbnailError(error.message || 'Unable to upload image right now.')
    }
  }

  const handleRemoveThumbnail = () => {
    setThumbnailAsset(null)
    setThumbnailStatus('idle')
    setThumbnailError('')
  }

  const validateForm = () => {
    const nextErrors = {}
    if (!formData.title.trim()) {
      nextErrors.title = 'Title is required.'
    }
    if (!formData.description.trim()) {
      nextErrors.description = 'Description is required.'
    }
    if (!formData.projectOverview.trim()) {
      nextErrors.projectOverview = 'Project overview is required.'
    }
    if (!skills.length) {
      nextErrors.skills = 'Select at least one skill.'
    }
    if (!formData.budgetMin.trim()) {
      nextErrors.budgetMin = 'Enter a minimum budget.'
    }
    if (!formData.budgetMax.trim()) {
      nextErrors.budgetMax = 'Enter a maximum budget.'
    }
    if (!formData.deadline.trim()) {
      nextErrors.deadline = 'Select a deadline.'
    }
    const responsibilityList = normalizeListInput(formData.responsibilities)
    const requirementList = normalizeListInput(formData.requirements)
    if (!responsibilityList.length) {
      nextErrors.responsibilities = 'Add at least one responsibility.'
    }
    if (!requirementList.length) {
      nextErrors.requirements = 'Add at least one requirement.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const persistGig = async ({ status = 'Draft' } = {}) => {
    if (!user?.uid) {
      throw new Error('You must be signed in as a client to save drafts.')
    }

    const sanitizedSkills = skills.map((skill) => skill.trim()).filter(Boolean)
    const projectOverview = formData.projectOverview.trim()
    const responsibilitiesList = normalizeListInput(formData.responsibilities)
    const requirementsList = normalizeListInput(formData.requirements)

    return saveGigDraft(user.uid, {
      title: formData.title.trim(),
      summary: formData.description.trim(),
      description: projectOverview,
      projectOverview,
      skills: sanitizedSkills,
      tags: sanitizedSkills,
      budgetMin: formData.budgetMin,
      budgetMax: formData.budgetMax,
      currency: formData.currency,
      timeline: formData.deadline,
      deadline: formData.deadline,
      responsibilities: responsibilitiesList,
      requirements: requirementsList,
      thumbnail: thumbnailAsset?.url,
      creative: thumbnailAsset || null,
      status,
      priceType: 'Fixed price',
      priceRange: formatBudgetRangeLabel(formData.currency, formData.budgetMin, formData.budgetMax),
      client: buildClientSnapshot(user),
      tokens: user?.tokenBalance ?? user?.tokens ?? 0,
    })
  }

  const handleSaveDraft = async () => {
    setStatus('submitting')
    setMessage('')
    try {
      const saved = await persistGig({ status: 'Draft' })
      setStatus('success')
      setMessage(`Draft for ${saved.title || 'this gig'} saved.`)
      setSavedAt(new Date())
    } catch (error) {
      setStatus('error')
      setMessage(error.message || 'Unable to save draft.')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validateForm()) return

    setStatus('submitting')
    setMessage('')
    try {
      const saved = await persistGig({ status: 'Open' })
      setStatus('success')
      setMessage(`Gig ${saved.title || 'draft'} saved.`)
      setSavedAt(new Date())
      setFormData(initialForm)
      setSkills(initialSkills)
      setErrors({})
      setThumbnailAsset(null)
      setThumbnailStatus('idle')
      setThumbnailError('')
    } catch (error) {
      setStatus('error')
      setMessage(error.message || 'Unable to save gig.')
    }
  }

  const handleCancel = () => {
    setFormData(initialForm)
    setSkills(initialSkills)
    setErrors({})
    setMessage('')
    setStatus('idle')
    setThumbnailAsset(null)
    setThumbnailStatus('idle')
    setThumbnailError('')
  }

  const handlePreview = () => {
    setStatus('success')
    setMessage('Preview mode is coming soon.')
  }

  return (
    <div className="post-gig-page">
      <section className="post-gig-intro">
        <p className="post-gig-hero-eyebrow">Client workspace</p>
        <h1>Launch a new project brief</h1>
        <p>
          Bring your next engagement to life with a structured, guided workflow. Share context, scope, and guardrails so
          we can introduce the right experts in hours instead of weeks.
        </p>
      </section>

      {message && (
        <div className={`inline-alert ${status === 'success' ? 'inline-alert-success' : 'inline-alert-error'}`}>
          <p>{message}</p>
        </div>
      )}

      <form className="post-gig-card" onSubmit={handleSubmit}>
          <section className="form-section">
            <div className="field-heading">
              <h3>Job Title</h3>
              <p>A clear title helps the right talent find your project quickly.</p>
            </div>
            <input
              className="input-control"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Senior UI/UX Designer for Web App Redesign"
            />
            {errors.title && <p className="field-error">{errors.title}</p>}
          </section>

          <section className="form-section">
            <div className="field-heading">
              <h3>Job Description</h3>
              <p>Share context, goals, and success metrics for the project.</p>
            </div>
            <div className="editor-shell">
              <div className="editor-meta" />
              <textarea
                className="input-control editor-input"
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe the opportunity, collaboration expectations, and deliverables."
              />
              {errors.description && <p className="field-error">{errors.description}</p>}
            </div>
          </section>

          <section className="form-section">
            <div className="field-heading">
              <h3>Project Overview</h3>
              <p>Outline the product vision, audiences, and current state of the work.</p>
            </div>
            <textarea
              className="input-control"
              name="projectOverview"
              rows={5}
              value={formData.projectOverview}
              onChange={handleChange}
              placeholder="Explain the problem space, collaborators, and desired outcomes."
            />
            {errors.projectOverview && <p className="field-error">{errors.projectOverview}</p>}
          </section>

          <section className="form-section">
            <div className="field-heading">
              <h3>Responsibilities</h3>
              <p>List the top contributions you expect from the freelancer (one per line).</p>
            </div>
            <textarea
              className="input-control"
              name="responsibilities"
              rows={4}
              value={formData.responsibilities}
              onChange={handleChange}
              placeholder={'Ship dashboard UX flows\nStand up usability tests\nAlign with growth PM weekly'}
            />
            <small className="field-helper">Each new line becomes a bullet in the freelancer view.</small>
            {errors.responsibilities && <p className="field-error">{errors.responsibilities}</p>}
          </section>

          <section className="form-section">
            <div className="field-heading">
              <h3>Requirements</h3>
              <p>Call out must-have skills, tools, or experience (one per line).</p>
            </div>
            <textarea
              className="input-control"
              name="requirements"
              rows={4}
              value={formData.requirements}
              onChange={handleChange}
              placeholder={'5+ years in product design\nExpert Figma systems\nExperience shipping fintech or SaaS'}
            />
            <small className="field-helper">Keep it concise—focus on the decisive qualifiers.</small>
            {errors.requirements && <p className="field-error">{errors.requirements}</p>}
          </section>

          <section className="form-section">
            <div className="field-heading">
              <h3>Ad Creative</h3>
              <p>Attach a hero image for your posting. This appears on freelancer opportunity cards.</p>
            </div>
            <div className="creative-upload">
              {thumbnailAsset ? (
                <div className="creative-preview">
                  <img src={thumbnailAsset.url} alt={thumbnailAsset.name} />
                  <div className="creative-preview-meta">
                    <p>{thumbnailAsset.name}</p>
                    <button type="button" className="ghost-button ghost-compact" onClick={handleRemoveThumbnail}>
                      Remove image
                    </button>
                  </div>
                </div>
              ) : (
                <p className="creative-placeholder">No creative uploaded yet.</p>
              )}
              <label className="ghost-button creative-upload-trigger">
                Upload image
                <input type="file" accept="image/*" onChange={handleThumbnailChange} />
              </label>
              {thumbnailStatus === 'uploading' && <p className="field-helper">Uploading image…</p>}
              {thumbnailError && <p className="field-error">{thumbnailError}</p>}
              <small className="field-helper">PNG or JPG up to 5MB.</small>
            </div>
          </section>

          <section className="form-section">
            <div className="field-heading">
              <h3>Required Expertise</h3>
              <p>Add up to 5 skills to help us match you with the right talent.</p>
            </div>
            <div className="skill-chip-list">
              {skills.map((skill) => (
                <span className="skill-chip" key={skill}>
                  {skill}
                  <button type="button" onClick={() => handleRemoveSkill(skill)} aria-label={`Remove ${skill}`}>
                    ×
                  </button>
                </span>
              ))}
              {skills.length < 5 && (
                <input
                  className="skill-input"
                  name="skillInput"
                  placeholder="Add more skills..."
                  value={formData.skillInput}
                  onChange={handleChange}
                  onKeyDown={handleSkillInputKeyDown}
                />
              )}
            </div>
            {errors.skills && <p className="field-error">{errors.skills}</p>}
            <div className="skill-suggestions">
              <span>Suggestions:</span>
              {skillSuggestions.map((skill) => (
                <button type="button" key={skill} onClick={() => addSkill(skill)}>
                  + {skill}
                </button>
              ))}
            </div>
          </section>

          <section className="budget-grid">
            <div>
              <div className="field-heading">
                <h3>Budget Range</h3>
              </div>
              <div className="budget-inputs">
                <div className="currency-input">
                  <span>{formData.currency}</span>
                  <input
                    type="number"
                    name="budgetMin"
                    value={formData.budgetMin}
                    onChange={handleChange}
                    placeholder="Min"
                    min="0"
                  />
                </div>
                <span className="budget-separator">to</span>
                <div className="currency-input">
                  <span>{formData.currency}</span>
                  <input
                    type="number"
                    name="budgetMax"
                    value={formData.budgetMax}
                    onChange={handleChange}
                    placeholder="Max"
                    min="0"
                  />
                </div>
              </div>
              {(errors.budgetMin || errors.budgetMax) && (
                <p className="field-error">{errors.budgetMin || errors.budgetMax}</p>
              )}
            </div>
            <div className="deadline-field">
              <div className="field-heading">
                <h3>Project Deadline</h3>
              </div>
              <div className="date-field">
                <input type="date" name="deadline" value={formData.deadline} onChange={handleChange} />
                <CalendarDays size={18} aria-hidden="true" />
              </div>
              {errors.deadline && <p className="field-error">{errors.deadline}</p>}
            </div>
          </section>

          <div className="form-footer">
            <button type="button" className="ghost-button" onClick={handleCancel}>
              Cancel
            </button>
            <div className="footer-actions">
              <button type="button" className="ghost-button" onClick={handleSaveDraft}>
                Save draft
              </button>
              <button type="submit" className="cta cta-primary" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Saving...' : 'Post gig'}
              </button>
            </div>
          </div>
      </form>
    </div>
  )
}

export default ClientPostGig

const formatSavedAt = (date) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)

const normalizeListInput = (value = '') =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)

const formatBudgetRangeLabel = (currency, min, max) => {
  const symbol = currency || '₦'
  const formatPart = (value) => {
    if (value === null || value === undefined || value === '') {
      return '0'
    }
    const numeric = Number(value)
    return Number.isNaN(numeric) ? String(value) : numeric.toLocaleString()
  }
  return `${symbol}${formatPart(min)} - ${symbol}${formatPart(max)}`
}

const buildClientSnapshot = (user) => ({
  id: user?.uid || null,
  name: user?.companyName || user?.displayName || user?.email || 'SkillLink client',
  sector: user?.industry || 'General',
  rating: user?.clientRating || 'New',
  location: user?.location || user?.city || 'Remote',
  verified: Boolean(user?.verificationStatus === 'verified' || user?.workspaceVerified),
})
