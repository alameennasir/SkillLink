import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Ban, CheckCircle2, Loader2, RefreshCcw, Shield } from 'lucide-react'
import { fetchAdminOverview, resolveReport } from '../services/adminService'
import useAdminBlockActions from '../hooks/useAdminBlockActions'

const AdminDashboard = () => {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reports, setReports] = useState([])
  const {
    form: blockForm,
    status: blockStatus,
    action: blockAction,
    error: blockError,
    updateField,
    blockByEmail,
    restoreByEmail,
    blockByAccountId,
    clearError: clearBlockError,
  } = useAdminBlockActions()

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
    await blockByAccountId(accountId)
  }

  const handleBlockAccount = (event) => {
    event.preventDefault()
    clearBlockError()
    blockByEmail()
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
          <p>Respond to scam alerts directly from the console using email lookups.</p>

          <form className="admin-block-form" onSubmit={handleBlockAccount}>
            <label>
              <span>Account email</span>
              <input
                name="email"
                type="email"
                placeholder="talent@example.com"
                value={blockForm.email}
                onChange={(event) => updateField('email', event.target.value)}
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
                onChange={(event) => updateField('reason', event.target.value)}
              />
            </label>
            {blockError && <p className="admin-panel-error" style={{ padding: '0.65rem 0.85rem' }}>{blockError}</p>}
            <div className="admin-block-actions">
              <button type="submit" className="admin-danger" disabled={blockStatus === 'pending'}>
                {blockStatus === 'pending' && blockAction !== 'restore' ? 'Processing…' : 'Block account'}
              </button>
              <button
                type="button"
                className="admin-secondary"
                disabled={!blockForm.email || blockStatus === 'pending'}
                onClick={() => {
                  clearBlockError()
                  restoreByEmail()
                }}
              >
                {blockStatus === 'pending' && blockAction === 'restore' ? 'Restoring…' : 'Restore access'}
              </button>
            </div>
          </form>
        </article>
      </section>
    </div>
  )
}

export default AdminDashboard
