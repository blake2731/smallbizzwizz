'use client'

import { FormEvent, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  recordSaleAction,
  recordUnsoldAction,
  undoLastItemAction,
} from './actions'
import styles from './auction.module.css'

type RecentBuyer = {
  id: number
  displayName: string
}

export default function LiveEntry({
  auctionId,
  recentBuyers,
}: {
  auctionId: number
  recentBuyers: RecentBuyer[]
}) {
  const router = useRouter()
  const itemRef = useRef<HTMLInputElement>(null)
  const [itemName, setItemName] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [price, setPrice] = useState('')
  const [keepBuyer, setKeepBuyer] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function resetAfterEntry() {
    setItemName('')
    setPrice('')
    if (!keepBuyer) setBuyerName('')
    requestAnimationFrame(() => itemRef.current?.focus())
  }

  function run(action: () => Promise<unknown>, successMessage: string, reset = true) {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await action()
          if (reset) resetAfterEntry()
          setMessage(successMessage)
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Something went wrong.')
        }
      })()
    })
  }

  function sold(event: FormEvent) {
    event.preventDefault()
    run(
      () => recordSaleAction({ auctionId, itemName, buyerName, price }),
      buyerName.trim() ? 'Sold to ' + buyerName.trim() + '.' : 'Sale recorded.',
    )
  }

  function unsold() {
    run(
      () => recordUnsoldAction({ auctionId, itemName, price }),
      'Marked unsold.',
    )
  }

  function undo() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await undoLastItemAction(auctionId)
          setMessage(result.message)
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Undo failed.')
        }
      })()
    })
  }

  return (
    <section className={styles.liveEntry}>
      <div className={styles.liveEntryHeader}>
        <div>
          <p className={styles.kicker}>Fast entry</p>
          <h2 className={styles.liveEntryTitle}>Record the next item</h2>
        </div>
        <button
          className={styles.undoButton}
          type="button"
          onClick={undo}
          disabled={pending}
        >
          ↶ Undo last
        </button>
      </div>

      <form className={styles.entryForm} onSubmit={sold}>
        <label className={styles.fieldGroup}>
          <span>Item</span>
          <input
            ref={itemRef}
            className={styles.bigInput}
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            placeholder="Dual tank humidifier"
            autoComplete="off"
            enterKeyHint="next"
            disabled={pending}
          />
        </label>

        <label className={styles.fieldGroup}>
          <span>Buyer</span>
          <input
            className={styles.bigInput}
            value={buyerName}
            onChange={(event) => setBuyerName(event.target.value)}
            placeholder="Tap recent buyer or type a name"
            autoComplete="off"
            enterKeyHint="next"
            disabled={pending}
          />
        </label>

        {recentBuyers.length ? (
          <div className={styles.recentBuyers} aria-label="Recent buyers">
            {recentBuyers.map((buyer) => (
              <button
                key={buyer.id}
                className={styles.buyerChip}
                type="button"
                onClick={() => setBuyerName(buyer.displayName)}
                disabled={pending}
              >
                {buyer.displayName}
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.priceRow}>
          <label className={styles.fieldGroup}>
            <span>Price</span>
            <div className={styles.moneyInputWrap}>
              <span className={styles.currency}>$</span>
              <input
                className={styles.moneyInput}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                enterKeyHint="done"
                disabled={pending}
              />
            </div>
          </label>

          <label className={styles.keepBuyer}>
            <input
              type="checkbox"
              checked={keepBuyer}
              onChange={(event) => setKeepBuyer(event.target.checked)}
            />
            <span>Keep this buyer selected</span>
          </label>
        </div>

        <div className={styles.liveButtons}>
          <button className={styles.soldButton} type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'SOLD'}
          </button>
          <button
            className={styles.unsoldButton}
            type="button"
            onClick={unsold}
            disabled={pending}
          >
            UNSOLD
          </button>
        </div>
      </form>

      <div className={styles.entryHint}>
        {message || 'After a save, the item and price clear automatically so you are ready for the next lot.'}
      </div>
    </section>
  )
}
