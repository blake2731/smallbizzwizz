'use client'

import { useState } from 'react'

export default function CopyBriefButton({ brief }: { brief: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button type="button" onClick={copy} className="cp-copy-button">
      {copied ? 'Copied role packet' : 'Copy role packet'}
    </button>
  )
}
