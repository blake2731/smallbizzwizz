'use client'

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react'
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
  const buyerRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const [draftReady, setDraftReady] = useState(false)
  const [mode, setMode] = useState<'quick' | 'auction'>(openLot ? 'auction' : 'quick')
  const [itemName, setItemName] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [price, setPrice] = useState('')
  const [keepBuyer, setKeepBuyer] = useState(false)
  const [repeatSale, setRepeatSale] = useState(false)
  const [auctionItemName, setAuctionItemName] = useState('')
  const [startingPrice, setStartingPrice] = useState('')
  const [bidderName, setBidderName] = useState('')
  const [bid, setBid] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const storageKey = 'tcb-auction-draft-' + auctionId
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const draft = JSON.parse(raw) as {
          itemName?: string
          buyerName?: string
          price?: string
          keepBuyer?: boolean
          repeatSale?: boolean
        }
        setItemName(draft.itemName ?? '')
        setBuyerName(draft.buyerName ?? '')
        setPrice(draft.price ?? '')
        setKeepBuyer(Boolean(draft.keepBuyer))
        setRepeatSale(Boolean(draft.repeatSale))
        if (draft.itemName || draft.buyerName || draft.price) {
          setMessage('Draft restored.')
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey)
    } finally {
      setDraftReady(true)
    }
  }, [auctionId])

  useEffect(() => {
    if (!draftReady) return
    const storageKey = 'tcb-auction-draft-' + auctionId
    const hasDraft = Boolean(itemName || buyerName || price || keepBuyer || repeatSale)
    if (!hasDraft) {
      window.localStorage.removeItem(storageKey)
      return
    }
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ itemName, buyerName, price, keepBuyer, repeatSale }),
    )
  }, [auctionId, buyerName, draftReady, itemName, keepBuyer, price, repeatSale])

  function run(action: () => Promise<unknown>, successMessage: string, after?: () => void) {
    if (busyRef.current) return
    busyRef.current = true
    setMessage('Saving…')
    startTransition(() => {
      void (async () => {
        try {
          await action()
          after?.()
          setMessage(successMessage)
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Something went wrong.')
        } finally {
          busyRef.current = false
        }
      })()
    })
  }

  function resetQuick() {
    if (!repeatSale) {
      setItemName('')
      setPrice('')
    }
    if (!keepBuyer) setBuyerName('')

    requestAnimationFrame(() => {
      if (repeatSale && !keepBuyer) {
        buyerRef.current?.focus()
      } else {
        itemRef.current?.focus()
      }
    })
  }

  function clearQuickEntry() {
    setItemName('')
    setBuyerName('')
    setPrice('')
    setKeepBuyer(false)
    setRepeatSale(false)
    setMessage('Entry cleared.')
    window.localStorage.removeItem('tcb-auction-draft-' + auctionId)
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
    const visibleBuyers = (
      normalizedQuery
        ? recentBuyers.filter((buyer) => buyer.displayName.toLowerCase().includes(normalizedQuery))
        : recentBuyers
    ).slice(0, normalizedQuery ? 12 : 8)

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
        <div className={styles.headerActions}>
          {mode === 'quick' ? (
            <button
              className={styles.clearEntryButton}
              type="button"
              onClick={clearQuickEntry}
              disabled={pending}
            >
              Clear entry
            </button>
          ) : null}
          <button
            className={styles.undoButton}
            type="button"
            onClick={undo}
            disabled={pending}
          >
            ↶ Undo last
          </button>
        </div>
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
              autoCapitalize="sentences"
              enterKeyHint="next"
              disabled={pending}
            />
          </label>

          <label className={styles.fieldGroup}>
            <span>Buyer</span>
            <input
              ref={buyerRef}
              className={styles.bigInput}
              value={buyerName}
              onChange={(event) => setBuyerName(event.target.value)}
              placeholder="Tap a recent buyer or type a name"
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
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

            <div className={styles.entryToggles}>
              <label className={styles.keepBuyer}>
                <input
                  type="checkbox"
                  checked={keepBuyer}
                  onChange={(event) => setKeepBuyer(event.target.checked)}
                />
                <span>Keep buyer</span>
              </label>
              <label className={styles.repeatSale}>
                <input
                  type="checkbox"
                  checked={repeatSale}
                  onChange={(event) => setRepeatSale(event.target.checked)}
                />
                <span>Repeat item + price</span>
              </label>
            </div>
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
                placeholder="Tap a recent buyer or type a name"
                autoComplete="off"
                autoCapitalize="words"
                autoCorrect="off"
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
                  placeholder={(
                    openLot.priceCents / 100 + (openLot.buyerName ? 1 : 0)
                  ).toFixed(2)}
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
            ? 'Saved sales survive refresh. Use Repeat item + price when several people buy the same thing.'
            : openLot
              ? 'Keep updating the high bid until time is up, then close the lot.'
              : 'Open one auction lot at a time and keep its high bid on screen.'
        )}
      </div>
    </section>
  )
}
