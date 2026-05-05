'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SuccessPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => router.push('/chat'), 4000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f7f4ef', fontFamily: "'DM Sans', sans-serif", alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', color: '#0f0e0c', marginBottom: '1.5rem' }}>
        SmallBizz<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
      </p>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', fontWeight: 400, color: '#0f0e0c', marginBottom: '0.75rem' }}>
        Your 7-day trial starts now.
      </h1>
      <p style={{ fontSize: '0.95rem', color: '#8a8680', marginBottom: '2rem' }}>
        No charge for 7 days — taking you to the advisor now...
      </p>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: '8px', height: '8px', borderRadius: '50%', background: '#c8410a',
            animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
