import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getFirebaseStorage, isFirebaseConfigured, requireFirebaseConfig } from './firebaseClient'

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const normalizeCategory = (category) => (category === 'samples' ? 'samples' : 'attachments')

const LOCAL_PORTFOLIO_SCHEME = 'local-portfolio://'
const LOCAL_PORTFOLIO_DB = 'skilllinkPortfolio'
const LOCAL_PORTFOLIO_STORE = 'assets'
let localPortfolioDbPromise = null

const getBooleanEnv = (value) => {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

const shouldUseLocalPortfolioStore = () => {
  const fromImport = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_USE_LOCAL_PORTFOLIO_MOCK : undefined
  if (fromImport !== undefined) {
    return getBooleanEnv(fromImport)
  }
  if (typeof process !== 'undefined') {
    return getBooleanEnv(process.env?.VITE_USE_LOCAL_PORTFOLIO_MOCK)
  }
  return !isFirebaseConfigured
}

const supportsIndexedDB = () => typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'

const getLocalPortfolioDb = () => {
  if (!supportsIndexedDB()) {
    return Promise.reject(new Error('Local portfolio storage requires a browser environment with IndexedDB.'))
  }
  if (localPortfolioDbPromise) {
    return localPortfolioDbPromise
  }
  localPortfolioDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_PORTFOLIO_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LOCAL_PORTFOLIO_STORE)) {
        db.createObjectStore(LOCAL_PORTFOLIO_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open local portfolio storage.'))
  })
  return localPortfolioDbPromise
}

const saveLocalPortfolioBlob = async (assetId, file) => {
  const db = await getLocalPortfolioDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_PORTFOLIO_STORE, 'readwrite')
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error || new Error('Unable to store local portfolio asset.'))
    tx.objectStore(LOCAL_PORTFOLIO_STORE).put(file, assetId)
  })
}

const readLocalPortfolioBlob = async (assetId) => {
  const db = await getLocalPortfolioDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_PORTFOLIO_STORE, 'readonly')
    tx.onerror = () => reject(tx.error || new Error('Unable to read local portfolio asset.'))
    const request = tx.objectStore(LOCAL_PORTFOLIO_STORE).get(assetId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('Unable to read local portfolio asset.'))
  })
}

const deleteLocalPortfolioBlob = async (assetId) => {
  const db = await getLocalPortfolioDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_PORTFOLIO_STORE, 'readwrite')
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error || new Error('Unable to delete local portfolio asset.'))
    tx.objectStore(LOCAL_PORTFOLIO_STORE).delete(assetId)
  })
}

const buildLocalPortfolioPayload = ({ assetId, file, userId }) => ({
  id: assetId,
  name: file.name,
  size: file.size,
  type: file.type || 'application/octet-stream',
  url: `${LOCAL_PORTFOLIO_SCHEME}${assetId}`,
  storagePath: `${LOCAL_PORTFOLIO_SCHEME}${assetId}`,
  uploadedAt: new Date().toISOString(),
  ownerId: userId,
})

const uploadPortfolioAssetLocally = async ({ userId, file }) => {
  if (!supportsIndexedDB()) {
    throw new Error('Local file storage is not supported in this browser. Configure Firebase Storage to upload files.')
  }
  const assetId = randomId()
  await saveLocalPortfolioBlob(assetId, file)
  return buildLocalPortfolioPayload({ assetId, file, userId })
}

export const isLocalPortfolioReference = (value) =>
  typeof value === 'string' && value.startsWith(LOCAL_PORTFOLIO_SCHEME)

export const fetchLocalPortfolioAssetBlob = async (assetId) => {
  if (!assetId) return null
  try {
    return await readLocalPortfolioBlob(assetId)
  } catch (error) {
    console.warn('Unable to read local portfolio asset', error)
    return null
  }
}

export const deleteLocalPortfolioAssetBlob = async (assetId) => {
  if (!assetId) return false
  try {
    await deleteLocalPortfolioBlob(assetId)
    return true
  } catch (error) {
    console.warn('Unable to delete local portfolio asset', error)
    return false
  }
}

export const uploadGigThumbnail = async ({ clientId, file }) => {
  if (!clientId) {
    throw new Error('Client identifier is required to upload gig creatives.')
  }
  if (!file) {
    throw new Error('Select an image to upload.')
  }
  if (!file.type?.startsWith('image/')) {
    throw new Error('Upload a valid image file (PNG, JPG, or GIF).')
  }

  requireFirebaseConfig()
  const storage = getFirebaseStorage()
  const assetId = randomId()
  const path = `gigs/${clientId}/thumbnails/${assetId}-${file.name}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file)
  const url = await getDownloadURL(fileRef)

  return {
    id: assetId,
    name: file.name,
    size: file.size,
    type: file.type,
    url,
    storagePath: path,
    uploadedAt: new Date().toISOString(),
  }
}

export const uploadProposalAsset = async ({ userId, gigId, file, category = 'attachments' }) => {
  if (!userId || !gigId) {
    throw new Error('User and gig identifiers are required to upload files.')
  }
  if (!file) {
    throw new Error('Select a file to upload.')
  }

  const bucketCategory = normalizeCategory(category)
  requireFirebaseConfig()
  const storage = getFirebaseStorage()
  const assetId = randomId()
  const path = `proposals/${userId}/${gigId}/${bucketCategory}/${assetId}-${file.name}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file)
  const url = await getDownloadURL(fileRef)

  return {
    id: assetId,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url,
    storagePath: path,
    category: bucketCategory,
    uploadedAt: new Date().toISOString(),
  }
}

export const uploadFreelancerPortfolioAsset = async ({ userId, file }) => {
  if (!userId) {
    throw new Error('Freelancer identifier is required to upload portfolio files.')
  }
  if (!file) {
    throw new Error('Select a file to upload.')
  }

  if (shouldUseLocalPortfolioStore()) {
    return uploadPortfolioAssetLocally({ userId, file })
  }

  requireFirebaseConfig()
  const storage = getFirebaseStorage()
  const assetId = randomId()
  const folder = file.type?.startsWith('video/') ? 'videos' : 'images'
  const path = `users/${userId}/portfolio/${folder}/${assetId}-${file.name}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file)
  const url = await getDownloadURL(fileRef)

  return {
    id: assetId,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url,
    storagePath: path,
    uploadedAt: new Date().toISOString(),
  }
}

export const uploadThreadAttachment = async ({ threadId, senderId, file }) => {
  if (!threadId || !senderId) {
    throw new Error('Thread and sender identifiers are required to upload chat attachments.')
  }
  if (!file) {
    throw new Error('Select a file to upload.')
  }

  requireFirebaseConfig()
  const storage = getFirebaseStorage()
  const assetId = randomId()
  const path = `threads/${threadId}/${senderId}/${assetId}-${file.name}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file)
  const url = await getDownloadURL(fileRef)

  return {
    id: assetId,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url,
    storagePath: path,
    uploadedAt: new Date().toISOString(),
  }
}
