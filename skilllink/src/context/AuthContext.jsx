import { onAuthStateChanged } from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchUserProfile } from '../services/firestoreClient'
import { getFirebaseAuth, isFirebaseConfigured, requireFirebaseConfig } from '../services/firebaseClient'
import { loginWithEmail, logoutCurrentUser, registerAccount } from '../services/authService'

const AuthContext = createContext(null)
const missingFirebaseConfigError = new Error(
  'Firebase configuration is missing. Provide all VITE_FIREBASE_* values in .env.local to use SkillLink.',
)

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({ status: 'loading', user: null, error: null })

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setState({ status: 'error', user: null, error: missingFirebaseConfigError })
      return
    }

    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    const auth = getFirebaseAuth()
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          setState({ status: 'ready', user: null, error: null })
          return
        }
        try {
          const profile = await fetchUserProfile(firebaseUser.uid)
          setState({
            status: 'ready',
            user: mapUser(firebaseUser, profile),
            error: null,
          })
        } catch (error) {
          setState({ status: 'error', user: null, error })
        }
      },
      (error) => setState({ status: 'error', user: null, error }),
    )

    return () => unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    requireFirebaseConfig()
    if (!state.user?.uid) {
      return
    }

    setState((prev) => ({ ...prev, status: 'refreshing', error: null }))
    try {
      const profile = await fetchUserProfile(state.user.uid)
      setState((prev) => ({
        status: 'ready',
        user: { ...prev.user, ...profile },
        error: null,
      }))
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', error }))
    }
  }, [state.user])

  const login = useCallback(
    async (email, password) => {
      requireFirebaseConfig()
      setState((prev) => ({ ...prev, status: 'loading', error: null }))
      try {
        const authUser = await loginWithEmail(email, password)
        const profile = await fetchUserProfile(authUser.uid)
        return mapUser(authUser, profile)
      } catch (error) {
        setState((prev) => ({ ...prev, status: 'error', error }))
        throw error
      }
    },
    [],
  )

  const registerAccountHandler = useCallback(async (payload) => {
    requireFirebaseConfig()
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const newUser = await registerAccount(payload)
      return newUser
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', error }))
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    requireFirebaseConfig()
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      await logoutCurrentUser()
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', error }))
      throw error
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ ...state, refresh, login, logout, registerAccount: registerAccountHandler }}
    >
      {children}
    </AuthContext.Provider>
  )
}

const mapUser = (firebaseUser, profile) => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: profile?.displayName || firebaseUser.displayName || firebaseUser.email || 'Client',
  role: profile?.role || 'client',
  accountTier: profile?.accountTier || 'Pending',
  ...profile,
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    // During HMR or transient renders consumers may attempt to call `useAuth`
    // before the provider is reattached. Log a warning and return a safe
    // fallback so components don't crash; ProtectedRoute will treat this as
    // a loading state.
    // eslint-disable-next-line no-console
    console.warn('useAuth called without AuthProvider; returning fallback auth state')
    return { status: 'loading', user: null, error: new Error('AuthProvider missing') }
  }
  return context
}
