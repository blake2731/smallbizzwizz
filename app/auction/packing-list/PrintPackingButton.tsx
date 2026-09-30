'use client'

export default function PrintPackingButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        border: '0',
        borderRadius: '10px',
        background: '#6571ff',
        color: 'white',
        padding: '11px 16px',
        font: 'inherit',
        fontWeight: 900,
        cursor: 'pointer',
      }}
    >
      Print packing list
    </button>
  )
}
