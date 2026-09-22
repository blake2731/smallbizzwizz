'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { prepareReadyShopifyInvoicesAction } from './actions'
import styles from './auction.module.css'

export default function InvoiceBatchPanel({
  auctionId,
  total,
  prepared,
  sent,
  paid,
  missingShipping,
  missingAddress,
}: {
  auctionId: number
  total: number
  prepared: number
  sent: number
  paid: number
  missingShipping: number
  missingAddress: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  function prepareAll() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await prepareReadyShopifyInvoicesAction({ auctionId })
          const pieces = [
            result.created ? String(result.created) + ' created' : null,
            result.existing ? String(result.existing) + ' already prepared' : null,
            result.paid ? String(result.paid) + ' already paid' : null,
            result.blocked.length ? String(result.blocked.length) + ' blocked' : null,
          ].filter(Boolean)

          setMessage(pieces.join(' · ') || 'Nothing needed.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not prepare invoices.')
        }
      })()
    })
  }

  return (
    <div className={styles.invoiceBatchPanel}>
      <div className={styles.invoiceBatchStats}>
        <div>
          <span>Total buyers</span>
          <strong>{total}</strong>
        </div>
        <div>
          <span>Shopify prepared</span>
          <strong>{prepared}</strong>
        </div>
        <div>
          <span>Sent</span>
          <strong>{sent}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong>{paid}</strong>
        </div>
        <div>
          <span>Missing shipping</span>
          <strong>{missingShipping}</strong>
        </div>
        <div>
          <span>Missing address</span>
          <strong>{missingAddress}</strong>
        </div>
      </div>

      <div className={styles.invoiceBatchActions}>
        <button
          className={styles.primaryAction}
          type="button"
          onClick={prepareAll}
          disabled={pending}
        >
          {pending ? 'Preparing invoices…' : 'Prepare all ready Shopify invoices'}
        </button>
        <small>
          This creates Shopify checkout links only. It does not email customers or charge anyone.
        </small>
      </div>

      {message ? <div className={styles.inlineMessage}>{message}</div> : null}
    </div>
  )
}
