import { Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import stateOptions from '../data/stateOptions'
import { limitLanguagesInput, parseLanguagesInput } from '../utils/languageUtils'
import { saveUserProfile } from '../services/firestoreClient'

const clientInitial = {
  companyName: '',
  industry: '',
  hiringFocus: '',
  teamSize: '',
  preferredSkills: '',
  state: '',
  languages: '',
}

const ClientOnboarding = () => {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [formState, setFormState] = useState(clientInitial)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!user) return
    setFormState({
      companyName: user.companyName || user.displayName || '',
      industry: user.industry || '',
      hiringFocus: user.hiringFocus || '',
      teamSize: user.teamSize || '',
      preferredSkills: Array.isArray(user.preferredSkills) ? user.preferredSkills.join(', ') : user.preferredSkills || '',
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
        companyName: formState.companyName.trim(),
        industry: formState.industry.trim(),
        hiringFocus: formState.hiringFocus.trim(),
        teamSize: formState.teamSize.trim(),
        preferredSkills: formState.preferredSkills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        state: selectedState,
        location: selectedState || user?.location || '',
        languages,
        onboardingStep: 'client-onboarding-complete',
        profileComplete: 0.65,
      }
      await saveUserProfile(user.uid, payload)
      await refresh()
      navigate('/client', { replace: true })
    } catch (error) {
      setFeedback(error?.message || 'Unable to save your onboarding details. Please try again.')
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
        onboardingStep: 'client-onboarding-complete',
        profileComplete: user?.profileComplete ?? 0.4,
      })
      await refresh()
      navigate('/client', { replace: true })
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
          <Building2 size={28} />
          <div>
            <h2>Client onboarding</h2>
            <p>These details appear on gig briefs and talent searches.</p>
          </div>
        </div>

        {feedback && <div className="onboarding-feedback">{feedback}</div>}

        <form className="onboarding-form" onSubmit={handleSubmit}>
          <label>
            <span>Company / Individual name</span>
            <input
              name="companyName"
              value={formState.companyName}
              onChange={handleChange}
              required
              placeholder="SkillLink Ventures"
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
            <span>Industry</span>
            <input
              name="industry"
              value={formState.industry}
              onChange={handleChange}
              placeholder="Fintech, Entertainment, Commerce"
            />
          </label>

          <label>
            <span>What are you hiring for?</span>
            <textarea
              name="hiringFocus"
              value={formState.hiringFocus}
              onChange={handleChange}
              rows={3}
              placeholder="Tell freelancers about your immediate priorities."
            />
          </label>

          <label>
            <span>Team size (optional)</span>
            <input
              name="teamSize"
              value={formState.teamSize}
              onChange={handleChange}
              placeholder="e.g. 5-10"
            />
          </label>

          <label>
            <span>Skills you often need (comma separated)</span>
            <textarea
              name="preferredSkills"
              value={formState.preferredSkills}
              onChange={handleChange}
              rows={2}
              placeholder="Product design, Flutter, Growth marketing"
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
            <small>Comma separate languages — extras beyond three are ignored.</small>
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

export default ClientOnboarding
