'use client'

import { useState } from 'react'

export default function CheckoutButton({ url, score }: { url: string; score: number }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function checkout() {
    setLoading(true)
    setError('')

    const gtag = (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag
    gtag?.('event', 'outreach_fix_pack_checkout_started', { score })

    try {
      const response = await fetch('/api/revenue-audit/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.')
      window.location.assign(data.url)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout could not be started.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={checkout}
        disabled={loading}
        style={{
          width: '100%',
          border: 0,
          borderRadius: 13,
          padding: '16px 20px',
          background: '#99f2bd',
          color: '#07110f',
          fontSize: 15,
          fontWeight: 850,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Opening secure checkout…' : 'Get the complete Fix Pack · $49'}
      </button>
      {error ? <p style={{ color: '#ffc5c5', fontSize: 12, marginTop: 10 }}>{error}</p> : null}
    </div>
  )
}
