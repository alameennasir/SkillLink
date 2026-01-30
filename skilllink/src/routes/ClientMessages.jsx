import { useEffect, useMemo, useRef, useState } from 'react'
import { Image, Paperclip, Search, Send, Smile, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  acceptProjectGroupInvite,
  createProjectGroupChat,
  declineProjectGroupInvite,
  deleteProjectGroup,
  deleteThreadForEveryone,
  hideThreadForUser,
  inviteFreelancerToProjectGroup,
  leaveMessagingThread,
  leaveProjectGroup,
  markThreadAsRead,
  sendThreadMessage,
  subscribeToThreadMessages,
  subscribeToUserThreads,
} from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'
import { deriveGroupContext, formatMemberList, isGroupThread, isThreadVisibleToUser } from './messagesUtils'

const ClientMessages = () => {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [threads, setThreads] = useState([])
  const [threadStatus, setThreadStatus] = useState(isFirebaseConfigured ? 'idle' : 'error')
  const [threadError, setThreadError] = useState(
    isFirebaseConfigured ? null : new Error('Connect Firebase (.env) to sync client conversations.'),
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
  const [showGroupWizard, setShowGroupWizard] = useState(false)
  const [groupWizardStep, setGroupWizardStep] = useState(1)
  const [groupWizardSearch, setGroupWizardSearch] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState([])
  const [groupWizardName, setGroupWizardName] = useState('')
  const [groupWizardSummary, setGroupWizardSummary] = useState('')
  const [groupWizardFeedback, setGroupWizardFeedback] = useState('')
  const [groupWizardMode, setGroupWizardMode] = useState('create')
  const [groupWizardTargetGroupId, setGroupWizardTargetGroupId] = useState(null)
  const [blockedContactIds, setBlockedContactIds] = useState([])
  const [groupWizardStatus, setGroupWizardStatus] = useState('idle')
  const [threadAction, setThreadAction] = useState(null)
  const [threadActionFeedback, setThreadActionFeedback] = useState('')
  const [threadView, setThreadView] = useState('all')
  const fileInputRef = useRef(null)
  const isClient = user?.role === 'client'

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
    if ((fallback?.id || null) !== activeThreadId) {
      setActiveThreadId(fallback ? fallback.id : null)
    }
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
  const contacts = useMemo(() => {
    const directThreads = visibleThreads.filter((thread) => !isGroupThread(thread))
    if (!directThreads.length) return []
    const map = new Map()
    directThreads.forEach((thread) => {
      const partner = getPartnerSnapshot(thread, user?.uid)
      if (!partner?.id || map.has(partner.id)) return
      map.set(partner.id, {
        id: partner.id,
        name: partner.name,
        initials: partner.initials,
        context: thread.gigTitle || thread.subject || 'Conversation',
      })
    })
    return Array.from(map.values())
  }, [visibleThreads, user?.uid])

  const contactMap = useMemo(() => {
    const map = new Map()
    contacts.forEach((contact) => {
      if (contact?.id) {
        map.set(contact.id, contact)
      }
    })
    return map
  }, [contacts])

  const filteredContacts = useMemo(() => {
    const normalized = groupWizardSearch.trim().toLowerCase()
    const blockedIds = Array.isArray(blockedContactIds) ? blockedContactIds : []
    return contacts.filter((contact) => {
      if (!contact?.id || blockedIds.includes(contact.id)) return false
      if (!normalized) return true
      return (
        contact.name.toLowerCase().includes(normalized) ||
        contact.context?.toLowerCase().includes(normalized)
      )
    })
  }, [contacts, groupWizardSearch, blockedContactIds])

  const selectedContactDetails = useMemo(
    () => selectedContactIds.map((id) => contactMap.get(id)).filter(Boolean),
    [selectedContactIds, contactMap],
  )
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
  const isInviteMode = groupWizardMode === 'invite'

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

  const handleOpenGroupWizard = (mode = 'create') => {
    setGroupWizardMode(mode)
    setShowGroupWizard(true)
    setGroupWizardStatus('idle')
    setGroupWizardStep(1)
    setSelectedContactIds([])
    setGroupWizardSearch('')
    setGroupWizardName('')
    setGroupWizardSummary('')
    setGroupWizardFeedback('')
    setBlockedContactIds(mode === 'invite' ? groupContext.restrictedContactIds || [] : [])
    setGroupWizardTargetGroupId(mode === 'invite' ? groupContext.groupId : null)
  }

  const handleCloseGroupWizard = () => {
    if (groupWizardStatus === 'loading') return
    setShowGroupWizard(false)
    setGroupWizardFeedback('')
    setGroupWizardStep(1)
    setGroupWizardMode('create')
    setGroupWizardTargetGroupId(null)
    setBlockedContactIds([])
  }

  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((current) =>
      current.includes(contactId) ? current.filter((id) => id !== contactId) : [...current, contactId],
    )
  }

  const handleGroupWizardNext = () => {
    if (!groupWizardName.trim()) {
      setGroupWizardName(buildDefaultGroupName(selectedContactDetails))
    }
    setGroupWizardFeedback('')
    setGroupWizardStep(2)
  }

  const handleGroupWizardBack = () => {
    setGroupWizardStep(1)
    setGroupWizardFeedback('')
  }

  const handleGroupWizardCreate = async () => {
    if (!isClient || !user?.uid) {
      setGroupWizardFeedback('Only client accounts can create project group chats.')
      return
    }
    const trimmedName = groupWizardName.trim()
    if (!trimmedName) {
      setGroupWizardFeedback('Name your project group before creating it.')
      return
    }
    setGroupWizardStatus('loading')
    setGroupWizardFeedback('')
    try {
      await createProjectGroupChat({
        clientId: user.uid,
        clientName: user.displayName || user.email || 'Client',
        name: trimmedName,
        summary: groupWizardSummary.trim(),
        freelancerIds: selectedContactIds,
      })
      setShowGroupWizard(false)
      setGroupWizardStep(1)
      setGroupWizardSearch('')
      setSelectedContactIds([])
      setGroupWizardName('')
      setGroupWizardSummary('')
      setGroupWizardMode('create')
      setGroupWizardTargetGroupId(null)
      setBlockedContactIds([])
    } catch (error) {
      setGroupWizardFeedback(error?.message || 'Unable to create the project group right now.')
    } finally {
      setGroupWizardStatus('idle')
    }
  }

  const handleInviteFreelancers = async () => {
    if (!isClient || !user?.uid) {
      setGroupWizardFeedback('Only client accounts can manage project group invites.')
      return
    }
    if (!groupWizardTargetGroupId) {
      setGroupWizardFeedback('Open an existing group chat to send invites.')
      return
    }
    if (!selectedContactIds.length) {
      setGroupWizardFeedback('Select at least one freelancer to continue.')
      return
    }
    setGroupWizardStatus('loading')
    setGroupWizardFeedback('')
    try {
      await inviteFreelancerToProjectGroup({
        groupId: groupWizardTargetGroupId,
        clientId: user.uid,
        freelancerIds: selectedContactIds,
      })
      setShowGroupWizard(false)
      setGroupWizardStep(1)
      setSelectedContactIds([])
      setGroupWizardSearch('')
      setGroupWizardMode('create')
      setGroupWizardTargetGroupId(null)
      setBlockedContactIds([])
    } catch (error) {
      setGroupWizardFeedback(error?.message || 'Unable to send group invites right now.')
    } finally {
      setGroupWizardStatus('idle')
    }
  }

  const handleGroupWizardSubmit = (event) => {
    event.preventDefault()
    if (isInviteMode) {
      handleInviteFreelancers()
      return
    }
    if (groupWizardStep === 1) {
      handleGroupWizardNext()
      return
    }
    handleGroupWizardCreate()
  }

  const handleAcceptInvite = async () => {
    if (!groupContext.groupId || !user?.uid) return
    setThreadAction('accept')
    setThreadActionFeedback('')
    try {
      await acceptProjectGroupInvite({ groupId: groupContext.groupId, freelancerId: user.uid })
      setThreadActionFeedback('Invite accepted. You can start chatting now.')
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
      setThreadActionFeedback('Conversation removed from your list.')
      setActiveThreadId((current) => (current === activeThreadId ? null : current))
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
      setThreadActionFeedback('You left the group. The thread will disappear shortly.')
      setActiveThreadId(null)
    } catch (error) {
      setThreadActionFeedback(error?.message || 'Unable to leave the group right now.')
    } finally {
      setThreadAction(null)
    }
  }

  const handleDeleteThreadForEveryone = async () => {
    if (!activeThreadId || !user?.uid) return
    setThreadAction('deleteForEveryone')
    setThreadActionFeedback('')
    try {
      await deleteThreadForEveryone({ threadId: activeThreadId, performedBy: user.uid })
      if (groupContext.groupId) {
        await deleteProjectGroup({ groupId: groupContext.groupId, performedBy: user.uid })
      }
      setThreadActionFeedback('Conversation deleted for everyone.')
      setActiveThreadId(null)
    } catch (error) {
      setThreadActionFeedback(error?.message || 'Unable to delete the conversation right now.')
    } finally {
      setThreadAction(null)
    }
  }

  const sidebarEmptyCopy = !isFirebaseConfigured
    ? 'Add Firebase credentials to populate conversations from Firestore.'
    : 'No conversations yet. Message a freelancer from any proposal to get started.'
  const composerHasPayload = Boolean(composer.trim()) || composerFiles.length > 0
  const composerDisabled = !activeThread || sending || !isFirebaseConfigured || viewerInvitePending
  const composerPlaceholder = !isFirebaseConfigured
    ? 'Configure Firebase to enable messaging'
    : !activeThread
      ? 'Select a thread to start typing'
      : viewerInvitePending
        ? 'Accept the invite to start chatting'
        : 'Send a message'
  const wizardTitle = isInviteMode ? 'Invite freelancers' : 'New group'
  const wizardIntroCopy = isInviteMode
    ? 'Invite freelancers from recent chats. Current members and pending invites stay hidden.'
    : 'Select freelancers from recent conversations (optional). You can add teammates after the group launches.'
  const wizardPrimaryDisabled = isInviteMode
    ? selectedContactIds.length === 0 || groupWizardStatus === 'loading' || !isFirebaseConfigured
    : groupWizardStep === 1
      ? groupWizardStatus === 'loading' || !isFirebaseConfigured
      : groupWizardStatus === 'loading' || !groupWizardName.trim() || !isFirebaseConfigured
  const wizardPrimaryLabel = isInviteMode
    ? groupWizardStatus === 'loading'
      ? 'Sending…'
      : 'Send invites'
    : groupWizardStep === 1
      ? 'Next'
      : groupWizardStatus === 'loading'
        ? 'Creating…'
        : 'Create group'
  const threadDisplayName = groupContext.isGroup ? groupContext.name : activePartnerSnapshot.name
  const threadSubtitle = groupContext.isGroup
    ? activeMemberLabel
    : activeThread?.gigTitle || activeThread?.subject || 'SkillLink conversation'
  const threadAvatarInitials = groupContext.isGroup ? getInitials(groupContext.name) : activePartnerSnapshot.initials
  const acceptBusy = threadAction === 'accept'
  const declineBusy = threadAction === 'decline'
  const deleteForMeBusy = threadAction === 'deleteForMe'
  const exitGroupBusy = threadAction === 'exitGroup'
  const deleteEveryoneBusy = threadAction === 'deleteForEveryone'

  return (
    <div className="client-page">
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
              placeholder="Search freelancers or gigs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!visibleThreads.length}
            />
          </label>

          {isClient && (
            <button type="button" className="messages-new-group-btn" onClick={handleOpenGroupWizard}>
              <Users size={16} aria-hidden="true" /> New project group
            </button>
          )}

          {threadError ? (
            <div className="messages-thread-placeholder">
              <p>{threadError.message}</p>
            </div>
          ) : threadStatus === 'loading' ? (
            <div className="messages-thread-placeholder">
              <p>Loading threads…</p>
              <small>Syncing chats from Firestore.</small>
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
                            {thread.lastMessage || 'Start the conversation'}
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
                  {groupContext.canInvite && (
                    <button
                      type="button"
                      className="thread-icon-btn"
                      aria-label="Add freelancers"
                      onClick={() => handleOpenGroupWizard('invite')}
                    >
                      <UserPlus size={16} aria-hidden="true" />
                    </button>
                  )}
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
                  <strong>Select a thread</strong>
                  <p>Chats will appear here.</p>
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
                <p>Select a thread to review chats with freelancers.</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="thread-empty-state">
                <p>No messages yet.</p>
                <small>Send a quick brief overview to get the freelancer talking.</small>
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
                    Waiting for <strong>{pendingInviteLabel || 'invited freelancers'}</strong> to accept the invite.
                  </p>
                  <button type="button" className="profile-ghost-btn" onClick={() => handleOpenGroupWizard('invite')}>
                    Manage invites
                  </button>
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

        {showGroupWizard && (
          <>
            <button
              type="button"
              className="group-wizard-backdrop"
              aria-label="Close group creation"
              onClick={handleCloseGroupWizard}
            />
            <div
              className="group-wizard-panel"
              role="dialog"
              aria-modal="true"
              aria-label={isInviteMode ? 'Manage project group invites' : 'Create project group chat'}
            >
              <div className="group-wizard-head">
                <div>
                  <p className="group-wizard-eyebrow">Project chat</p>
                  <h3>{wizardTitle}</h3>
                </div>
                <button type="button" aria-label="Close" onClick={handleCloseGroupWizard}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              {!isInviteMode && (
                <div className="group-wizard-stepper" aria-label="Group creation progress">
                  <span className={groupWizardStep === 1 ? 'is-active' : ''}>1</span>
                  <span className={groupWizardStep === 2 ? 'is-active' : ''}>2</span>
                </div>
              )}

              <form className="group-wizard-body" onSubmit={handleGroupWizardSubmit}>
                {groupWizardStep === 1 ? (
                  <>
                    <p className="group-wizard-copy">{wizardIntroCopy}</p>
                    <label className="messages-search group-wizard-search">
                      <Search size={16} aria-hidden="true" />
                      <input
                        type="search"
                        placeholder="Search freelancers"
                        value={groupWizardSearch}
                        onChange={(event) => setGroupWizardSearch(event.target.value)}
                      />
                    </label>

                    <div className="group-contact-list-shell" role="listbox" aria-label="Select freelancers">
                      {filteredContacts.length === 0 ? (
                        <p className="group-wizard-empty">
                          {contacts.length === 0
                            ? 'No recent freelancer chats yet. You can continue without adding anyone.'
                            : 'No matches for that search.'}
                        </p>
                      ) : (
                        <ul className="group-wizard-contact-list">
                          {filteredContacts.map((contact) => {
                            const isSelected = selectedContactIds.includes(contact.id)
                            return (
                              <li key={contact.id}>
                                <label className={`group-contact ${isSelected ? 'is-selected' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleContactSelection(contact.id)}
                                  />
                                  <div className="thread-avatar" aria-hidden="true">
                                    {contact.initials}
                                  </div>
                                  <div>
                                    <strong>{contact.name}</strong>
                                    <small>{contact.context}</small>
                                  </div>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </>
                ) : !isInviteMode ? (
                  <>
                    <p className="group-wizard-copy">Give this crew a name so everyone knows the mission.</p>
                    <div className="group-wizard-chips" aria-label="Selected freelancers">
                      {selectedContactDetails.map((contact) => (
                        <span key={contact.id}>{contact.name}</span>
                      ))}
                    </div>
                    <label className="group-wizard-field">
                      <span>Group subject</span>
                      <input
                        type="text"
                        placeholder="e.g., Lagos fintech rollout"
                        value={groupWizardName}
                        onChange={(event) => setGroupWizardName(event.target.value)}
                      />
                    </label>
                    <label className="group-wizard-field">
                      <span>Summary (optional)</span>
                      <textarea
                        rows={3}
                        placeholder="Add context, deliverables, or handoff notes."
                        value={groupWizardSummary}
                        onChange={(event) => setGroupWizardSummary(event.target.value)}
                      />
                    </label>
                  </>
                ) : null}

                {groupWizardFeedback && <p className="group-wizard-feedback">{groupWizardFeedback}</p>}

                <div className="group-wizard-actions">
                  {groupWizardStep === 2 && !isInviteMode && (
                    <button
                      type="button"
                      className="profile-ghost-btn"
                      onClick={handleGroupWizardBack}
                      disabled={groupWizardStatus === 'loading'}
                    >
                      Back
                    </button>
                  )}
                  <button type="submit" className="profile-primary-btn" disabled={wizardPrimaryDisabled}>
                    {wizardPrimaryLabel}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export default ClientMessages

const buildDefaultGroupName = (contacts) => {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return 'Project group'
  }
  const firstNames = contacts
    .map((contact) => {
      if (!contact?.name) return null
      const [first] = contact.name.split(' ').filter(Boolean)
      return first || contact.name
    })
    .filter(Boolean)
  if (firstNames.length === 0) return 'Project group'
  if (firstNames.length === 1) return `${firstNames[0]} project chat`
  if (firstNames.length === 2) return `${firstNames[0]} & ${firstNames[1]}`
  return `${firstNames[0]}, ${firstNames[1]} +${firstNames.length - 2}`
}

const getPartnerSnapshot = (thread, userId) => {
  if (!thread) {
    return { id: null, name: 'Conversation', initials: 'SL' }
  }

  if (isGroupThread(thread)) {
    const groupName = thread.metadata?.group?.name || thread.subject || thread.gigTitle || 'Project chat'
    return { id: thread.groupId || thread.projectGroupId || thread.metadata?.group?.id || null, name: groupName, initials: getInitials(groupName) }
  }

  let partnerId = thread.partnerId || null

  if (thread.participantsInfo) {
    const entries = Object.entries(thread.participantsInfo)
    const other = entries.find(([participantId]) => participantId !== userId)
    if (other) {
      partnerId = other[0]
      const payload = other[1]
      const label = payload?.displayName || payload?.name || thread.partnerName || 'Conversation'
      return { id: partnerId, name: label, initials: getInitials(label) }
    }
  }

  if (Array.isArray(thread.participants)) {
    const partner = thread.participants.find((participantId) => participantId !== userId)
    if (partner) {
      partnerId = partner
    } else if (!partnerId && thread.participants.length) {
      partnerId = thread.participants[0]
    }
  }

  const fallback = thread.partnerName || thread.subject || thread.gigTitle || 'Conversation'
  return { id: partnerId, name: fallback, initials: getInitials(fallback) }
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
