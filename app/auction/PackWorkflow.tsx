'use client'

import { useMemo, useState } from 'react'
import BuyerCard from './BuyerCard'
import styles from './auction.module.css'

type Buyer = React.ComponentProps<typeof BuyerCard>['buyer']

export default function PackWorkflow({
  auctionId,
  auctionTitle,
  buyers,
}: {
  auctionId: number
  auctionTitle: string
  buyers: Buyer[]
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'todo' | 'packed' | 'letters' | 'all'>('todo')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return buyers.filter((buyer) => {
      const packed = buyer.packageStatus === 'packed'
      const letterOnly =
        buyer.items.length > 0 &&
        buyer.items.every((item) => item.itemName.trim().toLowerCase() === 'seeds')

      if (filter === 'todo' && packed) return false
      if (filter === 'packed' && !packed) return false
      if (filter === 'letters' && !letterOnly) return false
      if (normalized && !buyer.displayName.toLowerCase().includes(normalized)) return false
      return true
    })
  }, [buyers, filter, query])

  return (
    <div className={styles.packWorkflow}>
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
            ['todo', 'Needs packing'],
            ['packed', 'Packed'],
            ['letters', 'Letters'],
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

      <div className={styles.cardGrid}>
        {filtered.map((buyer) => (
          <BuyerCard
            key={buyer.id}
            auctionId={auctionId}
            auctionTitle={auctionTitle}
            buyer={buyer}
            mode="pack"
          />
        ))}
      </div>
    </div>
  )
}
