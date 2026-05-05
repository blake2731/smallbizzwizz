import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: '#0f0e0c',
        padding: '80px',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            background: '#c8410a',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '16px',
          }}
        >
          <span style={{ color: '#fff', fontSize: '32px', fontWeight: 700 }}>W</span>
        </div>
        <span style={{ color: '#ffffff', fontSize: '28px', fontWeight: 400 }}>
          SmallBizzWizz
        </span>
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: '64px',
          fontWeight: 700,
          color: '#ffffff',
          lineHeight: 1.15,
          maxWidth: '900px',
          marginBottom: '28px',
        }}
      >
        The business-savvy friend you never had.
      </div>

      {/* Subtext */}
      <div style={{ fontSize: '28px', color: '#8a8680', maxWidth: '800px', lineHeight: 1.5 }}>
        Direct answers on pricing, contracts, clients &amp; hiring.
        No hedging. No jargon. No "it depends."
      </div>

      {/* CTA pill */}
      <div
        style={{
          marginTop: '48px',
          background: '#c8410a',
          color: '#ffffff',
          fontSize: '22px',
          fontWeight: 600,
          padding: '14px 32px',
          borderRadius: '8px',
        }}
      >
        7-day free trial — smallbizzwizz.com
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}
