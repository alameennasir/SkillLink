import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'
const authEmulatorPort = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099)
const firestoreEmulatorPort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080)
const functionsEmulatorPort = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)
const storageEmulatorPort = Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || 9199)

let emulatorInitialized = false

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

const ensureEmulatorsConnected = () => {
  if (!useEmulators || emulatorInitialized) return
  const app = getFirebaseApp()

  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${emulatorHost}:${authEmulatorPort}`, { disableWarnings: true })

  const db = getFirestore(app)
  connectFirestoreEmulator(db, emulatorHost, firestoreEmulatorPort)

  const functions = getFunctions(app)
  connectFunctionsEmulator(functions, emulatorHost, functionsEmulatorPort)

  const storage = getStorage(app)
  connectStorageEmulator(storage, emulatorHost, storageEmulatorPort)

  emulatorInitialized = true
}

export const getFirebaseAuth = () => {
  ensureEmulatorsConnected()
  return getAuth(getFirebaseApp())
}

export const getFirestoreClient = () => {
  ensureEmulatorsConnected()
  return getFirestore(getFirebaseApp())
}

export const getFirebaseStorage = () => {
  ensureEmulatorsConnected()
  return getStorage(getFirebaseApp())
}

const functionsCustomDomain = import.meta.env.VITE_FUNCTIONS_CUSTOM_DOMAIN?.trim()

export const getFirebaseFunctions = () => {
  const app = getFirebaseApp()
  ensureEmulatorsConnected()
  if (useEmulators) {
    return getFunctions(app)
  }
  return functionsCustomDomain ? getFunctions(app, functionsCustomDomain) : getFunctions(app)
}
