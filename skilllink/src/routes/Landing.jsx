import { ArrowRight, BadgeCheck, Briefcase, Shield, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

const Landing = () => {
  return (
    <div className="landing-shell">
      <header className="landing-hero">
        <p className="landing-pill">Nigerian talent x verified work</p>
        <h1>
          Build once. <span>Hire fast.</span>
        </h1>
        <p className="landing-subtitle">
          SkillLink is the shared workspace where clients post serious projects and independent freelancers get
          matched, onboarded, and paid without email ping-pong.
        </p>

        <div className="landing-actions">
          <Link to="/auth/register" className="cta cta-primary">
            Get started
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/auth/login" className="cta cta-secondary">
            Login
          </Link>
        </div>

        <div className="landing-meta">
          <span>One sign up for clients and freelancers</span>
          <span>Role-aware dashboards after login</span>
        </div>
      </header>

      <section className="landing-grid">
        <article className="landing-card">
          <div className="landing-card-icon landing-card-icon-primary">
            <Briefcase size={24} aria-hidden="true" />
          </div>
          <h3>Post and manage gigs</h3>
          <p>Create rich briefs, review applicants, and keep hiring velocity high from a single dashboard.</p>
        </article>

        <article className="landing-card">
          <div className="landing-card-icon landing-card-icon-secondary">
            <Users size={24} aria-hidden="true" />
          </div>
          <h3>Verified freelancer network</h3>
          <p>Curated profiles with proof-of-work, rates, and readiness signals to remove guesswork.</p>
        </article>

        <article className="landing-card">
          <div className="landing-card-icon landing-card-icon-tertiary">
            <Shield size={24} aria-hidden="true" />
          </div>
          <h3>Secure collaboration</h3>
          <p>Unified messaging, attachments, and moderation so both sides ship work without worrying about trust.</p>
        </article>
      </section>

      <section className="landing-cta">
        <div>
          <BadgeCheck size={28} aria-hidden="true" />
          <h2>Ready to plug into SkillLink?</h2>
          <p>Spin up your workspace in minutes. Choose a role during signup and unlock the right onboarding path.</p>
        </div>
        <div className="landing-cta-actions">
          <Link to="/auth/register" className="cta cta-primary">
            Create account
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/auth/login" className="cta cta-secondary">
            I already have access
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Landing
