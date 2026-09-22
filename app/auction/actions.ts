'use server'

import { auth } from '@clerk/nextjs/server'
import { and, desc, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { shopifyGraphql } from '@/lib/shopify-admin'
import {
  auctionBuyer,
  auctionCustomerPreference,
  auctionCustomerProfile,
  auctionItem,
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
