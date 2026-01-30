const applicantStatusMeta = {
  draft: { label: 'Draft', tone: 'muted' },
  under_review: { label: 'Under Review', tone: 'neutral' },
  interview: { label: 'Interview', tone: 'info' },
  hired: { label: 'Hired', tone: 'positive' },
  rejected: { label: 'Not Selected', tone: 'muted' },
}

const normalizeApplicantStatus = (status) => status?.toLowerCase?.() ?? ''

const normalizeLanguages = (value) => {
  if (!value && value !== 0) return []
  if (Array.isArray(value)) {
    return value.map((entry) => entry?.toString().trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

export const formatApplicantStatus = (status) => applicantStatusMeta[normalizeApplicantStatus(status)]?.label || 'Under Review'

export const resolveApplicantTone = (status) => applicantStatusMeta[normalizeApplicantStatus(status)]?.tone || 'neutral'

export const formatApplicantRelative = (value) => {
  if (!value) return 'Updated just now'
  try {
    const date = new Date(value)
    const diff = Date.now() - date.getTime()
    if (diff < 60 * 1000) return 'Updated just now'
    if (diff < 60 * 60 * 1000) return `Updated ${Math.floor(diff / (60 * 1000))}m ago`
    if (diff < 24 * 60 * 60 * 1000) return `Updated ${Math.floor(diff / (60 * 60 * 1000))}h ago`
    return `Updated ${date.toLocaleDateString()}`
  } catch (error) {
    return 'Updated recently'
  }
}

export const resolveApplicantId = (record) => {
  if (!record) return null
  return record.freelancerId || record.id || null
}

export const resolveApplicantLocalTime = (record = {}) => record.localTimeLabel || 'Local time not shared'

export const resolveApplicantLanguage = (record = {}, snapshot = {}) => {
  // Languages removed from frontend — always return a neutral label
  return record.languagePreference || snapshot.primaryLanguage || 'Language not shared'
}

export const getInitials = (value) => {
  if (!value) return 'SL'
  const parts = value.trim().split(' ')
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? 'S'
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}
