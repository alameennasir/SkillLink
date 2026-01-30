import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions, getFirestoreClient, requireFirebaseConfig } from './firebaseClient'
import { setAccountBlockStatus } from './firestoreClient'

const OVERVIEW_COLLECTION = 'admin'
const OVERVIEW_DOC = 'overview'
const REPORTS_COLLECTION = 'adminReports'
const REPORT_LIMIT = 25
const useFirestoreAdmin = import.meta.env.VITE_USE_FIRESTORE_ADMIN === 'true'

export const fetchAdminOverview = async () => {
  requireFirebaseConfig()
  const db = getFirestoreClient()

  const overviewDoc = doc(db, OVERVIEW_COLLECTION, OVERVIEW_DOC)
  const reportsRef = collection(db, REPORTS_COLLECTION)

  const [overviewSnap, reportsSnap] = await Promise.all([
    getDoc(overviewDoc),
    getDocs(query(reportsRef, orderBy('openedAt', 'desc'), limit(REPORT_LIMIT))),
  ])

  const metrics = extractMetricCards(overviewSnap)
  const reports = reportsSnap.docs.map((docSnap) => normalizeReport(docSnap.id, docSnap.data()))

  return { metrics, reports }
}

export const resolveReport = async (reportId) => {
  const normalizedId = String(reportId || '').trim()
  if (!normalizedId) {
    throw new Error('Provide a report identifier before resolving.')
  }
  return callAdminFunction('adminResolveReport', { reportId: normalizedId })
}

export const blockAccount = async ({ accountId, email, reason }) => {
  const identifier = normalizeAccountIdentifier({ accountId, email })
  if (!identifier.accountId && !identifier.email) {
    throw new Error('Provide an email or account ID before blocking access.')
  }
  if (useFirestoreAdmin) {
    return setAccountBlockStatus({
      ...identifier,
      blocked: true,
      reason: formatReason(reason),
    })
  }
  return callAdminFunction('adminBlockAccount', {
    ...identifier,
    reason: formatReason(reason),
  })
}

export const liftBlock = async ({ accountId, email }) => {
  const identifier = normalizeAccountIdentifier({ accountId, email })
  if (!identifier.accountId && !identifier.email) {
    throw new Error('Provide an email or account ID to restore access.')
  }
  if (useFirestoreAdmin) {
    return setAccountBlockStatus({
      ...identifier,
      blocked: false,
    })
  }
  return callAdminFunction('adminLiftBlock', identifier)
}

const extractMetricCards = (snapshot) => {
  if (!snapshot?.exists()) return []
  const data = snapshot.data()
  const cards = Array.isArray(data.cards) ? data.cards : Array.isArray(data.metrics) ? data.metrics : []
  return cards.map((card) => ({
    label: card?.label || 'Metric',
    value: typeof card?.value === 'number' ? card.value : Number(card?.value) || 0,
    trend: card?.trend || '',
  }))
}

const normalizeReport = (id, data = {}) => ({
  id,
  subject: data.subject || 'Incoming report',
  type: data.type || 'General',
  reporter: data.reporter || data.reporterId || 'unknown',
  status: String(data.status || 'open').toLowerCase(),
  priority: data.priority || 'normal',
  openedAt: toIsoString(data.openedAt || data.createdAt || Date.now()),
})

const toDateInstance = (value) => {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : new Date(parsed)
  }
  return null
}

const toIsoString = (value) => {
  const date = toDateInstance(value)
  return date ? date.toISOString() : new Date().toISOString()
}

const normalizeAccountIdentifier = ({ accountId, email }) => {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : ''
  const normalizedAccountId = accountId ? String(accountId).trim() : ''
  return {
    email: normalizedEmail || undefined,
    accountId: normalizedAccountId || undefined,
  }
}

const formatReason = (reason) => {
  const trimmed = reason?.trim()
  return trimmed || 'No reason supplied'
}

const callAdminFunction = async (name, payload) => {
  requireFirebaseConfig()
  const functions = getFirebaseFunctions()
  const callable = httpsCallable(functions, name)
  const response = await callable(payload)
  return response?.data ?? null
}
