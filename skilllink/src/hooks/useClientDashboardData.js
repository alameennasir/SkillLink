import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchClientDashboardData } from '../services/firestoreClient'

export const useClientDashboardData = () => {
  const { user } = useAuth()
  const [state, setState] = useState({ status: 'idle', data: null, error: null })

  const load = useCallback(async () => {
    if (!user?.uid) return
    setState((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading', error: null }))
    try {
      const data = await fetchClientDashboardData(user.uid)
      setState({ status: 'ready', data, error: null })
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', error }))
    }
  }, [user?.uid])

  useEffect(() => {
    if (user?.uid) {
      load()
    }
  }, [load, user?.uid])

  return { ...state, refresh: load }
}
