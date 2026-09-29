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
  shippoTransactionId: string | null
  shippoLabelUrl: string | null
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

function LetterCard({
  auctionId,
  buyerId,
  pkg,
}: {
  auctionId: number
  buyerId: number
  pkg: Package
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')

  function markPacked() {
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await saveAuctionPackageAction({
            auctionId,
            buyerId,
            packageId: pkg.id,
            shipping: pkg.shippingCents === null ? '' : (pkg.shippingCents / 100).toFixed(2),
            packed: true,
            weightPounds: '',
            weightOunces: '',
            length: '',
            width: '',
            height: '',
            mailingMode: 'letter',
          })
          setMessage('Letter marked packed.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not save letter.')
        }
      })()
    })
  }

  return (
    <div className={styles.letterPackCard}>
      <div>
        <strong>✉️ Letter + 2 stamps</strong>
        <small>Seeds do not need package weight or box dimensions here.</small>
      </div>
      <button
        className={pkg.status === 'packed' ? styles.secondaryAction : styles.primaryAction}
        type="button"
        onClick={markPacked}
        disabled={pending}
      >
        {pending ? 'Saving…' : pkg.status === 'packed' ? 'Packed ✓' : 'Mark packed'}
      </button>
      {message ? <div className={styles.cardMessage}>{message}</div> : null}
    </div>
  )
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

  const pounds = Number(weightPounds || 0)
  const ounces = Number(weightOunces || 0)
  const totalOunces = pounds * 16 + ounces
  const validWeight =
    Number.isFinite(totalOunces) &&
    totalOunces > 0 &&
    Number.isInteger(pounds) &&
    Number.isInteger(ounces) &&
    pounds >= 0 &&
    ounces >= 0 &&
    ounces <= 15

  const validDimension = (value: string) => {
    const number = Number(value)
    return value.trim() !== '' && Number.isFinite(number) && number > 0
  }

  const complete =
    validWeight &&
    validDimension(length) &&
    validDimension(width) &&
    validDimension(height)

  function savePackage() {
    if (!complete) {
      setMessage('Enter the package weight and all three dimensions.')
      return
    }

    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await saveAuctionPackageAction({
            auctionId,
            buyerId,
            packageId: pkg.id,
            shipping: pkg.shippingCents === null ? '' : (pkg.shippingCents / 100).toFixed(2),
            packed: true,
            weightPounds,
            weightOunces,
            length,
            width,
            height,
            mailingMode: 'parcel',
          })
          setMessage('Package saved and marked packed.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not save package.')
        }
      })()
    })
  }

  function removePackage() {
    if (!window.confirm('Remove Package ' + pkg.packageNumber + '?')) return
    setMessage('')
    startTransition(() => {
      void (async () => {
        try {
          await removeAuctionPackageAction({
            auctionId,
            buyerId,
            packageId: pkg.id,
          })
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not remove package.')
        }
      })()
    })
  }

  return (
    <div className={styles.packagePanel}>
      <div className={styles.packSectionTitle}>
        <div>
          <strong>Package {pkg.packageNumber}</strong>
          <small>Finished weight and outside dimensions.</small>
        </div>
        {pkg.status === 'packed' ? (
          <span className={styles.profileStatus}>Packed</span>
        ) : (
          <span className={styles.profileStatusMuted}>Needs packing</span>
        )}
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
          <span>Length</span>
          <input
            className={styles.compactInput}
            inputMode="decimal"
            value={length}
            onChange={(event) => setLength(event.target.value)}
            placeholder="in"
            disabled={pending}
          />
        </label>
        <label className={styles.fieldGroup}>
          <span>Width</span>
          <input
            className={styles.compactInput}
            inputMode="decimal"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            placeholder="in"
            disabled={pending}
          />
        </label>
        <label className={styles.fieldGroup}>
          <span>Height</span>
          <input
            className={styles.compactInput}
            inputMode="decimal"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            placeholder="in"
            disabled={pending}
          />
        </label>
      </div>

      {!complete && (weightPounds || weightOunces || length || width || height) ? (
        <div className={styles.inlineHint}>Weight must be positive, ounces 0–15, and all dimensions greater than 0.</div>
      ) : null}

      <div className={styles.packageActions}>
        <button
          className={styles.primaryAction}
          type="button"
          onClick={savePackage}
          disabled={pending || !complete}
        >
          {pending
            ? 'Saving…'
            : pkg.status === 'packed'
              ? 'Save changes'
              : 'Save & mark packed'}
        </button>

        {packageCount > 1 ? (
          <button
            className={styles.dangerAction}
            type="button"
            onClick={removePackage}
            disabled={pending || Boolean(pkg.shippoTransactionId || pkg.shippoLabelUrl)}
          >
            Remove
          </button>
        ) : null}
      </div>

      {message ? <div className={styles.cardMessage}>{message}</div> : null}
    </div>
  )
}

export default function BuyerPackagePackingEditor({
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

  const letterOnly =
    items.length > 0 &&
    items.every((item) => item.itemName.trim().toLowerCase() === 'seeds')

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
          await assignAuctionItemPackageAction({ auctionId, buyerId, itemId, packageId })
          setMessage('Item moved.')
          router.refresh()
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not move item.')
        }
      })()
    })
  }

  if (letterOnly && packages[0]) {
    return (
      <LetterCard
        auctionId={auctionId}
        buyerId={buyerId}
        pkg={packages[0]}
      />
    )
  }

  return (
    <div className={styles.multiPackageSection}>
      <div className={styles.compactPackageHeader}>
        <span>
          <strong>{packages.length}</strong> {packages.length === 1 ? 'package' : 'packages'}
        </span>
        <button
          className={styles.secondaryAction}
          type="button"
          onClick={addPackage}
          disabled={pending}
        >
          + Add box
        </button>
      </div>

      {packages.length > 1 ? (
        <details className={styles.packageAssignmentDetails}>
          <summary>Assign items to boxes</summary>
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
        </details>
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
