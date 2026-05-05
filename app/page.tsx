import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'SmallBizzWizz',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'AI business advisor for small business owners and freelancers. Get direct, plain-English answers on pricing, contracts, clients, and hiring.',
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

export default async function HomePage() {
  const { userId } = await auth()
  if (userId) redirect('/chat')
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#f7f4ef', color: '#0f0e0c', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 2rem', borderBottom: '1px solid #e4e0d8', background: '#fff' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400 }}>
          SmallBizz<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
        </div>
        <div className="landing-nav-buttons" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link href="/sign-in" style={{ fontSize: '0.875rem', color: '#4a4740', textDecoration: 'none', padding: '0.5rem 1.25rem', border: '1px solid #e4e0d8', borderRadius: '6px', fontWeight: 500 }}>Sign in</Link>
          <Link href="/sign-up" style={{ background: '#c8410a', color: '#fff', padding: '0.5rem 1.25rem', borderRadius: '6px', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: '760px', margin: '0 auto', padding: '5rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: '#fff', border: '1px solid #e4e0d8', borderRadius: '100px', padding: '0.35rem 1rem', fontSize: '0.8rem', color: '#8a8680', marginBottom: '1.75rem' }}>
          7-day free trial · then $19/month
        </div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1.25rem', color: '#0f0e0c' }}>
          The business-savvy friend<br />you never had
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#6b6760', lineHeight: 1.7, maxWidth: '560px', margin: '0 auto 2.5rem' }}>
          Ask anything about your business — pricing, deals, contracts, clients, hiring. Get a straight answer in plain English. No hedging, no jargon, no "it depends."
        </p>
        <Link href="/sign-up" style={{ display: 'inline-block', background: '#c8410a', color: '#fff', padding: '0.875rem 2rem', borderRadius: '6px', fontSize: '1rem', fontWeight: 500, textDecoration: 'none' }}>
          Start free 7-day trial →
        </Link>
        <p style={{ marginTop: '0.875rem', fontSize: '0.8rem', color: '#8a8680' }}>No charge for 7 days. Cancel anytime.</p>
      </section>

      {/* Chat preview */}
      <section style={{ maxWidth: '680px', margin: '0 auto', padding: '0 2rem 5rem' }}>
        <div style={{ background: '#fff', border: '1px solid #e4e0d8', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ borderBottom: '1px solid #e4e0d8', padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#e4e0d8' }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#e4e0d8' }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#e4e0d8' }} />
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: '#0f0e0c', color: '#f7f4ef', padding: '0.75rem 1rem', borderRadius: '12px 12px 2px 12px', fontSize: '0.875rem', lineHeight: 1.6, maxWidth: '80%' }}>
                My client hasn&apos;t paid in 60 days. What do I do?
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#f7f4ef', border: '1px solid #e4e0d8', color: '#0f0e0c', padding: '0.75rem 1rem', borderRadius: '12px 12px 12px 2px', fontSize: '0.875rem', lineHeight: 1.7, maxWidth: '85%' }}>
                Stop all work immediately — don&apos;t do another hour until this is resolved. Send a firm email today: the invoice number, the amount, and a 7-day deadline before you send it to collections. Most clients pay at the first real consequence. If they don&apos;t respond in 7 days, send a collections notice — even a free one from a collections agency letter template. The relationship is already damaged; being direct won&apos;t make it worse.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: '#0f0e0c', color: '#f7f4ef', padding: '0.75rem 1rem', borderRadius: '12px 12px 2px 12px', fontSize: '0.875rem', lineHeight: 1.6, maxWidth: '80%' }}>
                A contractor wants 40% upfront. Is that normal?
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#f7f4ef', border: '1px solid #e4e0d8', color: '#0f0e0c', padding: '0.75rem 1rem', borderRadius: '12px 12px 12px 2px', fontSize: '0.875rem', lineHeight: 1.7, maxWidth: '85%' }}>
                Yes, that&apos;s normal and reasonable. 40-50% upfront is standard for contractors covering materials and time. If you&apos;re worried, pay 40% to start, 30% at a clear midpoint milestone, and 30% on completion. Never pay 100% upfront.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section style={{ background: '#fff', borderTop: '1px solid #e4e0d8', borderBottom: '1px solid #e4e0d8', padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', fontWeight: 400, textAlign: 'center', marginBottom: '0.75rem' }}>
            Ask anything about your business
          </h2>
          <p style={{ textAlign: 'center', color: '#8a8680', fontSize: '0.95rem', marginBottom: '2.5rem' }}>
            Real expertise across the decisions small business owners face every day.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {[
              { title: 'Pricing', desc: 'Know what to charge and how to raise your rates without losing clients.' },
              { title: 'Deals & Offers', desc: 'Evaluate business opportunities, acquisitions, and partnerships.' },
              { title: 'Contracts', desc: 'Spot red flags before you sign. Know when to push back.' },
              { title: 'Cash Flow', desc: 'Understand your margins, when to spend, and when to hold.' },
              { title: 'Clients', desc: 'Handle late payments, difficult clients, and scope creep.' },
              { title: 'Hiring', desc: 'When to hire, how to let someone go, and how to structure pay.' },
            ].map((item) => (
              <div key={item.title} style={{ background: '#f7f4ef', border: '1px solid #e4e0d8', borderRadius: '8px', padding: '1.25rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem', color: '#c8410a' }}>{item.title}</div>
                <div style={{ fontSize: '0.85rem', color: '#6b6760', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ maxWidth: '480px', margin: '0 auto', padding: '5rem 2rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', fontWeight: 400, marginBottom: '0.5rem' }}>
          Simple pricing
        </h2>
        <p style={{ color: '#8a8680', fontSize: '0.95rem', marginBottom: '2.5rem' }}>One plan. Everything included.</p>
        <div style={{ background: '#fff', border: '1px solid #e4e0d8', borderRadius: '12px', padding: '2.5rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '3rem', fontWeight: 400, color: '#0f0e0c' }}>
            $19<span style={{ fontSize: '1rem', color: '#8a8680', fontFamily: "'DM Sans', sans-serif" }}>/month</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', margin: '1.75rem 0 2rem', textAlign: 'left' }}>
            {[
              'Unlimited questions',
              'Pricing, contracts, hiring, deals, clients',
              'Straight answers in plain English',
              'Available whenever you need it',
              '7-day free trial to start',
              'Cancel anytime',
            ].map((f) => (
              <div key={f} style={{ fontSize: '0.875rem', color: '#4a4740', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: '#c8410a', fontWeight: 700, fontSize: '1rem' }}>✓</span> {f}
              </div>
            ))}
          </div>
          <Link href="/sign-up" style={{ display: 'block', background: '#c8410a', color: '#fff', padding: '0.875rem', borderRadius: '6px', fontSize: '1rem', fontWeight: 500, textDecoration: 'none' }}>
            Start free 7-day trial →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e4e0d8', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', marginBottom: '0.5rem' }}>
          SmallBizz<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#8a8680' }}>© {new Date().getFullYear()} SmallBizzWizz. All rights reserved.</p>
      </footer>

    </div>
    </>
  )
}
