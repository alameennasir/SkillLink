import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ allowRoles, children }) => {
  const { status, user, error } = useAuth()
  const location = useLocation()

  if (status === 'loading' || status === 'refreshing') {
    return <div className="protected-state">Verifying workspace access…</div>
  }

  if (error) {
    return (
      <div className="protected-state protected-state-error">
        <p>We could not verify your session. Please reload or check Firebase auth.</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname + location.search }} />
  }

  if (allowRoles?.length && !allowRoles.includes(user.role)) {
    const fallback = user.role === 'freelancer' ? '/freelancer' : user.role === 'admin' ? '/admin' : '/client'
    return <Navigate to={fallback} replace />
  }

  if (needsOnboarding(user) && !location.pathname.startsWith('/onboarding')) {
    const onboardingPath = user.role === 'client' ? '/onboarding/client' : '/onboarding/freelancer'
    return <Navigate to={onboardingPath} replace />
  }

  return children
}

export default ProtectedRoute

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
