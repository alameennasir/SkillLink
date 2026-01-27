import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions, getFirestoreClient, requireFirebaseConfig } from './firebaseClient'

const OVERVIEW_COLLECTION = 'admin'
const OVERVIEW_DOC = 'overview'
const REPORTS_COLLECTION = 'adminReports'
const ACTIVITY_COLLECTION = 'adminActivity'
const REPORT_LIMIT = 25
const ACTIVITY_LIMIT = 15

export const fetchAdminOverview = async () => {
  requireFirebaseConfig()
  const db = getFirestoreClient()

  const overviewDoc = doc(db, OVERVIEW_COLLECTION, OVERVIEW_DOC)
  const reportsRef = collection(db, REPORTS_COLLECTION)
  const activityRef = collection(db, ACTIVITY_COLLECTION)

  const [overviewSnap, reportsSnap, activitySnap] = await Promise.all([
    getDoc(overviewDoc),
    getDocs(query(reportsRef, orderBy('openedAt', 'desc'), limit(REPORT_LIMIT))),
    getDocs(query(activityRef, orderBy('createdAt', 'desc'), limit(ACTIVITY_LIMIT))),
  ])

  const metrics = extractMetricCards(overviewSnap)
  const reports = reportsSnap.docs.map((docSnap) => normalizeReport(docSnap.id, docSnap.data()))
  const activity = activitySnap.docs.map((docSnap) => normalizeActivity(docSnap.id, docSnap.data()))

  return { metrics, reports, activity }
}

export const resolveReport = async (reportId) => {
  if (!reportId) {
    throw new Error('Provide a report identifier before resolving.')
  }
  return callAdminFunction('adminResolveReport', { reportId })
}

export const blockAccount = async ({ accountId, reason }) => {
  if (!accountId) {
    throw new Error('Provide an account ID before blocking access.')
  }
  return callAdminFunction('adminBlockAccount', {
    accountId,
    reason: reason?.trim() || 'No reason supplied',
  })
}

export const liftBlock = async (accountId) => {
  if (!accountId) {
    throw new Error('Provide an account ID to restore access.')
  }
  return callAdminFunction('adminLiftBlock', { accountId })
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

const normalizeActivity = (id, data = {}) => ({
  id,
  message: data.message || data.summary || 'Log entry',
  timestamp: formatDisplayTimestamp(data.createdAt || data.timestamp || Date.now()),
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

const formatDisplayTimestamp = (value) => {
  const date = toDateInstance(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const callAdminFunction = async (name, payload) => {
  requireFirebaseConfig()
  const functions = getFirebaseFunctions()
  const callable = httpsCallable(functions, name)
  const response = await callable(payload)
  return response?.data ?? null
}
