'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  saveBuyerContactAction,
  setBuyerInvoiceStatusAction,
  setBuyerPrivateGroupAction,
  setBuyerShippingAction,
} from './actions'
import styles from './auction.module.css'

type Item = {
  id: number
  itemName: string
  priceCents: number
}

type Buyer = {
  id: number
  displayName: string
  privateGroup: boolean
  email: string | null
  shippingCents: number | null
  packageStatus: 'unpacked' | 'packed'
  invoiceStatus: 'not_ready' | 'ready' | 'sent' | 'paid'
  invoiceMethod: 'messenger' | 'shopify' | 'other' | null
  subtotalCents: number
  discountCents: number
  dueCents: number | null
  items: Item[]
}

function dollars(cents: number | null) {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export default function BuyerCard({
  auctionId,
  auctionTitle,
  buyer,
  mode,
}: {
  auctionId: number
  auctionTitle: string
  buyer: Buyer
  mode: 'buyers' | 'pack' | 'invoice'
}) {
  const router = useRouter()
  const [shipping, setShipping] = useState(
    buyer.shippingCents === null ? '' : (buyer.shippingCents / 100).toFixed(2),
  )
  const [packed, setPacked] = useState(buyer.packageStatus === 'packed')
  const [email, setEmail] = useState(buyer.email ?? '')
  const [message, setMessage] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy invoice for Messenger')
  const [pending, startTransition] = useTransition()

  async function copyInvoice() {
    if (buyer.dueCents === null || buyer.shippingCents === null) {
      setMessage('Enter shipping before copying the final invoice.')
      return
    }

    const itemLines = buyer.items
      .map((item) => '• ' + item.itemName + ' — ' + dollars(item.priceCents))
      .join('\n')

    const totals = [
      'Merchandise: ' + dollars(buyer.subtotalCents),
      buyer.discountCents > 0
        ? 'Private Group discount (10%): -' + dollars(buyer.discountCents)
        : null,
      'Shipping: ' + dollars(buyer.shippingCents),
      'Total: ' + dollars(buyer.dueCents),
    ].filter(Boolean).join('\n')

    const invoiceText = [
      'Hi ' + buyer.displayName + '! Here is your invoice from The Crafty Brother.',
      '',
      auctionTitle,
      '',
      itemLines,
      '',
      totals,
      '',
      'Thank you for your purchase! 💛',
    ].join('\n')

    try {
      await navigator.clipboard.writeText(invoiceText)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = invoiceText
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }

    setCopyLabel('Copied — paste into Messenger')
    setMessage('Invoice copied to your clipboard.')
    window.setTimeout(() => setCopyLabel('Copy invoice for Messenger'), 2600)
  }

  function run(action: () => Promise<unknown>, success: string) {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await action()
          setMessage(success)
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Update failed.')
        }
      })()
    })
  }

  return (
    <article className={styles.buyerCard}>
      <div className={styles.buyerCardTop}>
        <div>
          <div className={styles.buyerName}>{buyer.displayName}</div>
          <div className={styles.buyerMeta}>
            {buyer.items.length} {buyer.items.length === 1 ? 'item' : 'items'} · {dollars(buyer.subtotalCents)}
          </div>
        </div>
        <div className={styles.badgeRow}>
          {buyer.privateGroup ? <span className={styles.pgBadge}>PG −10%</span> : null}
          {buyer.packageStatus === 'packed' ? <span className={styles.goodBadge}>Packed</span> : null}
          {buyer.invoiceStatus === 'paid' ? <span className={styles.goodBadge}>Paid</span> : null}
          {buyer.invoiceStatus === 'sent' ? <span className={styles.infoBadge}>Invoice sent</span> : null}
        </div>
      </div>

      <div className={styles.itemList}>
        {buyer.items.map((item) => (
          <div className={styles.itemLine} key={item.id}>
            <span>{item.itemName}</span>
            <strong>{dollars(item.priceCents)}</strong>
          </div>
        ))}
      </div>

      {mode === 'buyers' ? (
        <div className={styles.buyerControls}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={buyer.privateGroup}
              onChange={(event) =>
                run(
                  () =>
                    setBuyerPrivateGroupAction({
                      auctionId,
                      buyerId: buyer.id,
                      enabled: event.target.checked,
                    }),
                  event.target.checked ? 'Private Group discount enabled.' : 'Private Group discount removed.',
                )
              }
              disabled={pending}
            />
            <span>
              <strong>Private Group member</strong>
              <small>Automatically applies 10% to merchandise only.</small>
            </span>
          </label>
        </div>
      ) : null}

      {mode === 'pack' ? (
        <div className={styles.buyerControls}>
          <div className={styles.compactGrid}>
            <label className={styles.fieldGroup}>
              <span>Shipping</span>
              <div className={styles.moneyInputWrapSmall}>
                <span className={styles.currency}>$</span>
                <input
                  className={styles.compactInput}
                  inputMode="decimal"
                  value={shipping}
                  onChange={(event) => setShipping(event.target.value)}
                  placeholder="0.00"
                  disabled={pending}
                />
              </div>
            </label>

            <label className={styles.packCheck}>
              <input
                type="checkbox"
                checked={packed}
                onChange={(event) => setPacked(event.target.checked)}
                disabled={pending}
              />
              <span>Package is packed</span>
            </label>
          </div>

          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() =>
              run(
                () =>
                  setBuyerShippingAction({
                    auctionId,
                    buyerId: buyer.id,
                    shipping,
                    packed,
                  }),
                'Packaging saved.',
              )
            }
            disabled={pending}
          >
            Save package
          </button>

          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={buyer.privateGroup}
              onChange={(event) =>
                run(
                  () =>
                    setBuyerPrivateGroupAction({
                      auctionId,
                      buyerId: buyer.id,
                      enabled: event.target.checked,
                    }),
                  'PG status updated.',
                )
              }
              disabled={pending}
            />
            <span>
              <strong>Private Group −10%</strong>
              <small>Merchandise only; shipping remains full price.</small>
            </span>
          </label>
        </div>
      ) : null}

      {mode === 'invoice' ? (
        <div className={styles.buyerControls}>
          <div className={styles.totalBreakdown}>
            <div><span>Merchandise</span><strong>{dollars(buyer.subtotalCents)}</strong></div>
            <div><span>PG discount</span><strong>−{dollars(buyer.discountCents)}</strong></div>
            <div><span>Shipping</span><strong>{dollars(buyer.shippingCents)}</strong></div>
            <div className={styles.dueLine}><span>Amount due</span><strong>{dollars(buyer.dueCents)}</strong></div>
          </div>

          <button
            className={styles.copyInvoiceButton}
            type="button"
            onClick={copyInvoice}
            disabled={buyer.dueCents === null}
          >
            📋 {copyLabel}
          </button>

          <div className={styles.invoiceActions}>
            <button
              className={styles.primaryAction}
              type="button"
              onClick={() =>
                run(
                  () =>
                    setBuyerInvoiceStatusAction({
                      auctionId,
                      buyerId: buyer.id,
                      status: 'sent',
                      method: 'messenger',
                    }),
                  'Messenger invoice marked sent.',
                )
              }
              disabled={pending || buyer.dueCents === null}
            >
              Mark Messenger sent
            </button>
            <button
              className={styles.secondaryAction}
              type="button"
              onClick={() =>
                run(
                  () =>
                    setBuyerInvoiceStatusAction({
                      auctionId,
                      buyerId: buyer.id,
                      status: 'paid',
                      method: buyer.invoiceMethod ?? 'messenger',
                    }),
                  'Marked paid.',
                )
              }
              disabled={pending || buyer.dueCents === null}
            >
              Mark paid
            </button>
          </div>

          <details className={styles.futureEmail}>
            <summary>
              Future email / Shopify
              {buyer.email ? <span className={styles.emailSavedBadge}>Email saved</span> : null}
            </summary>
            <div className={styles.futureEmailBody}>
              <p>
                Optional for now. Save an email as you collect them so this buyer can use Shopify/email invoicing later.
              </p>
              <div className={styles.emailRow}>
                <input
                  className={styles.compactInput}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Customer email"
                  disabled={pending}
                />
                <button
                  className={styles.smallButton}
                  type="button"
                  onClick={() =>
                    run(
                      () => saveBuyerContactAction({ auctionId, buyerId: buyer.id, email }),
                      'Email saved for future Shopify invoicing.',
                    )
                  }
                  disabled={pending}
                >
                  Save
                </button>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {message ? <div className={styles.cardMessage}>{message}</div> : null}
    </article>
  )
}
