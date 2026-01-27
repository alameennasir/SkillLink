import { Edit3, Info, Loader2, PlusCircle, Share2, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { saveFreelancerProfile } from '../services/firestoreClient'
import { useAuth } from '../context/AuthContext'
import {
  deleteLocalPortfolioAssetBlob,
  fetchLocalPortfolioAssetBlob,
  isLocalPortfolioReference,
  uploadFreelancerPortfolioAsset,
} from '../services/storageClient'

const defaultProfile = {
  displayName: '',
  title: '',
  location: '',
  state: '',
  summary: '',
  availability: '',
  skills: [],
  featured: [],
  languages: [],
}

const skillSuggestions = ['Product Strategy', 'Service Design', 'Flutter', 'No-code Automation']

const initialProjectForm = {
  title: '',
  description: '',
  tags: [],
  url: '',
  tone: 'rose',
  origin: 'user',
  media: null,
}

const MAX_PORTFOLIO_FILE_SIZE = 50 * 1024 * 1024
const PORTFOLIO_ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/quicktime']
const PORTFOLIO_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'mp4', 'mov']
const PORTFOLIO_ACCEPT_ATTR = PORTFOLIO_ACCEPTED_MIME.join(',')

const normalizePortfolioMedia = (media) => {
  if (!media || typeof media !== 'object') return null
  const fallbackId = media.storagePath || media.url || `asset-${Date.now()}`
  return {
    id: media.id || fallbackId,
    name: media.name || media.fileName || 'portfolio-asset',
    size: Number(media.size) || 0,
    type: media.type || 'application/octet-stream',
    url: media.url || '',
    storagePath: media.storagePath || '',
    uploadedAt: media.uploadedAt || media.createdAt || '',
  }
}

const isImageMedia = (media) => Boolean(media?.type?.startsWith('image/'))
const isVideoMedia = (media) => Boolean(media?.type?.startsWith('video/'))

const normalizeFeatured = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item) return null
      if (typeof item === 'string') {
        return {
          title: item,
          description: '',
          tags: [],
          url: '',
          tone: 'rose',
          origin: 'user',
        }
      }
      return {
        title: item.title || 'Untitled project',
        description: item.description || '',
        tags: Array.isArray(item.tags) ? [...item.tags] : [],
        url: item.url || '',
        tone: item.tone || 'rose',
        origin: item.origin || 'user',
        media: normalizePortfolioMedia(item.media),
      }
    })
    .filter(Boolean)
}

const pickTone = (index) => (index % 2 === 0 ? 'graphite' : 'rose')

const getInitials = (value) => {
  if (!value) return 'SL'
  const parts = value.trim().split(' ')
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? 'S'
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

const FreelancerProfile = () => {
  const { user, refresh } = useAuth()
  const [profile, setProfile] = useState(defaultProfile)
  const [draft, setDraft] = useState(defaultProfile)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [lastSaved, setLastSaved] = useState('')
  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [addingSkill, setAddingSkill] = useState(false)
  const [skillDraft, setSkillDraft] = useState('')
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [projectForm, setProjectForm] = useState(initialProjectForm)
  const [projectTagInput, setProjectTagInput] = useState('')
  const [editingProjectIndex, setEditingProjectIndex] = useState(null)
  const portfolioFileInputRef = useRef(null)
  const [isDraggingPortfolioFile, setIsDraggingPortfolioFile] = useState(false)
  const [isUploadingPortfolioMedia, setIsUploadingPortfolioMedia] = useState(false)
  const [portfolioUploadError, setPortfolioUploadError] = useState('')
  const localPortfolioMediaUrlsRef = useRef({})
  const [localPortfolioMediaVersion, setLocalPortfolioMediaVersion] = useState(0)

  const hydrateProfile = useCallback(() => {
    if (!user) return
    const normalizedFeatured = normalizeFeatured(user?.featured)
    const hydrated = {
      displayName: user.displayName || '',
      title: user.title || '',
      location: user.location || '',
      state: user.state || '',
      summary: user.summary || '',
      availability: user.availability || '',
      skills: user.skills?.length ? user.skills : [],
      featured: normalizedFeatured,
      languages: Array.isArray(user.languages) ? user.languages.filter(Boolean).slice(0, 3) : [],
    }
    setProfile(hydrated)
    setDraft(hydrated)
    setBioDraft(hydrated.summary)
  }, [user])

  useEffect(() => {
    hydrateProfile()
  }, [hydrateProfile])

  useEffect(() => {
    return () => {
      Object.values(localPortfolioMediaUrlsRef.current).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url)
        }
      })
      localPortfolioMediaUrlsRef.current = {}
    }
  }, [])

  const registerLocalPortfolioPreview = useCallback((assetId, objectUrl) => {
    if (!assetId || !objectUrl) return
    const existing = localPortfolioMediaUrlsRef.current[assetId]
    if (existing) {
      URL.revokeObjectURL(existing)
    }
    localPortfolioMediaUrlsRef.current[assetId] = objectUrl
    setLocalPortfolioMediaVersion((prev) => prev + 1)
  }, [])

  const removeLocalPortfolioPreview = useCallback((assetId) => {
    if (!assetId) return
    const existing = localPortfolioMediaUrlsRef.current[assetId]
    if (existing) {
      URL.revokeObjectURL(existing)
      delete localPortfolioMediaUrlsRef.current[assetId]
      setLocalPortfolioMediaVersion((prev) => prev + 1)
    }
  }, [])

  const getMediaPreviewUrl = useCallback(
    (media) => {
      if (!media) return ''
      if (media.url && !isLocalPortfolioReference(media.url)) {
        return media.url
      }
      if (media.id) {
        return localPortfolioMediaUrlsRef.current[media.id] || ''
      }
      return ''
    },
    [localPortfolioMediaVersion]
  )

  const cleanupLocalPortfolioMedia = useCallback(
    (media) => {
      if (!media?.id) return
      removeLocalPortfolioPreview(media.id)
      if (isLocalPortfolioReference(media.url)) {
        deleteLocalPortfolioAssetBlob(media.id)
      }
    },
    [removeLocalPortfolioPreview]
  )

  useEffect(() => {
    let active = true
    const missingIds = []
    ;(draft.featured || []).forEach((project) => {
      const media = project.media
      if (media?.id && isLocalPortfolioReference(media.url) && !localPortfolioMediaUrlsRef.current[media.id]) {
        missingIds.push(media.id)
      }
    })
    if (!missingIds.length) {
      return () => {
        active = false
      }
    }
    const hydrateLocalMedia = async () => {
      for (const assetId of missingIds) {
        try {
          const blob = await fetchLocalPortfolioAssetBlob(assetId)
          if (!blob || !active) continue
          const objectUrl = URL.createObjectURL(blob)
          registerLocalPortfolioPreview(assetId, objectUrl)
        } catch (error) {
          console.warn('Unable to hydrate local portfolio media', assetId, error)
        }
      }
    }
    hydrateLocalMedia()
    return () => {
      active = false
    }
  }, [draft.featured, registerLocalPortfolioPreview])

  const completeness = useMemo(() => {
    const basics = ['displayName', 'title', 'location', 'summary']
    const filledBasics = basics.filter((field) => draft[field]?.trim()).length
    const dataScore = filledBasics / basics.length
    const skillsScore = (draft.skills?.length || 0) >= 3 ? 1 : (draft.skills?.length || 0) / 3
    const featuredScore = (draft.featured?.length || 0) >= 2 ? 1 : (draft.featured?.length || 0) / 2
    return Math.round(((dataScore + skillsScore + featuredScore) / 3) * 100)
  }, [draft])

  const initials = useMemo(
    () => getInitials(draft.displayName || user?.email || 'SkillLink'),
    [draft.displayName, user?.email]
  )

  const languages = useMemo(() => {
    return (draft.languages || []).filter(Boolean).slice(0, 3)
  }, [draft.languages])

  const locationLabel = useMemo(() => {
    if (draft.location?.trim()) {
      return draft.location.trim()
    }
    if (draft.state?.trim()) {
      return draft.state.trim()
    }
    return 'Add your city or state'
  }, [draft.location, draft.state])

  const portfolioCards = useMemo(() => {
    if (!draft.featured?.length) {
      return []
    }

    return draft.featured.map((card, index) => ({
      title: card.title || 'Untitled project',
      description: card.description || '',
      tags: Array.isArray(card.tags) ? [...card.tags] : [],
      url: card.url || '',
      tone: card.tone || pickTone(index),
      origin: card.origin || 'user',
      media: card.media ? { ...card.media } : null,
    }))
  }, [draft.featured])

  const projectFormMediaPreviewUrl = useMemo(() => getMediaPreviewUrl(projectForm.media), [getMediaPreviewUrl, projectForm.media])

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(profile), [draft, profile])

  const memberSinceLabel = useMemo(() => {
    const rawDate = user?.createdAt
    if (!rawDate) return 'Member since —'
    const parsed = typeof rawDate.toDate === 'function' ? rawDate.toDate() : new Date(rawDate)
    if (Number.isNaN(parsed.getTime())) {
      return 'Member since —'
    }
    return `Member since ${parsed.getFullYear()}`
  }, [user?.createdAt])

  const handleDiscard = () => {
    const persistedIds = new Set((profile.featured || []).map((project) => project.media?.id).filter(Boolean))
    ;(draft.featured || []).forEach((project) => {
      if (project?.media?.id && isLocalPortfolioReference(project.media.url) && !persistedIds.has(project.media.id)) {
        cleanupLocalPortfolioMedia(project.media)
      }
    })
    if (projectForm.media && (!projectForm.media.id || !persistedIds.has(projectForm.media.id))) {
      cleanupLocalPortfolioMedia(projectForm.media)
    }
    setDraft(profile)
    setBioDraft(profile.summary)
    setSkillDraft('')
    setProjectForm(initialProjectForm)
    setProjectTagInput('')
    setShowProjectForm(false)
    setEditingProjectIndex(null)
    setEditingBio(false)
    setAddingSkill(false)
    setPortfolioUploadError('')
    setIsDraggingPortfolioFile(false)
    setIsUploadingPortfolioMedia(false)
    if (portfolioFileInputRef.current) {
      portfolioFileInputRef.current.value = ''
    }
    setError('')
    setStatus('idle')
  }

  const commitBio = () => {
    const next = bioDraft.trim()
    if (!next) return
    setDraft((prev) => ({ ...prev, summary: next }))
    setEditingBio(false)
  }

  const addSuggestedSkill = (skill) => {
    setDraft((prev) => {
      if (prev.skills?.includes(skill)) return prev
      return { ...prev, skills: [...(prev.skills || []), skill] }
    })
  }

  const addSkill = () => {
    const next = skillDraft.trim()
    if (!next) {
      setAddingSkill(false)
      setSkillDraft('')
      return
    }
    setDraft((prev) => {
      if (prev.skills?.includes(next)) return prev
      return { ...prev, skills: [...(prev.skills || []), next] }
    })
    setSkillDraft('')
    setAddingSkill(false)
  }

  const removeSkill = (skill) => {
    setDraft((prev) => ({ ...prev, skills: (prev.skills || []).filter((item) => item !== skill) }))
  }

  const openProjectForm = (project = initialProjectForm, index = null) => {
    setProjectForm({
      ...initialProjectForm,
      ...project,
      tags: project.tags?.length ? [...project.tags] : [],
      tone: project.tone || pickTone(index ?? (draft.featured?.length || 0)),
      origin: project.origin || 'user',
      media: project.media ? { ...project.media } : null,
    })
    setProjectTagInput('')
    setEditingProjectIndex(index)
    setPortfolioUploadError('')
    setIsDraggingPortfolioFile(false)
    setShowProjectForm(true)
  }

  const closeProjectForm = () => {
    setShowProjectForm(false)
    setProjectForm(initialProjectForm)
    setProjectTagInput('')
    setEditingProjectIndex(null)
    setPortfolioUploadError('')
    setIsDraggingPortfolioFile(false)
    setIsUploadingPortfolioMedia(false)
    if (portfolioFileInputRef.current) {
      portfolioFileInputRef.current.value = ''
    }
  }

  const discardProjectFormMediaIfTransient = () => {
    if (!projectForm.media?.id) {
      return
    }
    const baselineMediaId =
      editingProjectIndex !== null ? draft.featured?.[editingProjectIndex]?.media?.id : null
    if (editingProjectIndex === null || projectForm.media.id !== baselineMediaId) {
      cleanupLocalPortfolioMedia(projectForm.media)
    }
  }

  const cancelProjectForm = () => {
    discardProjectFormMediaIfTransient()
    closeProjectForm()
  }

  const handleProjectFieldChange = (event) => {
    const { name, value } = event.target
    setProjectForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleProjectTagKeyDown = (event) => {
    if ((event.key === 'Enter' || event.key === ',') && projectTagInput.trim()) {
      event.preventDefault()
      const value = projectTagInput.trim()
      setProjectForm((prev) => {
        if (prev.tags.includes(value)) return prev
        return { ...prev, tags: [...prev.tags, value] }
      })
      setProjectTagInput('')
      return
    }

    if (event.key === 'Backspace' && !projectTagInput && projectForm.tags.length) {
      event.preventDefault()
      setProjectForm((prev) => ({ ...prev, tags: prev.tags.slice(0, -1) }))
    }
  }

  const removeProjectTag = (tag) => {
    setProjectForm((prev) => ({ ...prev, tags: prev.tags.filter((item) => item !== tag) }))
  }

  const handleProjectSave = (event) => {
    event.preventDefault()
    const cleanedTitle = projectForm.title.trim()
    if (!cleanedTitle) return
    const payload = {
      ...projectForm,
      title: cleanedTitle,
      description: projectForm.description.trim(),
      url: projectForm.url.trim(),
      tags: projectForm.tags.map((tag) => tag.trim()).filter(Boolean),
      tone: projectForm.tone || pickTone(editingProjectIndex ?? draft.featured?.length ?? 0),
      origin: 'user',
      media: projectForm.media ? { ...projectForm.media } : null,
    }

    setDraft((prev) => {
      const nextFeatured = [...(prev.featured || [])]
      if (editingProjectIndex !== null) {
        nextFeatured[editingProjectIndex] = payload
      } else {
        nextFeatured.push(payload)
      }
      return { ...prev, featured: nextFeatured }
    })

    closeProjectForm()
  }

  const handleProjectDelete = (index) => {
    setDraft((prev) => {
      const existing = prev.featured || []
      const removedProject = existing[index]
      if (removedProject?.media) {
        cleanupLocalPortfolioMedia(removedProject.media)
      }
      return { ...prev, featured: existing.filter((_, idx) => idx !== index) }
    })
    if (editingProjectIndex === index) {
      closeProjectForm()
    } else if (editingProjectIndex !== null && editingProjectIndex > index) {
      setEditingProjectIndex((prev) => (prev !== null ? prev - 1 : null))
    }
  }

  const handlePortfolioMediaRemove = () => {
    setProjectForm((prev) => {
      if (prev.media) {
        cleanupLocalPortfolioMedia(prev.media)
      }
      return { ...prev, media: null }
    })
    setPortfolioUploadError('')
    if (portfolioFileInputRef.current) {
      portfolioFileInputRef.current.value = ''
    }
  }

  const validatePortfolioFile = (file) => {
    if (!file) {
      throw new Error('Select a file to upload.')
    }
    const extension = file.name?.split('.').pop()?.toLowerCase() || ''
    const hasAllowedMime = PORTFOLIO_ACCEPTED_MIME.includes(file.type)
    const hasAllowedExtension = PORTFOLIO_ALLOWED_EXTENSIONS.includes(extension)
    if (!hasAllowedMime && !hasAllowedExtension) {
      throw new Error('Upload JPG, PNG, MP4, or MOV files only.')
    }
    if (file.size > MAX_PORTFOLIO_FILE_SIZE) {
      throw new Error('File exceeds the 50MB limit.')
    }
  }

  const processPortfolioFiles = async (files) => {
    if (!user?.uid || !files?.length) return
    const [file] = files
    try {
      validatePortfolioFile(file)
    } catch (validationError) {
      setPortfolioUploadError(validationError.message)
      return
    }

    setPortfolioUploadError('')
    setIsUploadingPortfolioMedia(true)
    try {
      const asset = await uploadFreelancerPortfolioAsset({ userId: user.uid, file })
      if (isLocalPortfolioReference(asset.url)) {
        const previewUrl = URL.createObjectURL(file)
        registerLocalPortfolioPreview(asset.id, previewUrl)
      }
      setProjectForm((prev) => {
        if (prev.media && prev.media.id !== asset.id) {
          cleanupLocalPortfolioMedia(prev.media)
        }
        return { ...prev, media: asset }
      })
    } catch (err) {
      setPortfolioUploadError(err?.message || 'Unable to upload file right now.')
    } finally {
      setIsUploadingPortfolioMedia(false)
    }
  }

  const handlePortfolioInputChange = (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    processPortfolioFiles(files)
  }

  const handlePortfolioBrowse = () => {
    if (isUploadingPortfolioMedia) return
    portfolioFileInputRef.current?.click()
  }

  const handlePortfolioDragEnter = (event) => {
    event.preventDefault()
    if (isUploadingPortfolioMedia) return
    setIsDraggingPortfolioFile(true)
  }

  const handlePortfolioDragLeave = (event) => {
    event.preventDefault()
    if (event.currentTarget.contains(event.relatedTarget)) return
    setIsDraggingPortfolioFile(false)
  }

  const handlePortfolioDrop = (event) => {
    event.preventDefault()
    if (isUploadingPortfolioMedia) return
    const files = Array.from(event.dataTransfer?.files || [])
    setIsDraggingPortfolioFile(false)
    if (files.length) {
      processPortfolioFiles(files)
    }
  }

  const formatPortfolioMediaMeta = (media) => {
    if (!media) return ''
    const sizeLabel = media.size ? `${(media.size / (1024 * 1024)).toFixed(1)} MB` : ''
    const typeLabel = isImageMedia(media) ? 'Image' : isVideoMedia(media) ? 'Video' : 'File'
    return [typeLabel, sizeLabel].filter(Boolean).join(' · ')
  }

  const handleSave = async () => {
    if (!user?.uid || !hasChanges) return
    setStatus('saving')
    setError('')

    try {
      const payload = {
        ...draft,
        skills: (draft.skills || []).filter(Boolean),
        featured: (draft.featured || []).filter(Boolean),
        languages,
        state: draft.state?.trim() || '',
        location: draft.location?.trim() || draft.state?.trim() || '',
        profileComplete: completeness / 100,
      }
      await saveFreelancerProfile(user.uid, payload)
      await refresh()
      setProfile(payload)
      setDraft(payload)
      setStatus('saved')
      setLastSaved(
        new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      )
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err) {
      setStatus('error')
      setError(err?.message || 'Unable to save profile right now.')
    }
  }

  return (
    <div className="freelancer-page freelancer-profile-page">
      <section className="profile-stack">
        <article className="profile-card profile-completion-card">
          <header className="profile-card-header">
            <div>
              <p className="eyebrow">Profile Completion</p>
              <p>Add a portfolio item to reach 100% and unlock "Featured Freelancer" status.</p>
            </div>
            <strong>{completeness}%</strong>
          </header>
          <div
            className="profile-progress-track"
            role="progressbar"
            aria-valuenow={completeness}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.min(completeness, 100)}%` }} />
          </div>
        </article>

        <article className="profile-card profile-identity-card">
          <div className="profile-identity">
            <div className="profile-avatar-lg" aria-hidden="true">
              {initials}
            </div>
            <div>
              <h1>{draft.displayName || 'Add your first + last name'}</h1>
              <p>{draft.title || 'Share your focus area (e.g., Product Designer)'}</p>
              <div className="profile-identity-meta">
                <span>{locationLabel}</span>
                <span>{memberSinceLabel}</span>
                {user?.verificationStatus === 'verified' && (
                  <span className="profile-verified">
                    <ShieldCheck size={14} aria-hidden="true" />
                    Verified
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="profile-identity-actions">
            <button type="button" className="profile-ghost-btn">
              <Share2 size={16} aria-hidden="true" />
              Share Profile
            </button>
          </div>
        </article>
      </section>

      {error && status === 'error' && <div className="auth-alert">{error}</div>}

      <section className="profile-card profile-bio-card">
        <header className="profile-card-header">
          <h3>Professional Bio</h3>
          <button type="button" className="profile-icon-btn" onClick={() => setEditingBio((prev) => !prev)}>
            <Edit3 size={16} aria-hidden="true" />
            {editingBio ? 'Close' : 'Edit'}
          </button>
        </header>
        {editingBio ? (
          <div className="profile-inline-editor">
            <textarea value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} rows={4} />
            <div className="profile-inline-editor-actions">
              <button type="button" onClick={commitBio} className="profile-primary-btn">
                Save Bio
              </button>
              <button
                type="button"
                className="profile-ghost-btn"
                onClick={() => {
                  setBioDraft(draft.summary)
                  setEditingBio(false)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p>
            {draft.summary}
          </p>
        )}
        <p className="profile-tip">
          <Info size={16} aria-hidden="true" />
          Tip: Including keywords about your tech stack can increase visibility by 40%.
        </p>
      </section>

      <section className="profile-card profile-languages-card">
        <header className="profile-card-header">
          <h3>Languages</h3>
        </header>
        {languages.length ? (
          <div className="profile-skill-tags profile-language-tags">
            {languages.map((language) => (
              <span className="profile-skill-chip" key={`lang-${language}`}>
                {language}
              </span>
            ))}
          </div>
        ) : (
          <p className="profile-empty-copy">Select up to three spoken languages from onboarding to display here.</p>
        )}
        <p className="profile-tip">
          <Info size={16} aria-hidden="true" />
          Clients see these languages on your proposals.
        </p>
      </section>

      <section className="profile-card profile-skills-card">
        <header className="profile-card-header">
          <h3>Skills & Expertise</h3>
          <button type="button" className="profile-add-btn" onClick={() => setAddingSkill(true)}>
            <PlusCircle size={18} aria-hidden="true" />
            Add New
          </button>
        </header>
        <div className="profile-skill-tags">
          {draft.skills?.length ? (
            draft.skills.map((skill) => (
              <span className="profile-skill-chip" key={skill}>
                {skill}
                <button type="button" aria-label={`Remove ${skill}`} onClick={() => removeSkill(skill)}>
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))
          ) : (
            <p className="profile-empty-copy">Add at least 3 skills so clients can filter by your expertise.</p>
          )}
        </div>
        {addingSkill && (
          <div className="profile-skill-entry">
            <input
              value={skillDraft}
              onChange={(event) => setSkillDraft(event.target.value)}
              placeholder="e.g. Motion Prototyping"
              autoFocus
            />
            <button type="button" onClick={addSkill}>
              Save
            </button>
          </div>
        )}
        <div className="profile-skill-hints">
          <p>Popular on SkillLink:</p>
          <div className="profile-skill-hint-tags">
            {skillSuggestions.map((skill) => (
              <button type="button" key={skill} onClick={() => addSuggestedSkill(skill)}>
                {skill}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="profile-card profile-portfolio-card">
        <header className="profile-card-header">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h3>Case studies</h3>
          </div>
          <button type="button" className="profile-add-btn" onClick={() => openProjectForm()}>
            <PlusCircle size={18} aria-hidden="true" />
            Add Project
          </button>
        </header>

        {showProjectForm && (
          <form className="portfolio-form-panel" onSubmit={handleProjectSave}>
            <div className="portfolio-form-header">
              <h4>{editingProjectIndex !== null ? 'Edit Portfolio Project' : 'Add/Edit Portfolio Project'}</h4>
              <button type="button" aria-label="Close project form" onClick={cancelProjectForm}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <label>
              <span>Project Title</span>
              <input
                name="title"
                value={projectForm.title}
                onChange={handleProjectFieldChange}
                placeholder="e.g., FinTech Dashboard Redesign"
                required
              />
            </label>
            <label>
              <span>Detailed Description</span>
              <textarea
                name="description"
                value={projectForm.description}
                onChange={handleProjectFieldChange}
                placeholder="Provide a detailed overview of your project, challenges, and your role."
                rows={4}
              />
            </label>
            <label>
              <span>Skills/Tags</span>
              <div className="portfolio-tag-input">
                {projectForm.tags.map((tag) => (
                  <span key={tag} className="portfolio-tag-chip">
                    {tag}
                    <button type="button" aria-label={`Remove ${tag}`} onClick={() => removeProjectTag(tag)}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <input
                  value={projectTagInput}
                  onChange={(event) => setProjectTagInput(event.target.value)}
                  onKeyDown={handleProjectTagKeyDown}
                  placeholder="Add skills and tags (e.g., UI Design, SaaS, React.js)"
                />
              </div>
            </label>
            <label>
              <span>Project URL (Optional)</span>
              <input
                name="url"
                value={projectForm.url}
                onChange={handleProjectFieldChange}
                placeholder="Link to live project, Behance, Dribbble, etc."
              />
            </label>
            <div
              className={`portfolio-upload-area${isDraggingPortfolioFile ? ' is-dragging' : ''}${isUploadingPortfolioMedia ? ' is-disabled' : ''}`}
              onDragEnter={handlePortfolioDragEnter}
              onDragOver={handlePortfolioDragEnter}
              onDragLeave={handlePortfolioDragLeave}
              onDrop={handlePortfolioDrop}
            >
              {isUploadingPortfolioMedia ? (
                <Loader2 size={32} aria-hidden="true" className="icon-spin" />
              ) : (
                <UploadCloud size={32} aria-hidden="true" />
              )}
              <p>
                Drag & drop files here, or{' '}
                <button type="button" onClick={handlePortfolioBrowse} disabled={isUploadingPortfolioMedia}>
                  browse
                </button>
              </p>
              <small>Supports images (JPG, PNG) and videos (MP4, MOV). Max size 50MB.</small>
              {portfolioUploadError && <small className="portfolio-upload-error">{portfolioUploadError}</small>}
              <input
                ref={portfolioFileInputRef}
                type="file"
                accept={PORTFOLIO_ACCEPT_ATTR}
                onChange={handlePortfolioInputChange}
                hidden
                disabled={isUploadingPortfolioMedia}
              />
            </div>
            {projectForm.media && (
              <div className="portfolio-upload-preview">
                <div className="portfolio-upload-preview-thumb" aria-hidden="true">
                  {projectFormMediaPreviewUrl ? (
                    isVideoMedia(projectForm.media) ? (
                      <video
                        src={projectFormMediaPreviewUrl}
                        muted
                        loop
                        autoPlay
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={projectFormMediaPreviewUrl}
                        alt={projectForm.media.name || 'Uploaded portfolio media'}
                      />
                    )
                  ) : (
                    <span>File ready</span>
                  )}
                </div>
                <div className="portfolio-upload-preview-meta">
                  <p>{projectForm.media.name || 'Uploaded file'}</p>
                  <small>{formatPortfolioMediaMeta(projectForm.media)}</small>
                </div>
                <button type="button" className="profile-icon-btn" onClick={handlePortfolioMediaRemove}>
                  <X size={14} aria-hidden="true" />
                  Remove file
                </button>
              </div>
            )}
            <div className="portfolio-form-actions">
              <button type="button" className="profile-ghost-btn" onClick={cancelProjectForm}>
                Cancel
              </button>
              <button type="submit" className="profile-primary-btn">
                Save Project
              </button>
            </div>
          </form>
        )}

        <div className="portfolio-grid">
          {portfolioCards.map((card, index) => {
            const storedProject = draft.featured?.[index]
            const canEdit = card.origin === 'user' || card.tone === 'rose'
            const mediaPreviewUrl = getMediaPreviewUrl(card.media)

            return (
              <article className={`portfolio-card portfolio-card-${card.tone}`} key={`${card.title}-${index}`}>
                {canEdit && (
                  <div className="portfolio-card-actions">
                    <button
                      type="button"
                      aria-label={`Edit ${card.title}`}
                      onClick={() => openProjectForm(storedProject || card, storedProject ? index : null)}
                    >
                      <Edit3 size={14} aria-hidden="true" />
                    </button>
                    {storedProject && (
                      <button type="button" aria-label={`Delete ${card.title}`} onClick={() => handleProjectDelete(index)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
                <div className="portfolio-card-media" aria-hidden={!mediaPreviewUrl}>
                  {mediaPreviewUrl &&
                    (isVideoMedia(card.media) ? (
                      <video
                        src={mediaPreviewUrl}
                        muted
                        loop
                        autoPlay
                        playsInline
                        preload="metadata"
                        aria-label={`${card.title} media preview`}
                      />
                    ) : (
                      <img src={mediaPreviewUrl} alt={`${card.title} media preview`} />
                    ))}
                </div>
                <div className="portfolio-card-body">
                  <h4>{card.title}</h4>
                  <p>{card.description}</p>
                  <div className="portfolio-card-tags">
                    {card.tags.map((tag) => (
                      <span key={`${card.title}-${tag}`}>{tag}</span>
                    ))}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <footer className="profile-save-bar">
        <div>
          <p>{lastSaved ? `Last saved today at ${lastSaved}` : 'Changes not saved yet'}</p>
          {status === 'saved' && <small className="profile-status profile-status-success">Profile updated</small>}
        </div>
        <div className="profile-save-actions">
          <button
            type="button"
            className="profile-ghost-btn"
            onClick={handleDiscard}
            disabled={!hasChanges || status === 'saving'}
          >
            Discard Changes
          </button>
          <button
            type="button"
            className="profile-primary-btn"
            disabled={!hasChanges || status === 'saving'}
            onClick={handleSave}
          >
            {status === 'saving' ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </footer>
    </div>
  )
}

export default FreelancerProfile
