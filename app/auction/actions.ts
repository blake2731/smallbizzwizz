'use server'

import { auth } from '@clerk/nextjs/server'
import { and, desc, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { shopifyGraphql } from '@/lib/shopify-admin'
import { resolveShippoOriginAddressId, shippoRequest } from '@/lib/shippo'
import {
  auctionBuyer,
  auctionCustomerPreference,
  auctionCustomerProfile,
  auctionItem,
  auctionPackage,
  auctionSession,
} from '@/lib/auction-schema'
import {
  displayBuyerName,
  ensureAuctionSchema,
  normalizeBuyerName,
  parseMoneyToCents,
} from '@/lib/auction'

type LiveItemInput = {
  auctionId: number
  itemName: string
  buyerName?: string
  price: string
}

type EditItemInput = {
  auctionId: number
  itemId: number
  itemName: string
  buyerName?: string
  price: string
  status: 'open' | 'sold' | 'unsold'
  saleType: 'quick' | 'auction' | 'legacy'
}

async function currentUserId() {
  await ensureAuctionSchema()

  if (process.env.VERCEL_ENV === 'preview') {
    return 'auction-preview-owner'
  }

  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
  return userId
}

async function requireAuction(userId: string, auctionId: number) {
  const [auction] = await db
    .select()
    .from(auctionSession)
    .where(and(eq(auctionSession.id, auctionId), eq(auctionSession.userId, userId)))
    .limit(1)

  if (!auction) throw new Error('Auction not found')
  return auction
}

async function requireItem(auctionId: number, itemId: number) {
  const [item] = await db
    .select()
    .from(auctionItem)
    .where(and(eq(auctionItem.id, itemId), eq(auctionItem.auctionId, auctionId)))
    .limit(1)

  if (!item || item.status === 'void') throw new Error('Item not found')
  return item
}

async function touchAuction(auctionId: number) {
  await db
    .update(auctionSession)
    .set({ updatedAt: new Date() })
    .where(eq(auctionSession.id, auctionId))
}

async function getOrCreateBuyer(auctionId: number, rawName: string) {
  const displayName = displayBuyerName(rawName)
  const normalizedName = normalizeBuyerName(rawName)
  if (!displayName || !normalizedName) throw new Error('Buyer is required')

  const [existing] = await db
    .select()
    .from(auctionBuyer)
    .where(
      and(
        eq(auctionBuyer.auctionId, auctionId),
        eq(auctionBuyer.normalizedName, normalizedName),
      ),
    )
    .limit(1)

  if (existing) {
    if (existing.displayName !== displayName) {
      const [updated] = await db
        .update(auctionBuyer)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(auctionBuyer.id, existing.id))
        .returning()
      return updated
    }

    await db
      .update(auctionBuyer)
      .set({ updatedAt: new Date() })
      .where(eq(auctionBuyer.id, existing.id))
    return existing
  }

  const [created] = await db
    .insert(auctionBuyer)
    .values({
      auctionId,
      displayName,
      normalizedName,
    })
    .returning()

  return created
}

async function cleanupBuyerIfUnused(buyerId: number | null) {
  if (!buyerId) return

  const remaining = await db
    .select({ id: auctionItem.id })
    .from(auctionItem)
    .where(
      and(
        eq(auctionItem.buyerId, buyerId),
        ne(auctionItem.status, 'void'),
      ),
    )
    .limit(1)

  if (!remaining.length) {
    await db.delete(auctionBuyer).where(eq(auctionBuyer.id, buyerId))
  }
}

async function insertSoldItem(input: LiveItemInput) {
  const itemName = input.itemName.trim()
  const buyerName = input.buyerName?.trim() ?? ''
  const priceCents = parseMoneyToCents(input.price)
  if (!itemName) throw new Error('Item is required')
  if (!buyerName) throw new Error('Buyer is required')
  if (priceCents === null) throw new Error('Enter a valid price')

  const buyer = await getOrCreateBuyer(input.auctionId, buyerName)
  await db.insert(auctionItem).values({
    auctionId: input.auctionId,
    buyerId: buyer.id,
    itemName,
    priceCents,
    saleType: 'quick',
    status: 'sold',
  })
}

async function insertUnsoldItem(input: LiveItemInput) {
  const itemName = input.itemName.trim()
  const priceCents = parseMoneyToCents(input.price)
  if (!itemName) throw new Error('Item is required')
  if (priceCents === null) throw new Error('Enter a valid price')

  await db.insert(auctionItem).values({
    auctionId: input.auctionId,
    buyerId: null,
    itemName,
    priceCents,
    saleType: 'quick',
    status: 'unsold',
  })
}

export async function createAuctionAction(formData: FormData) {
  const userId = await currentUserId()
  const title = String(formData.get('title') ?? '').trim()
  const saleDate = String(formData.get('saleDate') ?? '').trim()

  if (!title) throw new Error('Auction name is required')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) throw new Error('Sale date is required')

  const [created] = await db
    .insert(auctionSession)
    .values({ userId, title, saleDate, status: 'live' })
    .returning({ id: auctionSession.id })

  revalidatePath('/auction')
  redirect('/auction?auction=' + created.id + '&view=live')
}

export async function recordSaleAction(input: LiveItemInput) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  await insertSoldItem(input)
  await touchAuction(input.auctionId)
  revalidatePath('/auction')
  return { ok: true }
}

export async function recordUnsoldAction(input: LiveItemInput) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  await insertUnsoldItem(input)
  await touchAuction(input.auctionId)
  revalidatePath('/auction')
  return { ok: true }
}

export async function startAuctionLotAction(input: {
  auctionId: number
  itemName: string
  startingPrice: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [open] = await db
    .select({ id: auctionItem.id })
    .from(auctionItem)
    .where(and(eq(auctionItem.auctionId, input.auctionId), eq(auctionItem.status, 'open')))
    .limit(1)

  if (open) throw new Error('Close the current auction lot before starting another.')

  const itemName = input.itemName.trim()
  if (!itemName) throw new Error('Item is required')

  const startingPrice = input.startingPrice.trim()
  const priceCents = startingPrice ? parseMoneyToCents(startingPrice) : 0
  if (priceCents === null) throw new Error('Enter a valid starting price')

  await db.insert(auctionItem).values({
    auctionId: input.auctionId,
    buyerId: null,
    itemName,
    priceCents,
    saleType: 'auction',
    status: 'open',
  })

  await touchAuction(input.auctionId)
  revalidatePath('/auction')
  return { ok: true }
}

export async function updateAuctionHighBidAction(input: {
  auctionId: number
  itemId: number
  buyerName: string
  bid: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  const item = await requireItem(input.auctionId, input.itemId)

  if (item.saleType !== 'auction' || item.status !== 'open') {
    throw new Error('This lot is no longer open for bidding.')
  }

  const bidCents = parseMoneyToCents(input.bid)
  if (bidCents === null) throw new Error('Enter a valid bid')
  if (bidCents <= item.priceCents) {
    throw new Error('New high bid must be higher than the current amount. Use Edit for corrections.')
  }

  const buyer = await getOrCreateBuyer(input.auctionId, input.buyerName)
  const previousBuyerId = item.buyerId

  let backupBidderName = item.backupBidderName
  let backupBidCents = item.backupBidCents

  if (previousBuyerId && previousBuyerId !== buyer.id) {
    const [previousBuyer] = await db
      .select({ displayName: auctionBuyer.displayName })
      .from(auctionBuyer)
      .where(eq(auctionBuyer.id, previousBuyerId))
      .limit(1)

    if (previousBuyer) {
      backupBidderName = previousBuyer.displayName
      backupBidCents = item.priceCents
    }
  }

  await db
    .update(auctionItem)
    .set({
      buyerId: buyer.id,
      priceCents: bidCents,
      lastBidAt: new Date(),
      backupBidderName,
      backupBidCents,
    })
    .where(eq(auctionItem.id, item.id))

  if (previousBuyerId && previousBuyerId !== buyer.id) {
    await cleanupBuyerIfUnused(previousBuyerId)
  }

  await touchAuction(input.auctionId)
  revalidatePath('/auction')
  return { ok: true }
}

export async function closeAuctionLotAction(input: {
  auctionId: number
  itemId: number
  result: 'sold' | 'unsold'
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  const item = await requireItem(input.auctionId, input.itemId)

  if (item.saleType !== 'auction' || item.status !== 'open') {
    throw new Error('This lot is already closed.')
  }

  if (input.result === 'sold' && !item.buyerId) {
    throw new Error('There is no high bidder yet.')
  }

  const previousBuyerId = item.buyerId
  await db
    .update(auctionItem)
    .set({
      status: input.result,
      buyerId: input.result === 'sold' ? item.buyerId : null,
    })
    .where(eq(auctionItem.id, item.id))

  if (input.result === 'unsold') {
    await cleanupBuyerIfUnused(previousBuyerId)
  }

  await touchAuction(input.auctionId)
  revalidatePath('/auction')
  return { ok: true }
}

export async function editItemAction(input: EditItemInput) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  const item = await requireItem(input.auctionId, input.itemId)

  const itemName = input.itemName.trim()
  const priceCents = parseMoneyToCents(input.price)
  if (!itemName) throw new Error('Item is required')
  if (priceCents === null) throw new Error('Enter a valid price')
  if (input.status === 'open' && input.saleType !== 'auction') {
    throw new Error('Only auction lots can be open.')
  }

  let buyerId: number | null = null
  if (input.status === 'sold' || (input.status === 'open' && input.buyerName?.trim())) {
    const buyerName = input.buyerName?.trim() ?? ''
    if (!buyerName && input.status === 'sold') throw new Error('Sold items need a buyer.')
    if (buyerName) {
      const buyer = await getOrCreateBuyer(input.auctionId, buyerName)
      buyerId = buyer.id
    }
  }

  const previousBuyerId = item.buyerId
  await db
    .update(auctionItem)
    .set({
      itemName,
      priceCents,
      saleType: input.saleType,
      status: input.status,
      buyerId: input.status === 'unsold' ? null : buyerId,
      lastBidAt: input.status === 'open' ? new Date() : item.lastBidAt,
    })
    .where(eq(auctionItem.id, item.id))

  if (previousBuyerId && previousBuyerId !== buyerId) {
    await cleanupBuyerIfUnused(previousBuyerId)
  }

  await touchAuction(input.auctionId)
  revalidatePath('/auction')
  return { ok: true }
}

export async function undoLastItemAction(auctionId: number) {
  const userId = await currentUserId()
  await requireAuction(userId, auctionId)

  const [last] = await db
    .select()
    .from(auctionItem)
    .where(and(eq(auctionItem.auctionId, auctionId), ne(auctionItem.status, 'void')))
    .orderBy(desc(auctionItem.createdAt), desc(auctionItem.id))
    .limit(1)

  if (!last) return { ok: false, message: 'Nothing to undo.' }

  await db
    .update(auctionItem)
    .set({ status: 'void', voidedAt: new Date() })
    .where(eq(auctionItem.id, last.id))

  await cleanupBuyerIfUnused(last.buyerId)
  await touchAuction(auctionId)

  revalidatePath('/auction')
  return { ok: true, message: 'Undid “' + last.itemName + '”.' }
}

export async function setBuyerPrivateGroupAction(input: {
  auctionId: number
  buyerId: number
  enabled: boolean
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  await db
    .update(auctionBuyer)
    .set({ privateGroup: input.enabled, updatedAt: new Date() })
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))

  revalidatePath('/auction')
  return { ok: true }
}

function parseWholeNumber(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed)) throw new Error(label + ' must be a whole number')
  const number = Number(trimmed)
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Enter valid ' + label.toLowerCase())
  return number
}

function parseDimensionHundredths(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  if (!Number.isFinite(number) || number <= 0 || number > 999) {
    throw new Error('Enter valid ' + label.toLowerCase())
  }
  return Math.round(number * 100)
}

async function syncBuyerPackageSummary(buyerId: number) {
  const packages = await db
    .select()
    .from(auctionPackage)
    .where(eq(auctionPackage.buyerId, buyerId))
    .orderBy(auctionPackage.packageNumber)

  if (!packages.length) return

  const allShippingReady = packages.every((pkg) => pkg.shippingCents !== null)
  const shippingCents = allShippingReady
    ? packages.reduce((sum, pkg) => sum + (pkg.shippingCents ?? 0), 0)
    : null
  const packageStatus = packages.every((pkg) => pkg.status === 'packed')
    ? 'packed'
    : 'unpacked'
  const sole = packages.length === 1 ? packages[0] : null

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(eq(auctionBuyer.id, buyerId))
    .limit(1)

  if (!buyer) return

  const invoiceStatus =
    shippingCents === null
      ? buyer.invoiceStatus === 'sent' || buyer.invoiceStatus === 'paid'
        ? buyer.invoiceStatus
        : 'not_ready'
      : buyer.invoiceStatus === 'sent' || buyer.invoiceStatus === 'paid'
        ? buyer.invoiceStatus
        : 'ready'

  await db
    .update(auctionBuyer)
    .set({
      shippingCents,
      packageStatus,
      packageWeightOunces: sole?.weightOunces ?? null,
      packageLengthHundredths: sole?.lengthHundredths ?? null,
      packageWidthHundredths: sole?.widthHundredths ?? null,
      packageHeightHundredths: sole?.heightHundredths ?? null,
      invoiceStatus,
      updatedAt: new Date(),
    })
    .where(eq(auctionBuyer.id, buyerId))
}

async function requireBuyerPackage(
  auctionId: number,
  buyerId: number,
  packageId: number,
) {
  const [buyer] = await db
    .select({ id: auctionBuyer.id })
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, buyerId), eq(auctionBuyer.auctionId, auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  const [pkg] = await db
    .select()
    .from(auctionPackage)
    .where(and(eq(auctionPackage.id, packageId), eq(auctionPackage.buyerId, buyerId)))
    .limit(1)

  if (!pkg) throw new Error('Package not found')
  return pkg
}

export async function addAuctionPackageAction(input: {
  auctionId: number
  buyerId: number
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select({ id: auctionBuyer.id })
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  const packages = await db
    .select()
    .from(auctionPackage)
    .where(eq(auctionPackage.buyerId, input.buyerId))
    .orderBy(desc(auctionPackage.packageNumber))

  const nextNumber = (packages[0]?.packageNumber ?? 0) + 1
  const [created] = await db
    .insert(auctionPackage)
    .values({
      buyerId: input.buyerId,
      packageNumber: nextNumber,
    })
    .returning()

  await syncBuyerPackageSummary(input.buyerId)
  revalidatePath('/auction')

  return {
    ok: true,
    packageId: created.id,
    packageNumber: created.packageNumber,
  }
}

export async function removeAuctionPackageAction(input: {
  auctionId: number
  buyerId: number
  packageId: number
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  const pkg = await requireBuyerPackage(input.auctionId, input.buyerId, input.packageId)

  const packages = await db
    .select()
    .from(auctionPackage)
    .where(eq(auctionPackage.buyerId, input.buyerId))
    .orderBy(auctionPackage.packageNumber)

  if (packages.length <= 1) {
    throw new Error('Each buyer must keep at least one package.')
  }

  if (pkg.shippoTransactionId || pkg.shippoLabelUrl) {
    throw new Error('A package with a purchased label cannot be removed.')
  }

  const fallback = packages.find((candidate) => candidate.id !== pkg.id)
  if (!fallback) throw new Error('No fallback package found.')

  await db
    .update(auctionItem)
    .set({ packageId: fallback.id })
    .where(and(eq(auctionItem.buyerId, input.buyerId), eq(auctionItem.packageId, pkg.id)))

  await db.delete(auctionPackage).where(eq(auctionPackage.id, pkg.id))
  await syncBuyerPackageSummary(input.buyerId)
  revalidatePath('/auction')

  return { ok: true }
}

export async function assignAuctionItemPackageAction(input: {
  auctionId: number
  buyerId: number
  itemId: number
  packageId: number
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  await requireBuyerPackage(input.auctionId, input.buyerId, input.packageId)

  const [item] = await db
    .select()
    .from(auctionItem)
    .where(
      and(
        eq(auctionItem.id, input.itemId),
        eq(auctionItem.auctionId, input.auctionId),
        eq(auctionItem.buyerId, input.buyerId),
        eq(auctionItem.status, 'sold'),
      ),
    )
    .limit(1)

  if (!item) throw new Error('Item not found')

  await db
    .update(auctionItem)
    .set({ packageId: input.packageId })
    .where(eq(auctionItem.id, input.itemId))

  revalidatePath('/auction')
  return { ok: true }
}

export async function saveAuctionPackageAction(input: {
  auctionId: number
  buyerId: number
  packageId: number
  shipping: string
  packed: boolean
  weightPounds: string
  weightOunces: string
  length: string
  width: string
  height: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  const current = await requireBuyerPackage(input.auctionId, input.buyerId, input.packageId)

  const shippingCents = input.shipping.trim() ? parseMoneyToCents(input.shipping) : null
  if (input.shipping.trim() && shippingCents === null) {
    throw new Error('Enter valid shipping')
  }

  const weightPounds = parseWholeNumber(input.weightPounds, 'Weight pounds')
  const weightOunces = parseWholeNumber(input.weightOunces, 'Weight ounces')
  if (weightOunces !== null && weightOunces > 15) {
    throw new Error('Weight ounces must be between 0 and 15')
  }

  const totalWeightOunces =
    weightPounds === null && weightOunces === null
      ? null
      : (weightPounds ?? 0) * 16 + (weightOunces ?? 0)

  const lengthHundredths = parseDimensionHundredths(input.length, 'Length')
  const widthHundredths = parseDimensionHundredths(input.width, 'Width')
  const heightHundredths = parseDimensionHundredths(input.height, 'Height')

  if (input.packed) {
    if (!totalWeightOunces || totalWeightOunces <= 0) {
      throw new Error('Enter the package weight before marking it packed')
    }
    if (
      lengthHundredths === null ||
      widthHundredths === null ||
      heightHundredths === null
    ) {
      throw new Error('Enter all three package dimensions before marking it packed')
    }
  }

  const measurementsChanged =
    current.weightOunces !== totalWeightOunces ||
    current.lengthHundredths !== lengthHundredths ||
    current.widthHundredths !== widthHundredths ||
    current.heightHundredths !== heightHundredths

  await db
    .update(auctionPackage)
    .set({
      shippingCents,
      weightOunces: totalWeightOunces,
      lengthHundredths,
      widthHundredths,
      heightHundredths,
      status: input.packed ? 'packed' : 'unpacked',
      ...(measurementsChanged
        ? {
            shippoShipmentId: null,
            shippoRateId: null,
            shippoProvider: null,
            shippoService: null,
            shippoRateCents: null,
            shippoQuotedAt: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(auctionPackage.id, input.packageId))

  await syncBuyerPackageSummary(input.buyerId)
  revalidatePath('/auction')
  return { ok: true }
}

export async function getShippoPackageRatesAction(input: {
  auctionId: number
  buyerId: number
  packageId: number
  weightPounds: string
  weightOunces: string
  length: string
  width: string
  height: string
  address1: string
  address2: string
  city: string
  state: string
  postalCode: string
  phone?: string
  email?: string
  countryCode?: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  await requireBuyerPackage(input.auctionId, input.buyerId, input.packageId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  const address1 = input.address1.trim()
  const address2 = input.address2.trim()
  const city = input.city.trim()
  const state = input.state.trim().toUpperCase()
  const postalCode = input.postalCode.trim()
  const countryCode = (input.countryCode ?? 'US').trim().toUpperCase() || 'US'

  if (!address1 || !city || !state || !postalCode) {
    throw new Error('Enter the customer address, city, state, and ZIP first.')
  }

  const weightPounds = parseWholeNumber(input.weightPounds, 'Weight pounds')
  const weightOunces = parseWholeNumber(input.weightOunces, 'Weight ounces')
  if (weightOunces !== null && weightOunces > 15) {
    throw new Error('Weight ounces must be between 0 and 15')
  }

  const totalWeightOunces = (weightPounds ?? 0) * 16 + (weightOunces ?? 0)
  if (totalWeightOunces <= 0) {
    throw new Error('Enter the package weight before getting shipping rates.')
  }

  const lengthHundredths = parseDimensionHundredths(input.length, 'Length')
  const widthHundredths = parseDimensionHundredths(input.width, 'Width')
  const heightHundredths = parseDimensionHundredths(input.height, 'Height')
  if (
    lengthHundredths === null ||
    widthHundredths === null ||
    heightHundredths === null
  ) {
    throw new Error('Enter all three package dimensions before getting shipping rates.')
  }

  const originAddressId = await resolveShippoOriginAddressId()
  const shipment = await shippoRequest<ShippoShipmentResponse>('/shipments/', {
    method: 'POST',
    body: JSON.stringify({
      address_from: originAddressId,
      address_to: {
        name: buyer.displayName,
        street1: address1,
        street2: address2 || undefined,
        city,
        state,
        zip: postalCode,
        country: countryCode,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        object_purpose: 'PURCHASE',
      },
      parcels: [
        {
          length: String(lengthHundredths / 100),
          width: String(widthHundredths / 100),
          height: String(heightHundredths / 100),
          distance_unit: 'in',
          weight: String(totalWeightOunces),
          mass_unit: 'oz',
        },
      ],
      object_purpose: 'PURCHASE',
      async: false,
    }),
  })

  const rates = (shipment.rates ?? [])
    .map((rate) => {
      const amount = Number(rate.amount)
      return {
        rateId: rate.object_id,
        shipmentId: shipment.object_id,
        provider: rate.provider,
        service: rate.servicelevel?.name || rate.servicelevel?.token || 'Shipping',
        serviceToken: rate.servicelevel?.token || '',
        amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : null,
        currencyCode: rate.currency,
        estimatedDays: rate.estimated_days ?? null,
        durationTerms: rate.duration_terms ?? '',
        attributes: rate.attributes ?? [],
      }
    })
    .filter(
      (rate) =>
        rate.amountCents !== null &&
        rate.amountCents >= 0 &&
        rate.currencyCode.toUpperCase() === 'USD',
    )
    .sort((a, b) => (a.amountCents ?? 0) - (b.amountCents ?? 0))

  if (!rates.length) {
    const detail = (shipment.messages ?? [])
      .map((message) => message.text)
      .filter(Boolean)
      .join('; ')
    throw new Error(detail || 'Shippo did not return any rates for this package.')
  }

  return {
    ok: true,
    shipmentId: shipment.object_id,
    rates,
  }
}

export async function selectShippoPackageRateAction(input: {
  auctionId: number
  buyerId: number
  packageId: number
  shipmentId: string
  rateId: string
  provider: string
  service: string
  amountCents: number
  packed: boolean
  weightPounds: string
  weightOunces: string
  length: string
  width: string
  height: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  await requireBuyerPackage(input.auctionId, input.buyerId, input.packageId)

  if (!input.shipmentId.trim() || !input.rateId.trim()) {
    throw new Error('Select a valid Shippo rate.')
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    throw new Error('Select a valid Shippo rate amount.')
  }

  const weightPounds = parseWholeNumber(input.weightPounds, 'Weight pounds')
  const weightOunces = parseWholeNumber(input.weightOunces, 'Weight ounces')
  if (weightOunces !== null && weightOunces > 15) {
    throw new Error('Weight ounces must be between 0 and 15')
  }
  const totalWeightOunces = (weightPounds ?? 0) * 16 + (weightOunces ?? 0)
  if (totalWeightOunces <= 0) throw new Error('Enter the package weight.')

  const lengthHundredths = parseDimensionHundredths(input.length, 'Length')
  const widthHundredths = parseDimensionHundredths(input.width, 'Width')
  const heightHundredths = parseDimensionHundredths(input.height, 'Height')
  if (
    lengthHundredths === null ||
    widthHundredths === null ||
    heightHundredths === null
  ) {
    throw new Error('Enter all three package dimensions.')
  }

  await db
    .update(auctionPackage)
    .set({
      weightOunces: totalWeightOunces,
      lengthHundredths,
      widthHundredths,
      heightHundredths,
      shippingCents: input.amountCents,
      status: input.packed ? 'packed' : 'unpacked',
      shippoShipmentId: input.shipmentId.trim(),
      shippoRateId: input.rateId.trim(),
      shippoProvider: input.provider.trim(),
      shippoService: input.service.trim(),
      shippoRateCents: input.amountCents,
      shippoQuotedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(auctionPackage.id, input.packageId))

  await syncBuyerPackageSummary(input.buyerId)
  revalidatePath('/auction')

  return { ok: true }
}

export async function setBuyerShippingAction(input: {
  auctionId: number
  buyerId: number
  shipping: string
  packed: boolean
  weightPounds: string
  weightOunces: string
  length: string
  width: string
  height: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const shippingCents = input.shipping.trim() ? parseMoneyToCents(input.shipping) : null
  if (input.shipping.trim() && shippingCents === null) throw new Error('Enter valid shipping')

  const weightPounds = parseWholeNumber(input.weightPounds, 'Weight pounds')
  const weightOunces = parseWholeNumber(input.weightOunces, 'Weight ounces')
  if (weightOunces !== null && weightOunces > 15) {
    throw new Error('Weight ounces must be between 0 and 15')
  }

  const packageWeightOunces =
    weightPounds === null && weightOunces === null
      ? null
      : (weightPounds ?? 0) * 16 + (weightOunces ?? 0)
  const packageLengthHundredths = parseDimensionHundredths(input.length, 'Length')
  const packageWidthHundredths = parseDimensionHundredths(input.width, 'Width')
  const packageHeightHundredths = parseDimensionHundredths(input.height, 'Height')

  if (input.packed) {
    if (!packageWeightOunces || packageWeightOunces <= 0) {
      throw new Error('Enter the package weight before marking it packed')
    }
    if (
      packageLengthHundredths === null ||
      packageWidthHundredths === null ||
      packageHeightHundredths === null
    ) {
      throw new Error('Enter all three package dimensions before marking it packed')
    }
  }

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)
  if (!buyer) throw new Error('Buyer not found')

  const nextInvoiceStatus =
    shippingCents === null
      ? 'not_ready'
      : buyer.invoiceStatus === 'sent' || buyer.invoiceStatus === 'paid'
        ? buyer.invoiceStatus
        : 'ready'

  await db
    .update(auctionBuyer)
    .set({
      shippingCents,
      packageWeightOunces,
      packageLengthHundredths,
      packageWidthHundredths,
      packageHeightHundredths,
      packageStatus: input.packed ? 'packed' : 'unpacked',
      invoiceStatus: nextInvoiceStatus,
      updatedAt: new Date(),
    })
    .where(eq(auctionBuyer.id, input.buyerId))

  revalidatePath('/auction')
  return { ok: true }
}

type ShippoRate = {
  object_id: string
  amount: string
  currency: string
  provider: string
  provider_image_75?: string
  provider_image_200?: string
  servicelevel?: {
    name?: string
    token?: string
  }
  estimated_days?: number | null
  duration_terms?: string | null
  attributes?: string[]
}

type ShippoShipmentResponse = {
  object_id: string
  status?: string
  rates?: ShippoRate[]
  messages?: Array<{
    source?: string
    code?: string
    text?: string
  }>
}

export async function getShippoShippingRatesAction(input: {
  auctionId: number
  buyerId: number
  weightPounds: string
  weightOunces: string
  length: string
  width: string
  height: string
  address1: string
  address2: string
  city: string
  state: string
  postalCode: string
  phone?: string
  email?: string
  countryCode?: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  const address1 = input.address1.trim()
  const address2 = input.address2.trim()
  const city = input.city.trim()
  const state = input.state.trim().toUpperCase()
  const postalCode = input.postalCode.trim()
  const countryCode = (input.countryCode ?? 'US').trim().toUpperCase() || 'US'

  if (!address1 || !city || !state || !postalCode) {
    throw new Error('Enter the customer address, city, state, and ZIP first.')
  }

  const weightPounds = parseWholeNumber(input.weightPounds, 'Weight pounds')
  const weightOunces = parseWholeNumber(input.weightOunces, 'Weight ounces')
  if (weightOunces !== null && weightOunces > 15) {
    throw new Error('Weight ounces must be between 0 and 15')
  }

  const totalWeightOunces = (weightPounds ?? 0) * 16 + (weightOunces ?? 0)
  if (totalWeightOunces <= 0) {
    throw new Error('Enter the package weight before getting shipping rates.')
  }

  const lengthHundredths = parseDimensionHundredths(input.length, 'Length')
  const widthHundredths = parseDimensionHundredths(input.width, 'Width')
  const heightHundredths = parseDimensionHundredths(input.height, 'Height')
  if (
    lengthHundredths === null ||
    widthHundredths === null ||
    heightHundredths === null
  ) {
    throw new Error('Enter all three package dimensions before getting shipping rates.')
  }

  const originAddressId = await resolveShippoOriginAddressId()
  const shipment = await shippoRequest<ShippoShipmentResponse>('/shipments/', {
    method: 'POST',
    body: JSON.stringify({
      address_from: originAddressId,
      address_to: {
        name: buyer.displayName,
        street1: address1,
        street2: address2 || undefined,
        city,
        state,
        zip: postalCode,
        country: countryCode,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        object_purpose: 'PURCHASE',
      },
      parcels: [
        {
          length: String(lengthHundredths / 100),
          width: String(widthHundredths / 100),
          height: String(heightHundredths / 100),
          distance_unit: 'in',
          weight: String(totalWeightOunces),
          mass_unit: 'oz',
        },
      ],
      object_purpose: 'PURCHASE',
      async: false,
    }),
  })

  const rates = (shipment.rates ?? [])
    .map((rate) => {
      const amount = Number(rate.amount)
      return {
        rateId: rate.object_id,
        shipmentId: shipment.object_id,
        provider: rate.provider,
        service: rate.servicelevel?.name || rate.servicelevel?.token || 'Shipping',
        serviceToken: rate.servicelevel?.token || '',
        amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : null,
        currencyCode: rate.currency,
        estimatedDays: rate.estimated_days ?? null,
        durationTerms: rate.duration_terms ?? '',
        attributes: rate.attributes ?? [],
      }
    })
    .filter(
      (rate) =>
        rate.amountCents !== null &&
        rate.amountCents >= 0 &&
        rate.currencyCode.toUpperCase() === 'USD',
    )
    .sort((a, b) => (a.amountCents ?? 0) - (b.amountCents ?? 0))

  if (!rates.length) {
    const detail = (shipment.messages ?? [])
      .map((message) => message.text)
      .filter(Boolean)
      .join('; ')
    throw new Error(detail || 'Shippo did not return any rates for this package.')
  }

  return {
    ok: true,
    shipmentId: shipment.object_id,
    rates,
  }
}

type ShopifyShippingRatesResponse = {
  draftOrderAvailableDeliveryOptions: {
    availableShippingRates: Array<{
      handle: string
      title: string
      code: string
      source: string
      price: {
        amount: string
        currencyCode: string
      }
    }>
  }
}

const SHOPIFY_SHIPPING_RATES = `
  query AuctionShippingRates($input: DraftOrderAvailableDeliveryOptionsInput!) {
    draftOrderAvailableDeliveryOptions(input: $input) {
      availableShippingRates {
        handle
        title
        code
        source
        price {
          amount
          currencyCode
        }
      }
    }
  }
`

export async function getShopifyShippingRatesAction(input: {
  auctionId: number
  buyerId: number
  weightPounds: string
  weightOunces: string
  address1: string
  address2: string
  city: string
  state: string
  postalCode: string
  countryCode?: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  const address1 = input.address1.trim()
  const address2 = input.address2.trim()
  const city = input.city.trim()
  const state = input.state.trim().toUpperCase()
  const postalCode = input.postalCode.trim()
  const countryCode = (input.countryCode ?? 'US').trim().toUpperCase() || 'US'

  if (!address1 || !city || !state || !postalCode) {
    throw new Error('Enter the customer address, city, state, and ZIP first.')
  }

  const weightPounds = parseWholeNumber(input.weightPounds, 'Weight pounds')
  const weightOunces = parseWholeNumber(input.weightOunces, 'Weight ounces')
  if (weightOunces !== null && weightOunces > 15) {
    throw new Error('Weight ounces must be between 0 and 15')
  }

  const totalWeightOunces = (weightPounds ?? 0) * 16 + (weightOunces ?? 0)
  if (totalWeightOunces <= 0) {
    throw new Error('Enter the package weight before getting shipping rates.')
  }

  const soldItems = await db
    .select({ priceCents: auctionItem.priceCents })
    .from(auctionItem)
    .where(
      and(
        eq(auctionItem.auctionId, input.auctionId),
        eq(auctionItem.buyerId, input.buyerId),
        eq(auctionItem.status, 'sold'),
      ),
    )

  if (!soldItems.length) throw new Error('This buyer has no sold items.')

  const subtotalCents = soldItems.reduce((sum, item) => sum + item.priceCents, 0)
  const merchandiseCents = buyer.privateGroup
    ? subtotalCents - Math.round(subtotalCents * 0.1)
    : subtotalCents
  const { firstName, lastName } = splitCustomerName(buyer.displayName)

  const data = await shopifyGraphql<ShopifyShippingRatesResponse>(
    SHOPIFY_SHIPPING_RATES,
    {
      input: {
        lineItems: [
          {
            title: 'Auction package',
            quantity: 1,
            originalUnitPriceWithCurrency: {
              amount: (merchandiseCents / 100).toFixed(2),
              currencyCode: 'USD',
            },
            requiresShipping: true,
            taxable: false,
            weight: {
              value: totalWeightOunces,
              unit: 'OUNCES',
            },
          },
        ],
        shippingAddress: {
          firstName,
          lastName,
          address1,
          address2: address2 || undefined,
          city,
          provinceCode: state,
          zip: postalCode,
          countryCode,
        },
      },
    },
  )

  const rates = data.draftOrderAvailableDeliveryOptions.availableShippingRates
    .map((rate) => {
      const amount = Number(rate.price.amount)
      return {
        handle: rate.handle,
        title: rate.title,
        code: rate.code,
        source: rate.source,
        amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : null,
        currencyCode: rate.price.currencyCode,
      }
    })
    .filter((rate) => rate.amountCents !== null)
    .sort((a, b) => (a.amountCents ?? 0) - (b.amountCents ?? 0))

  if (!rates.length) {
    throw new Error('Shopify did not return a shipping rate for this package and address.')
  }

  return { ok: true, rates }
}

type ShopifyDraftOrderCreateResponse = {
  draftOrderCreate: {
    draftOrder: {
      id: string
      name: string
      invoiceUrl: string | null
      totalPriceSet: {
        shopMoney: {
          amount: string
          currencyCode: string
        }
      }
    } | null
    userErrors: Array<{
      field: string[] | null
      message: string
    }>
  }
}

const SHOPIFY_DRAFT_ORDER_CREATE = `
  mutation AuctionDraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        invoiceUrl
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

type ShopifyDraftOrderInvoiceSendResponse = {
  draftOrderInvoiceSend: {
    draftOrder: {
      id: string
      invoiceSentAt: string | null
    } | null
    userErrors: Array<{
      field: string[] | null
      message: string
    }>
  }
}

const SHOPIFY_DRAFT_ORDER_INVOICE_SEND = `
  mutation AuctionDraftOrderInvoiceSend($id: ID!, $email: EmailInput) {
    draftOrderInvoiceSend(id: $id, email: $email) {
      draftOrder {
        id
        invoiceSentAt
      }
      userErrors {
        field
        message
      }
    }
  }
`

function splitCustomerName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? displayName, lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export async function createShopifyDraftOrderAction(input: {
  auctionId: number
  buyerId: number
}) {
  const userId = await currentUserId()
  const auction = await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  if (buyer.shopifyDraftOrderId && buyer.shopifyInvoiceUrl) {
    return {
      ok: true,
      invoiceUrl: buyer.shopifyInvoiceUrl,
      draftOrderId: buyer.shopifyDraftOrderId,
      draftOrderName: buyer.shopifyDraftOrderName,
      totalCents: buyer.shopifyDraftOrderTotalCents,
      existing: true,
    }
  }

  if (buyer.shippingCents === null) {
    throw new Error('Save the shipping charge before creating a Shopify invoice.')
  }

  const [profile] = await db
    .select()
    .from(auctionCustomerProfile)
    .where(
      and(
        eq(auctionCustomerProfile.userId, userId),
        eq(auctionCustomerProfile.normalizedName, buyer.normalizedName),
      ),
    )
    .limit(1)

  if (!profile?.address1 || !profile.city || !profile.state || !profile.postalCode) {
    throw new Error('Save the customer shipping address before creating a Shopify invoice.')
  }

  const soldItems = await db
    .select()
    .from(auctionItem)
    .where(
      and(
        eq(auctionItem.auctionId, input.auctionId),
        eq(auctionItem.buyerId, input.buyerId),
        eq(auctionItem.status, 'sold'),
      ),
    )

  if (!soldItems.length) throw new Error('This buyer has no sold items.')

  const { firstName, lastName } = splitCustomerName(buyer.displayName)
  const lineItems = soldItems.map((item) => ({
    title: item.itemName,
    quantity: 1,
    originalUnitPriceWithCurrency: {
      amount: (item.priceCents / 100).toFixed(2),
      currencyCode: 'USD',
    },
    requiresShipping: true,
    taxable: true,
    ...(buyer.privateGroup
      ? {
          appliedDiscount: {
            title: 'Private Group 10%',
            description: 'The Crafty Brother Private Group discount',
            value: 10,
            valueType: 'PERCENTAGE',
          },
        }
      : {}),
  }))

  const data = await shopifyGraphql<ShopifyDraftOrderCreateResponse>(
    SHOPIFY_DRAFT_ORDER_CREATE,
    {
      input: {
        lineItems,
        shippingAddress: {
          firstName,
          lastName,
          address1: profile.address1,
          address2: profile.address2 || undefined,
          city: profile.city,
          provinceCode: profile.state,
          zip: profile.postalCode,
          countryCode: profile.countryCode || 'US',
        },
        email: buyer.email || profile.email || undefined,
        shippingLine: {
          title: 'Shipping',
          priceWithCurrency: {
            amount: (buyer.shippingCents / 100).toFixed(2),
            currencyCode: 'USD',
          },
        },
        note: `Auction Console: ${auction.title} · Buyer: ${buyer.displayName}`,
        tags: ['auction-console', `auction-${auction.id}`],
        allowDiscountCodesInCheckout: false,
        visibleToCustomer: true,
      },
    },
  )

  const result = data.draftOrderCreate
  if (result.userErrors.length) {
    throw new Error(result.userErrors.map((error) => error.message).join('; '))
  }

  if (!result.draftOrder?.invoiceUrl) {
    throw new Error('Shopify created the draft order but did not return a checkout link.')
  }

  const totalAmount = Number(result.draftOrder.totalPriceSet.shopMoney.amount)
  const totalCents = Number.isFinite(totalAmount) ? Math.round(totalAmount * 100) : null
  const now = new Date()

  await db
    .update(auctionBuyer)
    .set({
      shopifyDraftOrderId: result.draftOrder.id,
      shopifyDraftOrderName: result.draftOrder.name,
      shopifyInvoiceUrl: result.draftOrder.invoiceUrl,
      shopifyDraftOrderTotalCents: totalCents,
      invoiceMethod: 'shopify',
      updatedAt: now,
    })
    .where(eq(auctionBuyer.id, buyer.id))

  revalidatePath('/auction')

  return {
    ok: true,
    invoiceUrl: result.draftOrder.invoiceUrl,
    draftOrderId: result.draftOrder.id,
    draftOrderName: result.draftOrder.name,
    totalCents,
    existing: false,
  }
}

type ShopifyDraftOrderStatusResponse = {
  node:
    | {
        id: string
        status: string
        order: {
          id: string
          name: string
          fullyPaid: boolean
          displayFinancialStatus: string | null
          fulfillmentOrders: {
            nodes: Array<{
              id: string
              status: string
            }>
          }
        } | null
      }
    | null
}

const SHOPIFY_DRAFT_ORDER_STATUS = `
  query AuctionDraftOrderStatus($id: ID!) {
    node(id: $id) {
      ... on DraftOrder {
        id
        status
        order {
          id
          name
          fullyPaid
          displayFinancialStatus
          fulfillmentOrders(first: 10) {
            nodes {
              id
              status
            }
          }
        }
      }
    }
  }
`

export async function syncShopifyOrderAction(input: {
  auctionId: number
  buyerId: number
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')
  if (!buyer.shopifyDraftOrderId) {
    throw new Error('Create the Shopify checkout link first.')
  }

  const data = await shopifyGraphql<ShopifyDraftOrderStatusResponse>(
    SHOPIFY_DRAFT_ORDER_STATUS,
    { id: buyer.shopifyDraftOrderId },
  )

  if (!data.node) {
    throw new Error('Shopify could not find this draft order.')
  }

  const order = data.node.order
  if (!order) {
    return {
      ok: true,
      paid: false,
      draftStatus: data.node.status,
      message: 'Shopify checkout has not been completed yet.',
    }
  }

  const fulfillmentOrder =
    order.fulfillmentOrders.nodes.find((node) =>
      ['OPEN', 'IN_PROGRESS', 'SCHEDULED'].includes(node.status),
    ) ?? order.fulfillmentOrders.nodes[0] ?? null

  const now = new Date()
  const paidCents =
    order.fullyPaid && buyer.shopifyDraftOrderTotalCents !== null
      ? buyer.shopifyDraftOrderTotalCents
      : buyer.paidCents

  await db
    .update(auctionBuyer)
    .set({
      shopifyOrderId: order.id,
      shopifyOrderName: order.name,
      shopifyFinancialStatus: order.displayFinancialStatus,
      shopifyFulfillmentOrderId: fulfillmentOrder?.id ?? null,
      invoiceStatus: order.fullyPaid ? 'paid' : buyer.invoiceStatus,
      paymentMethod: order.fullyPaid ? 'shopify' : buyer.paymentMethod,
      paymentTransactionId: order.fullyPaid ? order.id : buyer.paymentTransactionId,
      paidCents,
      paidAt: order.fullyPaid ? buyer.paidAt ?? now : buyer.paidAt,
      updatedAt: now,
    })
    .where(eq(auctionBuyer.id, buyer.id))

  revalidatePath('/auction')

  return {
    ok: true,
    paid: order.fullyPaid,
    draftStatus: data.node.status,
    financialStatus: order.displayFinancialStatus,
    orderId: order.id,
    orderName: order.name,
    fulfillmentOrderId: fulfillmentOrder?.id ?? null,
    message: order.fullyPaid
      ? 'Shopify payment confirmed.'
      : 'Shopify order exists but is not fully paid yet.',
  }
}

type ShopifyShippingLabelPurchaseResponse = {
  shippingLabelPurchase: {
    shippingLabelPurchaseResult: {
      id: string
      status: string
    } | null
    userErrors: Array<{
      field: string[] | null
      code: string | null
      message: string
    }>
  }
}

type ShopifyShippingLabelResultResponse = {
  node:
    | {
        status: string
        errors: Array<{
          code: string | null
          message: string
        }>
        shippingLabels: Array<{
          id: string
          cancellable: boolean
          printed: boolean
          trackingInfo: {
            number: string | null
            company: string | null
            url: string | null
          } | null
          shippingDocuments: Array<{
            documentType: string
            format: string
            url: string
          }>
        }>
      }
    | null
}

const SHOPIFY_SHIPPING_LABEL_PURCHASE = `
  mutation AuctionShippingLabelPurchase($input: ShippingLabelPurchaseInput!) {
    shippingLabelPurchase(shippingLabelPurchase: $input) {
      shippingLabelPurchaseResult {
        id
        status
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`

const SHOPIFY_SHIPPING_LABEL_RESULT = `
  query AuctionShippingLabelResult($id: ID!) {
    node(id: $id) {
      ... on ShippingLabelPurchaseResult {
        status
        errors {
          code
          message
        }
        shippingLabels {
          id
          cancellable
          printed
          trackingInfo {
            number
            company
            url
          }
          shippingDocuments {
            documentType
            format
            url
          }
        }
      }
    }
  }
`

async function readShopifyLabelResult(resultId: string) {
  const data = await shopifyGraphql<ShopifyShippingLabelResultResponse>(
    SHOPIFY_SHIPPING_LABEL_RESULT,
    { id: resultId },
  )

  if (!data.node) {
    throw new Error('Shopify could not find the shipping label purchase.')
  }

  if (data.node.status === 'PURCHASE_FAILED') {
    const detail = data.node.errors.map((error) => error.message).filter(Boolean).join('; ')
    throw new Error(detail || 'Shopify could not purchase the shipping label.')
  }

  const label = data.node.shippingLabels[0] ?? null
  const document =
    label?.shippingDocuments.find((item) => item.documentType === 'LABEL') ??
    label?.shippingDocuments[0] ??
    null

  return {
    status: data.node.status,
    label,
    document,
  }
}

export async function purchaseShopifyLabelAction(input: {
  auctionId: number
  buyerId: number
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  if (buyer.shopifyLabelUrl) {
    return {
      ok: true,
      status: 'PURCHASED',
      labelUrl: buyer.shopifyLabelUrl,
      trackingNumber: buyer.shopifyTrackingNumber,
      trackingUrl: buyer.shopifyTrackingUrl,
      carrier: buyer.shopifyCarrier,
      existing: true,
    }
  }

  if (!buyer.shopifyOrderId || !buyer.shopifyFulfillmentOrderId) {
    throw new Error('Check Shopify payment first so the fulfillment order is available.')
  }

  if (!buyer.paidAt || buyer.paymentMethod !== 'shopify') {
    throw new Error('Shopify payment must be confirmed before buying the label.')
  }

  if (
    !buyer.packageWeightOunces ||
    !buyer.packageLengthHundredths ||
    !buyer.packageWidthHundredths ||
    !buyer.packageHeightHundredths
  ) {
    throw new Error('Save the package weight and all three dimensions first.')
  }

  let resultId = buyer.shopifyLabelPurchaseResultId

  if (!resultId) {
    const purchase = await shopifyGraphql<ShopifyShippingLabelPurchaseResponse>(
      SHOPIFY_SHIPPING_LABEL_PURCHASE,
      {
        input: {
          fulfillmentOrderId: buyer.shopifyFulfillmentOrderId,
          shippingDatetime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          totalWeight: {
            value: buyer.packageWeightOunces,
            unit: 'OUNCES',
          },
          packageInfo: {
            customPackage: {
              weight: {
                value: 0.1,
                unit: 'OUNCES',
              },
              dimensions: {
                length: buyer.packageLengthHundredths / 100,
                width: buyer.packageWidthHundredths / 100,
                height: buyer.packageHeightHundredths / 100,
                unit: 'INCHES',
              },
              type: 'BOX',
            },
          },
          notifyCustomer: false,
        },
      },
    )

    const result = purchase.shippingLabelPurchase
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((error) => error.message).join('; '))
    }

    if (!result.shippingLabelPurchaseResult?.id) {
      throw new Error('Shopify did not start the shipping label purchase.')
    }

    resultId = result.shippingLabelPurchaseResult.id

    await db
      .update(auctionBuyer)
      .set({
        shopifyLabelPurchaseResultId: resultId,
        updatedAt: new Date(),
      })
      .where(eq(auctionBuyer.id, buyer.id))
  }

  let checked = await readShopifyLabelResult(resultId)

  for (let attempt = 0; attempt < 12 && checked.status === 'PENDING_PURCHASE'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    checked = await readShopifyLabelResult(resultId)
  }

  if (checked.status !== 'PURCHASED' || !checked.label || !checked.document?.url) {
    revalidatePath('/auction')
    return {
      ok: true,
      status: checked.status,
      labelUrl: null,
      trackingNumber: null,
      trackingUrl: null,
      carrier: null,
      existing: false,
    }
  }

  const now = new Date()
  await db
    .update(auctionBuyer)
    .set({
      shopifyLabelUrl: checked.document.url,
      shopifyTrackingNumber: checked.label.trackingInfo?.number ?? null,
      shopifyTrackingUrl: checked.label.trackingInfo?.url ?? null,
      shopifyCarrier: checked.label.trackingInfo?.company ?? null,
      shopifyLabelPurchasedAt: now,
      updatedAt: now,
    })
    .where(eq(auctionBuyer.id, buyer.id))

  revalidatePath('/auction')

  return {
    ok: true,
    status: 'PURCHASED',
    labelUrl: checked.document.url,
    trackingNumber: checked.label.trackingInfo?.number ?? null,
    trackingUrl: checked.label.trackingInfo?.url ?? null,
    carrier: checked.label.trackingInfo?.company ?? null,
    existing: false,
  }
}

export async function refreshShopifyLabelAction(input: {
  auctionId: number
  buyerId: number
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')
  if (!buyer.shopifyLabelPurchaseResultId) {
    throw new Error('No Shopify label purchase has been started.')
  }

  const checked = await readShopifyLabelResult(buyer.shopifyLabelPurchaseResultId)

  if (checked.status !== 'PURCHASED' || !checked.label || !checked.document?.url) {
    return {
      ok: true,
      status: checked.status,
      labelUrl: null,
      trackingNumber: null,
      trackingUrl: null,
      carrier: null,
    }
  }

  const now = new Date()
  await db
    .update(auctionBuyer)
    .set({
      shopifyLabelUrl: checked.document.url,
      shopifyTrackingNumber: checked.label.trackingInfo?.number ?? null,
      shopifyTrackingUrl: checked.label.trackingInfo?.url ?? null,
      shopifyCarrier: checked.label.trackingInfo?.company ?? null,
      shopifyLabelPurchasedAt: buyer.shopifyLabelPurchasedAt ?? now,
      updatedAt: now,
    })
    .where(eq(auctionBuyer.id, buyer.id))

  revalidatePath('/auction')

  return {
    ok: true,
    status: 'PURCHASED',
    labelUrl: checked.document.url,
    trackingNumber: checked.label.trackingInfo?.number ?? null,
    trackingUrl: checked.label.trackingInfo?.url ?? null,
    carrier: checked.label.trackingInfo?.company ?? null,
  }
}

export async function sendShopifyInvoiceAction(input: {
  auctionId: number
  buyerId: number
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')
  if (!buyer.shopifyDraftOrderId) {
    throw new Error('Create the Shopify checkout link before sending the invoice.')
  }

  const [profile] = await db
    .select()
    .from(auctionCustomerProfile)
    .where(
      and(
        eq(auctionCustomerProfile.userId, userId),
        eq(auctionCustomerProfile.normalizedName, buyer.normalizedName),
      ),
    )
    .limit(1)

  const email = (buyer.email || profile?.email || '').trim().toLowerCase()
  if (!email) {
    throw new Error('Save the customer email before sending a Shopify invoice.')
  }

  const data = await shopifyGraphql<ShopifyDraftOrderInvoiceSendResponse>(
    SHOPIFY_DRAFT_ORDER_INVOICE_SEND,
    {
      id: buyer.shopifyDraftOrderId,
      email: {
        to: email,
        customMessage: 'Thank you for shopping with The Crafty Brother. You can review and pay your auction invoice securely through Shopify.',
      },
    },
  )

  const result = data.draftOrderInvoiceSend
  if (result.userErrors.length) {
    throw new Error(result.userErrors.map((error) => error.message).join('; '))
  }

  const now = new Date()
  await db
    .update(auctionBuyer)
    .set({
      invoiceStatus: 'sent',
      invoiceMethod: 'shopify',
      invoiceSentAt: result.draftOrder?.invoiceSentAt
        ? new Date(result.draftOrder.invoiceSentAt)
        : now,
      updatedAt: now,
    })
    .where(eq(auctionBuyer.id, buyer.id))

  revalidatePath('/auction')
  return { ok: true, email }
}

export async function setBuyerInvoiceStatusAction(input: {
  auctionId: number
  buyerId: number
  status: 'ready' | 'sent' | 'paid'
  method?: 'messenger' | 'shopify' | 'other'
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const now = new Date()
  await db
    .update(auctionBuyer)
    .set({
      invoiceStatus: input.status,
      invoiceMethod: input.status === 'sent' || input.status === 'paid'
        ? input.method ?? 'messenger'
        : null,
      invoiceSentAt: input.status === 'sent' || input.status === 'paid' ? now : null,
      paidAt: input.status === 'paid' ? now : null,
      updatedAt: now,
    })
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))

  revalidatePath('/auction')
  return { ok: true }
}

export async function setBuyerPaymentAction(input: {
  auctionId: number
  buyerId: number
  paid: boolean
  paymentMethod?: 'paypal' | 'venmo' | 'meta_pay' | 'shopify' | 'other'
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  if (!input.paid) {
    await db
      .update(auctionBuyer)
      .set({
        paymentMethod: null,
        paymentTransactionId: null,
        paidCents: null,
        paidAt: null,
        updatedAt: new Date(),
      })
      .where(eq(auctionBuyer.id, input.buyerId))

    revalidatePath('/auction')
    return { ok: true }
  }

  if (buyer.shippingCents === null) {
    throw new Error('Enter shipping before marking this invoice paid.')
  }

  if (!input.paymentMethod) {
    throw new Error('Choose how the customer paid.')
  }

  const soldItems = await db
    .select({ priceCents: auctionItem.priceCents })
    .from(auctionItem)
    .where(
      and(
        eq(auctionItem.auctionId, input.auctionId),
        eq(auctionItem.buyerId, input.buyerId),
        eq(auctionItem.status, 'sold'),
      ),
    )

  const subtotalCents = soldItems.reduce((sum, item) => sum + item.priceCents, 0)
  const discountCents = buyer.privateGroup ? Math.round(subtotalCents * 0.1) : 0
  const dueCents = subtotalCents - discountCents + buyer.shippingCents
  const now = new Date()

  await db
    .update(auctionBuyer)
    .set({
      invoiceStatus: 'sent',
      invoiceSentAt: buyer.invoiceSentAt ?? now,
      paymentMethod: input.paymentMethod,
      paidCents: dueCents,
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(auctionBuyer.id, input.buyerId))

  if (input.paymentMethod === 'venmo' || input.paymentMethod === 'meta_pay') {
    await db
      .insert(auctionCustomerPreference)
      .values({
        userId,
        normalizedName: buyer.normalizedName,
        displayName: buyer.displayName,
        preferredPaymentMethod: input.paymentMethod,
        source: 'observed_payment',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          auctionCustomerPreference.userId,
          auctionCustomerPreference.normalizedName,
        ],
        set: {
          displayName: buyer.displayName,
          preferredPaymentMethod: input.paymentMethod,
          source: 'observed_payment',
          updatedAt: now,
        },
      })
  }

  revalidatePath('/auction')
  return { ok: true }
}

export async function setBuyerPaymentPreferenceAction(input: {
  auctionId: number
  buyerId: number
  method: 'paypal' | 'venmo' | 'meta_pay'
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)

  if (!buyer) throw new Error('Buyer not found')

  if (input.method === 'paypal') {
    await db
      .delete(auctionCustomerPreference)
      .where(
        and(
          eq(auctionCustomerPreference.userId, userId),
          eq(auctionCustomerPreference.normalizedName, buyer.normalizedName),
        ),
      )

    revalidatePath('/auction')
    return { ok: true }
  }

  await db
    .insert(auctionCustomerPreference)
    .values({
      userId,
      normalizedName: buyer.normalizedName,
      displayName: buyer.displayName,
      preferredPaymentMethod: input.method,
      source: 'manual',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        auctionCustomerPreference.userId,
        auctionCustomerPreference.normalizedName,
      ],
      set: {
        displayName: buyer.displayName,
        preferredPaymentMethod: input.method,
        source: 'manual',
        updatedAt: new Date(),
      },
    })

  revalidatePath('/auction')
  return { ok: true }
}

export async function saveBuyerShippingProfileAction(input: {
  auctionId: number
  buyerId: number
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  state: string
  postalCode: string
  countryCode?: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)
  if (!buyer) throw new Error('Buyer not found')

  const email = input.email.trim().toLowerCase()
  const phone = input.phone.trim()
  const address1 = input.address1.trim()
  const address2 = input.address2.trim()
  const city = input.city.trim()
  const state = input.state.trim().toUpperCase()
  const postalCode = input.postalCode.trim()
  const countryCode = (input.countryCode ?? 'US').trim().toUpperCase() || 'US'

  const hasAddress = Boolean(address1 || address2 || city || state || postalCode)
  if (hasAddress && (!address1 || !city || !state || !postalCode)) {
    throw new Error('Address, city, state, and ZIP are required together')
  }
  if (countryCode.length !== 2) throw new Error('Country code must be two letters')

  const now = new Date()
  await db
    .insert(auctionCustomerProfile)
    .values({
      userId,
      normalizedName: buyer.normalizedName,
      displayName: buyer.displayName,
      email: email || null,
      phone: phone || null,
      address1: address1 || null,
      address2: address2 || null,
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
      countryCode,
      shopifyCustomerId: buyer.shopifyCustomerId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        auctionCustomerProfile.userId,
        auctionCustomerProfile.normalizedName,
      ],
      set: {
        displayName: buyer.displayName,
        email: email || null,
        phone: phone || null,
        address1: address1 || null,
        address2: address2 || null,
        city: city || null,
        state: state || null,
        postalCode: postalCode || null,
        countryCode,
        updatedAt: now,
      },
    })

  await db
    .update(auctionBuyer)
    .set({ email: email || null, updatedAt: now })
    .where(eq(auctionBuyer.id, input.buyerId))

  revalidatePath('/auction')
  return { ok: true }
}

export async function saveBuyerContactAction(input: {
  auctionId: number
  buyerId: number
  email: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  const email = input.email.trim().toLowerCase()

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))
    .limit(1)
  if (!buyer) throw new Error('Buyer not found')

  const now = new Date()
  await db
    .update(auctionBuyer)
    .set({ email: email || null, updatedAt: now })
    .where(eq(auctionBuyer.id, input.buyerId))

  await db
    .insert(auctionCustomerProfile)
    .values({
      userId,
      normalizedName: buyer.normalizedName,
      displayName: buyer.displayName,
      email: email || null,
      countryCode: 'US',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        auctionCustomerProfile.userId,
        auctionCustomerProfile.normalizedName,
      ],
      set: {
        displayName: buyer.displayName,
        email: email || null,
        updatedAt: now,
      },
    })

  revalidatePath('/auction')
  return { ok: true }
}

export async function setAuctionStageAction(input: {
  auctionId: number
  status: 'live' | 'packaging' | 'invoicing' | 'complete'
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  await db
    .update(auctionSession)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(auctionSession.id, input.auctionId))

  revalidatePath('/auction')
  return { ok: true }
}

export async function importRowsAction(formData: FormData) {
  const userId = await currentUserId()
  const auctionId = Number(formData.get('auctionId'))
  const raw = String(formData.get('rows') ?? '').trim()
  if (!Number.isInteger(auctionId)) throw new Error('Auction is required')
  await requireAuction(userId, auctionId)
  if (!raw) return

  const lines = raw.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
  let imported = 0

  for (const line of lines.slice(0, 300)) {
    const columns = line.includes('\t')
      ? line.split('\t')
      : line.split(',').map((part) => part.trim())

    const itemName = (columns[0] ?? '').trim()
    const buyerName = (columns[1] ?? '').trim()
    const price = (columns[2] ?? '').trim()

    if (!itemName) continue
    if (/^item$/i.test(itemName) && /price/i.test(price)) continue
    if (parseMoneyToCents(price) === null) continue

    if (buyerName) {
      await insertSoldItem({ auctionId, itemName, buyerName, price })
    } else {
      await insertUnsoldItem({ auctionId, itemName, price })
    }
    imported += 1
  }

  if (imported) {
    await touchAuction(auctionId)
  }

  revalidatePath('/auction')
}
