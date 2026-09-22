'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editItemAction } from './actions'
import styles from './auction.module.css'

type KnownBuyer = {
  id: number
  displayName: string
}

type Item = {
  id: number
  itemName: string
  buyerName: string | null
  priceCents: number
  saleType: 'quick' | 'auction' | 'legacy'
  status: 'open' | 'sold' | 'unsold' | 'void'
  createdAt: Date
}

function dollars(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export default function ActivityItem({
  auctionId,
  item,
  buyers,
  timeLabel,
}: {
  auctionId: number
  item: Item
  buyers: KnownBuyer[]
  timeLabel: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [itemName, setItemName] = useState(item.itemName)
  const [buyerName, setBuyerName] = useState(item.buyerName ?? '')
  const [price, setPrice] = useState((item.priceCents / 100).toFixed(2))
  const [status, setStatus] = useState<'open' | 'sold' | 'unsold'>(
    item.status === 'void' ? 'unsold' : item.status,
  )
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function save() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await editItemAction({
            auctionId,
            itemId: item.id,
            itemName,
            buyerName,
            price,
            status,
            saleType: item.saleType,
          })
          setEditing(false)
          setMessage('Saved')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not save.')
        }
      })()
    })
  }

  const dotClass =
    item.status === 'sold'
      ? styles.soldDot
      : item.status === 'open'
        ? styles.openDot
        : styles.unsoldDot

  return (
    <div className={styles.activityItemWrap}>
      <div className={styles.activityRow}>
        <div className={dotClass} />
        <div className={styles.activityMain}>
          <div className={styles.activityTitleLine}>
            <strong>{item.itemName}</strong>
            <span className={item.saleType === 'auction' ? styles.auctionTag : styles.quickTag}>
              {item.saleType === 'auction' ? 'Auction' : 'Quick'}
            </span>
          </div>
          <span>
            {item.status === 'open'
              ? (item.buyerName ? 'High: ' + item.buyerName : 'Open · no bidder')
              : item.status === 'sold'
                ? item.buyerName
                : 'Unsold'} · {timeLabel}
          </span>
        </div>
        <div className={styles.activityPrice}>{dollars(item.priceCents)}</div>
        <button
          className={styles.editButton}
          type="button"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <div className={styles.inlineEditor}>
          <div className={styles.editGrid}>
            <label className={styles.fieldGroup}>
              <span>Item</span>
              <input
                className={styles.compactInput}
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                disabled={pending}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span>Price / high bid</span>
              <div className={styles.moneyInputWrapSmall}>
                <span className={styles.currency}>$</span>
                <input
                  className={styles.compactInput}
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  disabled={pending}
                />
              </div>
            </label>
          </div>

          <div className={styles.editGrid}>
            <label className={styles.fieldGroup}>
              <span>Buyer {status === 'unsold' ? '(not needed)' : ''}</span>
              <input
                className={styles.compactInput}
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                placeholder="Buyer name"
                disabled={pending || status === 'unsold'}
              />
            </label>

            <label className={styles.fieldGroup}>
              <span>Type</span>
              <select
                className={styles.compactInput}
                value={saleType}
                onChange={(event) => {
                  const next = event.target.value as 'quick' | 'auction' | 'legacy'
                  setSaleType(next)
                  if (next === 'quick' && status === 'open') setStatus('unsold')
                }}
                disabled={pending}
              >
                <option value="quick">Quick Sale</option>
                <option value="auction">Auction</option>\n                <option value="legacy">Imported / unknown</option>
              </select>
            </label>
          </div>

          <div className={styles.statusPicker}>
            <button
              type="button"
              className={status === 'sold' ? styles.statusActive : styles.statusChoice}
              onClick={() => setStatus('sold')}
            >
              Sold
            </button>
            <button
              type="button"
              className={status === 'unsold' ? styles.statusActive : styles.statusChoice}
              onClick={() => {
                setStatus('unsold')
                setBuyerName('')
              }}
            >
              Unsold
            </button>
            {item.saleType === 'auction' ? (
              <button
                type="button"
                className={status === 'open' ? styles.statusActive : styles.statusChoice}
                onClick={() => setStatus('open')}
              >
                Open
              </button>
            ) : null}
          </div>

          {status !== 'unsold' && buyers.length ? (
            <div className={styles.recentBuyers}>
              {buyers.slice(0, 16).map((buyer) => (
                <button
                  type="button"
                  key={buyer.id + '-' + buyer.displayName}
                  className={styles.buyerChip}
                  onClick={() => setBuyerName(buyer.displayName)}
                >
                  {buyer.displayName}
                </button>
              ))}
            </div>
          ) : null}

          <div className={styles.editorActions}>
            <button
              className={styles.primaryAction}
              type="button"
              onClick={save}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className={styles.secondaryAction}
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>

          {message ? <div className={styles.cardMessage}>{message}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
