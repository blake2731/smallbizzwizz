'use client'

import { useMemo, useState } from 'react'
import BuyerCard from './BuyerCard'
import styles from './auction.module.css'

type Buyer = React.ComponentProps<typeof BuyerCard>['buyer']

function dollars(cents: number | null) {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export default function InvoiceWorkflow({
  auctionId,
  auctionTitle,
  buyers,
}: {
  auctionId: number
  auctionTitle: string
  buyers: Buyer[]
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'todo' | 'sent' | 'paid' | 'all'>('todo')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return buyers.filter((buyer) => {
      if (filter === 'todo' && (buyer.invoiceStatus === 'sent' || buyer.paidAt)) return false
      if (filter === 'sent' && (buyer.invoiceStatus !== 'sent' || buyer.paidAt)) return false
      if (filter === 'paid' && !buyer.paidAt) return false
      if (normalized && !buyer.displayName.toLowerCase().includes(normalized)) return false
      return true
    })
  }, [buyers, filter, query])

  return (
    <div className={styles.invoiceWorkflow}>
      <div className={styles.shippingToolbar}>
        <input
          className={styles.shippingSearch}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a buyer…"
          aria-label="Find a buyer"
        />
        <div className={styles.shippingFilters}>
          {([
            ['todo', 'Needs invoice'],
            ['sent', 'Sent'],
            ['paid', 'Paid'],
            ['all', 'All'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? styles.filterButtonActive : styles.filterButton}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className={styles.shippingResultCount}>{filtered.length} shown</span>
      </div>

      <div className={styles.shippingList}>
        {filtered.map((buyer) => {
          const ready = buyer.shippingCents !== null
          return (
            <details className={styles.invoiceWorkflowCard} key={buyer.id}>
              <summary className={styles.shippingSummary}>
                <div className={styles.shippingSummaryMain}>
                  <strong>{buyer.displayName}</strong>
                  <span>{buyer.items.length} {buyer.items.length === 1 ? 'item' : 'items'} · merchandise {dollars(buyer.subtotalCents)}</span>
                </div>
                <div className={styles.invoiceSummaryTotal}>
                  <span>Amount due</span>
                  <strong>{dollars(buyer.dueCents)}</strong>
                </div>
                <div className={styles.shippingSummaryStatus}>
                  {!ready ? <span className={styles.profileStatusMuted}>Needs shipping</span> : null}
                  {buyer.paidAt ? (
                    <span className={styles.goodBadge}>Paid</span>
                  ) : buyer.invoiceStatus === 'sent' ? (
                    <span className={styles.infoBadge}>Sent</span>
                  ) : ready ? (
                    <span className={styles.profileStatusMuted}>Needs invoice</span>
                  ) : null}
                </div>
              </summary>
              <div className={styles.invoiceWorkflowBody}>
                <BuyerCard
                  auctionId={auctionId}
                  auctionTitle={auctionTitle}
                  buyer={buyer}
                  mode="invoice"
                />
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
