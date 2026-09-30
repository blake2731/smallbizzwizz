'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  saveAuctionPackageAction,
  saveBuyerShippingProfileAction,
} from './actions'
import styles from './auction.module.css'

type ShippingPackage = {
  id: number
  packageNumber: number
  packagingType: 'box' | 'envelope'
  weightOunces: number | null
  lengthHundredths: number | null
  widthHundredths: number | null
  heightHundredths: number | null
  shippingCents: number | null
  status: 'unpacked' | 'packed'
  shippoProvider: string | null
  shippoService: string | null
}

type ShippingBuyer = {
  id: number
  displayName: string
  itemCount: number
  subtotalCents: number
  shippingCents: number | null
  packages: ShippingPackage[]
  shippingProfile: {
    email: string | null
    phone: string | null
    address1: string | null
    address2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    countryCode: string
  } | null
  itemNames: string[]
}

function dollars(cents: number | null) {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function dimension(hundredths: number | null) {
  if (hundredths === null) return null
  return String(hundredths / 100)
}

function weightLabel(ounces: number | null) {
  if (ounces === null) return 'Weight missing'
  const pounds = Math.floor(ounces / 16)
  const remainder = ounces % 16
  return pounds + ' lb ' + remainder + ' oz'
}

function packageLabel(pkg: ShippingPackage, letterOnly: boolean) {
  if (
    letterOnly ||
    (pkg.shippoProvider === 'Manual mail' && pkg.shippoService === 'Letter + 2 stamps')
  ) {
    return 'Letter + 2 stamps'
  }

  const dims = pkg.packagingType === 'envelope'
    ? [dimension(pkg.lengthHundredths), dimension(pkg.widthHundredths)]
    : [dimension(pkg.lengthHundredths), dimension(pkg.widthHundredths), dimension(pkg.heightHundredths)]
  const dimensions = dims.every(Boolean) ? dims.join(' × ') + ' in' : 'Dimensions missing'
  return (pkg.packagingType === 'envelope' ? 'Envelope · ' : 'Box · ') + weightLabel(pkg.weightOunces) + ' · ' + dimensions
}

function BuyerShippingCard({
  auctionId,
  buyer,
}: {
  auctionId: number
  buyer: ShippingBuyer
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const profile = buyer.shippingProfile
  const [address1, setAddress1] = useState(profile?.address1 ?? '')
  const [address2, setAddress2] = useState(profile?.address2 ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [state, setState] = useState(profile?.state ?? '')
  const [postalCode, setPostalCode] = useState(profile?.postalCode ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [charges, setCharges] = useState<Record<number, string>>(
    Object.fromEntries(
      buyer.packages.map((pkg) => [
        pkg.id,
        pkg.shippingCents === null ? '' : (pkg.shippingCents / 100).toFixed(2),
      ]),
    ),
  )

  const hasAddress =
    Boolean(address1.trim()) &&
    Boolean(city.trim()) &&
    Boolean(state.trim()) &&
    Boolean(postalCode.trim())

  const letterOnly =
    buyer.itemNames.length > 0 &&
    buyer.itemNames.every((name) => name.trim().toLowerCase() === 'seeds')

  const allPacked = buyer.packages.length > 0 && buyer.packages.every((pkg) => pkg.status === 'packed')
  const allCharged = buyer.packages.length > 0 && buyer.packages.every((pkg) => pkg.shippingCents !== null)
  const ready = hasAddress && allPacked && allCharged

  function saveAddress() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await saveBuyerShippingProfileAction({
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
          })
          setMessage('Address saved.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not save address.')
        }
      })()
    })
  }

  function savePackageShipping(pkg: ShippingPackage) {
    const shipping = charges[pkg.id] ?? ''
    if (!shipping.trim()) {
      setMessage('Enter the shipping charge. Use 0 if shipping is free.')
      return
    }

    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const pounds = pkg.weightOunces === null ? '' : String(Math.floor(pkg.weightOunces / 16))
          const ounces = pkg.weightOunces === null ? '' : String(pkg.weightOunces % 16)
          await saveAuctionPackageAction({
            auctionId,
            buyerId: buyer.id,
            packageId: pkg.id,
            shipping,
            packed: pkg.status === 'packed',
            weightPounds: pounds,
            weightOunces: ounces,
            length: dimension(pkg.lengthHundredths) ?? '',
            width: dimension(pkg.widthHundredths) ?? '',
            height: dimension(pkg.heightHundredths) ?? '',
            packagingType: pkg.packagingType,
            mailingMode: letterOnly ? 'letter' : 'parcel',
          })
          setMessage('Shipping saved.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not save shipping.')
        }
      })()
    })
  }

  async function copyPirateShip(pkg: ShippingPackage) {
    const text = [
      buyer.displayName,
      address1,
      address2,
      city + ', ' + state.toUpperCase() + ' ' + postalCode,
      phone ? 'Phone: ' + phone : null,
      email ? 'Email: ' + email : null,
      '',
      'Package ' + pkg.packageNumber,
      packageLabel(pkg, letterOnly),
    ]
      .filter(Boolean)
      .join('\n')

    await navigator.clipboard.writeText(text)
    setMessage('Pirate Ship details copied.')
  }

  return (
    <details className={styles.shippingWorkflowCard}>
      <summary className={styles.shippingSummary}>
        <div className={styles.shippingSummaryMain}>
          <strong>{buyer.displayName}</strong>
          <span>{buyer.itemCount} {buyer.itemCount === 1 ? 'item' : 'items'} · {dollars(buyer.subtotalCents)}</span>
        </div>
        <div className={styles.shippingSummaryPackage}>
          {buyer.packages.length === 1
            ? packageLabel(buyer.packages[0], letterOnly)
            : buyer.packages.length + ' packages'}
        </div>
        <div className={styles.shippingSummaryStatus}>
          {!allPacked ? <span className={styles.profileStatusMuted}>Finish packing</span> : null}
          {!hasAddress ? <span className={styles.profileStatusMuted}>Needs address</span> : null}
          {hasAddress && !allCharged ? <span className={styles.infoBadge}>Needs charge</span> : null}
          {ready ? <span className={styles.goodBadge}>Ready to invoice</span> : null}
        </div>
      </summary>

      <div className={styles.shippingBody}>
        <section className={styles.shippingSection}>
          <div className={styles.shippingSectionHeading}>
            <div>
              <strong>Ship to</strong>
              <small>Stored once and reused for future auctions.</small>
            </div>
            {hasAddress ? <span className={styles.goodBadge}>Saved</span> : null}
          </div>

          {hasAddress ? (
            <div className={styles.addressSummary}>
              <strong>{address1}{address2 ? ', ' + address2 : ''}</strong>
              <span>{city}, {state.toUpperCase()} {postalCode}</span>
              <details>
                <summary>Edit address</summary>
                <div className={styles.shippingAddressGrid}>
                  <label className={styles.fieldGroup}>
                    <span>Street address</span>
                    <input className={styles.compactInput} value={address1} onChange={(e) => setAddress1(e.target.value)} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span>Apartment or unit</span>
                    <input className={styles.compactInput} value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Optional" />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span>City</span>
                    <input className={styles.compactInput} value={city} onChange={(e) => setCity(e.target.value)} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span>State</span>
                    <input className={styles.compactInput} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={3} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span>ZIP</span>
                    <input className={styles.compactInput} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span>Email</span>
                    <input className={styles.compactInput} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
                  </label>
                </div>
                <button className={styles.secondaryAction} type="button" onClick={saveAddress} disabled={pending}>
                  Save address changes
                </button>
              </details>
            </div>
          ) : (
            <>
              <div className={styles.shippingAddressGrid}>
                <label className={styles.fieldGroup}>
                  <span>Street address</span>
                  <input className={styles.compactInput} value={address1} onChange={(e) => setAddress1(e.target.value)} />
                </label>
                <label className={styles.fieldGroup}>
                  <span>Apartment or unit</span>
                  <input className={styles.compactInput} value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Optional" />
                </label>
                <label className={styles.fieldGroup}>
                  <span>City</span>
                  <input className={styles.compactInput} value={city} onChange={(e) => setCity(e.target.value)} />
                </label>
                <label className={styles.fieldGroup}>
                  <span>State</span>
                  <input className={styles.compactInput} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} maxLength={3} />
                </label>
                <label className={styles.fieldGroup}>
                  <span>ZIP</span>
                  <input className={styles.compactInput} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                </label>
                <label className={styles.fieldGroup}>
                  <span>Email</span>
                  <input className={styles.compactInput} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
                </label>
              </div>
              <button className={styles.primaryAction} type="button" onClick={saveAddress} disabled={pending || !hasAddress}>
                Save address
              </button>
            </>
          )}
        </section>

        <section className={styles.shippingSection}>
          <div className={styles.shippingSectionHeading}>
            <div>
              <strong>{letterOnly ? 'Mailing' : 'Packages'}</strong>
              <small>{letterOnly ? 'No Pirate Ship label needed.' : 'Measurements are locked from the Pack step.'}</small>
            </div>
            {!allPacked ? (
              <Link className={styles.smallTextLink} href={'/auction?auction=' + auctionId + '&view=pack'}>
                Return to Pack
              </Link>
            ) : null}
          </div>

          <div className={styles.shippingPackageList}>
            {buyer.packages.map((pkg) => (
              <div className={styles.shippingPackageRow} key={pkg.id}>
                <div>
                  <strong>{letterOnly ? '✉️ Letter + 2 stamps' : 'Package ' + pkg.packageNumber}</strong>
                  <span>{packageLabel(pkg, letterOnly)}</span>
                </div>

                <label className={styles.shippingChargeField}>
                  <span>Charge customer</span>
                  <div className={styles.moneyInputWrapSmall}>
                    <span className={styles.currency}>$</span>
                    <input
                      className={styles.compactInput}
                      inputMode="decimal"
                      value={charges[pkg.id] ?? ''}
                      onChange={(event) =>
                        setCharges((current) => ({ ...current, [pkg.id]: event.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </label>

                <div className={styles.shippingRowActions}>
                  {!letterOnly ? (
                    <button
                      className={styles.secondaryAction}
                      type="button"
                      onClick={() => void copyPirateShip(pkg)}
                      disabled={!hasAddress || !allPacked}
                    >
                      Copy for Pirate Ship
                    </button>
                  ) : null}
                  <button
                    className={styles.primaryAction}
                    type="button"
                    onClick={() => savePackageShipping(pkg)}
                    disabled={pending || !allPacked}
                  >
                    Save shipping
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {message ? <div className={styles.cardMessage}>{message}</div> : null}
      </div>
    </details>
  )
}

export default function ShippingWorkflow({
  auctionId,
  buyers,
}: {
  auctionId: number
  buyers: ShippingBuyer[]
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'todo' | 'ready' | 'letters' | 'all'>('todo')

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return buyers.filter((buyer) => {
      const profile = buyer.shippingProfile
      const hasAddress =
        Boolean(profile?.address1) &&
        Boolean(profile?.city) &&
        Boolean(profile?.state) &&
        Boolean(profile?.postalCode)
      const allPacked = buyer.packages.length > 0 && buyer.packages.every((pkg) => pkg.status === 'packed')
      const allCharged = buyer.packages.length > 0 && buyer.packages.every((pkg) => pkg.shippingCents !== null)
      const ready = hasAddress && allPacked && allCharged
      const letterOnly =
        buyer.itemNames.length > 0 &&
        buyer.itemNames.every((name) => name.trim().toLowerCase() === 'seeds')

      if (filter === 'todo' && ready) return false
      if (filter === 'ready' && !ready) return false
      if (filter === 'letters' && !letterOnly) return false
      if (normalizedQuery && !buyer.displayName.toLowerCase().includes(normalizedQuery)) return false
      return true
    })
  }, [buyers, filter, query])

  return (
    <div className={styles.shippingWorkflow}>
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
            ['todo', 'Needs work'],
            ['ready', 'Ready'],
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

      <div className={styles.shippingList}>
        {filtered.map((buyer) => (
          <BuyerShippingCard key={buyer.id} auctionId={auctionId} buyer={buyer} />
        ))}
      </div>
    </div>
  )
}
