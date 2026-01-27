import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseAuth, getFirestoreClient, requireFirebaseConfig } from './firebaseClient'

const allowedRoles = ['client', 'freelancer', 'admin']

export const registerAccount = async ({ email, password, role, accountDetails = {} }) => {
  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  const normalizedRole = role?.toLowerCase()
  if (!allowedRoles.includes(normalizedRole)) {
    throw new Error('Select a valid role to continue.')
  }

  requireFirebaseConfig()
  const normalizedEmail = email.trim()

  const auth = getFirebaseAuth()
  const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)

  const {
    fullName = '',
    companyName = '',
    entityType = 'company',
    industry = '',
    hiringFocus = '',
    phone = '',
    skills = [],
    experienceLevel = 'beginner',
    portfolioUrl = '',
    hourlyRate = '',
    adminDepartment = '',
    adminTitle = '',
  } = accountDetails

  const displayName =
    normalizedRole === 'client'
      ? companyName?.trim() || fullName?.trim() || credential.user.email
      : fullName?.trim() || companyName?.trim() || credential.user.email

  if (displayName) {
    await updateProfile(credential.user, { displayName })
  }

  const onboardingStep =
    normalizedRole === 'client'
      ? 'client-essentials'
      : normalizedRole === 'freelancer'
        ? 'freelancer-essentials'
        : 'admin-ready'
  const profileComplete = normalizedRole === 'admin' ? 1 : normalizedRole === 'client' ? 0.2 : 0.25

  const profileBase = {
    uid: credential.user.uid,
    role: normalizedRole,
    displayName,
    email: credential.user.email,
    phone: phone?.trim() || null,
    accountTier: normalizedRole === 'admin' ? 'Admin' : 'Pending',
    onboardingStep,
    profileComplete,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const roleSpecific =
    normalizedRole === 'client'
      ? {
          companyName: companyName?.trim() || displayName,
          companyType: entityType,
          industry: industry?.trim() || '',
          hiringFocus: hiringFocus?.trim() || '',
        }
      : normalizedRole === 'freelancer'
        ? {
            fullName: fullName?.trim() || displayName,
            skills: normalizeSkills(skills),
            experienceLevel,
            portfolioUrl: portfolioUrl?.trim() || '',
            hourlyRate: normalizeRate(hourlyRate),
          }
        : {
            fullName: fullName?.trim() || displayName,
            adminDepartment: adminDepartment?.trim() || '',
            adminTitle: adminTitle?.trim() || '',
            permissions: ['monitor_users', 'handle_reports', 'block_accounts'],
          }

  const db = getFirestoreClient()
  await setDoc(
    doc(db, 'users', credential.user.uid),
    {
      ...profileBase,
      ...roleSpecific,
    },
    { merge: true },
  )

  return {
    uid: credential.user.uid,
    ...profileBase,
    ...roleSpecific,
  }
}

export const loginWithEmail = async (email, password) => {
  if (!email || !password) {
    throw new Error('Email and password are required.')
  }

  requireFirebaseConfig()
  const normalizedEmail = email.trim()

  const auth = getFirebaseAuth()
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password)
  return credential.user
}

export const logoutCurrentUser = async () => {
  requireFirebaseConfig()
  const auth = getFirebaseAuth()
  return signOut(auth)
}

const normalizeSkills = (value) => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((skill) => skill.trim()).filter(Boolean)
  }
  return value
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
}

const normalizeRate = (value) => {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
