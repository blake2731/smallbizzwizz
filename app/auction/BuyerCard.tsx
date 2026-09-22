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
  buyer,
  mode,
}: {
  auctionId: number
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
  const [pending, startTransition] = useTransition()

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

          <div className={styles.emailRow}>
            <input
              className={styles.compactInput}
              type="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Customer email for Shopify"
              disabled={pending}
            />
            <button
              className={styles.smallButton}
              type="button"
              onClick={() =>
                run(
                  () => saveBuyerContactAction({ auctionId, buyerId: buyer.id, email }),
                  'Email saved.',
                )
              }
              disabled={pending}
            >
              Save
            </button>
          </div>

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

          <div className={styles.shopifyReadiness}>
            <span className={buyer.email ? styles.readyDot : styles.waitDot} />
            {buyer.email
              ? 'Shopify-ready identity saved. Draft-order sending is the next integration step.'
              : 'Add an email to make this buyer eligible for the Shopify invoice lane.'}
          </div>
        </div>
      ) : null}

      {message ? <div className={styles.cardMessage}>{message}</div> : null}
    </article>
  )
}
