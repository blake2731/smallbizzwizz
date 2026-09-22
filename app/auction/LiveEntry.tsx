'use client'

import { FormEvent, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  closeAuctionLotAction,
  recordSaleAction,
  recordUnsoldAction,
  startAuctionLotAction,
  undoLastItemAction,
  updateAuctionHighBidAction,
} from './actions'
import styles from './auction.module.css'

type KnownBuyer = {
  id: number
  displayName: string
}

type OpenLot = {
  id: number
  itemName: string
  priceCents: number
  buyerName: string | null
}

function dollars(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export default function LiveEntry({
  auctionId,
  recentBuyers,
  openLot,
}: {
  auctionId: number
  recentBuyers: KnownBuyer[]
  openLot: OpenLot | null
}) {
  const router = useRouter()
  const itemRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'quick' | 'auction'>(openLot ? 'auction' : 'quick')
  const [itemName, setItemName] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [price, setPrice] = useState('')
  const [keepBuyer, setKeepBuyer] = useState(false)
  const [auctionItemName, setAuctionItemName] = useState('')
  const [startingPrice, setStartingPrice] = useState('')
  const [bidderName, setBidderName] = useState('')
  const [bid, setBid] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<unknown>, successMessage: string, after?: () => void) {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await action()
          after?.()
          setMessage(successMessage)
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Something went wrong.')
        }
      })()
    })
  }

  function resetQuick() {
    setItemName('')
    setPrice('')
    if (!keepBuyer) setBuyerName('')
    requestAnimationFrame(() => itemRef.current?.focus())
  }

  function sold(event: FormEvent) {
    event.preventDefault()
    run(
      () => recordSaleAction({ auctionId, itemName, buyerName, price }),
      buyerName.trim() ? 'Sold to ' + buyerName.trim() + '.' : 'Sale recorded.',
      resetQuick,
    )
  }

  function unsold() {
    run(
      () => recordUnsoldAction({ auctionId, itemName, price }),
      'Marked unsold. You can sell it later from Recent activity.',
      resetQuick,
    )
  }

  function startLot(event: FormEvent) {
    event.preventDefault()
    run(
      () => startAuctionLotAction({ auctionId, itemName: auctionItemName, startingPrice }),
      'Auction lot opened.',
      () => {
        setAuctionItemName('')
        setStartingPrice('')
        setBidderName('')
        setBid('')
      },
    )
  }

  function updateBid(event: FormEvent) {
    event.preventDefault()
    if (!openLot) return
    run(
      () => updateAuctionHighBidAction({
        auctionId,
        itemId: openLot.id,
        buyerName: bidderName,
        bid,
      }),
      'High bid updated.',
      () => {
        setBid('')
        setBidderName('')
      },
    )
  }

  function closeLot(result: 'sold' | 'unsold') {
    if (!openLot) return
    run(
      () => closeAuctionLotAction({ auctionId, itemId: openLot.id, result }),
      result === 'sold' ? 'Sold to the high bidder.' : 'Auction lot closed with no sale.',
      () => {
        setBid('')
        setBidderName('')
      },
    )
  }

  function undo() {
    run(
      () => undoLastItemAction(auctionId),
      'Last item undone.',
    )
  }

  function buyerChips(onSelect: (name: string) => void, query: string) {
    if (!recentBuyers.length) return null
    const normalizedQuery = query.trim().toLowerCase()
    const visibleBuyers = normalizedQuery
      ? recentBuyers.filter((buyer) => buyer.displayName.toLowerCase().includes(normalizedQuery))
      : recentBuyers

    if (!visibleBuyers.length) return null

    return (
      <div className={styles.recentBuyers} aria-label="Known buyers">
        {visibleBuyers.map((buyer) => (
          <button
            key={buyer.id + '-' + buyer.displayName}
            className={styles.buyerChip}
            type="button"
            onClick={() => onSelect(buyer.displayName)}
            disabled={pending}
          >
            {buyer.displayName}
          </button>
        ))}
      </div>
    )
  }

  return (
    <section className={styles.liveEntry}>
      <div className={styles.liveEntryHeader}>
        <div>
          <p className={styles.kicker}>Fast entry</p>
          <h2 className={styles.liveEntryTitle}>
            {mode === 'quick' ? 'Quick sale' : 'Auction lot'}
          </h2>
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

      <div className={styles.saleModeSwitch}>
        <button
          type="button"
          className={mode === 'quick' ? styles.saleModeActive : styles.saleMode}
          onClick={() => setMode('quick')}
        >
          ⚡ Quick Sale
        </button>
        <button
          type="button"
          className={mode === 'auction' ? styles.saleModeActive : styles.saleMode}
          onClick={() => setMode('auction')}
        >
          🔨 Auction
          {openLot ? <span className={styles.openPill}>OPEN</span> : null}
        </button>
      </div>

      {mode === 'quick' ? (
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
              placeholder="Tap a buyer below or type a name"
              autoComplete="off"
              enterKeyHint="next"
              disabled={pending}
            />
          </label>

          {buyerChips(setBuyerName, buyerName)}

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
      ) : openLot ? (
        <div className={styles.auctionLot}>
          <div className={styles.currentLotCard}>
            <div>
              <span className={styles.currentLotLabel}>CURRENT LOT</span>
              <h3>{openLot.itemName}</h3>
            </div>
            <div className={styles.highBid}>
              <span>High bid</span>
              <strong>{dollars(openLot.priceCents)}</strong>
              <small>{openLot.buyerName ?? 'No bidder yet'}</small>
            </div>
          </div>

          <form className={styles.entryForm} onSubmit={updateBid}>
            <label className={styles.fieldGroup}>
              <span>New high bidder</span>
              <input
                className={styles.bigInput}
                value={bidderName}
                onChange={(event) => setBidderName(event.target.value)}
                placeholder="Tap a buyer or type a name"
                autoComplete="off"
                disabled={pending}
              />
            </label>

            {buyerChips(setBidderName, bidderName)}

            <label className={styles.fieldGroup}>
              <span>New high bid</span>
              <div className={styles.moneyInputWrap}>
                <span className={styles.currency}>$</span>
                <input
                  className={styles.moneyInput}
                  value={bid}
                  onChange={(event) => setBid(event.target.value)}
                  placeholder={(openLot.priceCents / 100 + 1).toFixed(2)}
                  inputMode="decimal"
                  disabled={pending}
                />
              </div>
            </label>

            <button className={styles.bidButton} type="submit" disabled={pending}>
              Update high bid
            </button>
          </form>

          <div className={styles.closeLotButtons}>
            <button
              className={styles.soldButton}
              type="button"
              onClick={() => closeLot('sold')}
              disabled={pending || !openLot.buyerName}
            >
              SELL TO HIGH BIDDER
            </button>
            <button
              className={styles.unsoldButton}
              type="button"
              onClick={() => closeLot('unsold')}
              disabled={pending}
            >
              NO SALE
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.entryForm} onSubmit={startLot}>
          <label className={styles.fieldGroup}>
            <span>Auction item</span>
            <input
              className={styles.bigInput}
              value={auctionItemName}
              onChange={(event) => setAuctionItemName(event.target.value)}
              placeholder="Vintage tray"
              autoComplete="off"
              disabled={pending}
            />
          </label>

          <label className={styles.fieldGroup}>
            <span>Starting price <em>(optional)</em></span>
            <div className={styles.moneyInputWrap}>
              <span className={styles.currency}>$</span>
              <input
                className={styles.moneyInput}
                value={startingPrice}
                onChange={(event) => setStartingPrice(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                disabled={pending}
              />
            </div>
          </label>

          <button className={styles.startLotButton} type="submit" disabled={pending}>
            OPEN AUCTION LOT
          </button>
        </form>
      )}

      <div className={styles.entryHint}>
        {message || (
          mode === 'quick'
            ? 'Quick Sale is for first-response wins at a fixed price.'
            : openLot
              ? 'Keep updating the high bid until time is up, then close the lot.'
              : 'Open one auction lot at a time and keep its high bid on screen.'
        )}
      </div>
    </section>
  )
}
