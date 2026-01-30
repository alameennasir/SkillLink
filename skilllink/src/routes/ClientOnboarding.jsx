import { Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import stateOptions from '../data/stateOptions'
import { saveUserProfile } from '../services/firestoreClient'

const clientInitial = {
  companyName: '',
  industry: '',
  state: '',
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
      state: user.state || user.location || '',
    })
  }, [user])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user?.uid) return
    setFeedback('')
    setIsSaving(true)
    try {
      const selectedState = formState.state.trim()
      const payload = {
        companyName: formState.companyName.trim(),
        industry: formState.industry.trim(),
        state: selectedState,
        location: selectedState || user?.location || '',
        onboardingStep: 'client-onboarding-complete',
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
