import { ArrowLeft, Briefcase, Layers3, Lock, Mail, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const accountInitial = {
  email: '',
  password: '',
  confirmPassword: '',
}

const clientInitial = {
  companyName: '',
  entityType: 'company',
  industry: '',
}

const freelancerInitial = {
  fullName: '',
  title: '',
  skills: '',
  experienceLevel: 'intermediate',
}

const AuthRegister = () => {
  const navigate = useNavigate()
  const { registerAccount, status, user } = useAuth()
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('freelancer')
  const [accountData, setAccountData] = useState(accountInitial)
  const [clientData, setClientData] = useState(clientInitial)
  const [freelancerData, setFreelancerData] = useState(freelancerInitial)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'ready' && user) {
      const destination = user.role === 'freelancer' ? '/freelancer' : '/client'
      navigate(destination, { replace: true })
    }
  }, [navigate, status, user])

  const handleAccountChange = (event) => {
    const { name, value } = event.target
    setAccountData((prev) => ({ ...prev, [name]: value }))
  }

  const handleClientChange = (event) => {
    const { name, value } = event.target
    setClientData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFreelancerChange = (event) => {
    const { name, value } = event.target
    setFreelancerData((prev) => ({ ...prev, [name]: value }))
  }

  const handleAccountSubmit = (event) => {
    event.preventDefault()
    setFormError('')

    if (accountData.password !== accountData.confirmPassword) {
      setFormError('Passwords must match before continuing.')
      return
    }

    if (accountData.password.length < 6) {
      setFormError('Use at least 6 characters for your password.')
      return
    }

    setStep(2)
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    setFormError('')

    if (role === 'client' && !clientData.companyName.trim()) {
      setFormError('Add your company or individual name to continue.')
      return
    }

    if (role === 'freelancer' && !freelancerData.fullName.trim()) {
      setFormError('Share your full name to set up your profile.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        email: accountData.email,
        password: accountData.password,
        role,
        accountDetails: role === 'client' ? clientData : freelancerData,
      }
      const newUser = await registerAccount(payload)
      const onboardingPath = role === 'client' ? '/onboarding/client' : '/onboarding/freelancer'
      navigate(onboardingPath, {
        replace: true,
        state: { newUserId: newUser?.uid },
      })
    } catch (error) {
      const friendlyMessage = error?.message || 'We could not create your account. Please try again.'
      setFormError(friendlyMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__header">
          <div className="auth-steps">
            <div className={`auth-step ${step === 1 ? 'auth-step-active' : ''}`}>
              <span>1</span>
              <p>Account</p>
            </div>
            <div className={`auth-step ${step === 2 ? 'auth-step-active' : ''}`}>
              <span>2</span>
              <p>Role & details</p>
            </div>
          </div>
          <h1>Create your SkillLink access</h1>
          <p>Start with your login credentials, then choose how you want to use SkillLink.</p>
        </div>

        {formError && <div className="auth-alert">{formError}</div>}

        {step === 1 ? (
          <form className="auth-form" onSubmit={handleAccountSubmit}>
            <label>
              <span>Email address</span>
              <div className="auth-input">
                <Mail size={18} />
                <input
                  type="email"
                  name="email"
                  placeholder="you@skilllink.africa"
                  value={accountData.email}
                  onChange={handleAccountChange}
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
                  placeholder="Minimum 6 characters"
                  value={accountData.password}
                  onChange={handleAccountChange}
                  required
                  autoComplete="new-password"
                />
              </div>
            </label>

            <label>
              <span>Confirm password</span>
              <div className="auth-input">
                <Lock size={18} />
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Retype password"
                  value={accountData.confirmPassword}
                  onChange={handleAccountChange}
                  required
                  autoComplete="new-password"
                />
              </div>
            </label>

            <button className="auth-submit" type="submit">
              Continue to role selection
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            <fieldset className="auth-role-fieldset">
              <legend>I want to join as</legend>
              <div className="auth-role-options">
                <label className={`auth-role-card ${role === 'freelancer' ? 'auth-role-card-active' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="freelancer"
                    checked={role === 'freelancer'}
                    onChange={() => setRole('freelancer')}
                  />
                  <div>
                    <Layers3 size={20} />
                    <strong>Freelancer</strong>
                    <p>Showcase skills, apply to briefs, and keep your pipeline organised.</p>
                  </div>
                </label>

                <label className={`auth-role-card ${role === 'client' ? 'auth-role-card-active' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="client"
                    checked={role === 'client'}
                    onChange={() => setRole('client')}
                  />
                  <div>
                    <Users size={20} />
                    <strong>Client</strong>
                    <p>Hire talent, manage gigs, and collaborate with vetted freelancers.</p>
                  </div>
                </label>
              </div>
            </fieldset>

            {role === 'client' ? (
              <>
                <label>
                  <span>Company / Individual name</span>
                  <div className="auth-input">
                    <Users size={18} />
                    <input
                      name="companyName"
                      placeholder="SkillLink Labs"
                      value={clientData.companyName}
                      onChange={handleClientChange}
                      required
                    />
                  </div>
                </label>

                <label>
                  <span>Entity type</span>
                  <select
                    className="auth-field-control"
                    name="entityType"
                    value={clientData.entityType}
                    onChange={handleClientChange}
                  >
                    <option value="company">Company</option>
                    <option value="individual">Individual</option>
                    <option value="agency">Agency</option>
                  </select>
                </label>

                <label>
                  <span>Industry (optional)</span>
                  <input
                    className="auth-field-control"
                    name="industry"
                    placeholder="Fintech, Media, Ecommerce"
                    value={clientData.industry}
                    onChange={handleClientChange}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>Full name</span>
                  <div className="auth-input">
                    <Users size={18} />
                    <input
                      name="fullName"
                      placeholder="Chioma Ajayi"
                      value={freelancerData.fullName}
                      onChange={handleFreelancerChange}
                      required
                    />
                  </div>
                </label>

                <label>
                  <span>Title</span>
                  <div className="auth-input">
                    <Briefcase size={18} />
                    <input
                      name="title"
                      placeholder="Product Designer"
                      value={freelancerData.title}
                      onChange={handleFreelancerChange}
                      required
                    />
                  </div>
                </label>

                <label>
                  <span>Skills</span>
                  <textarea
                    className="auth-textarea"
                    name="skills"
                    placeholder="Brand design, Pitch decks, Adobe CC"
                    value={freelancerData.skills}
                    onChange={handleFreelancerChange}
                    rows={3}
                  />
                </label>

                <label>
                  <span>Experience level</span>
                  <select
                    className="auth-field-control"
                    name="experienceLevel"
                    value={freelancerData.experienceLevel}
                    onChange={handleFreelancerChange}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="professional">Professional</option>
                  </select>
                </label>
              </>
            )}

            <div className="auth-actions">
              <button type="button" className="auth-back" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating workspace…' : 'Create my workspace'}
              </button>
            </div>
          </form>
        )}

        <div className="auth-card__footer">
          <p>
            Already registered? <Link to="/auth/login">Sign in here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default AuthRegister
