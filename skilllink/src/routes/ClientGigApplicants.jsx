import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Loader2, Users } from 'lucide-react'
import { fetchGigById, subscribeToGigApplications } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'
import {
  formatApplicantRelative,
  formatApplicantStatus,
  resolveApplicantId,
  resolveApplicantTone,
} from './clientApplicantHelpers'

const ClientGigApplicants = () => {
  const { gigId } = useParams()
  const navigate = useNavigate()
  const [gig, setGig] = useState(null)
  const [gigStatus, setGigStatus] = useState('loading')
  const [gigError, setGigError] = useState(null)
  const [applicantsState, setApplicantsState] = useState({ status: 'idle', records: [], error: null })

  useEffect(() => {
    if (!gigId) return

    if (!isFirebaseConfigured) {
      setGigStatus('error')
      setGigError(new Error('Add Firebase (.env VITE_FIREBASE_*) to load your gig applicants.'))
      setGig(null)
      return
    }

    let isMounted = true
    setGigStatus('loading')
    setGigError(null)

    fetchGigById(gigId)
      .then((payload) => {
        if (!isMounted) return
        if (!payload) {
          throw new Error('We could not find this gig. It may have been removed.')
        }
        setGig(payload)
        setGigStatus('ready')
      })
      .catch((error) => {
        if (!isMounted) return
        setGigStatus('error')
        setGigError(error)
      })

    return () => {
      isMounted = false
    }
  }, [gigId])

  useEffect(() => {
    if (!gigId) return () => {}

    if (!isFirebaseConfigured) {
      setApplicantsState({
        status: 'error',
        records: [],
        error: new Error('Add Firebase (.env VITE_FIREBASE_*) to sync applicants.'),
      })
      return () => {}
    }

    setApplicantsState({ status: 'loading', records: [], error: null })
    const unsubscribe = subscribeToGigApplications(
      gigId,
      (records) => {
        setApplicantsState({ status: 'ready', records, error: null })
      },
      {
        onError: (error) => {
          setApplicantsState({ status: 'error', records: [], error })
        },
      },
    )

    return () => {
      unsubscribe?.()
    }
  }, [gigId])

  const applicantSummary = useMemo(() => {
    const base = {
      under_review: 0,
      interview: 0,
      hired: 0,
    }

    applicantsState.records.forEach((record) => {
      const normalized = record?.status?.toLowerCase?.() || 'under_review'
      if (base[normalized] !== undefined) {
        base[normalized] += 1
      }
    })

    return [
      { id: 'under_review', label: 'Under review', value: base.under_review },
      { id: 'interview', label: 'Interviews', value: base.interview },
      { id: 'hired', label: 'Hired', value: base.hired },
    ]
  }, [applicantsState.records])

  const applicantListStatus = applicantsState.status
  const totalApplicants = applicantsState.records.length

  return (
    <div className="client-page applicants-page">
      <button type="button" className="ghost-button" onClick={() => navigate('/client/manage-gigs')}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to gigs
      </button>

      <header className="applicants-page-hero">
        <div>
          <p className="eyebrow">{gig?.title || 'Gig applicants'}</p>
          <h1>Applicant list</h1>
          <span>Browse every proposal tied to this posting and jump into a dedicated overview page.</span>
        </div>
        <div className="applicants-page-summary">
          {applicantSummary.map((item) => (
            <div key={item.id} className="applicants-summary-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </header>

      {gigStatus === 'error' && gigError && (
        <div className="gig-applicants-alert is-negative" role="alert">
          {gigError.message}
        </div>
      )}

      <div className="gig-applicants-body gig-applicants-standalone">
        <section className="gig-applicants-list" aria-label="Applicants list">
          <div className="gig-applicants-list-header">
            <strong>
              {totalApplicants} applicant{totalApplicants === 1 ? '' : 's'}
            </strong>
            <span>
              {applicantListStatus === 'ready'
                ? 'Newest proposals up top'
                : applicantListStatus === 'loading'
                  ? 'Syncing with Firebase'
                  : applicantListStatus === 'error'
                    ? 'Unable to sync'
                    : '—'}
            </span>
          </div>

          {applicantListStatus === 'loading' ? (
            <div className="gig-applicants-placeholder">
              <Loader2 size={22} className="icon-spin" aria-hidden="true" />
              <p>Fetching proposals…</p>
            </div>
          ) : applicantListStatus === 'error' ? (
            <div className="gig-applicants-placeholder">
              <p>{applicantsState.error?.message || 'Unable to load applicants.'}</p>
            </div>
          ) : totalApplicants === 0 ? (
            <div className="gig-applicants-placeholder">
              <Users size={22} aria-hidden="true" />
              <p>No applicants yet</p>
              <span>This view updates the moment a freelancer applies.</span>
            </div>
          ) : (
            <div className="gig-applicants-table-wrapper">
              <table className="gig-applicants-table" aria-label="Gig applicants">
                <thead>
                  <tr>
                    <th scope="col">Applicant</th>
                    <th scope="col">Skills</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {applicantsState.records.map((record) => {
                    const applicantId = resolveApplicantId(record)
                    const snapshot = record.freelancerSnapshot || {}
                    const tone = resolveApplicantTone(record.status)
                    const nextUrl = `/client/manage-gigs/${gigId}/applicants/${applicantId}`

                    const navigateToApplicant = () => {
                      navigate(nextUrl, { state: { gigTitle: gig?.title } })
                    }

                    const handleRowKeyDown = (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigateToApplicant()
                      }
                    }

                    return (
                      <tr
                        key={applicantId}
                        className="gig-applicant-row"
                        role="link"
                        tabIndex={0}
                        onClick={navigateToApplicant}
                        onKeyDown={handleRowKeyDown}
                      >
                        <td>
                          <div className="gig-applicant-copy">
                            <strong>{snapshot.displayName || 'Freelancer'}</strong>
                            <small>{formatApplicantRelative(record.proposalUpdatedAt)}</small>
                          </div>
                        </td>
                        <td>
                          {Array.isArray(snapshot.skills) && snapshot.skills.length > 0 ? (
                            <div className="gig-applicant-tags">
                              {snapshot.skills.slice(0, 3).map((skill) => (
                                <span key={`${applicantId}-${skill}`}>{skill}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="gig-applicant-empty">No skills shared</span>
                          )}
                        </td>
                        <td>
                          <div className="gig-applicant-list-meta">
                            <span className={`applicant-status-pill is-${tone}`}>
                              {formatApplicantStatus(record.status)}
                            </span>
                            <ChevronRight size={16} aria-hidden="true" />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default ClientGigApplicants
