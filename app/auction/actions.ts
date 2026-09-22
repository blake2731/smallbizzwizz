'use server'

import { auth } from '@clerk/nextjs/server'
import { and, desc, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { auctionBuyer, auctionItem, auctionSession } from '@/lib/auction-schema'
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

async function currentUserId() {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')
  await ensureAuctionSchema()
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
  await db
    .update(auctionSession)
    .set({ updatedAt: new Date() })
    .where(eq(auctionSession.id, input.auctionId))
  revalidatePath('/auction')
  return { ok: true }
}

export async function recordUnsoldAction(input: LiveItemInput) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  await insertUnsoldItem(input)
  await db
    .update(auctionSession)
    .set({ updatedAt: new Date() })
    .where(eq(auctionSession.id, input.auctionId))
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

  if (last.buyerId) {
    const remaining = await db
      .select({ id: auctionItem.id })
      .from(auctionItem)
      .where(
        and(
          eq(auctionItem.buyerId, last.buyerId),
          eq(auctionItem.status, 'sold'),
          ne(auctionItem.id, last.id),
        ),
      )
      .limit(1)

    if (!remaining.length) {
      await db.delete(auctionBuyer).where(eq(auctionBuyer.id, last.buyerId))
    }
  }

  await db
    .update(auctionSession)
    .set({ updatedAt: new Date() })
    .where(eq(auctionSession.id, auctionId))

  revalidatePath('/auction')
  return { ok: true, message: `Undid “${last.itemName}”.` }
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

export async function setBuyerShippingAction(input: {
  auctionId: number
  buyerId: number
  shipping: string
  packed: boolean
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)

  const shippingCents = input.shipping.trim() ? parseMoneyToCents(input.shipping) : null
  if (input.shipping.trim() && shippingCents === null) throw new Error('Enter valid shipping')

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
      packageStatus: input.packed ? 'packed' : 'unpacked',
      invoiceStatus: nextInvoiceStatus,
      updatedAt: new Date(),
    })
    .where(eq(auctionBuyer.id, input.buyerId))

  revalidatePath('/auction')
  return { ok: true }
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

export async function saveBuyerContactAction(input: {
  auctionId: number
  buyerId: number
  email: string
}) {
  const userId = await currentUserId()
  await requireAuction(userId, input.auctionId)
  const email = input.email.trim().toLowerCase()

  await db
    .update(auctionBuyer)
    .set({ email: email || null, updatedAt: new Date() })
    .where(and(eq(auctionBuyer.id, input.buyerId), eq(auctionBuyer.auctionId, input.auctionId)))

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
    await db
      .update(auctionSession)
      .set({ updatedAt: new Date() })
      .where(eq(auctionSession.id, auctionId))
  }

  revalidatePath('/auction')
}
