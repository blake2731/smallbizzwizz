import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'SmallBizzWizz',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'AI business advisor for small business owners and freelancers. Get direct, plain-English answers on pricing, contracts, clients, and hiring.',
  url: 'https://smallbizzwizz.com',
  offers: {
    '@type': 'Offer',
    price: '19',
    priceCurrency: 'USD',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      billingDuration: 'P1M',
    },
  },
  featureList: [
    'AI-powered business advice',
    'Contract review and red flag detection',
    'Pricing guidance for freelancers',
    'Client dispute resolution advice',
    'Hiring and firing guidance',
    'File and document upload support',
  ],
}

function Logomark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id="sbw-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e85b1f" />
          <stop offset="100%" stopColor="#a8350a" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill="url(#sbw-mark-grad)" />
      <path
        d="M8.5 23 L13.5 12 L18 19 L22.5 12 L27.5 23"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="28.5" cy="9" r="2.1" fill="#fff" />
    </svg>
  )
}

function Wordmark({ size = '1.1rem' }: { size?: string }) {
  return (
    <span
      style={{
        fontFamily: 'Georgia, serif',
        fontSize: size,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: '#0f0e0c',
        lineHeight: 1,
      }}
    >
      SmallBizz
      <span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
    </span>
  )
}

function CardIcon({ name }: { name: 'tag' | 'handshake' | 'doc' | 'chart' | 'user' | 'team' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'tag':
      return (
        <svg {...common}>
          <path d="M20.59 13.41 13 21a2 2 0 0 1-2.83 0L3 13.83V4a1 1 0 0 1 1-1h9.83l6.76 6.76a2 2 0 0 1 0 2.65z" />
          <circle cx="7.5" cy="7.5" r="1.2" />
        </svg>
      )
    case 'handshake':
      return (
        <svg {...common}>
          <path d="M11 17 8 14a2 2 0 0 1 0-2.83l3.59-3.59a2 2 0 0 1 2.83 0L17 10" />
          <path d="m17 10 3 3-3 3" />
          <path d="M3 13h4" />
          <path d="M14 17h7" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M8 13h6" />
          <path d="M8 17h8" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M7 21V10" />
          <path d="M12 21V4" />
          <path d="M17 21v-7" />
        </svg>
      )
    case 'user':
      return (
        <svg {...common}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'team':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
  }
}

const USE_CASES = [
  { icon: 'tag', title: 'Pricing', desc: 'Know what to charge — and how to raise rates without losing clients.' },
  { icon: 'handshake', title: 'Deals', desc: 'Read offers, partnerships, and acquisitions like a 20-year operator.' },
  { icon: 'doc', title: 'Contracts', desc: 'Spot red flags before you sign. Push back on the right clauses.' },
  { icon: 'chart', title: 'Cash flow', desc: 'Understand margins, when to spend, and when to hold tight.' },
  { icon: 'user', title: 'Clients', desc: 'Handle late payments, scope creep, and the talks you keep avoiding.' },
  { icon: 'team', title: 'Hiring', desc: 'When to hire, how to let go, and how to structure real pay.' },
] as const

export default async function HomePage() {
  const { userId } = await auth()
  if (userId) redirect('/chat')

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div
        style={{
          fontFamily: "'DM Sans', system-ui, -apple-system, Segoe UI, sans-serif",
          background: '#f7f4ef',
          color: '#0f0e0c',
          minHeight: '100vh',
        }}
      >
        {/* ─── Nav ─────────────────────────────────────────────────── */}
        <nav className="sbw-nav">
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              textDecoration: 'none',
            }}
            aria-label="SmallBizzWizz home"
          >
            <Logomark size={32} />
            <Wordmark />
          </Link>
          <div
            className="landing-nav-buttons"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Link href="/sign-in" className="sbw-link-ghost">
              Sign in
            </Link>
            <Link href="/sign-up" className="sbw-cta-sm">
              Get started
            </Link>
          </div>
        </nav>

        {/* ─── Hero ────────────────────────────────────────────────── */}
        <section className="sbw-hero">
          <div className="sbw-hero-mark">
            <Logomark size={64} />
          </div>

          <div className="sbw-eyebrow">
            <span className="sbw-eyebrow-dot" />
            AI advisor for small business owners
          </div>

          <h1 className="sbw-h1">
            Small business wisdom, <em>on tap.</em>
          </h1>

          <p className="sbw-sub">
            Direct, plain-English answers on pricing, contracts, clients, and hiring — built for owners
            and freelancers who&apos;d rather have an answer than a fifteen-bullet hedge.
          </p>

          <Link href="/sign-up" className="sbw-cta">
            Start your free trial
            <span className="sbw-cta-arrow">→</span>
          </Link>
          <p className="sbw-reassure">7 days free · Cancel anytime</p>
        </section>

        {/* ─── Chat preview ────────────────────────────────────────── */}
        <section style={{ maxWidth: '680px', margin: '0 auto', padding: '1rem 1.5rem 5rem' }}>
          <div className="sbw-preview">
            <div className="sbw-preview-bar">
              <span className="dot" style={{ background: '#e87060' }} />
              <span className="dot" style={{ background: '#f0c14b' }} />
              <span className="dot" style={{ background: '#7fc36a' }} />
              <span className="sbw-preview-url">smallbizzwizz.com/chat</span>
            </div>
            <div
              className="sbw-preview-body"
              style={{
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.9rem',
              }}
            >
              <div className="sbw-msg-user">
                My client hasn&apos;t paid in 60 days. What do I do?
              </div>
              <div className="sbw-msg-bot">
                Stop all work today — don&apos;t do another hour until this is resolved. Send a firm
                email with the invoice number, amount, and a 7-day deadline before you escalate to
                collections. Most clients pay at the first real consequence. If they don&apos;t,
                send the collections notice. The relationship is already damaged; being direct
                won&apos;t make it worse.
              </div>
              <div className="sbw-msg-user">A contractor wants 40% upfront. Is that normal?</div>
              <div className="sbw-msg-bot">
                Yes — 40–50% upfront is standard for contractors covering materials and time. If
                you&apos;re cautious, structure it 40 / 30 / 30: start, midpoint milestone,
                completion. Never pay 100% upfront.
              </div>
            </div>
          </div>
        </section>

        {/* ─── Use cases ───────────────────────────────────────────── */}
        <section
          style={{
            background: '#fff',
            borderTop: '1px solid #e4e0d8',
            borderBottom: '1px solid #e4e0d8',
            padding: '5rem 1.5rem',
          }}
        >
          <div style={{ maxWidth: '880px', margin: '0 auto' }}>
            <h2 className="sbw-section-h2">Ask anything about your business</h2>
            <p className="sbw-section-sub">
              Real expertise across the decisions owners face every day.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
              }}
            >
              {USE_CASES.map((item) => (
                <div key={item.title} className="sbw-card">
                  <div className="sbw-card-icon">
                    <CardIcon name={item.icon} />
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.98rem',
                      marginBottom: '0.35rem',
                      color: '#0f0e0c',
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.88rem', color: '#6b6760', lineHeight: 1.6 }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Why not ChatGPT ─────────────────────────────────────── */}
        <section
          style={{
            maxWidth: '700px',
            margin: '0 auto',
            padding: '5.5rem 1.5rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <h2 className="sbw-section-h2">Why not just use ChatGPT?</h2>
          <p
            style={{
              fontSize: '1.05rem',
              color: '#4a4740',
              lineHeight: 1.7,
              maxWidth: '560px',
              margin: '1rem auto 0',
            }}
          >
            Honestly? If you want to paste your industry, your situation, and{' '}
            <em>&ldquo;be direct, no hedging&rdquo;</em> into ChatGPT every single time — go for
            it. We&apos;ve already done that part. You just ask the question.
          </p>
        </section>

        {/* ─── Pricing ─────────────────────────────────────────────── */}
        <section
          style={{
            maxWidth: '500px',
            margin: '0 auto',
            padding: '4rem 1.5rem 5rem',
            textAlign: 'center',
          }}
        >
          <h2 className="sbw-section-h2">One plan. Everything in.</h2>
          <p className="sbw-section-sub">No tiers. No gotchas.</p>
          <div className="sbw-pricing-card">
            <div
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '3.2rem',
                fontWeight: 400,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: '#0f0e0c',
              }}
            >
              $19
              <span
                style={{
                  fontSize: '1rem',
                  color: '#8a8680',
                  fontFamily: 'inherit',
                  marginLeft: '0.25rem',
                }}
              >
                / month
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                margin: '1.75rem 0 2rem',
                textAlign: 'left',
              }}
            >
              {[
                'Unlimited questions',
                'Pricing, contracts, hiring, deals, clients',
                'Plain-English answers, no hedging',
                'Upload contracts and docs',
                '7-day free trial',
                'Cancel anytime',
              ].map((f) => (
                <div
                  key={f}
                  style={{
                    fontSize: '0.92rem',
                    color: '#3a3733',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: 'rgba(200, 65, 10, 0.1)',
                      color: '#c8410a',
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  {f}
                </div>
              ))}
            </div>
            <Link href="/sign-up" className="sbw-cta" style={{ width: '100%', justifyContent: 'center' }}>
              Start your free trial
              <span className="sbw-cta-arrow">→</span>
            </Link>
          </div>
        </section>

        {/* ─── Footer ──────────────────────────────────────────────── */}
        <footer
          style={{
            borderTop: '1px solid #e4e0d8',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.55rem',
              marginBottom: '0.5rem',
            }}
          >
            <Logomark size={24} />
            <Wordmark size="0.95rem" />
          </div>
          <p style={{ fontSize: '0.78rem', color: '#8a8680', marginTop: '0.4rem' }}>
            © {new Date().getFullYear()} SmallBizzWizz. All rights reserved.
          </p>
        </footer>
      </div>
    </>
  )
}
