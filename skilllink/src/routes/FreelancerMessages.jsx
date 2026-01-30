import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, Paperclip, Search, Send, Smile, Trash2, UserPlus, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  acceptProjectGroupInvite,
  declineProjectGroupInvite,
  hideThreadForUser,
  leaveMessagingThread,
  leaveProjectGroup,
  markThreadAsRead,
  sendThreadMessage,
  subscribeToThreadMessages,
  subscribeToUserThreads,
} from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'
import { deriveGroupContext, formatMemberList, isGroupThread, isThreadVisibleToUser } from './messagesUtils'

const FreelancerMessages = () => {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [threads, setThreads] = useState([])
  const [threadStatus, setThreadStatus] = useState(isFirebaseConfigured ? 'idle' : 'error')
  const [threadError, setThreadError] = useState(
    isFirebaseConfigured ? null : new Error('Add Firebase credentials to load your inbox.'),
  )
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageStatus, setMessageStatus] = useState('idle')
  const [messageError, setMessageError] = useState(null)
  const [composer, setComposer] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [requestedThreadId, setRequestedThreadId] = useState(location.state?.threadId || null)
  const [composerFiles, setComposerFiles] = useState([])
  const [threadAction, setThreadAction] = useState(null)
  const [threadActionFeedback, setThreadActionFeedback] = useState('')
  const [threadView, setThreadView] = useState('all')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (location.state?.threadId) {
      setRequestedThreadId(location.state.threadId)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state?.threadId, location.pathname, navigate])

  useEffect(() => {
    if (!requestedThreadId) return
    const match = threads.find((thread) => thread.id === requestedThreadId)
    if (match) {
      setActiveThreadId(requestedThreadId)
      setRequestedThreadId(null)
    }
  }, [requestedThreadId, threads])

  useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured) return undefined
    setThreadStatus('loading')
    const unsubscribe = subscribeToUserThreads(
      user.uid,
      (records) => {
        setThreads(records)
        setThreadStatus('ready')
        setThreadError(null)
        if (records.length) {
          setActiveThreadId((prev) => prev ?? records[0].id)
        }
      },
      {
        onError: (error) => {
          setThreadStatus('error')
          setThreadError(error)
        },
      },
    )
    return () => unsubscribe?.()
  }, [user?.uid])

  useEffect(() => {
    if (!activeThreadId || !user?.uid || !isFirebaseConfigured) {
      setMessages([])
      setMessageStatus(activeThreadId ? 'idle' : 'empty')
      return undefined
    }
    setMessageStatus('loading')
    const unsubscribe = subscribeToThreadMessages(
      activeThreadId,
      (records) => {
        setMessages(records)
        setMessageStatus('ready')
        setMessageError(null)
        markThreadAsRead(activeThreadId, user.uid).catch(() => {})
      },
      {
        onError: (error) => {
          setMessageStatus('error')
          setMessageError(error)
        },
      },
    )
    return () => unsubscribe?.()
  }, [activeThreadId, user?.uid])

  useEffect(() => {
    setThreadAction(null)
    setThreadActionFeedback('')
  }, [activeThreadId])

  useEffect(() => {
    if (!activeThreadId) return
    const current = threads.find((thread) => thread.id === activeThreadId)
    if (current && isThreadVisibleToUser(current, user?.uid)) {
      return
    }
    const fallback = threads.find((thread) => isThreadVisibleToUser(thread, user?.uid))
    setActiveThreadId(fallback ? fallback.id : null)
  }, [threads, activeThreadId, user?.uid])

  const visibleThreads = useMemo(
    () => threads.filter((thread) => isThreadVisibleToUser(thread, user?.uid)),
    [threads, user?.uid],
  )

  const filteredThreads = useMemo(() => {
    const scopedThreads = threadView === 'group'
      ? visibleThreads.filter((thread) => isGroupThread(thread))
      : visibleThreads
    const normalized = search.trim().toLowerCase()
    if (!normalized) return scopedThreads
    return scopedThreads.filter((thread) => {
      const partner = getPartnerSnapshot(thread, user?.uid)
      const haystack = [partner.name, thread.subject, thread.gigTitle, thread.lastMessage]
      return haystack.some((text) => text?.toLowerCase().includes(normalized))
    })
  }, [visibleThreads, search, user?.uid, threadView])

  useEffect(() => {
    if (!filteredThreads.length) {
      setActiveThreadId(null)
      return
    }
    if (!filteredThreads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(filteredThreads[0].id)
    }
  }, [filteredThreads, activeThreadId])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [threads, activeThreadId],
  )
  const activePartnerSnapshot = useMemo(() => getPartnerSnapshot(activeThread, user?.uid), [activeThread, user?.uid])
  const groupContext = useMemo(() => deriveGroupContext(activeThread, user?.uid), [activeThread, user?.uid])
  const pendingInviteLabel = useMemo(
    () => formatMemberList(groupContext.pendingMembers, { emptyFallback: '' }),
    [groupContext.pendingMembers],
  )
  const activeMemberLabel = useMemo(
    () => formatMemberList(groupContext.activeMembers, { emptyFallback: 'Project chat' }),
    [groupContext.activeMembers],
  )
  const showPendingBanner = groupContext.isGroup && groupContext.pendingMembers.length > 0 && groupContext.viewerRole === 'owner'
  const viewerInvitePending = groupContext.viewerInviteStatus === 'pending'

  const handleSelectThread = (threadId) => {
    setActiveThreadId(threadId)
    setMessageError(null)
    if (threadId && user?.uid) {
      markThreadAsRead(threadId, user.uid).catch(() => {})
    }
  }

  const handleAttachClick = () => {
    if (!activeThreadId || sending || viewerInvitePending || !isFirebaseConfigured) return
    fileInputRef.current?.click()
  }

  const handleFilesSelected = (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    const mapped = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      file,
    }))
    setComposerFiles((current) => [...current, ...mapped])
  }

  const handleRemovePendingFile = (attachmentId) => {
    setComposerFiles((current) => current.filter((item) => item.id !== attachmentId))
  }

  const handleSendMessage = async (event) => {
    event.preventDefault()
    const textPayload = composer.trim()
    const filesPayload = composerFiles.map((item) => item.file)
    if ((!textPayload && filesPayload.length === 0) || !activeThreadId || !user?.uid) return
    setSending(true)
    try {
      await sendThreadMessage({
        threadId: activeThreadId,
        senderId: user.uid,
        text: composer,
        files: filesPayload,
      })
      setComposer('')
      setComposerFiles([])
    } catch (error) {
      setMessageError(error)
    } finally {
      setSending(false)
    }
  }

  const handleAcceptInvite = async () => {
    if (!groupContext.groupId || !user?.uid) return
    setThreadAction('accept')
    setThreadActionFeedback('')
    try {
      await acceptProjectGroupInvite({ groupId: groupContext.groupId, freelancerId: user.uid })
      setThreadActionFeedback('Invite accepted. You can start replying now.')
    } catch (error) {
      setThreadActionFeedback(error?.message || 'Unable to accept the invite right now.')
    } finally {
      setThreadAction(null)
    }
  }

  const handleDeclineInvite = async () => {
    if (!groupContext.groupId || !user?.uid) return
    setThreadAction('decline')
    setThreadActionFeedback('')
    try {
      await declineProjectGroupInvite({ groupId: groupContext.groupId, freelancerId: user.uid })
      setThreadActionFeedback('Invite declined. This chat will disappear shortly.')
      setActiveThreadId(null)
    } catch (error) {
      setThreadActionFeedback(error?.message || 'Unable to decline the invite right now.')
    } finally {
      setThreadAction(null)
    }
  }

  const handleDeleteThreadForMe = async () => {
    if (!activeThreadId || !user?.uid) return
    setThreadAction('deleteForMe')
    setThreadActionFeedback('')
    try {
      await hideThreadForUser({ threadId: activeThreadId, userId: user.uid })
      setThreadActionFeedback('Conversation removed from your inbox.')
      setActiveThreadId(null)
    } catch (error) {
      setThreadActionFeedback(error?.message || 'Unable to remove the conversation right now.')
    } finally {
      setThreadAction(null)
    }
  }

  const handleExitGroup = async () => {
    if (!groupContext.groupId || !activeThreadId || !user?.uid) return
    setThreadAction('exitGroup')
    setThreadActionFeedback('')
    try {
      await Promise.all([
        leaveProjectGroup({ groupId: groupContext.groupId, memberId: user.uid }),
        leaveMessagingThread({ threadId: activeThreadId, userId: user.uid }),
      ])
      setThreadActionFeedback('You left the group. This chat will disappear shortly.')
      setActiveThreadId(null)
    } catch (error) {
      setThreadActionFeedback(error?.message || 'Unable to leave the group right now.')
    } finally {
      setThreadAction(null)
    }
  }

  const sidebarEmptyCopy = !isFirebaseConfigured
    ? 'Configure Firebase to unlock SkillLink messaging.'
    : 'No chats yet. Apply to gigs or respond to invites to start the conversation.'
  const composerHasPayload = Boolean(composer.trim()) || composerFiles.length > 0
  const composerDisabled = !activeThread || sending || !isFirebaseConfigured || viewerInvitePending
  const composerPlaceholder = !isFirebaseConfigured
    ? 'Configure Firebase to enable messaging'
    : !activeThread
      ? 'Select a thread to start typing'
      : viewerInvitePending
        ? 'Accept the invite to start chatting'
        : 'Send an update'
  const threadDisplayName = groupContext.isGroup ? groupContext.name : activePartnerSnapshot.name
  const threadSubtitle = groupContext.isGroup
    ? activeMemberLabel
    : activeThread?.gigTitle || activeThread?.subject || 'SkillLink conversation'
  const threadAvatarInitials = groupContext.isGroup ? getInitials(groupContext.name) : activePartnerSnapshot.initials
  const acceptBusy = threadAction === 'accept'
  const declineBusy = threadAction === 'decline'
  const deleteForMeBusy = threadAction === 'deleteForMe'
  const exitGroupBusy = threadAction === 'exitGroup'

  return (
    <div className="freelancer-page">
      <section className="messages-shell">
        <aside className="messages-sidebar" aria-label="Conversation list">
          <div className="messages-sidebar-head">
            <h2>Messages</h2>
            <div className="messages-view-toggle">
              <button
                type="button"
                className={`messages-view-tab ${threadView === 'all' ? 'is-active' : ''}`}
                onClick={() => setThreadView('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`messages-view-tab ${threadView === 'group' ? 'is-active' : ''}`}
                onClick={() => setThreadView('group')}
              >
                Groups
              </button>
            </div>
          </div>
          <label className="messages-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search clients or gigs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!visibleThreads.length}
            />
          </label>

          {threadError ? (
            <div className="messages-thread-placeholder">
              <p>{threadError.message}</p>
            </div>
          ) : threadStatus === 'loading' ? (
            <div className="messages-thread-placeholder">
              <p>Loading conversations…</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="messages-thread-placeholder">
              <p>{sidebarEmptyCopy}</p>
            </div>
          ) : (
            <ul className="messages-thread-list">
              {filteredThreads.map((thread) => {
                const partner = getPartnerSnapshot(thread, user?.uid)
                const unread = isThreadUnread(thread, user?.uid)
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className={`messages-thread ${thread.id === activeThreadId ? 'is-active' : ''}`}
                      onClick={() => handleSelectThread(thread.id)}
                    >
                      <div className="thread-avatar" aria-hidden="true">
                        {partner.initials}
                      </div>
                      <div className="messages-thread-body">
                        <div className="messages-thread-head">
                          <strong>{partner.name}</strong>
                          <span>{formatListTimestamp(thread.updatedAt)}</span>
                        </div>
                        <p className="messages-thread-meta">{thread.gigTitle || thread.subject || 'Project chat'}</p>
                        <div className="messages-thread-preview-row">
                          {unread && <span className="messages-thread-unread-dot" aria-hidden="true" />}
                          <small className={`messages-thread-preview ${unread ? 'is-unread' : ''}`}>
                            {thread.lastMessage || 'Say hello'}
                          </small>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <div className="messages-thread-view" aria-label="Active conversation">
          <header className="thread-view-head">
            {activeThread ? (
              <>
                <div className="thread-view-contact">
                  <div className="thread-avatar" aria-hidden="true">
                    {threadAvatarInitials}
                  </div>
                  <div>
                    <strong>{threadDisplayName}</strong>
                    <p>{threadSubtitle}</p>
                  </div>
                </div>
                <div className="thread-view-actions">
                  <button
                    type="button"
                    className="thread-icon-btn"
                    aria-label="Delete conversation"
                    onClick={handleDeleteThreadForMe}
                    disabled={deleteForMeBusy}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <div className="thread-view-contact">
                <div className="thread-avatar" aria-hidden="true">
                  SL
                </div>
                <div>
                  <strong>No thread selected</strong>
                  <p>Messages with clients will appear here.</p>
                </div>
              </div>
            )}
          </header>

          <div className="thread-view-body">
            {messageError ? (
              <div className="thread-empty-state">
                <p>{messageError.message}</p>
              </div>
            ) : messageStatus === 'loading' ? (
              <div className="thread-empty-state">
                <p>Loading conversation…</p>
              </div>
            ) : !activeThread ? (
              <div className="thread-empty-state">
                <p>Select a thread to read client updates.</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="thread-empty-state">
                <p>No messages yet.</p>
                <small>Share a quick update or attach your latest deliverable.</small>
              </div>
            ) : (
              <ul className="thread-message-stack">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={`thread-message ${message.senderId === user?.uid ? 'is-self' : ''}`}
                  >
                    <div className="thread-message-bubble">
                      {message.text && <p>{message.text}</p>}
                      {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <div className="thread-attachments">
                          {message.attachments.map((file) => (
                            <a href={file.url} key={file.id || file.url} target="_blank" rel="noreferrer">
                              {file.name || 'Attachment'}
                            </a>
                          ))}
                        </div>
                      )}
                      <span>{formatMessageTimestamp(message.sentAt || message.sentAtIso)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {activeThread && (showPendingBanner || viewerInvitePending) && (
            <div className={`thread-system-banner ${viewerInvitePending ? 'is-warning' : ''}`}>
              <UserPlus size={16} aria-hidden="true" />
              {viewerInvitePending ? (
                <div className="thread-banner-content">
                  <p>Accept the invite to unlock replies in this project group.</p>
                  <div className="thread-banner-actions">
                    <button
                      type="button"
                      className="profile-ghost-btn"
                      disabled={declineBusy}
                      onClick={handleDeclineInvite}
                    >
                      {declineBusy ? 'Declining…' : 'Decline'}
                    </button>
                    <button
                      type="button"
                      className="profile-primary-btn"
                      disabled={acceptBusy}
                      onClick={handleAcceptInvite}
                    >
                      {acceptBusy ? 'Joining…' : 'Accept invite'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="thread-banner-content">
                  <p>
                    Waiting for <strong>{pendingInviteLabel || 'invited teammates'}</strong> to accept their invites.
                  </p>
                </div>
              )}
            </div>
          )}

          {threadActionFeedback && <p className="thread-action-feedback">{threadActionFeedback}</p>}

          <form className="thread-composer" onSubmit={handleSendMessage} aria-disabled={composerDisabled}>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFilesSelected}
            />
            <div className="composer-actions">
              <button
                type="button"
                aria-label="Attach file"
                onClick={handleAttachClick}
                disabled={composerDisabled}
              >
                <Paperclip size={18} aria-hidden="true" />
              </button>
              {/* <button type="button" aria-label="Insert image" disabled>
                <Image size={18} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Add emoji" disabled>
                <Smile size={18} aria-hidden="true" />
              </button> */}
            </div>
            {composerFiles.length > 0 && (
              <div className="composer-attachment-preview">
                {composerFiles.map((item) => (
                  <span className="composer-attachment-chip" key={item.id}>
                    {item.file.name}
                    <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => handleRemovePendingFile(item.id)}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder={composerPlaceholder}
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              disabled={composerDisabled}
            />
            <button
              type="submit"
              className="thread-send"
              aria-label="Send message"
              disabled={composerDisabled || !composerHasPayload}
            >
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

export default FreelancerMessages

const getPartnerSnapshot = (thread, userId) => {
  if (!thread) {
    return { name: 'Conversation', initials: 'SL' }
  }
  if (isGroupThread(thread)) {
    const groupName = thread.metadata?.group?.name || thread.subject || thread.gigTitle || 'Project chat'
    return { name: groupName, initials: getInitials(groupName) }
  }
  if (thread.partnerName) {
    return { name: thread.partnerName, initials: getInitials(thread.partnerName) }
  }
  if (thread.participantsInfo) {
    const entries = Object.entries(thread.participantsInfo)
    const other = entries.find(([participantId]) => participantId !== userId)
    if (other) {
      const payload = other[1]
      const label = payload?.displayName || payload?.name || 'Conversation'
      return { name: label, initials: getInitials(label) }
    }
  }
  if (Array.isArray(thread.participants)) {
    const partner = thread.participants.find((participantId) => participantId !== userId)
    if (partner) {
      return { name: partner, initials: getInitials(partner) }
    }
  }
  const fallback = thread.subject || thread.gigTitle || 'Conversation'
  return { name: fallback, initials: getInitials(fallback) }
}

const getInitials = (value) => {
  if (!value) return 'SL'
  const parts = value.trim().split(' ').filter(Boolean)
  if (!parts.length) return 'SL'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

const formatListTimestamp = (value) => {
  const date = toDateValue(value)
  if (!date) return ''
  const now = new Date()
  const sameDay = now.toDateString() === date.toDateString()
  return new Intl.DateTimeFormat('en-NG', sameDay ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' }).format(
    date,
  )
}

const formatMessageTimestamp = (value) => {
  const date = toDateValue(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' }).format(date)
}

const isThreadUnread = (thread, userId) => {
  if (!thread) return false
  const updatedAt = toDateValue(thread.updatedAt)
  const readAt = toDateValue(thread.readBy?.[userId])
  if (!updatedAt) return false
  if (!readAt) return true
  return readAt.getTime() < updatedAt.getTime()
}

const toDateValue = (value) => {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
