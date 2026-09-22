'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addAuctionPackageAction,
  assignAuctionItemPackageAction,
  removeAuctionPackageAction,
  saveAuctionPackageAction,
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
  shopifyLabelUrl: string | null
  shopifyLabelPurchaseResultId: string | null
}

type Item = {
  id: number
  itemName: string
  priceCents: number
  packageId: number | null
}

function dimensionValue(hundredths: number | null) {
  if (hundredths === null) return ''
  return String(hundredths / 100)
}

function money(cents: number | null) {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function PackageCard({
  auctionId,
  buyerId,
  pkg,
  packageCount,
}: {
  auctionId: number
  buyerId: number
  pkg: Package
  packageCount: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
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

  return (
    <div className={styles.packagePanel}>
      <div className={styles.packSectionTitle}>
        <div>
          <strong>Package {pkg.packageNumber}</strong>
          <small>
            Weight, dimensions, and shipping are tracked separately for every box or mailer.
          </small>
        </div>
        <div className={styles.packageHeaderBadges}>
          {pkg.status === 'packed' ? <span className={styles.profileStatus}>Packed</span> : null}
          {pkg.shippingCents !== null ? (
            <span className={styles.profileStatus}>{money(pkg.shippingCents)}</span>
          ) : (
            <span className={styles.profileStatusMuted}>No shipping yet</span>
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
              if (!window.confirm('Remove package ' + pkg.packageNumber + '? Its items will move to another package.')) {
                return
              }
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
            disabled={pending || Boolean(pkg.shopifyLabelUrl || pkg.shopifyLabelPurchaseResultId)}
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
}: {
  auctionId: number
  buyerId: number
  packages: Package[]
  items: Item[]
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

  const shippingReady = packages.length > 0 && packages.every((pkg) => pkg.shippingCents !== null)
  const shippingTotal = shippingReady
    ? packages.reduce((sum, pkg) => sum + (pkg.shippingCents ?? 0), 0)
    : null

  return (
    <div className={styles.multiPackageSection}>
      <div className={styles.multiPackageHeader}>
        <div>
          <strong>{packages.length} {packages.length === 1 ? 'package' : 'packages'}</strong>
          <small>
            Add another package whenever one buyer needs more than one shipment. Invoice shipping is the total of all package charges.
          </small>
        </div>
        <div className={styles.packageHeaderActions}>
          <span className={shippingReady ? styles.profileStatus : styles.profileStatusMuted}>
            Shipping {money(shippingTotal)}
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
              <strong>Which items go in which package?</strong>
              <small>Move Teresa McSwain's items between Package 1 and Package 2 here.</small>
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
          />
        ))}
      </div>

      {message ? <div className={styles.cardMessage}>{message}</div> : null}
    </div>
  )
}
