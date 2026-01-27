const normalizeLanguageList = (value) => {
  if (!value && value !== 0) return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  return raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry).trim()))
    .filter(Boolean)
}

export const parseLanguagesInput = (value, limit = 3) => normalizeLanguageList(value).slice(0, limit)

export const limitLanguagesInput = (value, limit = 3) => {
  const normalized = normalizeLanguageList(value)
  if (normalized.length <= limit) {
    return typeof value === 'string' ? value : normalized.join(', ')
  }
  return normalized.slice(0, limit).join(', ')
}

export const formatLanguagesLabel = (languages, fallback = 'Language not shared') => {
  const normalized = normalizeLanguageList(languages)
  if (!normalized.length) {
    return fallback
  }
  return normalized.slice(0, 3).join(', ')
}
