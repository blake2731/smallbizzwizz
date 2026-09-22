'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addAuctionPackageAction,
  assignAuctionItemPackageAction,
  getShippoPackageRatesAction,
  removeAuctionPackageAction,
  saveAuctionPackageAction,
  selectShippoPackageRateAction,
} from './actions'
import styles from './auction.module.css'

type Package = {
  id: number
  packageNumber: number
  weightOunces: number | null
  lengthHundredths: number | null
  widthHundredths: number | null
  heightHundredths: number | null
  shippingCents: number | null
  status: 'unpacked' | 'packed'
  shippoShipmentId: string | null
  shippoRateId: string | null
  shippoProvider: string | null
  shippoService: string | null
  shippoRateCents: number | null
  shippoTransactionId: string | null
  shippoLabelUrl: string | null
}

type Item = {
  id: number
  itemName: string
  priceCents: number
  packageId: number | null
}

type Rate = {
  rateId: string
  shipmentId: string
  provider: string
  service: string
  serviceToken: string
  amountCents: number | null
  currencyCode: string
  estimatedDays: number | null
  durationTerms: string
  attributes: string[]
}

function dollars(cents: number | null) {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function dimensionValue(hundredths: number | null) {
  if (hundredths === null) return ''
  return String(hundredths / 100)
}

function PackageCard({
  auctionId,
  buyerId,
  pkg,
  packageCount,
  destination,
}: {
  auctionId: number
  buyerId: number
  pkg: Package
  packageCount: number
  destination: {
    address1: string
    address2: string
    city: string
    state: string
    postalCode: string
    phone: string
    email: string
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [rates, setRates] = useState<Rate[]>([])
  const [weightPounds, setWeightPounds] = useState(
    pkg.weightOunces === null ? '' : String(Math.floor(pkg.weightOunces / 16)),
  )
  const [weightOunces, setWeightOunces] = useState(
    pkg.weightOunces === null ? '' : String(pkg.weightOunces % 16),
  )
  const [length, setLength] = useState(dimensionValue(pkg.lengthHundredths))
  const [width, setWidth] = useState(dimensionValue(pkg.widthHundredths))
  const [height, setHeight] = useState(dimensionValue(pkg.heightHundredths))
  const [shipping, setShipping] = useState(
    pkg.shippingCents === null ? '' : (pkg.shippingCents / 100).toFixed(2),
  )
  const [packed, setPacked] = useState(pkg.status === 'packed')

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

  async function applyRate(rate: Rate) {
    if (rate.amountCents === null) return

    await selectShippoPackageRateAction({
      auctionId,
      buyerId,
      packageId: pkg.id,
      shipmentId: rate.shipmentId,
      rateId: rate.rateId,
      provider: rate.provider,
      service: rate.service,
      amountCents: rate.amountCents,
      packed,
      weightPounds,
      weightOunces,
      length,
      width,
      height,
    })

    setShipping((rate.amountCents / 100).toFixed(2))
  }

  function getRates() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await getShippoPackageRatesAction({
            auctionId,
            buyerId,
            packageId: pkg.id,
            weightPounds,
            weightOunces,
            length,
            width,
            height,
            address1: destination.address1,
            address2: destination.address2,
            city: destination.city,
            state: destination.state,
            postalCode: destination.postalCode,
            phone: destination.phone,
            email: destination.email,
            countryCode: 'US',
          })

          setRates(result.rates)
          const cheapest = result.rates[0]

          if (cheapest?.amountCents !== null && cheapest?.amountCents !== undefined) {
            await applyRate(cheapest)
            setMessage(
              'Cheapest selected: ' +
                cheapest.provider +
                ' ' +
                cheapest.service +
                ' ' +
                dollars(cheapest.amountCents),
            )
          } else {
            setMessage('Rates loaded.')
          }

          router.refresh()
        } catch (error) {
          setRates([])
          setMessage(error instanceof Error ? error.message : 'Could not load Shippo rates.')
        }
      })()
    })
  }

  const canRate =
    destination.address1.trim() &&
    destination.city.trim() &&
    destination.state.trim() &&
    destination.postalCode.trim() &&
    (weightPounds.trim() || weightOunces.trim()) &&
    length.trim() &&
    width.trim() &&
    height.trim()

  return (
    <div className={styles.packagePanel}>
      <div className={styles.packSectionTitle}>
        <div>
          <strong>Package {pkg.packageNumber}</strong>
          <small>Each package gets its own dimensions, weight, rate, and later its own label.</small>
        </div>
        <div className={styles.packageHeaderBadges}>
          {pkg.status === 'packed' ? <span className={styles.profileStatus}>Packed</span> : null}
          {pkg.shippingCents !== null ? (
            <span className={styles.profileStatus}>{dollars(pkg.shippingCents)}</span>
          ) : (
            <span className={styles.profileStatusMuted}>Needs rate</span>
          )}
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
            <strong>Carrier rates</strong>
            <small>Shippo compares the available services for this exact package. The cheapest rate is selected automatically.</small>
          </div>
        </div>

        <button
          className={styles.primaryAction}
          type="button"
          onClick={getRates}
          disabled={pending || !canRate}
        >
          {pending ? 'Getting rates…' : 'Get cheapest shipping'}
        </button>

        {rates.length ? (
          <div className={styles.shippingRateList}>
            {rates.map((rate, index) => (
              <button
                className={styles.shippingRateButton}
                type="button"
                key={rate.rateId}
                onClick={() => {
                  setMessage('')
                  startTransition(() => {
                    void (async () => {
                      try {
                        await applyRate(rate)
                        setMessage(rate.provider + ' ' + rate.service + ' selected.')
                        router.refresh()
                      } catch (error) {
                        setMessage(
                          error instanceof Error ? error.message : 'Could not select rate.',
                        )
                      }
                    })()
                  })
                }}
                disabled={pending || rate.amountCents === null}
              >
                <span>
                  <strong>
                    {index === 0 ? 'Cheapest · ' : ''}
                    {rate.provider} {rate.service}
                  </strong>
                  <small>
                    {rate.estimatedDays !== null
                      ? String(rate.estimatedDays) + ' estimated days'
                      : rate.durationTerms || 'Delivery estimate unavailable'}
                  </small>
                </span>
                <b>{dollars(rate.amountCents)}</b>
              </button>
            ))}
          </div>
        ) : pkg.shippoProvider && pkg.shippoService ? (
          <div className={styles.shopifyOrderStatus}>
            <span>{pkg.shippoProvider} {pkg.shippoService}</span>
            <strong>{dollars(pkg.shippoRateCents)}</strong>
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
        <span>Package {pkg.packageNumber} is packed and measured</span>
      </label>

      <div className={styles.packageActions}>
        <button
          className={styles.secondaryAction}
          type="button"
          onClick={() =>
            run(
              () =>
                saveAuctionPackageAction({
                  auctionId,
                  buyerId,
                  packageId: pkg.id,
                  shipping,
                  packed,
                  weightPounds,
                  weightOunces,
                  length,
                  width,
                  height,
                }),
              'Package ' + pkg.packageNumber + ' saved.',
            )
          }
          disabled={pending}
        >
          Save package {pkg.packageNumber}
        </button>

        {packageCount > 1 ? (
          <button
            className={styles.dangerAction}
            type="button"
            onClick={() => {
              if (!window.confirm('Remove Package ' + pkg.packageNumber + '?')) return
              run(
                () =>
                  removeAuctionPackageAction({
                    auctionId,
                    buyerId,
                    packageId: pkg.id,
                  }),
                'Package removed.',
              )
            }}
            disabled={pending || Boolean(pkg.shippoTransactionId || pkg.shippoLabelUrl)}
          >
            Remove package
          </button>
        ) : null}
      </div>

      {message ? <div className={styles.cardMessage}>{message}</div> : null}
    </div>
  )
}

export default function BuyerPackagesEditor({
  auctionId,
  buyerId,
  packages,
  items,
  destination,
}: {
  auctionId: number
  buyerId: number
  packages: Package[]
  items: Item[]
  destination: {
    address1: string
    address2: string
    city: string
    state: string
    postalCode: string
    phone: string
    email: string
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  function addPackage() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          const result = await addAuctionPackageAction({ auctionId, buyerId })
          setMessage('Package ' + result.packageNumber + ' added.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not add package.')
        }
      })()
    })
  }

  function assignItem(itemId: number, packageId: number) {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await assignAuctionItemPackageAction({
            auctionId,
            buyerId,
            itemId,
            packageId,
          })
          setMessage('Item moved.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not move item.')
        }
      })()
    })
  }

  const allRated = packages.length > 0 && packages.every((pkg) => pkg.shippingCents !== null)
  const shippingTotal = allRated
    ? packages.reduce((sum, pkg) => sum + (pkg.shippingCents ?? 0), 0)
    : null

  return (
    <div className={styles.multiPackageSection}>
      <div className={styles.multiPackageHeader}>
        <div>
          <strong>
            {packages.length} {packages.length === 1 ? 'package' : 'packages'}
          </strong>
          <small>
            Add another package whenever this buyer needs a second box or mailer. The Shopify invoice uses the combined shipping total.
          </small>
        </div>
        <div className={styles.packageHeaderActions}>
          <span className={allRated ? styles.profileStatus : styles.profileStatusMuted}>
            Shipping {dollars(shippingTotal)}
          </span>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={addPackage}
            disabled={pending}
          >
            Add package
          </button>
        </div>
      </div>

      {packages.length > 1 ? (
        <div className={styles.packageContentsPanel}>
          <div className={styles.packSectionTitle}>
            <div>
              <strong>Package contents</strong>
              <small>Choose which package each auction item is going into.</small>
            </div>
          </div>
          <div className={styles.packageItemAssignments}>
            {items.map((item) => (
              <label className={styles.packageItemAssignment} key={item.id}>
                <span>{item.itemName}</span>
                <select
                  className={styles.compactInput}
                  value={item.packageId ?? packages[0]?.id ?? ''}
                  onChange={(event) => assignItem(item.id, Number(event.target.value))}
                  disabled={pending}
                >
                  {packages.map((pkg) => (
                    <option value={pkg.id} key={pkg.id}>
                      Package {pkg.packageNumber}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.packageStack}>
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.id}
            auctionId={auctionId}
            buyerId={buyerId}
            pkg={pkg}
            packageCount={packages.length}
            destination={destination}
          />
        ))}
      </div>

      {message ? <div className={styles.cardMessage}>{message}</div> : null}
    </div>
  )
}
