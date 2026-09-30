'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isPirateShipMessage, PIRATE_SHIP_ORIGIN, validatePirateShipQuote, type PirateShipQuote } from '@/lib/pirate-ship-quote'
import { savePirateShipQuoteAction } from '../../actions'
import styles from './capture.module.css'

type Saved = { buyer: string; packageNumber: number; amountCents: number }
type Package = { buyer: string; buyerId: number; packageId: number; box: number; packagingType: 'box' | 'envelope'; pounds: number; ounces: number; length: number; width: number; height: number | null }

export default function QuoteReceiver({ auctionId, title, packages }: { auctionId: number; title: string; packages: Package[] }) {
  const [message, setMessage] = useState('Waiting for the Pirate Ship helper.')
  const [saved, setSaved] = useState<Saved[]>([])
  const [draft, setDraft] = useState<PirateShipQuote | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const channel = params.get('channel') || ''
    const opener = window.opener as Window | null
    let alive = true
    const complete = new Map<string, Awaited<ReturnType<typeof savePirateShipQuoteAction>>>()
    const active = new Set<string>()
    const reply = (payload: object) => opener?.postMessage({ ...payload, channel }, PIRATE_SHIP_ORIGIN)
    const ready = () => { if (opener && /^[0-9a-f-]{36}$/i.test(channel)) reply({ type: 'crafty-shipping-ready', auctionId, packages }) }
    async function receive(event: MessageEvent) {
      if (!isPirateShipMessage(event, opener, channel)) return
      const { requestId, quote: rawQuote } = event.data
      if (complete.has(requestId)) { reply({ type: 'crafty-shipping-result', requestId, result: complete.get(requestId) }); return }
      if (active.has(requestId)) return
      let quote: PirateShipQuote
      try { quote = validatePirateShipQuote(rawQuote); if (quote.auctionId !== auctionId) throw new Error('The quote belongs to another auction.') }
      catch { reply({ type: 'crafty-shipping-result', requestId, result: { ok: false, error: 'The captured quote does not match this auction.' } }); return }
      active.add(requestId); setBusy(true); setMessage('Saving the captured quote…')
      let result: Awaited<ReturnType<typeof savePirateShipQuoteAction>>
      try { result = await savePirateShipQuoteAction(quote) }
      catch { result = { ok: false, error: 'The connection interrupted the save. Retry the captured quote.' } }
      active.delete(requestId); complete.set(requestId, result)
      reply({ type: 'crafty-shipping-result', requestId, result })
      if (!alive) return
      setBusy(active.size > 0)
      if (result.ok) {
        setSaved(current => [{ buyer: result.buyer, packageNumber: result.packageNumber, amountCents: result.amountCents }, ...current])
        setMessage('Saved. Return to Pirate Ship for the next box.')
      } else setMessage(result.error)
    }
    const initialize = window.setTimeout(() => {
      const encodedDraft = params.get('quote')
      if (encodedDraft) {
        try {
          const quote = validatePirateShipQuote(JSON.parse(encodedDraft))
          if (quote.auctionId !== auctionId) throw new Error('Wrong auction')
          setDraft(quote); setMessage('Review the captured price, then save it.')
        } catch { setMessage('The captured quote is invalid. Capture it again in Pirate Ship.') }
      } else if (opener && /^[0-9a-f-]{36}$/i.test(channel)) setMessage('Connected. Fill a package in the helper, then enter its shipping amount.')
      else setMessage('Open this connection from the Shipping helper in Pirate Ship.')
    }, 0)
    window.addEventListener('message', receive)
    ready()
    const timer = window.setInterval(ready, 1500)
    return () => { alive = false; window.removeEventListener('message', receive); window.clearInterval(timer); window.clearTimeout(initialize) }
  }, [auctionId, packages])

  async function saveDraft() {
    if (!draft || busy) return
    setBusy(true)
    let result: Awaited<ReturnType<typeof savePirateShipQuoteAction>>
    try { result = await savePirateShipQuoteAction(draft) }
    catch { result = { ok: false, error: 'The connection interrupted the save. Try again.' } }
    setBusy(false)
    if (result.ok) { setSaved(current => [{ buyer: result.buyer, packageNumber: result.packageNumber, amountCents: result.amountCents }, ...current]); setDraft(null); setMessage('Shipping quote saved.'); window.history.replaceState(null, '', window.location.pathname + '?auction=' + auctionId) }
    else setMessage(result.error)
  }

  return <main className={styles.page}>
    <p className={styles.eyebrow}>{title}</p><h1>Shipping quotes, saved.</h1>
    <p className={styles.intro}>Keep this tab open while you quote the remaining boxes in Pirate Ship.</p>
    <div className={styles.status} role="status" aria-live="polite">{message}</div>
    {draft ? <section className={styles.card}><h2>Captured quote</h2>
      <p>Box {draft.packageNumber} · {draft.provider} {draft.service}</p>
      <strong className={styles.price}>${(draft.amountCents / 100).toFixed(2)}</strong>
      <button type="button" onClick={() => void saveDraft()} disabled={busy}>Save captured quote</button>
    </section> : null}
    {saved.length ? <section className={styles.card}><h2>Saved in this session</h2><ul>
      {saved.map((quote, i) => <li key={i}><span>{quote.buyer} · box {quote.packageNumber}</span><strong>${(quote.amountCents / 100).toFixed(2)}</strong></li>)}
    </ul></section> : null}
    <Link className={styles.link} href={'/auction?auction=' + auctionId + '&view=shipping'}>View shipping in the app</Link>
    <p className={styles.note}>Saving a quote updates the box cost and the buyer’s combined shipping total. Label purchase stays in Pirate Ship after payment.</p>
  </main>
}
