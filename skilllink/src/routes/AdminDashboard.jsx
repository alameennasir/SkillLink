import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Ban, CheckCircle2, Loader2, RefreshCcw, Shield, Users } from 'lucide-react'
import { blockAccount, fetchAdminOverview, liftBlock, resolveReport } from '../services/adminService'

const AdminDashboard = () => {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reports, setReports] = useState([])
  const [activity, setActivity] = useState([])
  const [blockForm, setBlockForm] = useState({ accountId: '', reason: '' })
  const [blockStatus, setBlockStatus] = useState('idle')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchAdminOverview()
        if (!mounted) return
        setOverview(data.metrics)
        setReports(data.reports)
        setActivity(data.activity)
      } catch (err) {
        if (!mounted) return
        setError(err?.message || 'Unable to load admin data.')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const criticalReports = useMemo(() => reports.filter((report) => report.status !== 'resolved'), [reports])

  const handleReopenReport = (reportId) => {
    setReports((prev) => prev.map((item) => (item.id === reportId ? { ...item, status: 'open' } : item)))
  }

  const handleResolve = async (reportId) => {
    try {
      await resolveReport(reportId)
      setReports((prev) => prev.map((item) => (item.id === reportId ? { ...item, status: 'resolved' } : item)))
    } catch (err) {
      setError(err?.message || 'Could not resolve report.')
    }
  }

  const handleBlockReporter = async (accountId) => {
    if (!accountId) return
    setError('')
    try {
      await blockAccount({ accountId, reason: 'Flagged via admin queue' })
    } catch (err) {
      setError(err?.message || 'Unable to block reported account.')
    }
  }

  const handleBlockAccount = async (event) => {
    event.preventDefault()
    if (!blockForm.accountId.trim()) {
      setError('Enter an account ID before taking action.')
      return
    }
    setBlockStatus('pending')
    setError('')
    try {
      await blockAccount({ accountId: blockForm.accountId.trim(), reason: blockForm.reason })
      setBlockForm({ accountId: '', reason: '' })
    } catch (err) {
      setError(err?.message || 'Unable to block account right now.')
    } finally {
      setBlockStatus('idle')
    }
  }

  const handleLiftBlock = async (accountId) => {
    setBlockStatus('pending')
    setError('')
    try {
      await liftBlock(accountId)
    } catch (err) {
      setError(err?.message || 'Unable to restore account.')
    } finally {
      setBlockStatus('idle')
    }
  }

  return (
    <div className="admin-dashboard">
      <section className="admin-section">
        {loading ? (
          <div className="admin-panel admin-panel-centered">
            <Loader2 className="icon-spin" size={28} aria-hidden="true" />
            <p>Loading security metrics…</p>
          </div>
        ) : error ? (
          <div className="admin-panel admin-panel-error">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{error}</p>
            <button type="button" className="admin-tertiary" onClick={() => window.location.reload()}>
              <RefreshCcw size={16} aria-hidden="true" /> Retry
            </button>
          </div>
        ) : (
          <div className="admin-grid">
            {overview?.map((card) => (
              <article key={card.label} className="admin-panel">
                <p className="admin-panel-label">{card.label}</p>
                <h2>{card.value}</h2>
                <span className="admin-panel-meta">{card.trend}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h3>Incoming reports</h3>
            <p>Triaged alerts waiting for a final action.</p>
          </div>
          <span className="admin-chip">
            <Shield size={16} aria-hidden="true" /> {criticalReports.length} open
          </span>
        </div>

        {reports.length === 0 ? (
          <div className="admin-panel admin-panel-centered">
            <CheckCircle2 size={18} aria-hidden="true" />
            <p>Nothing waiting in the queue.</p>
          </div>
        ) : (
          <div className="admin-table">
            <div className="admin-table-head">
              <span>Subject</span>
              <span>Type</span>
              <span>Reporter</span>
              <span>Opened</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {reports.map((report) => (
              <div key={report.id} className="admin-table-row">
                <span>{report.subject}</span>
                <span>{report.type}</span>
                <span>{report.reporter}</span>
                <span>{new Date(report.openedAt).toLocaleString()}</span>
                <span className={`admin-status admin-status-${report.status}`}>
                  {report.status}
                </span>
                <div className="admin-table-actions">
                  {report.status !== 'resolved' ? (
                    <button type="button" className="admin-secondary" onClick={() => handleResolve(report.id)}>
                      <CheckCircle2 size={14} aria-hidden="true" /> Resolve
                    </button>
                  ) : (
                    <button type="button" className="admin-tertiary" onClick={() => handleReopenReport(report.id)}>
                      <RefreshCcw size={14} aria-hidden="true" /> Reopen
                    </button>
                  )}
                  <button type="button" className="admin-danger" onClick={() => handleBlockReporter(report.reporter)}>
                    <Ban size={14} aria-hidden="true" /> Block
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section admin-two-column">
        <article className="admin-panel">
          <h3>Block or restore accounts</h3>
          <p>Respond to scam alerts directly from the console.</p>

          <form className="admin-block-form" onSubmit={handleBlockAccount}>
            <label>
              <span>Account ID</span>
              <input
                name="accountId"
                placeholder="freelancer_446"
                value={blockForm.accountId}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, accountId: event.target.value }))}
                required
              />
            </label>
            <label>
              <span>Reason</span>
              <textarea
                rows={3}
                name="reason"
                placeholder="Explain why this account is being blocked."
                value={blockForm.reason}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, reason: event.target.value }))}
              />
            </label>
            <div className="admin-block-actions">
              <button type="submit" className="admin-danger" disabled={blockStatus === 'pending'}>
                {blockStatus === 'pending' ? 'Processing…' : 'Block account'}
              </button>
              <button
                type="button"
                className="admin-secondary"
                disabled={!blockForm.accountId || blockStatus === 'pending'}
                onClick={() => handleLiftBlock(blockForm.accountId)}
              >
                Restore access
              </button>
            </div>
          </form>
        </article>

        <article className="admin-panel">
          <div className="admin-section-header">
            <div>
              <h3>Live activity feed</h3>
              <p>Continuous signal from abuse automation.</p>
            </div>
            <Users size={16} aria-hidden="true" />
          </div>
          {activity.length === 0 ? (
            <div className="admin-empty">Automation feed is quiet.</div>
          ) : (
            <ul className="admin-activity">
              {activity.map((event) => (
                <li key={event.id}>
                  <p>{event.message}</p>
                  <small>{event.timestamp}</small>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  )
}

export default AdminDashboard
