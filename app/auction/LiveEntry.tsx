'use client'

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { restoreEntryDraft, customerCue } from '@/lib/auction-entry-draft'
import {
  saveProspectiveCustomerAction,
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
  email: string | null
  city: string | null
  phone: string | null
  notes: string | null
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
  const contactQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const contactKeyRef = useRef('')
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
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [bidderCustomerId, setBidderCustomerId] = useState<number | null>(null)
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactCity, setContactCity] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [creationKey, setCreationKey] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
    try {
      const draft = restoreEntryDraft(window.localStorage.getItem('tcb-auction-draft-' + auctionId))
      setItemName(draft.itemName ?? '')
      setBuyerName(draft.buyerName ?? '')
      setPrice(draft.price ?? '')
      setKeepBuyer(draft.keepBuyer ?? false)
      setRepeatSale(draft.repeatSale ?? false)
      setAuctionItemName(draft.auctionItemName ?? '')
      setStartingPrice(draft.startingPrice ?? '')
      setBidderName(draft.bidderName ?? '')
      setBid(draft.bid ?? '')
      setCustomerId(draft.customerId ?? null)
      setBidderCustomerId(draft.bidderCustomerId ?? null)
      setContactEmail(draft.contactEmail ?? '')
      setContactPhone(draft.contactPhone ?? '')
      setContactCity(draft.contactCity ?? '')
      setContactNotes(draft.contactNotes ?? '')
      const restoredKey = draft.creationKey || crypto.randomUUID()
      contactKeyRef.current = restoredKey
      setCreationKey(restoredKey)
      if (draft.mode) setMode(draft.mode)
      if (Object.keys(draft).length) setMessage('Draft restored. Saved customers remain in the customer list.')
    } catch {
      const restoredKey = crypto.randomUUID()
      contactKeyRef.current = restoredKey
      setCreationKey(restoredKey)
      setMessage('Browser draft storage is unavailable. Save customer details before leaving.')
    } finally { setDraftReady(true) }
    })
    return () => { active = false }
  }, [auctionId])

  useEffect(() => {
    if (!draftReady) return
    try {
      const pendingContacts = JSON.parse(window.localStorage.getItem('tcb-auction-contacts-' + auctionId) || '{}')
      for (const input of Object.values(pendingContacts)) {
        if (input && typeof input === 'object') void queueContact(input as Parameters<typeof saveProspectiveCustomerAction>[0])
      }
    } catch { /* A damaged queue must not stop entry. */ }
    // Retry durable pending customer saves once on mount, including after interruption.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, draftReady])

  useEffect(() => {
    if (!draftReady) return
    try {
      window.localStorage.setItem('tcb-auction-draft-' + auctionId, JSON.stringify({
        itemName, buyerName, price, keepBuyer, repeatSale, auctionItemName, startingPrice,
        bidderName, bid, customerId, bidderCustomerId, contactEmail, contactPhone,
        contactCity, contactNotes, creationKey, mode,
      }))
    } catch { /* Server-saved customer details remain durable when browser storage fails. */ }
  }, [auctionId, draftReady, itemName, buyerName, price, keepBuyer, repeatSale, auctionItemName,
    startingPrice, bidderName, bid, customerId, bidderCustomerId, contactEmail, contactPhone,
    contactCity, contactNotes, creationKey, mode])

  function selectCustomer(customer: KnownBuyer, slot: 'quick' | 'auction') {
    saveContactDraft()
    if (slot === 'quick') { setBuyerName(customer.displayName); setCustomerId(customer.id) }
    else { setBidderName(customer.displayName); setBidderCustomerId(customer.id) }
    setContactEmail(customer.email ?? '')
    setContactPhone(customer.phone ?? '')
    setContactCity(customer.city ?? '')
    setContactNotes(customer.notes ?? '')
    const key = crypto.randomUUID(); contactKeyRef.current = key; setCreationKey(key)
  }

  function typeCustomer(name: string, slot: 'quick' | 'auction') {
    if (contactEmail || contactPhone || contactCity || contactNotes) saveContactDraft()
    if (slot === 'quick') { setBuyerName(name); setCustomerId(null) }
    else { setBidderName(name); setBidderCustomerId(null) }
    setContactEmail(''); setContactPhone(''); setContactCity(''); setContactNotes('')
    const key = crypto.randomUUID(); contactKeyRef.current = key; setCreationKey(key)
  }

  function queueContact(input: Parameters<typeof saveProspectiveCustomerAction>[0]) {
    const storageKey = 'tcb-auction-contacts-' + auctionId
    const snapshot = { ...input, auctionId }
    try {
      const pendingContacts = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
      pendingContacts[snapshot.creationKey] = snapshot
      window.localStorage.setItem(storageKey, JSON.stringify(pendingContacts))
    } catch { /* Explicit save is still available if browser storage is blocked. */ }
    const saved = contactQueueRef.current.catch(() => {}).then(async () => {
      const result = await saveProspectiveCustomerAction(snapshot)
      try {
        const pendingContacts = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
        if (JSON.stringify(pendingContacts[snapshot.creationKey]) === JSON.stringify(snapshot)) {
          delete pendingContacts[snapshot.creationKey]
          window.localStorage.setItem(storageKey, JSON.stringify(pendingContacts))
        }
      } catch { /* Server save succeeded. */ }
      if (contactKeyRef.current === snapshot.creationKey) {
        if (mode === 'quick') setCustomerId(result.customerId)
        else setBidderCustomerId(result.customerId)
      }
      router.refresh()
      return result
    })
    contactQueueRef.current = saved
    void saved.catch(() => setMessage('Customer draft kept in this browser. Save again when connected.'))
    return saved
  }

  function saveContactDraft() {
    const name = mode === 'quick' ? buyerName : bidderName
    const selectedId = mode === 'quick' ? customerId : bidderCustomerId
    if (!name.trim() || !creationKey) return
    // Typing an existing name still requires selecting its stable identity. The
    // explicit independent save can intentionally create a new same-name person.
    if (!selectedId && recentBuyers.some(customer => customer.displayName.toLowerCase().startsWith(name.trim().toLowerCase()))) return
    void queueContact({ auctionId, customerId: selectedId, creationKey, displayName: name,
      email: contactEmail, phone: contactPhone, city: contactCity, notes: contactNotes })
  }

  function saveCustomer() {
    const selectedId = mode === 'quick' ? customerId : bidderCustomerId
    run(async () => {
      const result = await queueContact({ auctionId, customerId: selectedId,
        creationKey, displayName: mode === 'quick' ? buyerName : bidderName,
        email: contactEmail, phone: contactPhone, city: contactCity, notes: contactNotes })
      if (mode === 'quick') setCustomerId(result.customerId)
      else setBidderCustomerId(result.customerId)
    }, 'Customer saved. Contact and notes remain saved even with no sale.')
  }

  function run(action: () => Promise<unknown>, successMessage: string, after?: () => void) {
    if (busyRef.current) return
    busyRef.current = true
    setMessage('Saving…')
    startTransition(() => {
      void (async () => {
        try {
          await contactQueueRef.current
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
    if (!keepBuyer) { setBuyerName(''); setCustomerId(null); setContactEmail(''); setContactPhone(''); setContactCity(''); setContactNotes(''); setCreationKey(crypto.randomUUID()) }

    requestAnimationFrame(() => {
      if (repeatSale && !keepBuyer) {
        buyerRef.current?.focus()
      } else {
        itemRef.current?.focus()
      }
    })
  }

  function clearQuickEntry() {
    saveContactDraft()
    setItemName('')
    setBuyerName('')
    setCustomerId(null)
    setContactEmail(''); setContactPhone(''); setContactCity(''); setContactNotes('')
    setCreationKey(crypto.randomUUID())
    setPrice('')
    setKeepBuyer(false)
    setRepeatSale(false)
    setMessage('Entry cleared.')
    try { window.localStorage.removeItem('tcb-auction-draft-' + auctionId) } catch { /* optional browser draft */ }
    requestAnimationFrame(() => itemRef.current?.focus())
  }

  function sold(event: FormEvent) {
    event.preventDefault()
    run(
      () => recordSaleAction({ auctionId, itemName, buyerName, customerId, price }),
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
        setBidderCustomerId(null)
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
        customerId: bidderCustomerId,
        bid,
      }),
      'High bid updated.',
      () => {
        setBid('')
        setBidderName('')
        setBidderCustomerId(null)
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
        setBidderCustomerId(null)
      },
    )
  }

  function undo() {
    run(
      () => undoLastItemAction(auctionId),
      'Last item undone.',
    )
  }

  function buyerChips(slot: 'quick' | 'auction', query: string) {
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
            onClick={() => selectCustomer(buyer, slot)}
            disabled={pending || !draftReady}
          >
            {buyer.displayName} · {customerCue(buyer)}
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
              disabled={pending || !draftReady}
            >
              Clear entry
            </button>
          ) : null}
          <button
            className={styles.undoButton}
            type="button"
            onClick={undo}
            disabled={pending || !draftReady}
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

      <details className={styles.fieldGroup}>
        <summary>Customer contact and notes</summary>
        <p>Enter or select the customer below, then save these details even if they do not bid or win.</p>
        <label>Email<input value={contactEmail} onBlur={saveContactDraft} onChange={e => setContactEmail(e.target.value)} disabled={pending || !draftReady} /></label>
        <label>Phone<input value={contactPhone} onBlur={saveContactDraft} onChange={e => setContactPhone(e.target.value)} disabled={pending || !draftReady} /></label>
        <label>City<input value={contactCity} onBlur={saveContactDraft} onChange={e => setContactCity(e.target.value)} disabled={pending || !draftReady} /></label>
        <label>Notes<textarea value={contactNotes} onBlur={saveContactDraft} onChange={e => setContactNotes(e.target.value)} disabled={pending || !draftReady} /></label>
        <button type="button" onClick={saveCustomer} disabled={pending || !draftReady}>Save customer independently</button>
      </details>

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
              disabled={pending || !draftReady}
            />
          </label>

          <label className={styles.fieldGroup}>
            <span>Buyer</span>
            <input
              ref={buyerRef}
              className={styles.bigInput}
              value={buyerName}
              onChange={(event) => typeCustomer(event.target.value, 'quick')}
              onBlur={saveContactDraft}
              placeholder="Tap a recent buyer or type a name"
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              enterKeyHint="next"
              disabled={pending || !draftReady}
            />
          </label>

          {buyerChips('quick', buyerName)}

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
                  disabled={pending || !draftReady}
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
            <button className={styles.soldButton} type="submit" disabled={pending || !draftReady}>
              {pending ? 'Saving…' : 'SOLD'}
            </button>
            <button
              className={styles.unsoldButton}
              type="button"
              onClick={unsold}
              disabled={pending || !draftReady}
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
                  onChange={(event) => typeCustomer(event.target.value, 'auction')}
                  onBlur={saveContactDraft}
                placeholder="Tap a recent buyer or type a name"
                autoComplete="off"
                autoCapitalize="words"
                autoCorrect="off"
                disabled={pending || !draftReady}
              />
            </label>

            {buyerChips('auction', bidderName)}

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
                  disabled={pending || !draftReady}
                />
              </div>
            </label>

            <button className={styles.bidButton} type="submit" disabled={pending || !draftReady}>
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
              disabled={pending || !draftReady}
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
              disabled={pending || !draftReady}
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
                disabled={pending || !draftReady}
              />
            </div>
          </label>

          <button className={styles.startLotButton} type="submit" disabled={pending || !draftReady}>
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
