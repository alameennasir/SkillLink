import { Lock, Mail, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const AuthLogin = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, status, user } = useAuth()
  const [formState, setFormState] = useState({ email: '', password: '' })
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'ready' && user) {
      const destination = resolveDestination(user)
      navigate(destination, { replace: true })
    }
  }, [navigate, status, user])

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const resolveDestination = (authUser) => {
    if (needsOnboarding(authUser)) {
      return authUser?.role === 'client' ? '/onboarding/client' : '/onboarding/freelancer'
    }
    if (authUser?.role === 'admin') {
      return '/admin'
    }
    if (location.state?.from) {
      return location.state.from
    }
    if (authUser?.role === 'freelancer') {
      return '/freelancer'
    }
    return '/client'
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    setIsSubmitting(true)

    try {
      const authUser = await login(formState.email, formState.password)
      const destination = resolveDestination(authUser)
      navigate(destination, { replace: true })
    } catch (error) {
      const friendlyMessage = error?.message || 'Unable to sign in. Please try again.'
      setFormError(friendlyMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__header">
          <h1>Welcome back</h1>
          <p>Sign in as Client or Freelancer.</p>
        </div>

        {formError && <div className="auth-alert">{formError}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email address</span>
            <div className="auth-input">
              <Mail size={18} />
              <input
                type="email"
                name="email"
                placeholder="you@skilllink.africa"
                value={formState.email}
                onChange={handleChange}
                required
                autoComplete="email"
              />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div className="auth-input">
              <Lock size={18} />
              <input
                type="password"
                name="password"
                placeholder="Enter your password"
                value={formState.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
              />
            </div>
          </label>

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Access workspace'}
          </button>
        </form>

        <div className="auth-card__footer">
          <p>
            Need an account? <Link to="/auth/register">Create your SkillLink account</Link>
          </p>
          {/* <p className="auth-footnote">
            Admin team? <Link to="/auth/admin/register">Request admin access</Link> or sign in here to jump to /admin.
          </p> */}
        </div>
      </div>
    </div>
  )
}

export default AuthLogin

const needsOnboarding = (profile) => {
  if (!profile?.onboardingStep) return false
  if (profile.role === 'client') {
    return profile.onboardingStep.startsWith('client-') && !profile.onboardingStep.includes('complete')
  }
  if (profile.role === 'freelancer') {
    return profile.onboardingStep.startsWith('freelancer-') && !profile.onboardingStep.includes('complete')
  }
  return false
}
