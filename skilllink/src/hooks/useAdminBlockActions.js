import { useState } from 'react'
import { blockAccount, liftBlock } from '../services/adminService'

const initialForm = { email: '', reason: '' }

const normalizeEmail = (value) => value?.trim().toLowerCase() || ''

export const useAdminBlockActions = () => {
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState('idle')
  const [action, setAction] = useState(null)
  const [error, setError] = useState('')

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const blockByEmail = async () => {
    const email = normalizeEmail(form.email)
    if (!email) {
      setError('Enter an email before taking action.')
      return
    }
    setAction('block')
    setStatus('pending')
    setError('')
    try {
      await blockAccount({ email, reason: form.reason })
      setForm(initialForm)
    } catch (err) {
      setError(err?.message || 'Unable to block account right now.')
    } finally {
      setStatus('idle')
      setAction(null)
    }
  }

  const restoreByEmail = async () => {
    const email = normalizeEmail(form.email)
    if (!email) {
      setError('Enter an email before restoring access.')
      return
    }
    setAction('restore')
    setStatus('pending')
    setError('')
    try {
      await liftBlock({ email })
      setForm((prev) => ({ ...prev, reason: '' }))
    } catch (err) {
      setError(err?.message || 'Unable to restore account.')
    } finally {
      setStatus('idle')
      setAction(null)
    }
  }

  const blockByAccountId = async (accountId) => {
    const id = accountId?.trim()
    if (!id) {
      setError('Missing account identifier to block.')
      return
    }
    setAction('report-block')
    setStatus('pending')
    setError('')
    try {
      await blockAccount({ accountId: id, reason: 'Flagged via admin queue' })
    } catch (err) {
      setError(err?.message || 'Unable to block reported account.')
    } finally {
      setStatus('idle')
      setAction(null)
    }
  }

  return {
    form,
    status,
    action,
    error,
    updateField,
    blockByEmail,
    restoreByEmail,
    blockByAccountId,
    clearError: () => setError(''),
  }
}

export default useAdminBlockActions
