'use client'

import { useState } from 'react'

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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f7f4ef', fontFamily: "'DM Sans', sans-serif", alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '480px', width: '100%', background: '#fff', border: '1px solid #e4e0d8', borderRadius: '8px', padding: '3rem 2.5rem', textAlign: 'center' }}>

        <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', color: '#0f0e0c', marginBottom: '0.5rem' }}>
          SmallBizz<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
        </p>

        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', fontWeight: 400, color: '#0f0e0c', margin: '1.5rem 0 0.75rem' }}>
          Get your business advisor
        </h1>
        <p style={{ fontSize: '0.95rem', color: '#8a8680', lineHeight: '1.6', marginBottom: '2rem' }}>
          Ask anything — deals, pricing, clients, contracts, hiring. Get a straight answer in plain English.
        </p>

        <div style={{ background: '#f7f4ef', borderRadius: '6px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', fontFamily: 'Georgia, serif', color: '#0f0e0c', fontWeight: 400 }}>
            $19
            <span style={{ fontSize: '1rem', color: '#8a8680', fontFamily: "'DM Sans', sans-serif" }}>/month</span>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
            {[
              'Unlimited questions',
              'Pricing, contracts, hiring, deals',
              'Plain English — no consultant-speak',
              'Cancel anytime',
            ].map((f) => (
              <div key={f} style={{ fontSize: '0.875rem', color: '#4a4740', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#c8410a', fontWeight: 600 }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          style={{
            width: '100%', padding: '0.875rem', background: loading ? '#e4e0d8' : '#c8410a',
            color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem',
            fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
          }}
        >
          {loading ? 'Redirecting...' : 'Subscribe for $19/month →'}
        </button>

        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#8a8680' }}>
          Secure checkout via Stripe. Cancel anytime from your account.
        </p>
      </div>
    </div>
  )
}
