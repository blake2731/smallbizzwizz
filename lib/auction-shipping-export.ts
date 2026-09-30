/** Pure parcel export logic. No database, payment, or label purchase calls. */
type Parcel = {
  id: number; buyerId: number; packageNumber: number; status: string
  weightOunces: number | null; lengthHundredths: number | null
  widthHundredths: number | null; heightHundredths: number | null
  shippoTransactionId?: string | null; shippoLabelUrl?: string | null
  shippoTrackingNumber?: string | null
}
type Item = {
  id: number; buyerId: number | null; packageId: number | null
  itemName: string; priceCents: number; status: string
}
type Profile = {
  address1: string | null; address2: string | null; city: string | null
  state: string | null; postalCode: string | null; countryCode: string
  email: string | null; phone: string | null
}
type Buyer = {
  id: number; displayName: string; email: string | null
  shippingProfile: Profile | null; packages: readonly Parcel[]
  items: readonly Item[]; subtotalCents: number; discountCents: number
  packageStatus: string; packageWeightOunces: number | null
  packageLengthHundredths: number | null; packageWidthHundredths: number | null
  packageHeightHundredths: number | null
  shopifyLabelPurchasedAt?: Date | string | null
  shopifyLabelPurchaseResultId?: string | null; shopifyLabelUrl?: string | null
}
export type ShippingExportState = {
  auction: { id: number; title: string }; buyers: readonly Buyer[]
}
export type ExportNotice = { buyerId: number; packageId: number | null; reason: string }
export type ExportRow = (string | number)[]
export type ShippingExport = {
  rows: ExportRow[]; skipped: ExportNotice[]; warnings: ExportNotice[]
  errors: ExportNotice[]
}
export const PIRATE_SHIP_HEADERS = [
  'Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Zip',
  'Country', 'Email', 'Phone', 'Pounds', 'Ounces', 'Length', 'Width',
  'Height', 'Order ID', 'Order Value', 'Note',
] as const

function positiveInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
function present(value: string | null | undefined) { return Boolean(value?.trim()) }
function csvCell(value: string | number) { return '"' + String(value).replace(/"/g, '""') + '"' }

/** Allocate cents exactly, using stable package order to break remainder ties. */
function discountedValues(gross: number[], discount: number): number[] | null {
  if (!Number.isSafeInteger(discount) || discount < 0 ||
      gross.some((value) => !Number.isSafeInteger(value) || value < 0)) return null
  const total = gross.reduce((a, b) => a + b, 0)
  if (!Number.isSafeInteger(total) || discount > total) return null
  if (total === 0) return gross.map(() => 0)
  const denominator = BigInt(total)
  const numerators = gross.map((value) => BigInt(value) * BigInt(discount))
  const allocated = numerators.map((value) => Number(value / denominator))
  const ranking = numerators.map((value, index) => ({ index, remainder: value % denominator }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
  const remaining = discount - allocated.reduce((a, b) => a + b, 0)
  for (let i = 0; i < remaining; i++) allocated[ranking[i].index]++
  return gross.map((value, index) => value - allocated[index])
}

export function buildPirateShipExport(state: ShippingExportState): ShippingExport {
  const result: ShippingExport = { rows: [], skipped: [], warnings: [], errors: [] }
  const seenBuyers = new Set<number>()
  const seenPackages = new Set<number>()
  for (const buyer of state.buyers) {
    const notice = (reason: string, packageId: number | null = null): ExportNotice =>
      ({ buyerId: buyer.id, packageId, reason })
    if (seenBuyers.has(buyer.id)) {
      result.errors.push(notice('Duplicate buyer record. Export stopped to avoid duplicate parcels.'))
      continue
    }
    seenBuyers.add(buyer.id)
    if (present(buyer.shopifyLabelUrl) || present(buyer.shopifyLabelPurchaseResultId) || buyer.shopifyLabelPurchasedAt) {
      result.skipped.push(notice('A Shopify label purchase is recorded. Review existing labels before exporting again.'))
      continue
    }
    // Use legacy measurements only when there are no canonical package records.
    const legacy = buyer.packages.length === 0
    const packages: Parcel[] = legacy ? [{
      id: 0, buyerId: buyer.id, packageNumber: 1, status: buyer.packageStatus,
      weightOunces: buyer.packageWeightOunces, lengthHundredths: buyer.packageLengthHundredths,
      widthHundredths: buyer.packageWidthHundredths, heightHundredths: buyer.packageHeightHundredths,
    }] : [...buyer.packages].sort((a, b) => a.packageNumber - b.packageNumber || a.id - b.id)
    const ids = new Set(packages.map((pkg) => pkg.id))
    const sold = buyer.items.filter((item) => item.status === 'sold' && item.buyerId === buyer.id)
    const assignmentComplete = sold.length > 0 && sold.length === buyer.items.length && sold.every((item) =>
      legacy || (item.packageId === null ? packages.length === 1 : ids.has(item.packageId)))
    const itemsByPackage = packages.map((pkg) => sold.filter((item) =>
      legacy || item.packageId === pkg.id || (item.packageId === null && packages.length === 1)))
    const gross = itemsByPackage.map((items) => items.reduce((sum, item) => sum + item.priceCents, 0))
    const values = assignmentComplete && gross.reduce((a, b) => a + b, 0) === buyer.subtotalCents
      ? discountedValues(gross, buyer.discountCents) : null
    const packageNumbers = new Set<number>()

    for (let index = 0; index < packages.length; index++) {
      const pkg = packages[index]
      const packageId = legacy ? null : pkg.id
      if (pkg.buyerId !== buyer.id || (!legacy && (!positiveInteger(pkg.id) || seenPackages.has(pkg.id))) ||
          !positiveInteger(pkg.packageNumber) || packageNumbers.has(pkg.packageNumber)) {
        result.errors.push(notice('Invalid or duplicate package ownership or identity.', packageId))
        continue
      }
      if (!legacy) seenPackages.add(pkg.id)
      packageNumbers.add(pkg.packageNumber)
      if (pkg.status !== 'packed') {
        result.skipped.push(notice('Package is not marked packed.', packageId))
        continue
      }
      if (present(pkg.shippoTransactionId) || present(pkg.shippoLabelUrl) || present(pkg.shippoTrackingNumber)) {
        result.skipped.push(notice('A Shippo purchase or label is recorded. Check it before buying another label.', packageId))
        continue
      }
      const profile = buyer.shippingProfile
      // Retain the existing address gate, including local pickup records without an address.
      if (!profile || ![profile.address1, profile.city, profile.state, profile.postalCode].every(present)) {
        result.skipped.push(notice('No complete shipping address. This may be pickup or an incomplete profile.', packageId))
        continue
      }
      if (![pkg.weightOunces, pkg.lengthHundredths, pkg.widthHundredths, pkg.heightHundredths].every(positiveInteger)) {
        result.errors.push(notice('Packed package needs positive weight and all three dimensions.', packageId))
        continue
      }
      const totalOunces = pkg.weightOunces as number
      const prefix = 'auction-' + state.auction.id + '-buyer-' + buyer.id
      // Keep the old key for legacy records; canonical parcel keys are stable across renumbering.
      const orderId = legacy ? prefix : prefix + '-package-' + pkg.id
      const contentNote = assignmentComplete ? itemsByPackage[index].map((item) => item.itemName).join('; ') : ''
      const valueNote = values === null ? 'Contents or values are not fully assigned. Order Value left blank; do not infer insurance value.' : ''
      if (values === null) result.warnings.push(notice(valueNote, packageId))
      result.rows.push([
        buyer.displayName, profile.address1 ?? '', profile.address2 ?? '', profile.city ?? '',
        profile.state ?? '', profile.postalCode ?? '', profile.countryCode?.trim() || 'US',
        buyer.email?.trim() || profile.email?.trim() || '', profile.phone ?? '',
        Math.floor(totalOunces / 16), totalOunces % 16,
        (pkg.lengthHundredths as number) / 100, (pkg.widthHundredths as number) / 100,
        (pkg.heightHundredths as number) / 100, orderId,
        values === null ? '' : (values[index] / 100).toFixed(2),
        ['Package ' + pkg.packageNumber + ' of ' + packages.length, contentNote, valueNote].filter(Boolean).join('; '),
      ])
    }
  }
  return result
}

/** Render a CSV or an explicit error. The optional report contains export decisions, not payment status. */
export function pirateShipExportResponse(state: ShippingExportState, report = false): Response {
  const result = buildPirateShipExport(state)
  const common = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  if (report) return Response.json(result, { headers: common })
  if (result.errors.length) return new Response(
    'Shipping export stopped. No CSV was generated.\n' + result.errors.map((error) =>
      'Buyer ' + error.buyerId + (error.packageId === null ? '' : ', package ' + error.packageId) + ': ' + error.reason).join('\n'),
    { status: 422, headers: { ...common, 'Content-Type': 'text/plain; charset=utf-8' } },
  )
  if (!result.rows.length) return new Response(
    'No packages are ready to export. Check packed status, address, measurements, and existing labels.\n' +
      result.skipped.map((item) => 'Buyer ' + item.buyerId + ': ' + item.reason).join('\n'),
    { status: 400, headers: { ...common, 'Content-Type': 'text/plain; charset=utf-8' } },
  )
  const title = state.auction.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'auction'
  const csv = [PIRATE_SHIP_HEADERS.map(csvCell).join(','), ...result.rows.map((row) => row.map(csvCell).join(','))].join('\r\n')
  return new Response(csv, { headers: {
    ...common, 'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="' + title + '-pirate-ship.csv"',
    'X-Export-Package-Count': String(result.rows.length), 'X-Export-Skipped-Count': String(result.skipped.length),
    'X-Export-Warning-Count': String(result.warnings.length),
  } })
}
