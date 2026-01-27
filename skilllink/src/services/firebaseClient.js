import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Object.values(config).every(Boolean)

export const requireFirebaseConfig = () => {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase configuration is missing. Provide all VITE_FIREBASE_* values in your .env.local before running SkillLink.',
    )
  }
}

export const getFirebaseApp = () => {
  requireFirebaseConfig()
  return getApps().length ? getApp() : initializeApp(config)
}

export const getFirebaseAuth = () => getAuth(getFirebaseApp())

export const getFirestoreClient = () => getFirestore(getFirebaseApp())

export const getFirebaseFunctions = () => getFunctions(getFirebaseApp())
