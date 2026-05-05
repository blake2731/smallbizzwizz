import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#c8410a',
        borderRadius: '96px',
      }}
    >
      <span style={{ fontSize: 300, color: '#ffffff', fontWeight: 700, lineHeight: 1 }}>
        W
      </span>
    </div>,
    { width: 512, height: 512 }
  )
}
