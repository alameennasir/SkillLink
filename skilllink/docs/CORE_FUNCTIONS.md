**Core Functions — Quick Reference**

This document lists core functionalities in the SkillLink codebase, what they do, and where to find them.

- **Firestore / Data layer**: src/services/firestoreClient.js
  - fetchClientDashboardData: gather gigs, applicant counts, reminders, activity, spotlight users for client dashboard.
  - saveGigDraft / upsertGigDraft: create or update gig draft documents in `gigs` collection.
  - subscribeToClientGigs: real-time listener for a client's gigs and per-gig application count listeners.
  - updateGigStatus / deleteGig: update gig metadata or delete a gig and mark related applications/proposals.
  - fetchUserProfile / fetchFreelancerProfile: read a user's profile from `users/{uid}`.
  - findUserByEmail: search `users` by email.
  - setAccountBlockStatus: mark accounts blocked/unblocked and update block metadata.
  - requestVerificationReview / fetchVerificationRequests / updateUserVerificationStatus: verification request lifecycle for NIN verification.
  - upsertFreelancerProposal / fetchFreelancerProposal / fetchFreelancerProposals / mirrorProposalToGigApplication: manage freelancer proposals and mirror them into gig application subcollections.
  - subscribeToOpenGigs / fetchGigById / searchFreelancers: public searching and listing helpers for gigs and freelancers.
  - subscribeToGigApplications / subscribeToGigApplicant / updateGigApplicantInterviewLink / updateGigApplicantStatus: application-level listeners and actions for interview/status updates.
  - Messaging & threads: subscribeToUserThreads, subscribeToThreadMessages, markThreadAsRead, sendThreadMessage, createMessagingThread — create and manage threaded messages and attachments.
  - Project groups: fetchProjectGroupChats, createProjectGroupChat, inviteFreelancerToProjectGroup, fetchProjectGroupInvites, acceptProjectGroupInvite, declineProjectGroupInvite, leaveProjectGroup, deleteProjectGroup — group chat lifecycle and thread linkage.

- **Firebase client init**: src/services/firebaseClient.js
  - getFirestoreClient / isFirebaseConfigured / requireFirebaseConfig: initialize and expose Firestore client; guard helpers used across services.

- **Auth & account actions**: src/services/authService.js
  - signIn / signOut / register / refreshToken (or similarly named): handle authentication flows and token/session management. (Open the file to inspect exported helpers.)

- **Storage helpers**: src/services/storageClient.js
  - uploadThreadAttachment: uploads files used by messaging; used by `sendThreadMessage` to attach files to messages.

- **React context / auth state**: src/context/AuthContext.jsx
  - Provides `AuthContext` and `AuthProvider` for current user, auth state, and convenience methods (login/logout, token refresh). Components use this to gate routes and show user-specific data.

- **Route protection**: src/components/ProtectedRoute.jsx
  - Wraps route components and redirects unauthenticated users to login; may also check roles/permissions.

- **Major route components** (pages to study for UI ↔ data interactions): src/routes/
  - ClientDashboard.jsx, FreelancerDashboard.jsx: pages that consume many of the data helpers in `firestoreClient`.
  - ClientPostGig.jsx, ClientManageGigs.jsx, ClientGigApplicants.jsx: gig creation, editing, and applicant management flows.
  - FreelancerMyGigs.jsx, FreelancerMyProposals.jsx, FreelancerOpportunities.jsx: proposal and gig discovery flows for freelancers.
  - Messaging routes: ClientMessages.jsx, FreelancerMessages.jsx: components that use thread/message subscription functions.

Tips for studying the code:
- Start with `src/services/firebaseClient.js` to understand how Firestore is initialized and guarded.
- Read `src/services/firestoreClient.js` next — it's the central place for reading/updating app data and contains many small helper utilities (normalizers, snapshot builders, mirror syncing logic).
- Open `src/context/AuthContext.jsx` to see how auth state is provided to UI; this reveals how user IDs are passed into service functions.
- Review `src/components/ProtectedRoute.jsx` and the main pages in `src/routes/` to follow how service helpers are consumed in the UI.

If you'd like, I can:
- Add inline comments inside selected files (e.g., `firestoreClient.js`) highlighting each function's purpose and example usage.
- Annotate additional files you care about (pick a small set first).

File locations referenced above:
- [src/services/firestoreClient.js](src/services/firestoreClient.js)
- [src/services/firebaseClient.js](src/services/firebaseClient.js)
- [src/services/authService.js](src/services/authService.js)
- [src/services/storageClient.js](src/services/storageClient.js)
- [src/context/AuthContext.jsx](src/context/AuthContext.jsx)
- [src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx)
- [src/routes/ClientDashboard.jsx](src/routes/ClientDashboard.jsx)
- [src/routes/FreelancerDashboard.jsx](src/routes/FreelancerDashboard.jsx)

---
Generated: concise guide for studying core code (ask to expand inline comments).
