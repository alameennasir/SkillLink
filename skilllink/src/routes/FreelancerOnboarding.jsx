import { Briefcase } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import stateOptions from '../data/stateOptions'
import { limitLanguagesInput, parseLanguagesInput } from '../utils/languageUtils'
import { saveUserProfile } from '../services/firestoreClient'

const freelancerInitial = {
  bio: '',
  skills: '',
  experienceLevel: 'intermediate',
  portfolioUrl: '',
  hourlyRate: '',
  state: '',
  languages: '',
}

const FreelancerOnboarding = () => {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [formState, setFormState] = useState(freelancerInitial)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!user) return
    setFormState({
      bio: user.bio || '',
      skills: Array.isArray(user.skills) ? user.skills.join(', ') : user.skills || '',
      experienceLevel: user.experienceLevel || 'intermediate',
      portfolioUrl: user.portfolioUrl || '',
      hourlyRate: user.hourlyRate || '',
      state: user.state || user.location || '',
      languages: Array.isArray(user.languages) ? user.languages.join(', ') : user.languages || '',
    })
  }, [user])

  const handleChange = (event) => {
    const { name, value } = event.target
    if (name === 'languages') {
      const limited = limitLanguagesInput(value)
      setFormState((prev) => ({ ...prev, languages: limited }))
      return
    }
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user?.uid) return
    setFeedback('')
    setIsSaving(true)
    try {
      const languages = parseLanguagesInput(formState.languages)
      const selectedState = formState.state.trim()
      const payload = {
        bio: formState.bio.trim(),
        skills: formState.skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        experienceLevel: formState.experienceLevel,
        portfolioUrl: formState.portfolioUrl.trim(),
        hourlyRate: formState.hourlyRate ? Number(formState.hourlyRate) : null,
        state: selectedState,
        location: selectedState || user?.location || '',
        languages,
        onboardingStep: 'freelancer-onboarding-complete',
        profileComplete: 0.7,
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
        profileComplete: user?.profileComplete ?? 0.4,
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

          <label>
            <span>Top skills (comma separated)</span>
            <textarea
              name="skills"
              value={formState.skills}
              onChange={handleChange}
              rows={3}
              placeholder="Brand design, Copywriting, Motion graphics"
            />
          </label>

          <label>
            <span>Languages spoken (max 3)</span>
            <input
              name="languages"
              value={formState.languages}
              onChange={handleChange}
              placeholder="English, Yoruba, Hausa"
            />
            <small>Share up to three languages — extra entries are ignored.</small>
          </label>

          <label>
            <span>Experience level</span>
            <select name="experienceLevel" value={formState.experienceLevel} onChange={handleChange}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
            </select>
          </label>

          <label>
            <span>Portfolio or website</span>
            <input
              name="portfolioUrl"
              value={formState.portfolioUrl}
              onChange={handleChange}
              placeholder="https://"
            />
          </label>

          <label>
            <span>Hourly rate (optional)</span>
            <input
              type="number"
              min="0"
              step="1"
              name="hourlyRate"
              value={formState.hourlyRate}
              onChange={handleChange}
              placeholder="15000"
            />
          </label>

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
