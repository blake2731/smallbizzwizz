'use client'

import { useState } from 'react'

const examples = [
  { q: 'Is this contract fair?', a: 'Red flag on clause 8 — they can cancel with 0 notice and keep your deposit. Push back.' },
  { q: 'Should I hire or keep doing it myself?', a: 'If it\'s eating more than 10 hrs/week and isn\'t your core skill, hire. Time is the constraint.' },
  { q: 'My client hasn\'t paid in 60 days.', a: 'Stop all work now. Send a firm 7-day ultimatum. Most clients pay at the first real consequence.' },
]

export default function SubscribePage() {
  const [loading, setLoading] = useState(false)

  const handleSubscribe = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ef', fontFamily: "'DM Sans', sans-serif", color: '#0f0e0c' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem 2rem', borderBottom: '1px solid #e4e0d8', background: '#fff' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400 }}>
          SmallBizz<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '4rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '3rem', alignItems: 'start' }}>

        {/* Left — value pitch */}
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 400, lineHeight: 1.25, marginBottom: '1rem' }}>
            The business advisor<br />you actually listen to
          </h1>
          <p style={{ fontSize: '1rem', color: '#6b6760', lineHeight: 1.7, marginBottom: '2.5rem', maxWidth: '440px' }}>
            Not a chatbot that hedges everything. A direct, experienced voice that tells you what it actually thinks — about your pricing, your contracts, your clients, your hires.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
            {examples.map((ex) => (
              <div key={ex.q} style={{ background: '#fff', border: '1px solid #e4e0d8', borderRadius: '10px', padding: '1.1rem 1.25rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#8a8680', marginBottom: '0.4rem' }}>You ask</div>
                <div style={{ fontSize: '0.875rem', color: '#0f0e0c', fontWeight: 500, marginBottom: '0.75rem' }}>&ldquo;{ex.q}&rdquo;</div>
                <div style={{ fontSize: '0.8rem', color: '#8a8680', marginBottom: '0.4rem' }}>SmallBizzWizz</div>
                <div style={{ fontSize: '0.875rem', color: '#4a4740', lineHeight: 1.6 }}>{ex.a}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              'Pricing & knowing what to charge',
              'Evaluating deals and contracts',
              'Handling clients, late payments, scope creep',
              'Hiring, firing, and managing people',
              'When to quit, pivot, or double down',
            ].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem', color: '#4a4740' }}>
                <span style={{ color: '#c8410a', fontWeight: 700, fontSize: '1rem', lineHeight: 1 }}>✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Right — pricing card */}
        <div style={{ position: 'sticky', top: '2rem' }}>
          <div style={{ background: '#fff', border: '1px solid #e4e0d8', borderRadius: '12px', overflow: 'hidden' }}>

            <div style={{ background: '#0f0e0c', padding: '1.75rem 2rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#8a8680', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>SmallBizzWizz</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem' }}>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: '3.5rem', color: '#fff', lineHeight: 1 }}>$19</span>
                <span style={{ fontSize: '0.9rem', color: '#8a8680', paddingBottom: '0.5rem' }}>/ month</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b6760', marginTop: '0.5rem' }}>Cancel anytime. No contracts.</div>
            </div>

            <div style={{ padding: '1.75rem 2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.75rem' }}>
                {[
                  'Unlimited questions, any time',
                  'Pricing, contracts, deals, hiring',
                  'Direct answers — no hedging',
                  'Plain English, no jargon',
                  'Cancel from your account anytime',
                ].map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.875rem', color: '#4a4740' }}>
                    <span style={{ color: '#c8410a', fontWeight: 700, marginTop: '1px', flexShrink: 0 }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSubscribe}
                disabled={loading}
                style={{
                  width: '100%', padding: '0.9rem', background: loading ? '#e4e0d8' : '#c8410a',
                  color: '#fff', border: 'none', borderRadius: '7px', fontSize: '1rem',
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s', letterSpacing: '0.01em',
                }}
              >
                {loading ? 'Redirecting to checkout...' : 'Start for $19 / month →'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '1rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#8a8680' }}>🔒</span>
                <span style={{ fontSize: '0.75rem', color: '#8a8680' }}>Secured by Stripe. Your card info never touches our servers.</span>
              </div>
            </div>
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#8a8680', marginTop: '1rem' }}>
            Less than a 30-minute consult with an advisor — every month.
          </p>
        </div>

      </div>
    </div>
  )
}
