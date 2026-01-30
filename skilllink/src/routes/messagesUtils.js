export const deriveGroupContext = (thread, userId) => {
  const base = {
    isGroup: false,
    groupId: null,
    name: thread?.subject || thread?.gigTitle || 'Conversation',
    ownerId: null,
    pendingMembers: [],
    activeMembers: [],
    viewerInviteStatus: null,
    viewerRole: null,
    canInvite: false,
    canDeleteForEveryone: false,
    canLeave: false,
    restrictedContactIds: [],
  }

  if (!thread) {
    return base
  }

  const groupMeta = thread.groupMeta || thread.group || thread.metadata?.group || null
  const groupId = groupMeta?.id || thread.groupId || thread.projectGroupId || null
  if (!groupId) {
    return base
  }

  const ownerId = groupMeta?.ownerId || groupMeta?.owner?.id || thread.ownerId || null
  const pendingMembers = normalizeMemberList(
    groupMeta?.pendingMembers || groupMeta?.pending || valuesFromMap(groupMeta?.pendingInvites),
  )
  const activeMembers = normalizeMemberList(groupMeta?.members || groupMeta?.activeMembers)
  const viewerRecord = groupMeta?.viewer || activeMembers.find((member) => member.id === userId) || null
  const viewerInviteStatus =
    groupMeta?.viewer?.inviteStatus ||
    (groupMeta?.pendingInvites && groupMeta.pendingInvites[userId]?.status) ||
    viewerRecord?.status ||
    null
  const viewerRole =
    groupMeta?.viewer?.role ||
    viewerRecord?.role ||
    (userId && ownerId && userId === ownerId ? 'owner' : viewerRecord?.role || null)

  const restrictedContactIds = Array.from(
    new Set([
      ...activeMembers.map((member) => member.id).filter(Boolean),
      ...pendingMembers.map((member) => member.id).filter(Boolean),
    ]),
  )

  return {
    ...base,
    isGroup: true,
    groupId,
    name: groupMeta?.name || base.name,
    ownerId,
    pendingMembers,
    activeMembers,
    viewerInviteStatus,
    viewerRole,
    canInvite: viewerRole === 'owner',
    canDeleteForEveryone: viewerRole === 'owner',
    canLeave: Boolean(viewerRole && viewerRole !== 'owner'),
    restrictedContactIds,
  }
}

export const formatMemberList = (members, { emptyFallback = '', max = 3 } = {}) => {
  if (!Array.isArray(members) || members.length === 0) {
    return emptyFallback
  }
  const names = members
    .map((member) => member?.name)
    .filter(Boolean)
    .slice(0, max + 1)
  if (names.length === 0) {
    return emptyFallback
  }
  if (names.length === 1) {
    return names[0]
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`
  }
  return `${names[0]}, ${names[1]} +${members.length - 2}`
}

export const isThreadVisibleToUser = (thread, userId) => {
  if (!thread) return false
  if (typeof thread.status === 'string' && thread.status.toLowerCase() === 'deleted') {
    return false
  }
  if (thread.hiddenBy && userId && thread.hiddenBy[userId]) {
    return false
  }
  return true
}

export const isGroupThread = (thread) => {
  if (!thread) return false
  const groupMeta = thread.groupMeta || thread.group || thread.metadata?.group || null
  return Boolean(thread.threadType === 'group' || groupMeta?.id || thread.groupId || thread.projectGroupId)
}

const normalizeMemberList = (value) => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map(normalizeMember).filter(Boolean)
  }
  if (typeof value === 'object') {
    return Object.values(value).map(normalizeMember).filter(Boolean)
  }
  return []
}

const normalizeMember = (entry) => {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { id: entry, name: entry }
  }
  const id = entry.id || entry.userId || entry.uid || null
  const name = entry.name || entry.displayName || entry.label || entry.email || 'Member'
  const role = entry.role || null
  const status = entry.status || entry.state || null
  return { id, name, role, status }
}

const valuesFromMap = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return Object.values(value)
  return []
}
