import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#c8410a',
        borderRadius: '36px',
      }}
    >
      <span style={{ fontSize: 108, color: '#ffffff', fontWeight: 700, lineHeight: 1 }}>
        W
      </span>
    </div>,
    { width: 180, height: 180 }
  )
}
