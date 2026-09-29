'use client'

import { useMemo, useState } from 'react'
import BuyerCard from './BuyerCard'
import styles from './auction.module.css'

type Buyer = React.ComponentProps<typeof BuyerCard>['buyer']

export default function BuyerReviewWorkflow({
  auctionId,
  auctionTitle,
  buyers,
}: {
  auctionId: number
  auctionTitle: string
  buyers: Buyer[]
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'pg' | 'regular'>('all')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return buyers.filter((buyer) => {
      if (filter === 'pg' && !buyer.privateGroup) return false
      if (filter === 'regular' && buyer.privateGroup) return false
      if (normalized && !buyer.displayName.toLowerCase().includes(normalized)) return false
      return true
    })
  }, [buyers, filter, query])

  return (
    <div className={styles.buyerReviewWorkflow}>
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
            ['all', 'All'],
            ['pg', 'Private Group'],
            ['regular', 'Regular'],
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

      <div className={styles.cardGrid}>
        {filtered.map((buyer) => (
          <BuyerCard
            key={buyer.id}
            auctionId={auctionId}
            auctionTitle={auctionTitle}
            buyer={buyer}
            mode="buyers"
          />
        ))}
      </div>
    </div>
  )
}
