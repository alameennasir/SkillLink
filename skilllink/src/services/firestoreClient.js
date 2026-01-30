/*
  Summary: Core Firestore helpers and data-layer operations for SkillLink.

  See docs/CORE_FUNCTIONS.md for a concise list of core functions, their
  responsibilities, and where to find them in the repository.

  File: src/services/firestoreClient.js — Primary Firestore data access layer
  Responsibilities include: gig management, proposals mirror-syncing,
  messaging/threads, project group chats, user profile and verification flows,
  and real-time subscription helpers.
*/

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { getFirestoreClient, isFirebaseConfigured, requireFirebaseConfig } from './firebaseClient'
import { uploadThreadAttachment } from './storageClient'

const pipelineStatuses = ['Draft', 'Reviewing', 'Shortlist', 'In progress', 'Completed']
const defaultGigThumbnail = 'https://placehold.co/320x180?text=SkillLink'
const allowedApplicantStatuses = ['under_review', 'interview', 'hired', 'rejected']

const normalizePortfolioTags = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean)
}

const normalizePortfolioMediaSnapshot = (media, fallbackId) => {
  if (!media || typeof media !== 'object') return null
  const url = media.url || media.downloadUrl || media.link || ''
  const id = media.id || media.storagePath || fallbackId || url || `portfolio-media-${Date.now()}`
  return {
    id,
    name: media.name || media.fileName || 'portfolio-media',
    url,
    storagePath: media.storagePath || '',
    type: media.type || media.mimeType || 'application/octet-stream',
    previewUrl: media.previewUrl || media.thumbnail || url,
    size: Number(media.size) || 0,
  }
}

const normalizeFreelancerPortfolio = (collection) => {
  if (!Array.isArray(collection)) return []
  return collection
    .map((item, index) => {
      if (!item) return null
      const media = normalizePortfolioMediaSnapshot(item.media, item.id || `portfolio-${index}`)
      const previewUrl = item.previewUrl || media?.previewUrl || ''
      const url = item.url || item.projectUrl || media?.url || item.downloadUrl || ''
      return {
        id: item.id || media?.id || `portfolio-item-${index}`,
        title: item.title || item.name || 'Portfolio project',
        description: item.description || '',
        url,
        previewUrl,
        tags: normalizePortfolioTags(item.tags),
        media,
        role: item.role || '',
        type: item.type || '',
      }
    })
    .filter(Boolean)
}

const buildParticipantKey = (participants = []) => {
  if (!Array.isArray(participants)) return null
  const normalized = participants
    .filter(Boolean)
    .map((value) => String(value))
    .sort()
  return normalized.length ? normalized.join('__') : null
}

const initialMessageHasPayload = (message) => {
  if (!message || typeof message !== 'object') {
    return false
  }
  const text = typeof message.text === 'string' ? message.text.trim() : ''
  const hasFiles = Array.isArray(message.files) && message.files.length > 0
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0
  return Boolean(text) || hasFiles || hasAttachments
}

const isActiveDirectThread = (threadData, participants) => {
  if (!threadData) return false
  const status = typeof threadData.status === 'string' ? threadData.status.toLowerCase() : 'open'
  if (status === 'deleted') {
    return false
  }
  if (!Array.isArray(threadData.participants)) {
    return false
  }
  const [first, second] = participants
  const hasBoth = threadData.participants.includes(first) && threadData.participants.includes(second)
  const isDirect = threadData.threadType === 'direct' || threadData.participants.length === 2
  return hasBoth && isDirect
}

const findExistingDirectThread = async (db, participants) => {
  if (!db || !Array.isArray(participants) || participants.length !== 2) {
    return null
  }

  const threadsRef = collection(db, 'threads')
  const participantKey = buildParticipantKey(participants)

  if (participantKey) {
    const keySnapshot = await getDocs(query(threadsRef, where('participantKey', '==', participantKey), limit(1)))
    if (!keySnapshot.empty) {
      const docSnap = keySnapshot.docs[0]
      return { id: docSnap.id, ...docSnap.data() }
    }
  }

  const fallbackSnapshot = await getDocs(query(threadsRef, where('participants', 'array-contains', participants[0])))
  for (const docSnap of fallbackSnapshot.docs) {
    const data = docSnap.data()
    if (isActiveDirectThread(data, participants)) {
      return { id: docSnap.id, ...data }
    }
  }
  return null
}

const normalizeNin = (value) => {
  if (value === undefined || value === null) return ''
  const digits = String(value).replace(/\D/g, '')
  return digits.slice(0, 11)
}

const allowedVerificationStatuses = ['pending', 'verified', 'rejected']

const toMillis = (value) => {
  if (!value && value !== 0) return 0
  if (typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export const fetchClientDashboardData = async (clientId) => {
  if (!clientId) throw new Error('Client identifier is required')
  requireFirebaseConfig()
  const db = getFirestoreClient()

  const gigsRef = collection(db, 'gigs')
  // Query common client identifier fields so older gigs with alternate keys are included
  const queries = [
    query(gigsRef, where('clientId', '==', clientId)),
    query(gigsRef, where('ownerId', '==', clientId)),
    query(gigsRef, where('clientUid', '==', clientId)),
    query(gigsRef, where('client.id', '==', clientId)),
  ]

  const snapshots = await Promise.all(queries.map((q) => getDocs(q)))
  const allDocs = snapshots.flatMap((snap) => snap.docs)
  const unique = new Map()
  allDocs.forEach((docSnap) => {
    if (!unique.has(docSnap.id)) unique.set(docSnap.id, docSnap)
  })
  const gigs = Array.from(unique.values()).map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

  // Enrich gigs with applicant counts from the applications subcollection so
  // dashboard stats (total applicants) reflect real application numbers.
  try {
    const statusCounts = await Promise.all(
      gigs.map(async (g) => {
        try {
          const appsRef = collection(db, 'gigs', g.id, 'applications')
          const appsSnap = await getDocs(appsRef)
          const base = { under_review: 0, interview: 0, hired: 0 }
          let total = 0
          appsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data?.() || docSnap.data || {}
            const normalized = (data.status || 'under_review').toLowerCase()
            if (base[normalized] !== undefined) base[normalized] += 1
            total += 1
          })
          return { under_review: base.under_review, interview: base.interview, hired: base.hired, total }
        } catch (error) {
          return { under_review: 0, interview: 0, hired: 0, total: 0 }
        }
      }),
    )

    gigs.forEach((g, idx) => {
      const sc = statusCounts[idx] || { under_review: 0, interview: 0, hired: 0, total: 0 }
      g.applicants = g.applicants ?? g.pendingApplicants ?? sc.under_review ?? 0
      g.pendingApplicants = g.pendingApplicants ?? sc.under_review ?? 0
      g.applicantsCount = g.applicantsCount ?? sc.total ?? 0
      g.applicantsByStatus = { under_review: sc.under_review, interview: sc.interview, hired: sc.hired }
    })

    try {
      console.debug('fetchClientDashboardData: computed applicant counts', gigs.map((g) => ({ id: g.id, applicants: g.applicants, applicantsCount: g.applicantsCount })))
    } catch (err) {}
  } catch (error) {
    console.warn('Unable to compute applicant counts for client dashboard', error)
  }

  const stats = buildStatsFromGigs(gigs)
  const pipeline = pipelineStatuses.map((status) => ({
    status,
    count: gigs.filter((gig) => normalizeStatus(gig.status) === normalizeStatus(status)).length,
    description: buildPipelineDescription(status),
  }))

  const remindersRef = collection(db, 'users', clientId, 'reminders')
  const remindersSnap = await getDocs(remindersRef)
  const reminders = remindersSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

  const activityRef = collection(db, 'users', clientId, 'activity')
  const activitySnap = await getDocs(query(activityRef, orderBy('createdAt', 'desc'), limit(8)))
  const activity = activitySnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

  const talentRef = collection(db, 'users')
  const talentSnap = await getDocs(
    query(talentRef, where('role', '==', 'freelancer'), where('verificationStatus', '==', 'verified'), limit(4)),
  )
  const spotlight = talentSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

  return { stats, pipeline, reminders, activity, spotlight }
}

export const saveGigDraft = async (clientId, payload = {}) => {
  if (!clientId) throw new Error('Client identifier is required')
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const gigsCollection = collection(db, 'gigs')
  const skills = normalizeSkillsInput(payload.skills)
  const tags = normalizeSkillsInput(payload.tags)
  const statusLabel = formatStatusLabel(payload.status || 'Draft')
  const thumbnail = payload.thumbnail || defaultGigThumbnail
  const clientProfile = buildClientProfile(clientId, payload.client)
  const applicantsCount = Number.isFinite(Number(payload.applicants)) ? Number(payload.applicants) : 0

  const docPayload = {
    ...payload,
    clientId,
    status: statusLabel,
    thumbnail,
    applicants: applicantsCount,
    skills,
    tags: tags.length ? tags : skills,
    client: clientProfile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = await addDoc(gigsCollection, docPayload)

  return { id: docRef.id, ...docPayload }
}

export const upsertGigDraft = async (clientId, payload = {}, gigId = null) => {
  if (!clientId) throw new Error('Client identifier is required')
  requireFirebaseConfig()
  const db = getFirestoreClient()

  const skills = normalizeSkillsInput(payload.skills)
  const tags = normalizeSkillsInput(payload.tags)
  const statusLabel = formatStatusLabel(payload.status || 'Draft')
  const clientProfile = buildClientProfile(clientId, payload.client)

  if (gigId) {
    const gigRef = doc(db, 'gigs', gigId)
    const existingSnap = await getDoc(gigRef)
    const existing = existingSnap.exists() ? existingSnap.data() : null

    const existingApplicants = existing?.applicants ?? existing?.applicantsCount
    const applicantsCount = Number.isFinite(Number(payload.applicants))
      ? Number(payload.applicants)
      : Number.isFinite(Number(existingApplicants))
        ? Number(existingApplicants)
        : 0
    const existingThumbnail = existing?.thumbnail || existing?.creative?.url
    const thumbnail = payload.thumbnail || existingThumbnail || defaultGigThumbnail

    const docPayload = {
      ...payload,
      clientId,
      status: statusLabel,
      thumbnail,
      applicants: applicantsCount,
      skills,
      tags: tags.length ? tags : skills,
      client: clientProfile,
      updatedAt: serverTimestamp(),
      createdAt: existing?.createdAt || serverTimestamp(),
      creative: payload.creative ?? existing?.creative ?? null,
    }

    await setDoc(gigRef, docPayload, { merge: true })
    return { id: gigId, ...(existing || {}), ...docPayload }
  }

  const gigsCollection = collection(db, 'gigs')
  const thumbnail = payload.thumbnail || defaultGigThumbnail
  const applicantsCount = Number.isFinite(Number(payload.applicants)) ? Number(payload.applicants) : 0

  const docPayload = {
    ...payload,
    clientId,
    status: statusLabel,
    thumbnail,
    applicants: applicantsCount,
    skills,
    tags: tags.length ? tags : skills,
    client: clientProfile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const docRef = await addDoc(gigsCollection, docPayload)
  return { id: docRef.id, ...docPayload }
}

export const subscribeToClientGigs = (clientId, callback) => {
  if (!clientId || typeof callback !== 'function') return () => {}

  if (!isFirebaseConfigured) {
    console.warn('subscribeToClientGigs requires Firebase configuration. Returning an empty dataset.')
    callback([])
    return () => {}
  }

  const db = getFirestoreClient()
  const gigsRef = collection(db, 'gigs')
  const gigsQuery = query(gigsRef, where('clientId', '==', clientId), orderBy('createdAt', 'desc'))

  // We'll maintain per-gig listeners for application subcollections so counts
  // are kept in sync in real-time. Keep track of unsubscribes to clean up.
  const appUnsubs = new Map()

  const gigsUnsub = onSnapshot(gigsQuery, (snapshot) => {
    const gigs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

    // Ensure listeners exist for each gig; remove listeners for gigs no longer present
    const currentIds = new Set(gigs.map((g) => g.id))
    for (const id of Array.from(appUnsubs.keys())) {
      if (!currentIds.has(id)) {
        try {
          appUnsubs.get(id)?.()
        } catch (err) {}
        appUnsubs.delete(id)
      }
    }

    // create listeners for new gigs
    gigs.forEach((g) => {
      if (appUnsubs.has(g.id)) return
      try {
        const appsRef = collection(db, 'gigs', g.id, 'applications')
        const appsQuery = query(appsRef)
        const unsubApps = onSnapshot(
          appsQuery,
          (appsSnap) => {
            // Update the local gig object with applicant counts and notify consumer
            try {
              const base = { under_review: 0, interview: 0, hired: 0 }
              let total = 0
              appsSnap.docs.forEach((docSnap) => {
                const data = docSnap.data?.() || docSnap.data || {}
                const normalized = (data.status || 'under_review').toLowerCase()
                if (base[normalized] !== undefined) base[normalized] += 1
                total += 1
              })

              const enriched = gigs.map((gg) => {
                if (gg.id !== g.id) return gg
                const sc = { under_review: base.under_review, interview: base.interview, hired: base.hired, total }
                return {
                  ...gg,
                  applicants: gg.applicants ?? gg.pendingApplicants ?? sc.under_review ?? 0,
                  pendingApplicants: gg.pendingApplicants ?? sc.under_review ?? 0,
                  applicantsCount: gg.applicantsCount ?? sc.total ?? 0,
                  applicantsByStatus: { under_review: sc.under_review, interview: sc.interview, hired: sc.hired },
                }
              })
              try {
                console.debug('subscribeToClientGigs: applicant counts (realtime update)', enriched.map((e) => ({ id: e.id, applicants: e.applicants, applicantsCount: e.applicantsCount })))
              } catch (err) {}
              callback(enriched)
            } catch (err) {
              console.error('Error processing applications snapshot for gig', g.id, err)
            }
          },
          (error) => {
            console.error('Applications listener error for gig', g.id, error)
          },
        )
        appUnsubs.set(g.id, unsubApps)
      } catch (err) {
        console.error('Unable to attach applications listener for gig', g.id, err)
      }
    })

    // initial callback without counts (will be updated by per-gig listeners)
    callback(gigs)
  })

  const unsubscribe = () => {
    try {
      gigsUnsub?.()
    } catch (err) {}
    for (const unsub of appUnsubs.values()) {
      try {
        unsub?.()
      } catch (err) {}
    }
    appUnsubs.clear()
  }

  return unsubscribe
}

export const updateGigStatus = async (gigId, updates = {}) => {
  if (!gigId) throw new Error('Gig identifier is required')
  if (!updates || Object.keys(updates).length === 0) return null
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const gigRef = doc(db, 'gigs', gigId)
  await updateDoc(gigRef, { ...updates, updatedAt: serverTimestamp() })
  return true
}

export const deleteGig = async (gigId, clientId) => {
  if (!gigId) throw new Error('Gig identifier is required')
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const gigRef = doc(db, 'gigs', gigId)
  const gigSnap = await getDoc(gigRef)

  if (!gigSnap.exists()) {
    return false
  }

  const gigData = gigSnap.data()
  if (clientId && gigData?.clientId && gigData.clientId !== clientId) {
    throw new Error('You do not have permission to delete this gig.')
  }

  const applicationsRef = collection(db, 'gigs', gigId, 'applications')
  const applicationsSnap = await getDocs(applicationsRef)
  const nowIso = new Date().toISOString()

  await Promise.all(
    applicationsSnap.docs.map(async (docSnap) => {
      const data = docSnap.data() || {}
      const freelancerId = data.freelancerId || docSnap.id
      if (!freelancerId) return
      const proposalRef = doc(db, 'users', freelancerId, 'proposals', gigId)
      await setDoc(
        proposalRef,
        {
          gigStatus: 'deleted',
          gigIsActive: false,
          gigClosedReason: 'Gig no longer hiring',
          updatedAt: nowIso,
        },
        { merge: true },
      )
      await setDoc(
        doc(db, 'gigs', gigId, 'applications', docSnap.id),
        {
          gigStatus: 'deleted',
          gigIsActive: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }),
  )

  await deleteDoc(gigRef)
  return true
}

export const deleteFreelancerProposal = async (freelancerId, gigId) => {
  if (!freelancerId || !gigId) {
    throw new Error('Freelancer and gig identifiers are required')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  await deleteDoc(doc(db, 'users', freelancerId, 'proposals', gigId))
  try {
    await deleteDoc(doc(db, 'gigs', gigId, 'applications', freelancerId))
  } catch (error) {
    console.warn('Unable to remove gig application record', error)
  }
  return true
}

export const fetchUserProfile = async (uid) => {
  if (!uid) {
    throw new Error('User identifier is required')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const docSnap = await getDoc(doc(db, 'users', uid))
  return docSnap.exists() ? docSnap.data() : null
}

export const findUserByEmail = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Email is required to locate the account.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const usersRef = collection(db, 'users')
  const snapshot = await getDocs(query(usersRef, where('email', '==', normalizedEmail), limit(1)))
  if (snapshot.empty) {
    return null
  }
  const docSnap = snapshot.docs[0]
  return { id: docSnap.id, ...docSnap.data() }
}

export const setAccountBlockStatus = async ({ userId, email, blocked, reason, adminId }) => {
  const normalizedUserId = userId ? String(userId).trim() : ''
  const normalizedEmail = email ? String(email).trim().toLowerCase() : ''

  if (!normalizedUserId && !normalizedEmail) {
    throw new Error('Provide an account ID or email to update block status.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()

  let targetUserId = normalizedUserId
  if (!targetUserId) {
    const userRecord = await findUserByEmail(normalizedEmail)
    if (!userRecord?.id) {
      throw new Error('No matching account found for that email.')
    }
    targetUserId = userRecord.id
  }

  const payload = blocked
    ? {
        isBlocked: true,
        blockedAt: serverTimestamp(),
        blockedReason: reason?.trim() || 'No reason supplied',
        blockedBy: adminId || null,
      }
    : {
        isBlocked: false,
        blockedAt: deleteField(),
        blockedReason: deleteField(),
        blockedBy: deleteField(),
        blockedLiftedAt: serverTimestamp(),
      }

  const userRef = doc(db, 'users', targetUserId)
  await updateDoc(userRef, payload)

  return { id: targetUserId, ...payload }
}

export const fetchFreelancerProfile = async (uid) => fetchUserProfile(uid)

const saveProfileDocument = async (uid, updates = {}) => {
  if (!uid) {
    throw new Error('User identifier is required')
  }
  if (!updates || Object.keys(updates).length === 0) {
    throw new Error('Provide at least one field to update.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  await setDoc(
    doc(db, 'users', uid),
    {
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  return fetchUserProfile(uid)
}

export const saveFreelancerProfile = async (uid, updates = {}) => saveProfileDocument(uid, updates)

export const saveUserProfile = async (uid, updates = {}) => saveProfileDocument(uid, updates)

export const requestVerificationReview = async ({ userId, nin }) => {
  if (!userId) {
    throw new Error('User identifier is required to request verification.')
  }
  const normalizedNin = normalizeNin(nin)
  if (normalizedNin.length !== 11) {
    throw new Error('Enter your 11-digit NIN before requesting verification.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()
  const userRef = doc(db, 'users', userId)
  await updateDoc(userRef, {
    nin: normalizedNin,
    verificationStatus: 'pending',
    verificationRequestedAt: serverTimestamp(),
    verificationReviewedAt: null,
    verificationReviewedBy: null,
    verificationNotes: null,
  })

  return { nin: normalizedNin }
}

export const fetchVerificationRequests = async ({ statuses = ['pending'], limit: limitCount = 50 } = {}) => {
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const usersRef = collection(db, 'users')
  const normalizedStatuses = Array.isArray(statuses) ? statuses.filter(Boolean) : []
  const constraints = []

  if (normalizedStatuses.length === 1) {
    constraints.push(where('verificationStatus', '==', normalizedStatuses[0]))
  } else if (normalizedStatuses.length > 1) {
    constraints.push(where('verificationStatus', 'in', normalizedStatuses.slice(0, 10)))
  }

  if (limitCount) {
    constraints.push(limit(limitCount))
  }

  const queryRef = constraints.length ? query(usersRef, ...constraints) : usersRef
  const snapshot = await getDocs(queryRef)
  const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
  return records.sort((a, b) => toMillis(b.verificationRequestedAt) - toMillis(a.verificationRequestedAt))
}

export const updateUserVerificationStatus = async ({ userId, status, reviewerId, notes }) => {
  if (!userId) {
    throw new Error('Provide a user identifier to update verification status.')
  }
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : ''
  if (!allowedVerificationStatuses.includes(normalizedStatus)) {
    throw new Error('Select a supported verification status.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()
  const userRef = doc(db, 'users', userId)
  const timestamp = serverTimestamp()
  const trimmedNotes = notes?.trim() || null

  const payload = {
    verificationStatus: normalizedStatus,
    verificationReviewedAt: normalizedStatus === 'pending' ? null : timestamp,
    verificationReviewedBy: normalizedStatus === 'pending' ? null : reviewerId || null,
    verificationNotes: trimmedNotes,
  }

  if (normalizedStatus === 'pending') {
    payload.verificationRequestedAt = timestamp
  }

  if (normalizedStatus === 'rejected') {
    payload.verificationRejectionReason = trimmedNotes
  } else if (normalizedStatus === 'verified') {
    payload.verificationRejectionReason = null
  }

  await updateDoc(userRef, payload)
  return true
}

const proposalMilestones = {
  submittedAt: null,
  underReviewAt: null,
  interviewAt: null,
  hiredAt: null,
  rejectedAt: null,
}

const mergeProposalMilestones = (current = {}, incoming = {}) => ({ ...proposalMilestones, ...current, ...incoming })

const buildGigSnapshot = (gig = {}) => ({
  gigId: gig.id,
  clientId: gig.clientId ?? gig.ownerId ?? gig.client?.id ?? gig.clientUid ?? null,
  gigTitle: gig.title ?? 'Untitled gig',
  gigClient: gig.client?.name ?? gig.client ?? 'Unknown client',
  gigSummary: gig.summary ?? '',
  gigDeadline: gig.deadline ?? '',
})

const normalizeInterviewLink = (value) => {
  if (!value && value !== 0) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized)) {
    return normalized
  }
  return `https://${normalized}`
}

const normalizeInterviewSchedule = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

const buildFreelancerSnapshot = (profile = {}) => {
  if (!profile || typeof profile !== 'object') {
    return {
      uid: null,
      displayName: 'Freelancer',
      title: '',
      location: '',
      state: '',
      skills: [],
      portfolioUrl: '',
      summary: '',
      verificationStatus: 'pending',
      photoURL: '',
      rate: '',
      featured: [],
    }
  }

  const featuredPortfolio = normalizeFreelancerPortfolio(profile.featured || profile.featuredProjects || [])

  return {
    uid: profile.uid || profile.id || null,
    displayName: profile.displayName || profile.fullName || 'Freelancer',
    title: profile.title || profile.headline || '',
    location: profile.location || profile.state || '',
    state: profile.state || '',
    skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 10) : [],
    portfolioUrl: profile.portfolioUrl || '',
    summary: profile.summary || '',
    verificationStatus: profile.verificationStatus || 'pending',
    photoURL: profile.photoURL || profile.avatarUrl || '',
    rate: profile.rate || profile.hourlyRate || '',
    featured: featuredPortfolio,
    isProfileVisible: profile.isProfileVisible !== false,
  }
}

export const fetchFreelancerProposal = async (freelancerId, gigId) => {
  if (!freelancerId || !gigId) return null
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const proposalRef = doc(db, 'users', freelancerId, 'proposals', gigId)
  const snapshot = await getDoc(proposalRef)
  return snapshot.exists() ? { id: gigId, ...snapshot.data() } : null
}

export const subscribeToFreelancerProposal = (freelancerId, gigId, callback, options = {}) => {
  if (!freelancerId || !gigId || typeof callback !== 'function') {
    return () => {}
  }

  if (!isFirebaseConfigured) {
    console.warn('subscribeToFreelancerProposal requires Firebase configuration. Returning null dataset.')
    callback(null)
    options.onError?.(new Error('Firebase configuration missing.'))
    return () => {}
  }

  const db = getFirestoreClient()
  const proposalRef = doc(db, 'users', freelancerId, 'proposals', gigId)
  return onSnapshot(
    proposalRef,
    (snapshot) => {
      callback(snapshot.exists() ? { id: gigId, ...snapshot.data() } : null)
    },
    (error) => {
      console.error('Real-time proposal listener failed', error)
      options.onError?.(error)
    },
  )
}

export const fetchFreelancerProposals = async (freelancerId) => {
  if (!freelancerId) return []
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const proposalsRef = collection(db, 'users', freelancerId, 'proposals')
  const snapshot = await getDocs(query(proposalsRef, orderBy('updatedAt', 'desc')))
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
}

export const upsertFreelancerProposal = async (freelancerId, gig, updates = {}) => {
  if (!freelancerId) {
    throw new Error('Freelancer identifier is required')
  }
  if (!gig?.id) {
    throw new Error('Gig context is required when saving proposals.')
  }

  const gigSnapshot = buildGigSnapshot(gig)
  const normalizedMilestones = updates.milestones ? mergeProposalMilestones({}, updates.milestones) : undefined
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const proposalRef = doc(db, 'users', freelancerId, 'proposals', gig.id)
  const existingSnap = await getDoc(proposalRef)
  const existingData = existingSnap.exists() ? existingSnap.data() : null
  const timestamp = new Date().toISOString()

  const payload = {
    freelancerId,
    ...gigSnapshot,
    attachments: updates.attachments ?? existingData?.attachments ?? [],
    samples: updates.samples ?? existingData?.samples ?? [],
    status: updates.status ?? existingData?.status ?? 'draft',
    coverLetter: updates.coverLetter ?? existingData?.coverLetter ?? '',
    milestones: mergeProposalMilestones(existingData?.milestones, normalizedMilestones),
    interviewLink: normalizeInterviewLink(updates.interviewLink ?? existingData?.interviewLink ?? null),
    decisionNotes: updates.decisionNotes ?? existingData?.decisionNotes ?? null,
    updatedAt: timestamp,
  }

  if (updates.milestones === undefined && !existingData?.milestones) {
    payload.milestones = mergeProposalMilestones()
  }

  if (!existingData) {
    payload.createdAt = timestamp
  } else if (existingData.createdAt && !payload.createdAt) {
    payload.createdAt = existingData.createdAt
  }

  await setDoc(proposalRef, payload)
  await mirrorProposalToGigApplication({
    freelancerId,
    gig,
    proposal: payload,
  })

  return { id: gig.id, ...payload }
}

const mirrorProposalToGigApplication = async ({ freelancerId, gig, proposal }) => {
  if (!freelancerId || !gig?.id || !proposal) return
  const db = getFirestoreClient()
  const applicationRef = doc(db, 'gigs', gig.id, 'applications', freelancerId)
  const existingSnap = await getDoc(applicationRef)
  const existingData = existingSnap.exists() ? existingSnap.data() : null

  let freelancerProfile = null
  try {
    freelancerProfile = await fetchFreelancerProfile(freelancerId)
  } catch (error) {
    freelancerProfile = existingData?.freelancerSnapshot || null
  }

  const isoUpdatedAt = proposal.updatedAt || new Date().toISOString()
  const normalizedMilestones = mergeProposalMilestones(existingData?.milestones, proposal.milestones)

  const payload = {
    freelancerId,
    gigId: gig.id,
    clientId: proposal.clientId || gig.clientId || null,
    status: proposal.status,
    coverLetter: proposal.coverLetter || existingData?.coverLetter || '',
    attachments: proposal.attachments || existingData?.attachments || [],
    samples: proposal.samples || existingData?.samples || [],
    milestones: normalizedMilestones,
    interviewLink: proposal.interviewLink || existingData?.interviewLink || null,
    decisionNotes: proposal.decisionNotes ?? existingData?.decisionNotes ?? null,
    proposalUpdatedAt: isoUpdatedAt,
    updatedAt: serverTimestamp(),
    createdAt: existingData?.createdAt || isoUpdatedAt,
    freelancerSnapshot: buildFreelancerSnapshot(freelancerProfile || existingData?.freelancerSnapshot || {}),
  }

  await setDoc(applicationRef, payload, { merge: true })
}

export const subscribeToOpenGigs = (callback, options = {}) => {
  if (typeof callback !== 'function') {
    return () => {}
  }

  if (!isFirebaseConfigured) {
    console.warn('subscribeToOpenGigs requires Firebase configuration. Returning empty dataset.')
    callback([])
    return () => {}
  }

  const db = getFirestoreClient()
  const gigsRef = collection(db, 'gigs')
  const constraints = [orderBy('createdAt', 'desc')]
  if (options.limit) {
    constraints.push(limit(options.limit))
  }

  const gigsQuery = query(gigsRef, ...constraints)
  const allowedStatuses = (options.statuses || ['open', 'reviewing', 'in progress', 'draft']).map(normalizeStatus)

  const unsubscribe = onSnapshot(gigsQuery, (snapshot) => {
    const gigs = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((gig) => {
        if (!allowedStatuses.length) return true
        return allowedStatuses.includes(normalizeStatus(gig.status))
      })

    callback(gigs)
  })

  return unsubscribe
}

export const fetchGigById = async (gigId) => {
  if (!gigId) return null
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const snapshot = await getDoc(doc(db, 'gigs', gigId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

export const searchFreelancers = async ({ limit: limitCount = 24, verifiedOnly = false, visibleOnly = false } = {}) => {
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const talentRef = collection(db, 'users')
  const constraints = [where('role', '==', 'freelancer')]
  if (verifiedOnly) {
    constraints.push(where('verificationStatus', '==', 'verified'))
  }
  if (limitCount) {
    constraints.push(limit(limitCount))
  }

  const snapshot = await getDocs(query(talentRef, ...constraints))
  const normalizedResults = snapshot.docs.map((docSnap) => {
    const rawProfile = { id: docSnap.id, ...docSnap.data() }
    const snapshotProfile = buildFreelancerSnapshot({ ...rawProfile, uid: rawProfile.id })
    return {
      ...rawProfile,
      ...snapshotProfile,
      id: rawProfile.id,
      uid: snapshotProfile.uid || rawProfile.id,
      featured: snapshotProfile.featured,
    }
  })

  if (visibleOnly) {
    return normalizedResults.filter((person) => person.isProfileVisible !== false)
  }
  return normalizedResults
}

export const subscribeToGigApplications = (gigId, callback, options = {}) => {
  if (!gigId || typeof callback !== 'function') {
    return () => {}
  }

  if (!isFirebaseConfigured) {
    console.warn('subscribeToGigApplications requires Firebase configuration. Returning an empty dataset.')
    callback([])
    options.onError?.(new Error('Firebase configuration missing.'))
    return () => {}
  }

  const db = getFirestoreClient()
  const applicationsRef = collection(db, 'gigs', gigId, 'applications')
  const constraints = [orderBy('updatedAt', 'desc')]
  if (options.limit) {
    constraints.push(limit(options.limit))
  }

  const applicationsQuery = query(applicationsRef, ...constraints)
  return onSnapshot(
    applicationsQuery,
    (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      callback(records)
    },
    (error) => {
      console.error('Real-time applications listener failed', error)
      options.onError?.(error)
    },
  )
}

export const subscribeToGigApplicant = (gigId, freelancerId, callback, options = {}) => {
  if (!gigId || !freelancerId || typeof callback !== 'function') {
    return () => {}
  }

  if (!isFirebaseConfigured) {
    console.warn('subscribeToGigApplicant requires Firebase configuration. Returning null dataset.')
    callback(null)
    options.onError?.(new Error('Firebase configuration missing.'))
    return () => {}
  }

  const db = getFirestoreClient()
  const applicantRef = doc(db, 'gigs', gigId, 'applications', freelancerId)

  return onSnapshot(
    applicantRef,
    (snapshot) => {
      callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null)
    },
    (error) => {
      console.error('Real-time applicant listener failed', error)
      options.onError?.(error)
    },
  )
}

export const updateGigApplicantInterviewLink = async ({ gigId, freelancerId, interviewLink, interviewSchedule, updatedBy }) => {
  if (!gigId || !freelancerId) {
    throw new Error('Gig and freelancer identifiers are required.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()
  const proposalRef = doc(db, 'users', freelancerId, 'proposals', gigId)
  const proposalSnap = await getDoc(proposalRef)
  if (!proposalSnap.exists()) {
    throw new Error('Proposal not found for this freelancer.')
  }

  const proposal = proposalSnap.data()
  const normalizedLink = normalizeInterviewLink(interviewLink)
  const normalizedSchedule = normalizeInterviewSchedule(interviewSchedule)
  const nowIso = new Date().toISOString()
  const interviewMoment = normalizedSchedule || (normalizedLink ? nowIso : null)
  const milestonePatch = interviewMoment ? { interviewAt: proposal?.milestones?.interviewAt || interviewMoment } : {}
  const mergedMilestones = mergeProposalMilestones(proposal.milestones, milestonePatch)

  let nextStatus = proposal.status || 'under_review'
  if (normalizedLink && !['hired', 'rejected'].includes(nextStatus)) {
    nextStatus = 'interview'
  } else if (!normalizedLink && nextStatus === 'interview') {
    nextStatus = 'under_review'
  }

  const proposalUpdates = {
    interviewLink: normalizedLink,
    interviewSchedule: normalizedSchedule || null,
    status: nextStatus,
    milestones: mergedMilestones,
    updatedAt: nowIso,
  }

  await updateDoc(proposalRef, proposalUpdates)

  const syncedProposal = {
    ...proposal,
    ...proposalUpdates,
  }

  await mirrorProposalToGigApplication({
    freelancerId,
    gig: { id: gigId, clientId: proposal.clientId },
    proposal: syncedProposal,
  })

  const applicationRef = doc(db, 'gigs', gigId, 'applications', freelancerId)
  await updateDoc(applicationRef, {
    lastAction: normalizedLink ? 'interview_link_added' : 'interview_link_removed',
    lastActionBy: updatedBy || null,
    interviewSchedule: normalizedSchedule || null,
    updatedAt: serverTimestamp(),
  })

  return { interviewLink: normalizedLink, status: nextStatus }
}

export const updateGigApplicantStatus = async ({ gigId, freelancerId, status, clientNotes = '', updatedBy }) => {
  if (!gigId || !freelancerId) {
    throw new Error('Gig and freelancer identifiers are required.')
  }
  if (!allowedApplicantStatuses.includes(status)) {
    throw new Error('Provide a supported applicant status.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()
  const proposalRef = doc(db, 'users', freelancerId, 'proposals', gigId)
  const proposalSnap = await getDoc(proposalRef)
  if (!proposalSnap.exists()) {
    throw new Error('Proposal not found for this freelancer.')
  }

  const proposal = proposalSnap.data()
  const nowIso = new Date().toISOString()
  const milestonePatch = {}
  if (status === 'hired') {
    milestonePatch.hiredAt = proposal?.milestones?.hiredAt || nowIso
  }
  if (status === 'rejected') {
    milestonePatch.rejectedAt = nowIso
  }

  const mergedMilestones = mergeProposalMilestones(proposal.milestones, milestonePatch)
  const trimmedNotes = clientNotes?.trim() || null

  const proposalUpdates = {
    status,
    milestones: mergedMilestones,
    decisionNotes: trimmedNotes,
    updatedAt: nowIso,
  }

  await updateDoc(proposalRef, proposalUpdates)

  const syncedProposal = {
    ...proposal,
    ...proposalUpdates,
  }

  await mirrorProposalToGigApplication({
    freelancerId,
    gig: { id: gigId, clientId: proposal.clientId },
    proposal: syncedProposal,
  })

  const applicationRef = doc(db, 'gigs', gigId, 'applications', freelancerId)
  await updateDoc(applicationRef, {
    lastAction:
      status === 'hired'
        ? 'client_hired'
        : status === 'rejected'
          ? 'client_rejected'
          : 'client_updated_status',
    lastActionBy: updatedBy || null,
    updatedAt: serverTimestamp(),
  })

  return { status }
}

export const subscribeToUserThreads = (userId, callback, options = {}) => {
  if (!userId || typeof callback !== 'function') return () => {}

  if (!isFirebaseConfigured) {
    console.warn('subscribeToUserThreads requires Firebase configuration. Returning an empty dataset.')
    callback([])
    options.onError?.(new Error('Firebase configuration missing.'))
    return () => {}
  }

  const db = getFirestoreClient()
  const threadsRef = collection(db, 'threads')
  const threadsQuery = query(threadsRef, where('participants', 'array-contains', userId), orderBy('updatedAt', 'desc'))

  return onSnapshot(
    threadsQuery,
    (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      callback(records)
    },
    (error) => {
      console.error('Real-time thread listener failed', error)
      options.onError?.(error)
    },
  )
}

export const subscribeToThreadMessages = (threadId, callback, options = {}) => {
  if (!threadId || typeof callback !== 'function') return () => {}

  if (!isFirebaseConfigured) {
    console.warn('subscribeToThreadMessages requires Firebase configuration. Returning an empty dataset.')
    callback([])
    options.onError?.(new Error('Firebase configuration missing.'))
    return () => {}
  }

  const db = getFirestoreClient()
  const messagesRef = collection(db, 'threads', threadId, 'messages')
  const constraints = [orderBy('sentAt', 'asc')]
  if (options.limit) {
    constraints.push(limit(options.limit))
  }

  const messagesQuery = query(messagesRef, ...constraints)
  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const records = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      callback(records)
    },
    (error) => {
      console.error('Real-time message listener failed', error)
      options.onError?.(error)
    },
  )
}

export const markThreadAsRead = async (threadId, userId) => {
  if (!threadId || !userId) return
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const threadRef = doc(db, 'threads', threadId)
  await updateDoc(threadRef, {
    [`readBy.${userId}`]: serverTimestamp(),
  })
}

export const sendThreadMessage = async ({
  threadId,
  senderId,
  text,
  attachments = [],
  files = [],
  metadata = {},
}) => {
  if (!threadId) throw new Error('Thread identifier is required to send a message.')
  if (!senderId) throw new Error('Sender identifier is required to send a message.')
  const sanitizedText = (text || '').trim()

  const preparedAttachments = [...(attachments || [])]
  if (Array.isArray(files) && files.length) {
    const uploads = []
    for (const file of files) {
      if (!file) continue
      const uploaded = await uploadThreadAttachment({ threadId, senderId, file })
      uploads.push(uploaded)
    }
    preparedAttachments.push(...uploads)
  }

  const hasPreparedAttachments = preparedAttachments.length > 0
  if (!sanitizedText && !hasPreparedAttachments) {
    throw new Error('Add a message or attachment before sending.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()
  const nowIso = new Date().toISOString()
  const payload = {
    senderId,
    text: sanitizedText,
    attachments: hasPreparedAttachments ? preparedAttachments : [],
    metadata,
    sentAt: serverTimestamp(),
    sentAtIso: nowIso,
  }

  await addDoc(collection(db, 'threads', threadId, 'messages'), payload)

  const threadRef = doc(db, 'threads', threadId)
  const readField = `readBy.${senderId}`
  const attachmentPreview = hasPreparedAttachments
    ? `${preparedAttachments.length} attachment${preparedAttachments.length > 1 ? 's' : ''}`
    : ''
  await updateDoc(threadRef, {
    lastMessage: sanitizedText || attachmentPreview,
    lastSenderId: senderId,
    updatedAt: serverTimestamp(),
    [readField]: serverTimestamp(),
  })
}

export const createMessagingThread = async ({
  participants = [],
  createdBy,
  participantsInfo = {},
  gigId,
  gigTitle,
  proposalId,
  subject,
  metadata = {},
  initialMessage,
  reuseExisting = false,
  allowSolo = false,
}) => {
  const normalizedParticipants = Array.from(new Set(participants.filter(Boolean)))
  if (normalizedParticipants.length < 2 && !allowSolo) {
    throw new Error('Provide at least two participants to start a conversation.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()
  const now = serverTimestamp()
  const creatorId = createdBy || normalizedParticipants[0]
  const isGroupThread = Boolean(metadata?.group?.id || metadata?.groupId) || normalizedParticipants.length > 2 || allowSolo
  const threadType = isGroupThread ? 'group' : 'direct'

  if (reuseExisting && threadType === 'direct') {
    const existingThread = await findExistingDirectThread(db, normalizedParticipants)
    if (existingThread) {
      const shouldSendInitialMessage = initialMessageHasPayload(initialMessage)
      if (shouldSendInitialMessage) {
        await sendThreadMessage({
          threadId: existingThread.id,
          senderId: initialMessage.senderId || creatorId,
          text: initialMessage.text || '',
          files: initialMessage.files || [],
          attachments: initialMessage.attachments || [],
          metadata: initialMessage.metadata || {},
        })
      }

      const updatePayload = {}
      if (metadata && Object.keys(metadata).length) {
        updatePayload.metadata = { ...(existingThread.metadata || {}), ...metadata }
      }
      if (participantsInfo && Object.keys(participantsInfo).length) {
        updatePayload.participantsInfo = { ...(existingThread.participantsInfo || {}), ...participantsInfo }
      }
      if (Object.keys(updatePayload).length) {
        updatePayload.updatedAt = serverTimestamp()
        await updateDoc(doc(db, 'threads', existingThread.id), updatePayload)
      }

      return existingThread
    }
  }

  const participantKey = buildParticipantKey(normalizedParticipants)
  const threadPayload = {
    participants: normalizedParticipants,
    participantsInfo,
    createdBy: creatorId,
    gigId: gigId || null,
    gigTitle: gigTitle || null,
    proposalId: proposalId || null,
    subject: subject || gigTitle || 'Project conversation',
    metadata,
    status: 'open',
    readBy: creatorId ? { [creatorId]: now } : {},
    lastMessage: '',
    lastSenderId: null,
    createdAt: now,
    updatedAt: now,
    threadType,
    participantKey: participantKey || null,
  }

  const docRef = await addDoc(collection(db, 'threads'), threadPayload)

  if (initialMessageHasPayload(initialMessage)) {
    await sendThreadMessage({
      threadId: docRef.id,
      senderId: initialMessage.senderId || creatorId,
      text: initialMessage.text || '',
      files: initialMessage.files || [],
      attachments: initialMessage.attachments || [],
      metadata: initialMessage.metadata || {},
    })
  }

  return { id: docRef.id, ...threadPayload }
}

export const fetchProjectGroupChats = async (clientId) => {
  if (!clientId) return []
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const groupsRef = collection(db, 'projectGroups')
  const snapshot = await getDocs(query(groupsRef, where('clientId', '==', clientId), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
}

export const createProjectGroupChat = async ({
  clientId,
  clientName,
  name,
  summary = '',
  freelancerIds = [],
}) => {
  if (!clientId) {
    throw new Error('Client identifier is required to create a project group chat.')
  }
  const trimmedName = name?.trim()
  if (!trimmedName) {
    throw new Error('Add a project group name before creating the chat.')
  }
  const participants = Array.from(new Set([clientId]))
  const pendingInvites = Array.from(new Set(freelancerIds.filter(Boolean)))
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const payload = {
    clientId,
    name: trimmedName,
    summary: summary?.trim() || '',
    participants,
    pendingInvites,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  const docRef = await addDoc(collection(db, 'projectGroups'), payload)
  const pendingInviteMap = pendingInvites.reduce((accumulator, invitee) => {
    accumulator[invitee] = { id: invitee, status: 'pending' }
    return accumulator
  }, {})
  const memberMap = {
    [clientId]: {
      id: clientId,
      name: clientName || 'Client',
      role: 'owner',
      status: 'active',
    },
  }
  const groupMeta = {
    id: docRef.id,
    name: trimmedName,
    ownerId: clientId,
    pendingInvites: pendingInviteMap,
    members: memberMap,
  }

  const thread = await createMessagingThread({
    participants: [clientId, ...pendingInvites],
    createdBy: clientId,
    subject: trimmedName,
    metadata: { group: groupMeta },
    allowSolo: true,
  })

  await updateDoc(docRef, { threadId: thread.id, updatedAt: serverTimestamp() })
  await updateDoc(doc(db, 'threads', thread.id), {
    groupId: docRef.id,
    projectGroupId: docRef.id,
    updatedAt: serverTimestamp(),
  })

  return { id: docRef.id, threadId: thread.id, ...payload }
}

export const inviteFreelancerToProjectGroup = async ({ groupId, freelancerId, freelancerIds = [], clientId }) => {
  if (!groupId) {
    throw new Error('Group identifier is required to invite talent.')
  }
  const invitees = Array.from(new Set([freelancerId, ...(Array.isArray(freelancerIds) ? freelancerIds : [])].filter(Boolean)))
  if (!invitees.length) {
    throw new Error('Select at least one freelancer to invite.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const groupRef = doc(db, 'projectGroups', groupId)
  const groupSnap = await getDoc(groupRef)
  const groupData = groupSnap.exists() ? groupSnap.data() : null
  await updateDoc(groupRef, {
    pendingInvites: arrayUnion(...invitees),
    updatedAt: serverTimestamp(),
    lastInvitee: invitees[invitees.length - 1],
    lastInvitedBy: clientId || null,
  })
  if (groupData?.threadId) {
    const threadRef = doc(db, 'threads', groupData.threadId)
    const pendingUpdates = invitees.reduce((accumulator, invitee) => {
      accumulator[`metadata.group.pendingInvites.${invitee}`] = { id: invitee, status: 'pending' }
      return accumulator
    }, {})
    await updateDoc(threadRef, {
      participants: arrayUnion(...invitees),
      updatedAt: serverTimestamp(),
      'metadata.group.updatedAt': serverTimestamp(),
      ...pendingUpdates,
    })
  }
  return true
}

export const fetchProjectGroupInvites = async (freelancerId) => {
  if (!freelancerId) return []
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const groupsRef = collection(db, 'projectGroups')
  const snapshot = await getDocs(query(groupsRef, where('pendingInvites', 'array-contains', freelancerId)))
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
}

export const acceptProjectGroupInvite = async ({ groupId, freelancerId }) => {
  if (!groupId || !freelancerId) {
    throw new Error('Group and freelancer identifiers are required to accept an invite.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const groupRef = doc(db, 'projectGroups', groupId)
  const groupSnap = await getDoc(groupRef)
  const groupData = groupSnap.exists() ? groupSnap.data() : null
  await updateDoc(groupRef, {
    pendingInvites: arrayRemove(freelancerId),
    participants: arrayUnion(freelancerId),
    updatedAt: serverTimestamp(),
    lastJoiner: freelancerId,
  })
  if (groupData?.threadId) {
    const threadRef = doc(db, 'threads', groupData.threadId)
    await updateDoc(threadRef, {
      participants: arrayUnion(freelancerId),
      [`metadata.group.pendingInvites.${freelancerId}`]: deleteField(),
      [`metadata.group.members.${freelancerId}`]: { id: freelancerId, status: 'active' },
      'metadata.group.updatedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
  return true
}

export const declineProjectGroupInvite = async ({ groupId, freelancerId }) => {
  if (!groupId || !freelancerId) {
    throw new Error('Group and freelancer identifiers are required to decline an invite.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const groupRef = doc(db, 'projectGroups', groupId)
  const groupSnap = await getDoc(groupRef)
  const groupData = groupSnap.exists() ? groupSnap.data() : null
  await updateDoc(groupRef, {
    pendingInvites: arrayRemove(freelancerId),
    updatedAt: serverTimestamp(),
  })
  if (groupData?.threadId) {
    const threadRef = doc(db, 'threads', groupData.threadId)
    await updateDoc(threadRef, {
      participants: arrayRemove(freelancerId),
      [`metadata.group.pendingInvites.${freelancerId}`]: deleteField(),
      'metadata.group.updatedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
  return true
}

export const leaveProjectGroup = async ({ groupId, memberId }) => {
  if (!groupId || !memberId) {
    throw new Error('Group and member identifiers are required to leave the project chat.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const groupRef = doc(db, 'projectGroups', groupId)
  const groupSnap = await getDoc(groupRef)
  const groupData = groupSnap.exists() ? groupSnap.data() : null
  await updateDoc(groupRef, {
    participants: arrayRemove(memberId),
    pendingInvites: arrayRemove(memberId),
    updatedAt: serverTimestamp(),
    lastLeaver: memberId,
  })
  if (groupData?.threadId) {
    const threadRef = doc(db, 'threads', groupData.threadId)
    await updateDoc(threadRef, {
      participants: arrayRemove(memberId),
      [`metadata.group.pendingInvites.${memberId}`]: deleteField(),
      [`metadata.group.members.${memberId}`]: deleteField(),
      'metadata.group.updatedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
  return true
}

export const deleteProjectGroup = async ({ groupId, performedBy }) => {
  if (!groupId) {
    throw new Error('Group identifier is required to delete the project chat.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const groupRef = doc(db, 'projectGroups', groupId)
  await updateDoc(groupRef, {
    status: 'deleted',
    deletedAt: serverTimestamp(),
    deletedBy: performedBy || null,
  })
  return true
}

export const leaveMessagingThread = async ({ threadId, userId }) => {
  if (!threadId || !userId) {
    throw new Error('Thread and user identifiers are required to leave a conversation.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const threadRef = doc(db, 'threads', threadId)
  await updateDoc(threadRef, {
    participants: arrayRemove(userId),
    [`readBy.${userId}`]: deleteField(),
    updatedAt: serverTimestamp(),
    lastLeaver: userId,
  })
  return true
}

export const hideThreadForUser = async ({ threadId, userId }) => {
  if (!threadId || !userId) {
    throw new Error('Thread and user identifiers are required to hide a conversation.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const threadRef = doc(db, 'threads', threadId)
  await updateDoc(threadRef, {
    [`hiddenBy.${userId}`]: serverTimestamp(),
  })
  return true
}

export const deleteThreadForEveryone = async ({ threadId, performedBy }) => {
  if (!threadId) {
    throw new Error('Thread identifier is required to delete a conversation for everyone.')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const threadRef = doc(db, 'threads', threadId)
  await updateDoc(threadRef, {
    status: 'deleted',
    deletedAt: serverTimestamp(),
    deletedBy: performedBy || null,
  })
  return true
}

const normalizeStatus = (status) => status?.toLowerCase?.() ?? ''

const buildStatsFromGigs = (gigs) => {
  const openStatuses = ['draft', 'open', 'reviewing']
  const activeStatuses = ['in progress', 'active']

  const openCount = gigs.filter((gig) => openStatuses.includes(normalizeStatus(gig.status))).length
  const totalApplicants = gigs.reduce(
    // Use the total applicants count when available; fall back to other keys.
    (total, gig) => total + (gig.applicantsCount ?? gig.applicants ?? gig.pendingApplicants ?? 0),
    0,
  )
  const activeEngagements = gigs.filter((gig) => activeStatuses.includes(normalizeStatus(gig.status))).length
  const budgetAtRisk = gigs
    .filter((gig) => gig.budgetRisk)
    .reduce((total, gig) => total + (gig.budgetRisk.amount || 0), 0)

  return [
    {
      label: 'Open gigs',
      value: `${openCount}`,
      detail: `${activeEngagements} active`,
      trend: 'Pipeline auto-syncs hourly',
      tone: openCount > 0 ? 'positive' : 'neutral',
    },
    {
      label: 'Total applicants',
      value: `${totalApplicants}`,
      detail: 'Across current postings',
      trend: totalApplicants > 5 ? 'Review in progress' : 'On track',
      tone: totalApplicants > 5 ? 'negative' : 'neutral',
    },
    {
      label: 'Active gigs',
      value: `${activeEngagements}`,
      detail: 'Response SLA ≥ 85%',
      trend: 'Auto-generated from gigs',
      tone: 'positive',
    },
    {
      label: 'Budget at risk',
      value: budgetAtRisk ? `${budgetAtRisk.toLocaleString()}` : '0',
      detail: 'Awaiting approvals',
      trend: budgetAtRisk ? 'Resolve before billing' : 'All clear',
      tone: budgetAtRisk ? 'negative' : 'positive',
    },
  ]
}

const buildPipelineDescription = (status) => {
  switch (normalizeStatus(status)) {
    case 'draft':
      return 'Not yet published'
    case 'reviewing':
      return 'Screen applicants'
    case 'shortlist':
      return 'Interviews + approvals'
    case 'in progress':
      return 'Delivery underway'
    case 'completed':
      return 'Awaiting feedback'
    default:
      return 'Status pending'
  }
}

// formatBudget removed — currency and budget range strings are not used by the frontend anymore

function normalizeSkillsInput(value) {
  if (Array.isArray(value)) {
    return value.map((skill) => skill?.trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)
  }
  return []
}

function buildClientProfile(clientId, profile = {}) {
  return {
    id: profile.id || clientId,
    name: profile.name || profile.displayName || 'SkillLink client',
    sector: profile.sector || profile.industry || 'General',
    rating: profile.rating || 'New',
    location: profile.location || profile.state || 'Remote',
    state: profile.state || '',
    verified: Boolean(profile.verified ?? false),
  }
}

function formatStatusLabel(status) {
  if (!status || typeof status !== 'string') {
    return 'Draft'
  }
  return status
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
