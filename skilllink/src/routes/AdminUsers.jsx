import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchVerificationRequests, updateUserVerificationStatus } from '../services/firestoreClient'

const AdminUsers = () => {
  const { user: adminUser } = useAuth()
  const [verificationQueue, setVerificationQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState('')
  const [queueProcessing, setQueueProcessing] = useState(null)

  useEffect(() => {
    let mounted = true
    const loadQueue = async () => {
      setQueueLoading(true)
      setQueueError('')
      try {
        const pending = await fetchVerificationRequests({ statuses: ['pending'], limit: 100 })
        if (!mounted) return
        setVerificationQueue(Array.isArray(pending) ? pending : [])
      } catch (err) {
        if (!mounted) return
        setQueueError(err?.message || 'Unable to load verification requests.')
      } finally {
        if (mounted) setQueueLoading(false)
      }
    }
    loadQueue()
    return () => {
      mounted = false
    }
  }, [])

  const formatRequestedAt = (value) => {
    if (!value) return '—'
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric' })
  }

  const handleVerificationDecision = async (recordId, nextStatus) => {
    if (!recordId || !nextStatus) return
    setQueueProcessing(`${recordId}-${nextStatus}`)
    setQueueError('')
    try {
      await updateUserVerificationStatus({
        userId: recordId,
        status: nextStatus,
        reviewerId: adminUser?.uid,
      })
      setVerificationQueue((prev) => prev.filter((record) => record.id !== recordId))
    } catch (err) {
      setQueueError(err?.message || 'Unable to update verification status.')
    } finally {
      setQueueProcessing(null)
    }
  }

  const handleRefreshQueue = async () => {
    setQueueLoading(true)
    setQueueError('')
    try {
      const pending = await fetchVerificationRequests({ statuses: ['pending'], limit: 100 })
      setVerificationQueue(Array.isArray(pending) ? pending : [])
    } catch (err) {
      setQueueError(err?.message || 'Unable to refresh verification requests.')
    } finally {
      setQueueLoading(false)
    }
  }

  return (
    <div className="admin-users">
      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h3>Verification requests</h3>
            <p>Approve or reject pending verification badge submissions.</p>
          </div>
          <div className="admin-table-actions">
            <button
              type="button"
              className="admin-secondary"
              onClick={handleRefreshQueue}
              disabled={queueLoading}
            >
              {queueLoading ? 'Refreshing…' : 'Refresh'}
            </button>
            <ShieldCheck size={16} aria-hidden="true" />
          </div>
        </div>

        {queueLoading ? (
          <div className="admin-panel admin-panel-centered">
            <Loader2 className="icon-spin" size={24} aria-hidden="true" />
            <p>Checking verification queue…</p>
          </div>
        ) : queueError ? (
          <div className="admin-panel admin-panel-error">
            <p>{queueError}</p>
          </div>
        ) : verificationQueue.length === 0 ? (
          <div className="admin-panel admin-panel-centered">
            <p>No pending verification requests.</p>
          </div>
        ) : (
          <div className="admin-table admin-verification-table">
            <div className="admin-table-head">
              <span>User</span>
              <span>Role</span>
              <span>NIN</span>
              <span>Requested</span>
              <span>Actions</span>
            </div>
            {verificationQueue.map((record) => {
              const approveKey = `${record.id}-verified`
              const rejectKey = `${record.id}-rejected`
              return (
                <div key={record.id} className="admin-table-row">
                  <div className="admin-verification-user">
                    <strong>{record.displayName || record.companyName || record.fullName || record.email || record.id}</strong>
                    <small>{record.email || 'Email pending'}</small>
                  </div>
                  <span>{record.role || '—'}</span>
                  <span>{record.nin || '—'}</span>
                  <span>{formatRequestedAt(record.verificationRequestedAt)}</span>
                  <div className="admin-table-actions">
                    <button
                      type="button"
                      className="admin-success"
                      disabled={queueProcessing === approveKey}
                      onClick={() => handleVerificationDecision(record.id, 'verified')}
                    >
                      {queueProcessing === approveKey ? 'Verifying…' : 'Verify'}
                    </button>
                    <button
                      type="button"
                      className="admin-danger"
                      disabled={queueProcessing === rejectKey}
                      onClick={() => handleVerificationDecision(record.id, 'rejected')}
                    >
                      {queueProcessing === rejectKey ? 'Rejecting…' : 'Reject'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default AdminUsers
