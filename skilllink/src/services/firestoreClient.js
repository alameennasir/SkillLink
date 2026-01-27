import {
  addDoc,
  collection,
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

export const fetchClientDashboardData = async (clientId) => {
  if (!clientId) throw new Error('Client identifier is required')
  requireFirebaseConfig()
  const db = getFirestoreClient()

  const gigsRef = collection(db, 'gigs')
  const gigsQuery = query(gigsRef, where('clientId', '==', clientId))
  const gigsSnapshot = await getDocs(gigsQuery)
  const gigs = gigsSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))

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
  const budgetLabel = formatBudget(payload)
  const skills = normalizeSkillsInput(payload.skills)
  const tags = normalizeSkillsInput(payload.tags)
  const statusLabel = formatStatusLabel(payload.status || 'Draft')
  const priceType = payload.priceType || 'Fixed price'
  const priceRange = payload.priceRange || budgetLabel
  const thumbnail = payload.thumbnail || defaultGigThumbnail
  const tokens = Number.isFinite(Number(payload.tokens)) ? Number(payload.tokens) : 0
  const clientProfile = buildClientProfile(clientId, payload.client)
  const applicantsCount = Number.isFinite(Number(payload.applicants)) ? Number(payload.applicants) : 0

  const docPayload = {
    ...payload,
    clientId,
    budget: budgetLabel,
    status: statusLabel,
    priceType,
    priceRange,
    thumbnail,
    tokens,
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

  const unsubscribe = onSnapshot(gigsQuery, (snapshot) => {
    const gigs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    callback(gigs)
  })

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

export const fetchUserProfile = async (uid) => {
  if (!uid) {
    throw new Error('User identifier is required')
  }
  requireFirebaseConfig()
  const db = getFirestoreClient()
  const docSnap = await getDoc(doc(db, 'users', uid))
  return docSnap.exists() ? docSnap.data() : null
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
  gigBudget: gig.priceRange ?? '',
  gigType: gig.priceType ?? '',
  gigTokens: gig.tokens ?? 0,
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
      languages: [],
      primaryLanguage: '',
    }
  }

  const languages = Array.isArray(profile.languages) ? profile.languages.filter(Boolean).slice(0, 3) : []

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
    languages,
    primaryLanguage: profile.primaryLanguage || languages[0] || '',
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

export const searchFreelancers = async ({ limit: limitCount = 24, verifiedOnly = false } = {}) => {
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
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
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

export const updateGigApplicantInterviewLink = async ({ gigId, freelancerId, interviewLink, updatedBy }) => {
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
  const nowIso = new Date().toISOString()
  const milestonePatch = normalizedLink ? { interviewAt: proposal?.milestones?.interviewAt || nowIso } : {}
  const mergedMilestones = mergeProposalMilestones(proposal.milestones, milestonePatch)

  let nextStatus = proposal.status || 'under_review'
  if (normalizedLink && !['hired', 'rejected'].includes(nextStatus)) {
    nextStatus = 'interview'
  } else if (!normalizedLink && nextStatus === 'interview') {
    nextStatus = 'under_review'
  }

  const proposalUpdates = {
    interviewLink: normalizedLink,
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
}) => {
  const normalizedParticipants = Array.from(new Set(participants.filter(Boolean)))
  if (normalizedParticipants.length < 2) {
    throw new Error('Provide at least two participants to start a conversation.')
  }

  requireFirebaseConfig()
  const db = getFirestoreClient()
  const now = serverTimestamp()
  const creatorId = createdBy || normalizedParticipants[0]
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
  }

  const docRef = await addDoc(collection(db, 'threads'), threadPayload)

  if (initialMessage && (initialMessage.text || initialMessage.files?.length || initialMessage.attachments?.length)) {
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

const normalizeStatus = (status) => status?.toLowerCase?.() ?? ''

const buildStatsFromGigs = (gigs) => {
  const openStatuses = ['draft', 'open', 'reviewing']
  const activeStatuses = ['in progress', 'active']

  const openCount = gigs.filter((gig) => openStatuses.includes(normalizeStatus(gig.status))).length
  const applicantsAwaiting = gigs.reduce((total, gig) => total + (gig.pendingApplicants || 0), 0)
  const activeEngagements = gigs.filter((gig) => activeStatuses.includes(normalizeStatus(gig.status))).length
  const budgetAtRisk = gigs
    .filter((gig) => gig.budgetRisk)
    .reduce((total, gig) => total + (gig.budgetRisk.amount || 0), 0)

  return [
    {
      label: 'Open gigs',
      value: `${openCount}`,
      detail: `${activeEngagements} in delivery`,
      trend: 'Pipeline auto-syncs hourly',
      tone: openCount > 0 ? 'positive' : 'neutral',
    },
    {
      label: 'Applicants awaiting review',
      value: `${applicantsAwaiting}`,
      detail: 'Across current postings',
      trend: applicantsAwaiting > 5 ? 'Prioritize today' : 'On track',
      tone: applicantsAwaiting > 5 ? 'negative' : 'neutral',
    },
    {
      label: 'Active engagements',
      value: `${activeEngagements}`,
      detail: 'Response SLA ≥ 85%',
      trend: 'Auto-generated from gigs',
      tone: 'positive',
    },
    {
      label: 'Budget at risk',
      value: budgetAtRisk ? `₦${budgetAtRisk.toLocaleString()}` : '₦0',
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

const formatBudget = (payload) => {
  const currency = payload.currency || '₦'
  const min = payload.budgetMin || '0'
  const max = payload.budgetMax || '0'
  return `${currency}${min} - ${currency}${max}`
}

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
  const languages = Array.isArray(profile.languages) ? profile.languages.filter(Boolean).slice(0, 3) : []
  return {
    id: profile.id || clientId,
    name: profile.name || profile.displayName || 'SkillLink client',
    sector: profile.sector || profile.industry || 'General',
    rating: profile.rating || 'New',
    location: profile.location || profile.state || 'Remote',
    state: profile.state || '',
    languages,
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
