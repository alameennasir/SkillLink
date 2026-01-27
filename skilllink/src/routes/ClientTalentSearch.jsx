import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, MapPin, ExternalLink, ChevronDown, Linkedin, Twitter, Dribbble, Languages } from 'lucide-react'
import { searchFreelancers } from '../services/firestoreClient'
import { isFirebaseConfigured } from '../services/firebaseClient'

const filterButtons = ['All Talent', 'Categories', 'Hourly Rate']

const sortOptions = [
  { id: 'relevant', label: 'Most Relevant' },
  { id: 'recent', label: 'Most Recent' },
  { id: 'rating', label: 'Highest Rated' },
]

const footerLinkGroups = [
  {
    title: 'Platform',
    links: [
      { label: 'Client Dashboard', to: '/' },
      { label: 'Manage Gigs', to: '/client/manage-gigs' },
      { label: 'Post a Gig', to: '/client/post-gig' },
      { label: 'Find Talent', to: '/client/talent-search' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help Center', href: '#' },
      { label: 'Community', href: '#' },
      { label: 'Guides', href: '#' },
      { label: 'Blog', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '#' },
      { label: 'Terms of Service', href: '#' },
      { label: 'Cookie Policy', href: '#' },
      { label: 'Security', href: '#' },
    ],
  },
]

const footerSocialLinks = [
  { label: 'LinkedIn', icon: Linkedin, href: 'https://linkedin.com/company/skilllink' },
  { label: 'Twitter', icon: Twitter, href: 'https://twitter.com/skilllink' },
  { label: 'Dribbble', icon: Dribbble, href: 'https://dribbble.com/skilllink' },
]

const ClientTalentSearch = () => {
  const [query, setQuery] = useState('')
  const [sortSelection, setSortSelection] = useState('relevant')
  const [talent, setTalent] = useState([])
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'error')
  const [error, setError] = useState(
    isFirebaseConfigured ? null : new Error('Provide Firebase credentials to surface real Nigerian talent.'),
  )

  const activeSortLabel = useMemo(
    () => sortOptions.find((option) => option.id === sortSelection)?.label ?? 'Most Relevant',
    [sortSelection],
  )

  useEffect(() => {
    if (!isFirebaseConfigured) return
    let active = true
    const load = async () => {
      setStatus('loading')
      setError(null)
      try {
        const results = await searchFreelancers({ limit: 48, verifiedOnly: true })
        if (active) {
          setTalent(results)
          setStatus('ready')
        }
      } catch (err) {
        if (active) {
          setError(err)
          setStatus('error')
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const filteredTalent = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return talent
    return talent.filter((person) => {
      const searchable = [person.displayName, person.fullName, person.title, person.focusArea, ...(person.skills || [])]
      return searchable.some((value) => value?.toLowerCase().includes(normalizedQuery))
    })
  }, [talent, query])

  const handleSubmit = (event) => {
    event.preventDefault()
    // Future enhancement: hook into Firestore search.
  }

  return (
    <div className="talent-page">
      <header className="talent-hero">
        <p className="eyebrow">Find Talent</p>
        <h1>Discover Creative Talent</h1>
        <p className="talent-hero-copy">
          Source verified Nigerian designers, engineers, and storytellers. Every profile is reviewed before landing in
          your shortlist.
        </p>
        <form className="talent-search-bar" onSubmit={handleSubmit} role="search">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search for creative talent, skills, or roles"
            aria-label="Search for creative talent"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
        <div className="talent-filter-row">
          <div className="talent-filter-group">
            {filterButtons.map((label, index) => (
              <button type="button" className={`talent-filter ${index === 0 ? 'talent-filter-active' : ''}`} key={label}>
                {label}
                {index > 0 && <ChevronDown size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="talent-sort">
            <span>Sort:</span>
            <button type="button" className="talent-sort-pill" onClick={() => setSortSelection('relevant')}>
              {activeSortLabel} <ChevronDown size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <section className="talent-results">
        {error ? (
          <div className="talent-empty">
            <h3>Firebase setup required</h3>
            <p>{error.message}</p>
          </div>
        ) : status === 'loading' ? (
          <div className="talent-empty">
            <h3>Loading verified freelancers…</h3>
            <p>Give us a moment to sync portfolios from Firestore.</p>
          </div>
        ) : filteredTalent.length === 0 ? (
          <div className="talent-empty">
            <h3>No profiles match your filters</h3>
            <p>Try adjusting your search or inviting freelancers to complete verification.</p>
          </div>
        ) : (
          <>
            <p className="results-count">{filteredTalent.length} profiles match your search</p>
            <div className="talent-grid">
              {filteredTalent.map((person) => (
                <article className="talent-profile-card" key={person.id}>
              <div className="talent-card-header">
                <div className="talent-avatar" aria-hidden="true">
                      {(person.displayName || person.fullName || 'SL').charAt(0)}
                </div>
                <div>
                      <h3>{person.displayName || person.fullName || 'Unnamed talent'}</h3>
                      <p className="talent-headline">{person.title || 'Add professional title'}</p>
                </div>
              </div>
              <div className="talent-card-body">
                <div className="talent-tags">
                      {(person.skills || []).slice(0, 4).map((skill) => (
                        <span className="talent-tag" key={`${person.id}-${skill}`}>
                      {skill}
                    </span>
                  ))}
                </div>
                <div className="talent-meta-info">
                  <div>
                    <span>Rate</span>
                        <strong>{person.rate || 'Share budget range'}</strong>
                  </div>
                  <div>
                    <span>Location</span>
                    <p>
                          <MapPin size={15} aria-hidden="true" /> {person.location || 'Nigeria (remote)'}
                    </p>
                  </div>
                  <div>
                    <span>Languages</span>
                    <p>
                      <Languages size={15} aria-hidden="true" />{' '}
                      <span>
                        {Array.isArray(person.languages) && person.languages.filter(Boolean).length
                          ? person.languages.filter(Boolean).slice(0, 3).join(', ')
                          : 'Not shared'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="talent-card-actions">
                <button type="button" className="talent-ghost">
                  View Portfolio <ExternalLink size={16} aria-hidden="true" />
                </button>
              </div>
                </article>
              ))}
            </div>
            <button type="button" className="load-more">
              Load More Results <ChevronDown size={18} aria-hidden="true" />
            </button>
          </>
        )}
      </section>

      <div className="talent-footer-shell">
        <footer className="talent-footer">
          <div className="talent-footer-top">
          <div className="footer-brand-block">
            <div className="footer-brand-head">
              <div className="brand-logo" aria-hidden="true">
                SL
              </div>
              <div>
                <p>SkillLink</p>
                <small>Connecting world-class creative talent with forward-thinking teams.</small>
              </div>
            </div>
            <p className="footer-brand-copy">
              Commission curated talent across Nigeria and the global creative community with one streamlined workflow.
            </p>
            <div className="footer-contact">
              <span>Need help hiring?</span>
              <a href="mailto:teams@skilllink.africa">teams@skilllink.africa</a>
              <a href="tel:+2348000000000">+234 800 000 0000</a>
            </div>
          </div>
          {footerLinkGroups.map((group) => (
            <div className="footer-links" key={group.title}>
              <strong>{group.title}</strong>
              {group.links.map((link) =>
                link.to ? (
                  <Link to={link.to} className="footer-link" key={link.label}>
                    {link.label}
                  </Link>
                ) : (
                  <a href={link.href ?? '#'} className="footer-link" key={link.label}>
                    {link.label}
                  </a>
                )
              )}
            </div>
          ))}
            <div className="footer-cta-card">
              <strong>Ready to brief your next gig?</strong>
              <p>
                Outline deliverables, budgets, and timelines, then let SkillLink queue up curated talent in under 24 hours.
              </p>
              <button type="button">Post a New Gig</button>
            </div>
          </div>
          <div className="talent-footer-bottom">
            <p className="footer-legal">© 2024 SkillLink Inc. All rights reserved.</p>
            <div className="footer-socials">
              {footerSocialLinks.map(({ label, icon: Icon, href }) => (
                <a key={label} href={href} aria-label={label} target="_blank" rel="noreferrer">
                  <Icon size={16} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default ClientTalentSearch
