'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createShopifyDraftOrderAction,
  getShopifyShippingRatesAction,
  purchaseShopifyLabelAction,
  refreshShopifyLabelAction,
  saveBuyerContactAction,
  sendShopifyInvoiceAction,
  syncShopifyOrderAction,
  saveBuyerShippingProfileAction,
  setBuyerInvoiceStatusAction,
  setBuyerPaymentAction,
  setBuyerPaymentPreferenceAction,
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
  shopifyDraftOrderId: string | null
  shopifyDraftOrderName: string | null
  shopifyInvoiceUrl: string | null
  shopifyDraftOrderTotalCents: number | null
  shopifyOrderId: string | null
  shopifyOrderName: string | null
  shopifyFinancialStatus: string | null
  shopifyFulfillmentOrderId: string | null
  shopifyLabelPurchaseResultId: string | null
  shopifyLabelUrl: string | null
  shopifyTrackingNumber: string | null
  shopifyTrackingUrl: string | null
  shopifyCarrier: string | null
  shopifyLabelPurchasedAt: Date | null
  packageWeightOunces: number | null
  packageLengthHundredths: number | null
  packageWidthHundredths: number | null
  packageHeightHundredths: number | null
  packageStatus: 'unpacked' | 'packed'
  invoiceStatus: 'not_ready' | 'ready' | 'sent' | 'paid'
  invoiceMethod: 'messenger' | 'shopify' | 'other' | null
  paymentMethod: string | null
  preferredPaymentMethod: 'venmo' | 'meta_pay' | null
  paidCents: number | null
  paidAt: Date | null
  subtotalCents: number
  discountCents: number
  dueCents: number | null
  shippingProfile: {
    id: number
    displayName: string
    email: string | null
    phone: string | null
    address1: string | null
    address2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    countryCode: string
  } | null
  items: Item[]
}

const PAYMENT_METHODS = [
  ['paypal', 'PayPal'],
  ['venmo', 'Venmo'],
  ['meta_pay', 'Facebook Pay'],
  ['shopify', 'Shopify'],
  ['other', 'Other'],
] as const

function dollars(cents: number | null) {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function paymentMethodLabel(value: string | null) {
  return PAYMENT_METHODS.find(([key]) => key === value)?.[1] ?? value ?? 'Unknown'
}

function dimensionValue(hundredths: number | null) {
  if (hundredths === null) return ''
  return String(hundredths / 100)
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
  const [weightPounds, setWeightPounds] = useState(
    buyer.packageWeightOunces === null ? '' : String(Math.floor(buyer.packageWeightOunces / 16)),
  )
  const [weightOunces, setWeightOunces] = useState(
    buyer.packageWeightOunces === null ? '' : String(buyer.packageWeightOunces % 16),
  )
  const [length, setLength] = useState(dimensionValue(buyer.packageLengthHundredths))
  const [width, setWidth] = useState(dimensionValue(buyer.packageWidthHundredths))
  const [height, setHeight] = useState(dimensionValue(buyer.packageHeightHundredths))
  const [email, setEmail] = useState(buyer.email ?? buyer.shippingProfile?.email ?? '')
  const [phone, setPhone] = useState(buyer.shippingProfile?.phone ?? '')
  const [address1, setAddress1] = useState(buyer.shippingProfile?.address1 ?? '')
  const [address2, setAddress2] = useState(buyer.shippingProfile?.address2 ?? '')
  const [city, setCity] = useState(buyer.shippingProfile?.city ?? '')
  const [state, setState] = useState(buyer.shippingProfile?.state ?? '')
  const [postalCode, setPostalCode] = useState(buyer.shippingProfile?.postalCode ?? '')
  const [paymentMethod, setPaymentMethod] = useState(
    buyer.paymentMethod ?? buyer.preferredPaymentMethod ?? 'paypal',
  )
  const [invoicePaymentPreference, setInvoicePaymentPreference] = useState<
    'paypal' | 'venmo' | 'meta_pay'
  >(buyer.preferredPaymentMethod ?? 'paypal')
  const [message, setMessage] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy invoice for Messenger')
  const [shopifyInvoiceUrl, setShopifyInvoiceUrl] = useState(buyer.shopifyInvoiceUrl ?? '')
  const [shopifyDraftOrderName, setShopifyDraftOrderName] = useState(
    buyer.shopifyDraftOrderName ?? '',
  )
  const [shopifyTotalCents, setShopifyTotalCents] = useState(
    buyer.shopifyDraftOrderTotalCents,
  )
  const [shippingRates, setShippingRates] = useState<
    Array<{
      handle: string
      title: string
      code: string
      source: string
      amountCents: number | null
      currencyCode: string
    }>
  >([])
  const [shopifyLabelUrl, setShopifyLabelUrl] = useState(buyer.shopifyLabelUrl ?? '')
  const [shopifyTrackingNumber, setShopifyTrackingNumber] = useState(
    buyer.shopifyTrackingNumber ?? '',
  )
  const [shopifyTrackingUrl, setShopifyTrackingUrl] = useState(
    buyer.shopifyTrackingUrl ?? '',
  )
  const [shopifyCarrier, setShopifyCarrier] = useState(buyer.shopifyCarrier ?? '')
  const [pending, startTransition] = useTransition()

  function loadShopifyRates() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await getShopifyShippingRatesAction({
            auctionId,
            buyerId: buyer.id,
            weightPounds,
            weightOunces,
            address1,
            address2,
            city,
            state,
            postalCode,
            countryCode: 'US',
          })
          setShippingRates(result.rates)
          setMessage('Shopify shipping rates loaded.')
        } catch (error) {
          setShippingRates([])
          setMessage(error instanceof Error ? error.message : 'Could not load Shopify shipping rates.')
        }
      })()
    })
  }

  async function copyShipment() {
    const addressLines = [
      buyer.displayName,
      address1.trim(),
      address2.trim(),
      [city.trim(), state.trim(), postalCode.trim()].filter(Boolean).join(', ').replace(', ' + postalCode.trim(), ' ' + postalCode.trim()),
      phone.trim() ? 'Phone: ' + phone.trim() : null,
      email.trim() ? 'Email: ' + email.trim() : null,
      '',
      'Weight: ' + (weightPounds || '0') + ' lb ' + (weightOunces || '0') + ' oz',
      'Dimensions: ' + (length || '?') + ' x ' + (width || '?') + ' x ' + (height || '?') + ' in',
    ].filter((line) => line !== null && line !== '').join('\n')

    try {
      await navigator.clipboard.writeText(addressLines)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = addressLines
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }

    setMessage('Shipment details copied.')
  }

  async function copyText(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setMessage(success)
  }

  function purchaseShopifyLabel() {
    if (
      !window.confirm(
        'This will purchase a Shopify Shipping label and charge the store for the label. Continue?',
      )
    ) {
      return
    }

    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await purchaseShopifyLabelAction({
            auctionId,
            buyerId: buyer.id,
          })

          if (result.labelUrl) {
            setShopifyLabelUrl(result.labelUrl)
            setShopifyTrackingNumber(result.trackingNumber ?? '')
            setShopifyTrackingUrl(result.trackingUrl ?? '')
            setShopifyCarrier(result.carrier ?? '')
            setMessage(result.existing ? 'Existing Shopify label loaded.' : 'Shopify label purchased.')
          } else {
            setMessage(
              result.status === 'PENDING_PURCHASE'
                ? 'Shopify is still creating the label. Use Check label status in a moment.'
                : 'Shopify label status: ' + result.status,
            )
          }

          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not purchase Shopify label.')
        }
      })()
    })
  }

  function refreshShopifyLabel() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await refreshShopifyLabelAction({
            auctionId,
            buyerId: buyer.id,
          })

          if (result.labelUrl) {
            setShopifyLabelUrl(result.labelUrl)
            setShopifyTrackingNumber(result.trackingNumber ?? '')
            setShopifyTrackingUrl(result.trackingUrl ?? '')
            setShopifyCarrier(result.carrier ?? '')
            setMessage('Shopify label is ready.')
          } else {
            setMessage('Shopify label status: ' + result.status)
          }

          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not check Shopify label.')
        }
      })()
    })
  }

  function syncShopifyOrder() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await syncShopifyOrderAction({
            auctionId,
            buyerId: buyer.id,
          })
          setMessage(result.message)
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not check Shopify payment.')
        }
      })()
    })
  }

  function createShopifyInvoice() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await createShopifyDraftOrderAction({
            auctionId,
            buyerId: buyer.id,
          })
          setShopifyInvoiceUrl(result.invoiceUrl)
          setShopifyDraftOrderName(result.draftOrderName ?? '')
          setShopifyTotalCents(result.totalCents)
          setMessage(
            result.existing
              ? 'Existing Shopify checkout link loaded.'
              : 'Shopify checkout link created.',
          )
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Shopify invoice creation failed.')
        }
      })()
    })
  }

  async function copyInvoice() {
    if (buyer.dueCents === null || buyer.shippingCents === null) {
      setMessage('Enter shipping before copying the final invoice.')
      return
    }

    const itemLines = buyer.items
      .map((item, index) => (index + 1) + '. ' + item.itemName + ' — ' + dollars(item.priceCents))
      .join('\n')

    const totals = [
      'Subtotal: ' + dollars(buyer.subtotalCents),
      buyer.discountCents > 0
        ? 'Private Group discount (10%): -' + dollars(buyer.discountCents)
        : null,
      'Shipping: ' + dollars(buyer.shippingCents),
      'TOTAL: ' + dollars(buyer.dueCents),
    ].filter(Boolean).join('\n')

    const paymentLines =
      buyer.preferredPaymentMethod === 'venmo'
        ? [
            'HOW TO PAY',
            'Venmo: @Justin-Crouse-6',
          ]
        : buyer.preferredPaymentMethod === 'meta_pay'
          ? [
              'HOW TO PAY',
              'Facebook Pay: please send through Messenger.',
            ]
          : [
              'HOW TO PAY',
              'PayPal: paypal.me/justincrouse2',
            ]

    const invoiceText = [
      'THE CRAFTY BROTHER',
      'INVOICE',
      '',
      'Sale: ' + auctionTitle,
      'Bill to: ' + buyer.displayName,
      '',
      itemLines,
      '',
      totals,
      '',
      ...paymentLines,
      '',
      'Please send the exact total above and include your name in the payment note so we can match your payment.',
      '',
      'Thank you for your purchase.',
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
          {buyer.preferredPaymentMethod ? (
            <span className={styles.infoBadge}>
              Prefers {buyer.preferredPaymentMethod === 'venmo' ? 'Venmo' : 'Facebook Pay'}
            </span>
          ) : null}
          {buyer.paidAt ? (
            <span className={styles.goodBadge}>Paid · {paymentMethodLabel(buyer.paymentMethod)}</span>
          ) : buyer.invoiceStatus === 'sent' ? (
            <span className={styles.infoBadge}>Invoice sent</span>
          ) : null}
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
          <div className={styles.shippingProfilePanel}>
            <div className={styles.packSectionTitle}>
              <div>
                <strong>Ship to</strong>
                <small>Saved for this customer and reused in future auctions.</small>
              </div>
              {buyer.shippingProfile?.address1 ? (
                <span className={styles.profileStatus}>Saved customer</span>
              ) : (
                <span className={styles.profileStatusMuted}>Needs address</span>
              )}
            </div>

            <div className={styles.addressGrid}>
              <label className={styles.fieldGroup}>
                <span>Address</span>
                <input
                  className={styles.compactInput}
                  value={address1}
                  onChange={(event) => setAddress1(event.target.value)}
                  placeholder="Street address"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Apartment or unit</span>
                <input
                  className={styles.compactInput}
                  value={address2}
                  onChange={(event) => setAddress2(event.target.value)}
                  placeholder="Optional"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>City</span>
                <input
                  className={styles.compactInput}
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="City"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>State</span>
                <input
                  className={styles.compactInput}
                  value={state}
                  onChange={(event) => setState(event.target.value.toUpperCase())}
                  placeholder="VA"
                  maxLength={3}
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>ZIP</span>
                <input
                  className={styles.compactInput}
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  placeholder="24333"
                  inputMode="numeric"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Phone</span>
                <input
                  className={styles.compactInput}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Optional"
                  inputMode="tel"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Email</span>
                <input
                  className={styles.compactInput}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Optional"
                  disabled={pending}
                />
              </label>
            </div>

            <button
              className={styles.secondaryAction}
              type="button"
              onClick={() =>
                run(
                  () =>
                    saveBuyerShippingProfileAction({
                      auctionId,
                      buyerId: buyer.id,
                      email,
                      phone,
                      address1,
                      address2,
                      city,
                      state,
                      postalCode,
                      countryCode: 'US',
                    }),
                  'Customer shipping information saved.',
                )
              }
              disabled={pending}
            >
              Save customer shipping info
            </button>
          </div>

          <div className={styles.packagePanel}>
            <div className={styles.packSectionTitle}>
              <div>
                <strong>Package</strong>
                <small>We will use these values for shipping rates and labels.</small>
              </div>
            </div>

            <div className={styles.packageMeasureGrid}>
              <label className={styles.fieldGroup}>
                <span>Pounds</span>
                <input
                  className={styles.compactInput}
                  inputMode="numeric"
                  value={weightPounds}
                  onChange={(event) => setWeightPounds(event.target.value)}
                  placeholder="0"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Ounces</span>
                <input
                  className={styles.compactInput}
                  inputMode="numeric"
                  value={weightOunces}
                  onChange={(event) => setWeightOunces(event.target.value)}
                  placeholder="0"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Length in</span>
                <input
                  className={styles.compactInput}
                  inputMode="decimal"
                  value={length}
                  onChange={(event) => setLength(event.target.value)}
                  placeholder="12"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Width in</span>
                <input
                  className={styles.compactInput}
                  inputMode="decimal"
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                  placeholder="9"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Height in</span>
                <input
                  className={styles.compactInput}
                  inputMode="decimal"
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  placeholder="2"
                  disabled={pending}
                />
              </label>
              <label className={styles.fieldGroup}>
                <span>Shipping charge</span>
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
            </div>

            <div className={styles.shopifyRatesPanel}>
              <div className={styles.packSectionTitle}>
                <div>
                  <strong>Shopify shipping rates</strong>
                  <small>Uses the saved destination and package weight to price the shipment.</small>
                </div>
              </div>

              <button
                className={styles.secondaryAction}
                type="button"
                onClick={loadShopifyRates}
                disabled={
                  pending ||
                  !address1.trim() ||
                  !city.trim() ||
                  !state.trim() ||
                  !postalCode.trim() ||
                  (!weightPounds.trim() && !weightOunces.trim())
                }
              >
                Get Shopify shipping rates
              </button>

              {shippingRates.length ? (
                <div className={styles.shippingRateList}>
                  {shippingRates.map((rate) => (
                    <button
                      className={styles.shippingRateButton}
                      type="button"
                      key={rate.handle}
                      onClick={() => {
                        if (rate.amountCents === null) return
                        setShipping((rate.amountCents / 100).toFixed(2))
                        setMessage(rate.title + ' selected for shipping.')
                      }}
                      disabled={pending || rate.amountCents === null}
                    >
                      <span>
                        <strong>{rate.title}</strong>
                        <small>{rate.source || rate.code}</small>
                      </span>
                      <b>{dollars(rate.amountCents)}</b>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className={styles.packCheck}>
              <input
                type="checkbox"
                checked={packed}
                onChange={(event) => setPacked(event.target.checked)}
                disabled={pending}
              />
              <span>Package is packed and measured</span>
            </label>

            <div className={styles.packageActions}>
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
                        weightPounds,
                        weightOunces,
                        length,
                        width,
                        height,
                      }),
                    'Package saved.',
                  )
                }
                disabled={pending}
              >
                Save package
              </button>
              <button
                className={styles.copyShipmentButton}
                type="button"
                onClick={copyShipment}
                disabled={pending || !address1.trim() || !city.trim() || !state.trim() || !postalCode.trim()}
              >
                Copy shipment details
              </button>
            </div>
          </div>

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
            {buyer.discountCents > 0 ? (
              <div><span>PG discount</span><strong>−{dollars(buyer.discountCents)}</strong></div>
            ) : null}
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

          <div className={styles.paymentPanel}>
            <div className={styles.paymentPanelTitle}>
              <span>Shopify checkout</span>
              <strong>{shopifyDraftOrderName || 'NOT CREATED'}</strong>
            </div>

            {shopifyInvoiceUrl ? (
              <>
                <div className={styles.paidSummary}>
                  <span>Shopify total</span>
                  <strong>{dollars(shopifyTotalCents)}</strong>
                </div>
                {buyer.dueCents !== null &&
                shopifyTotalCents !== null &&
                buyer.dueCents !== shopifyTotalCents ? (
                  <p className={styles.shopifyTaxNote}>
                    Shopify total differs from the app total because Shopify calculated the checkout,
                    including any applicable tax.
                  </p>
                ) : null}
                <div className={styles.invoiceActions}>
                  <a
                    className={styles.secondaryAction}
                    href={shopifyInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Shopify checkout
                  </a>
                  <button
                    className={styles.secondaryAction}
                    type="button"
                    onClick={() =>
                      copyText(shopifyInvoiceUrl, 'Shopify checkout link copied.')
                    }
                    disabled={pending}
                  >
                    Copy Shopify link
                  </button>
                </div>
                <button
                  className={styles.primaryAction}
                  type="button"
                  onClick={() =>
                    run(
                      () =>
                        sendShopifyInvoiceAction({
                          auctionId,
                          buyerId: buyer.id,
                        }),
                      'Shopify invoice emailed to the customer.',
                    )
                  }
                  disabled={pending || !email.trim() || buyer.invoiceStatus === 'paid'}
                >
                  {buyer.invoiceStatus === 'sent' && buyer.invoiceMethod === 'shopify'
                    ? 'Resend Shopify invoice email'
                    : 'Send Shopify invoice email'}
                </button>
                <button
                  className={styles.secondaryAction}
                  type="button"
                  onClick={syncShopifyOrder}
                  disabled={pending}
                >
                  Check Shopify payment
                </button>
                {buyer.shopifyOrderName ? (
                  <div className={styles.shopifyOrderStatus}>
                    <span>{buyer.shopifyOrderName}</span>
                    <strong>
                      {buyer.shopifyFinancialStatus || (buyer.paidAt ? 'PAID' : 'ORDER CREATED')}
                    </strong>
                  </div>
                ) : null}

                {shopifyLabelUrl ? (
                  <div className={styles.shopifyLabelPanel}>
                    <div className={styles.paymentPanelTitle}>
                      <span>Shipping label</span>
                      <strong>READY</strong>
                    </div>
                    <div className={styles.shopifyOrderStatus}>
                      <span>{shopifyCarrier || 'Shopify Shipping'}</span>
                      <strong>{shopifyTrackingNumber || 'TRACKING READY'}</strong>
                    </div>
                    <div className={styles.invoiceActions}>
                      <a
                        className={styles.secondaryAction}
                        href={shopifyLabelUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open label
                      </a>
                      {shopifyTrackingUrl ? (
                        <a
                          className={styles.secondaryAction}
                          href={shopifyTrackingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Track package
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : buyer.shopifyLabelPurchaseResultId ? (
                  <button
                    className={styles.secondaryAction}
                    type="button"
                    onClick={refreshShopifyLabel}
                    disabled={pending}
                  >
                    Check label status
                  </button>
                ) : (
                  <button
                    className={styles.primaryAction}
                    type="button"
                    onClick={purchaseShopifyLabel}
                    disabled={
                      pending ||
                      !buyer.shopifyFulfillmentOrderId ||
                      !buyer.paidAt ||
                      buyer.paymentMethod !== 'shopify' ||
                      !buyer.packageWeightOunces ||
                      !buyer.packageLengthHundredths ||
                      !buyer.packageWidthHundredths ||
                      !buyer.packageHeightHundredths
                    }
                  >
                    Buy Shopify shipping label
                  </button>
                )}
              </>
            ) : (
              <>
                <p className={styles.shopifyTaxNote}>
                  Creates a Shopify payment link using this buyer, their items, saved address,
                  Private Group discount, and shipping charge. Shopify will calculate the final
                  checkout total.
                </p>
                <button
                  className={styles.primaryAction}
                  type="button"
                  onClick={createShopifyInvoice}
                  disabled={pending || buyer.shippingCents === null}
                >
                  Create Shopify checkout link
                </button>
              </>
            )}
          </div>

          <button
            className={styles.secondaryAction}
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
            disabled={pending || buyer.dueCents === null || Boolean(buyer.paidAt)}
          >
            Mark Messenger sent
          </button>

          <div className={styles.paymentPanel}>
            <div className={styles.paymentPanelTitle}>
              <span>Invoice payment preference</span>
              <strong>{invoicePaymentPreference === 'paypal' ? 'PAYPAL' : invoicePaymentPreference === 'venmo' ? 'VENMO' : 'FACEBOOK PAY'}</strong>
            </div>
            <div className={styles.paymentEntry}>
              <select
                className={styles.compactInput}
                value={invoicePaymentPreference}
                onChange={(event) =>
                  setInvoicePaymentPreference(event.target.value as 'paypal' | 'venmo' | 'meta_pay')
                }
                disabled={pending}
              >
                <option value="paypal">PayPal — default</option>
                <option value="venmo">Venmo</option>
                <option value="meta_pay">Facebook Pay</option>
              </select>
              <button
                className={styles.secondaryAction}
                type="button"
                onClick={() =>
                  run(
                    () =>
                      setBuyerPaymentPreferenceAction({
                        auctionId,
                        buyerId: buyer.id,
                        method: invoicePaymentPreference,
                      }),
                    invoicePaymentPreference === 'paypal'
                      ? 'Invoice preference reset to PayPal.'
                      : 'Customer invoice preference saved.',
                  )
                }
                disabled={pending}
              >
                Save preference
              </button>
            </div>
          </div>

          <div className={styles.paymentPanel}>
            <div className={styles.paymentPanelTitle}>
              <span>Payment</span>
              {buyer.paidAt ? <strong>PAID {dollars(buyer.paidCents)}</strong> : <strong>UNPAID</strong>}
            </div>

            {buyer.paidAt ? (
              <div className={styles.paidSummary}>
                <span>{paymentMethodLabel(buyer.paymentMethod)}</span>
                <button
                  className={styles.smallButton}
                  type="button"
                  onClick={() =>
                    run(
                      () => setBuyerPaymentAction({
                        auctionId,
                        buyerId: buyer.id,
                        paid: false,
                      }),
                      'Payment status reset to unpaid.',
                    )
                  }
                  disabled={pending}
                >
                  Undo paid
                </button>
              </div>
            ) : (
              <div className={styles.paymentEntry}>
                <select
                  className={styles.compactInput}
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  disabled={pending}
                >
                  <option value="">How did they pay?</option>
                  {PAYMENT_METHODS.map(([key, label]) => (
                    <option value={key} key={key}>{label}</option>
                  ))}
                </select>
                <button
                  className={styles.primaryAction}
                  type="button"
                  onClick={() =>
                    run(
                      () => setBuyerPaymentAction({
                        auctionId,
                        buyerId: buyer.id,
                        paid: true,
                        paymentMethod: paymentMethod as 'paypal' | 'venmo' | 'meta_pay' | 'shopify' | 'other',
                      }),
                      'Payment recorded.',
                    )
                  }
                  disabled={pending || buyer.dueCents === null || !paymentMethod}
                >
                  Mark paid
                </button>
              </div>
            )}
          </div>

          <details className={styles.futureEmail}>
            <summary>
              Customer email
              {buyer.email ? <span className={styles.emailSavedBadge}>Email saved</span> : null}
            </summary>
            <div className={styles.futureEmailBody}>
              <p>
                Save the customer email here if you want Shopify to send the payment invoice directly.
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
                      'Customer email saved.',
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
