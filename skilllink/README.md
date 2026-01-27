# SkillLink Relaunch (React + Vite)

SkillLink is being rebuilt as a React + Firebase platform that helps Nigerian youth publish portfolios, match with gigs, and collaborate with clients under admin oversight. This repository holds the Vite workspace plus a living requirements brief (`requirements.md`) that captures the vision, roles, functional pillars, and data expectations.

## Project Snapshot

- **Tech stack:** React 18, Vite, Context API, Tailwind-style tokens (to be added), Firebase Auth/Firestore/Storage.
- **Core journeys:** Freelancer onboarding + workspace, Client gig management, Admin verification/moderation.
- **Functional pillars:** Authentication, Public marketing pages, Freelancer workspace, Client workspace, Messaging, Admin tooling, and a shared UI system.
- **Design direction:** Token-driven UI with reusable components (Cards, Pills, Tabs, Stat tiles) to keep surfaces cohesive across roles.

## Getting Started

```bash
npm install
npm run dev
```

Use `npm run build` for production bundles and `npm run preview` to inspect the output locally.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | High-level product brief rendered in the browser. |
| `src/App.css` + `src/index.css` | Visual system with gradients, cards, and typography tokens. |
| `requirements.md` | Canonical requirements, open questions, and data model expectations. |
| `.github/copilot-instructions.md` | Checklist that tracks scaffolding → customization → launch readiness. |

## Next Steps

1. Wire Firebase configuration via `.env` values (`VITE_FIREBASE_*`) and guard routes per role.
2. Stand up Tailwind/PostCSS tooling or port equivalent design tokens into `styles/tokens.css`.
3. Begin implementing flows per pillar (onboarding wizard, gig CRUD, messaging, admin dashboards).
4. Decide on deployment target (Firebase Hosting vs Vercel) and CI/CD expectations.

## Authentication Quickstart

- Provide all required `VITE_FIREBASE_*` values inside `.env.local` before running the app. The workspace no longer includes mock accounts.
- Once Firebase Auth + Firestore are configured, visit `/auth/register` to create a freelancer or `/auth/login` for returning users.
- Newly registered freelancers land in `/freelancer/profile` so they can complete onboarding, portfolios, and verification steps tailored to Nigerian youth talent.

## Local Portfolio Upload Mock

If you want to test the freelancer portfolio flow without enabling Firebase Storage billing, add the flag below to your `.env.local`:

```bash
VITE_USE_LOCAL_PORTFOLIO_MOCK=true
```

With the mock enabled, uploaded media is stored inside the browser's IndexedDB and referenced with `local-portfolio://` URLs. These files only exist on the current device and will clear if you wipe browser storage, but they unblock the drag-and-drop UI without incurring cloud costs.
