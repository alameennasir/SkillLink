import { Briefcase } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import stateOptions from '../data/stateOptions'
import { saveUserProfile } from '../services/firestoreClient'

const freelancerInitial = {
  bio: '',
  skills: '',
  experienceLevel: 'intermediate',
  state: '',
  featured: [],
}

const FreelancerOnboarding = () => {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [formState, setFormState] = useState(freelancerInitial)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [projectForm, setProjectForm] = useState({ title: '', description: '', url: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!user) return
    setFormState({
      bio: user.summary || '',
      skills: Array.isArray(user.skills) ? user.skills.join(', ') : user.skills || '',
      experienceLevel: user.experienceLevel || 'intermediate',
      state: user.state || user.location || '',
      featured: Array.isArray(user.featured) ? user.featured.map((p) => ({ title: p.title || '', description: p.description || '', url: p.url || '' })) : [],
    })
  }, [user])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleProjectFieldChange = (e) => {
    const { name, value } = e.target
    setProjectForm((prev) => ({ ...prev, [name]: value }))
  }

  const addProject = (e) => {
    e.preventDefault()
    const title = projectForm.title.trim()
    if (!title) return
    setFormState((prev) => ({ ...prev, featured: [...(prev.featured || []), { ...projectForm }] }))
    setProjectForm({ title: '', description: '', url: '' })
    setShowProjectForm(false)
  }

  const removeProject = (index) => {
    setFormState((prev) => ({ ...prev, featured: (prev.featured || []).filter((_, i) => i !== index) }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user?.uid) return
    setFeedback('')
    setIsSaving(true)
    try {
      const selectedState = formState.state.trim()
      const payload = {
        summary: formState.bio.trim(),
        skills: formState.skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        experienceLevel: formState.experienceLevel,
        featured: Array.isArray(formState.featured)
          ? formState.featured.map((p) => ({ title: p.title || '', description: p.description || '', url: p.url || '' }))
          : [],
        state: selectedState,
        location: selectedState || user?.location || '',
        onboardingStep: 'freelancer-onboarding-complete',
      }
      await saveUserProfile(user.uid, payload)
      await refresh()
      navigate('/freelancer', { replace: true })
    } catch (error) {
      setFeedback(error?.message || 'Unable to save your details. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSkip = async () => {
    if (!user?.uid) return
    setFeedback('')
    setIsSaving(true)
    try {
      await saveUserProfile(user.uid, {
        onboardingStep: 'freelancer-onboarding-complete',
      })
      await refresh()
      navigate('/freelancer', { replace: true })
    } catch (error) {
      setFeedback(error?.message || 'Unable to skip onboarding. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-card__header">
          <Briefcase size={28} />
          <div>
            <h2>Your professional snapshot</h2>
            <p>Tell clients what you do best. You can always update this later.</p>
          </div>
        </div>

        {feedback && <div className="onboarding-feedback">{feedback}</div>}

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <label>
            <span>Short bio</span>
            <textarea
              name="bio"
              value={formState.bio}
              onChange={handleChange}
              rows={4}
              placeholder="Share experience, industries, and recent wins."
            />
          </label>

          <label>
            <span>Where are you based?</span>
            <select name="state" value={formState.state} onChange={handleChange} required>
              <option value="">Select a state</option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>

          <section>
            <h3>Portfolio case studies</h3>
            {(formState.featured || []).length === 0 && <p>No case studies added yet.</p>}
            {(formState.featured || []).map((p, i) => (
              <div key={i} className="case-study-card">
                <strong>{p.title || 'Untitled case study'}</strong>
                {p.description && <p>{p.description}</p>}
                {p.url && (
                  <p>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.url}
                    </a>
                  </p>
                )}
                <button type="button" className="auth-back" onClick={() => removeProject(i)}>
                  Remove
                </button>
              </div>
            ))}

            {showProjectForm ? (
              <form onSubmit={addProject} className="case-study-form">
                <label>
                  <span>Title</span>
                  <input name="title" value={projectForm.title} onChange={handleProjectFieldChange} required />
                </label>

                <label>
                  <span>Description</span>
                  <textarea name="description" value={projectForm.description} onChange={handleProjectFieldChange} rows={3} />
                </label>

                <label>
                  <span>Project URL (optional)</span>
                  <input name="url" value={projectForm.url} onChange={handleProjectFieldChange} placeholder="https://" />
                </label>

                <div className="onboarding-actions">
                  <button type="button" className="auth-back" onClick={() => setShowProjectForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="auth-submit">
                    Add case study
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="auth-submit" onClick={() => setShowProjectForm(true)}>
                Add case study
              </button>
            )}
          </section>

          <div className="onboarding-actions">
            <button type="button" className="auth-back" onClick={handleSkip} disabled={isSaving}>
              Skip for now
            </button>
            <button type="submit" className="auth-submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save & continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FreelancerOnboarding
