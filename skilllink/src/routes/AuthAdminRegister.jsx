import { Building, KeyRound, Lock, Mail, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const defaultState = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  adminDepartment: '',
  adminTitle: '',
  phone: '',
  inviteCode: '',
}

const fallbackInvite = 'SKILLLINK-ADMIN-ACCESS'

const AuthAdminRegister = () => {
  const navigate = useNavigate()
  const { registerAccount, status, user } = useAuth()
  const [formState, setFormState] = useState(defaultState)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (status !== 'ready' || !user) return
    const destination = user.role === 'admin' ? '/admin' : user.role === 'freelancer' ? '/freelancer' : '/client'
    navigate(destination, { replace: true })
  }, [navigate, status, user])

  const expectedInvite = import.meta.env.VITE_ADMIN_INVITE_CODE || fallbackInvite

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (formState.password.length < 10) {
      setError('Use at least 10 characters for admin passwords.')
      return
    }

    if (formState.password !== formState.confirmPassword) {
      setError('Passwords must match to continue.')
      return
    }

    if (formState.inviteCode.trim() !== expectedInvite) {
      setError('Invite code is invalid. Ask the SkillLink security lead to renew your code.')
      return
    }

    setIsSubmitting(true)
    try {
      await registerAccount({
        email: formState.email,
        password: formState.password,
        role: 'admin',
        accountDetails: {
          fullName: formState.fullName,
          adminDepartment: formState.adminDepartment,
          adminTitle: formState.adminTitle,
          phone: formState.phone,
        },
      })
      navigate('/admin', { replace: true })
    } catch (err) {
      const friendly = err?.message || 'Unable to provision admin access just yet.'
      setError(friendly)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__header">
          <div className="auth-badge auth-badge-critical">
            <Shield size={18} aria-hidden="true" />
            <span>Admin enrollment</span>
          </div>
          <h1>Verify leadership invite</h1>
          <p>Admins monitor reports, block scams, and guard payouts. Double-check each detail.</p>
        </div>

        {error && <div className="auth-alert">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Full name</span>
            <div className="auth-input">
              <Building size={18} aria-hidden="true" />
              <input
                name="fullName"
                placeholder="Regina Okafor"
                value={formState.fullName}
                onChange={handleChange}
                required
              />
            </div>
          </label>

          <label>
            <span>Work email</span>
            <div className="auth-input">
              <Mail size={18} aria-hidden="true" />
              <input
                type="email"
                name="email"
                placeholder="regina@skilllink.africa"
                value={formState.email}
                onChange={handleChange}
                required
              />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div className="auth-input">
              <Lock size={18} aria-hidden="true" />
              <input
                type="password"
                name="password"
                placeholder="Minimum 10 characters"
                value={formState.password}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
            </div>
          </label>

          <label>
            <span>Confirm password</span>
            <div className="auth-input">
              <Lock size={18} aria-hidden="true" />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Retype password"
                value={formState.confirmPassword}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
            </div>
          </label>

          <div className="auth-grid">
            <label>
              <span>Department</span>
              <input
                name="adminDepartment"
                placeholder="Trust & Safety"
                value={formState.adminDepartment}
                onChange={handleChange}
              />
            </label>
            <label>
              <span>Title</span>
              <input
                name="adminTitle"
                placeholder="Lead Investigator"
                value={formState.adminTitle}
                onChange={handleChange}
              />
            </label>
          </div>

          <label>
            <span>Phone (optional)</span>
            <input
              type="tel"
              name="phone"
              placeholder="+234 800 000 0000"
              value={formState.phone}
              onChange={handleChange}
            />
          </label>

          <label>
            <span>Invite code</span>
            <div className="auth-input">
              <KeyRound size={18} aria-hidden="true" />
              <input
                name="inviteCode"
                placeholder="Provided in leadership email"
                value={formState.inviteCode}
                onChange={handleChange}
                required
              />
            </div>
          </label>

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating admin seat…' : 'Activate admin access'}
          </button>
        </form>

        <div className="auth-card__footer">
          <p>
            Already have credentials? <Link to="/auth/login">Head to the login page</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AuthAdminRegister
