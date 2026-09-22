import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auctionBuyer, auctionItem, auctionSession } from '@/lib/auction-schema'
import { ensureAuctionSchema, normalizeBuyerName } from '@/lib/auction'

const PREVIEW_OWNER = 'auction-preview-owner'
const TITLE = 'September 21, 2026 Auction'

const rows = [
  ['Green Purse', '', 500],
  ['Heart Moulds', 'Melody Made', 600],
  ['Easter backdrop', 'Marjorie Bowing', 500],
  ['Flag', 'Gerry Saunders', 500],
  ['Flag', '', 500],
  ['Portable Nebulizer', 'Kathryn Lasch', 800],
  ['Personal sanitizer', 'Cheryl Horn', 1000],
  ['Personal sanitizer', 'Cheryl Fraser', 1000],
  ['Personal sanitizer', 'Rhonda Griffin', 1000],
  ['Airplane foot rest', '', 500],
  ['Butt pads', 'Becky Ross', 800],
  ['Twin comforter', '', 1000],
  ['Pillow sealy', 'Amy Stout', 500],
  ['Feather pillow', 'Cheryl Fraser', 800],
  ['Stuffing pillow', '', 500],
  ['Beauty rest pillow', 'Amy Stout', 800],
  ['3d cutout dad', 'Teresa Mcswain', 500],
  ['Silicon heat mat', 'Marie Doss', 2500],
  ['Silicon heat mat', 'Marie Doss', 2500],
  ['Mailbox', 'Dala Lawrence', 1200],
  ['Mailbox', 'Sally Bennett', 1200],
  ['Mailbox', 'Teresa Mcswain', 1200],
  ['4 x 2 rug', 'Mitzi Grant', 2200],
  ['Heater', 'Dala Lawrence', 3000],
  ['Gisselle Steam shot', 'Connie Costello', 3500],
  ['Hot cool homemedics', 'Cheryl Horn', 2300],
  ['Hot cool homemedics', 'Rhonda Griffin', 2300],
  ['Dual tank humidifier', 'Cheryl Horn', 2500],
  ['Dual tank humidifier', 'Dala Lawrence', 2500],
  ['Dual tank humidifier', 'Nancy Burton', 2500],
  ['Dual tank humidifier', 'Kathryn Lasch', 2500],
  ['Dual tank humidifier', 'Cheryl Fraser', 2500],
  ['Dual tank humidifier', 'Cheryl Fraser', 2500],
  ['Dual tank humidifier', 'Elaine Ressler', 2500],
  ['Dual tank humidifier', 'Rhonda Griffin', 2500],
  ['Full comforter', 'Suzy Cassingham', 1000],
  ['Bedsure white queen', 'Dala Lawrence', 2700],
  ['The Craft', 'Elaine Ressler', 4000],
] as const

export async function ensureLatestAuctionPreview(userId: string) {
  if (process.env.VERCEL_ENV !== 'preview' || userId !== PREVIEW_OWNER) return null

  await ensureAuctionSchema()

  const [existing] = await db
    .select({ id: auctionSession.id })
    .from(auctionSession)
    .where(and(eq(auctionSession.userId, PREVIEW_OWNER), eq(auctionSession.title, TITLE)))
    .limit(1)

  if (existing) return existing.id

  const [auction] = await db
    .insert(auctionSession)
    .values({
      userId: PREVIEW_OWNER,
      title: TITLE,
      saleDate: '2026-09-21',
      status: 'packaging',
    })
    .returning({ id: auctionSession.id })

  const names = [...new Set(rows.map((row) => row[1]).filter((name): name is Exclude<typeof name, ''> => Boolean(name)))]
  const buyerIdByName = new Map<string, number>()

  for (const name of names) {
    const [buyer] = await db
      .insert(auctionBuyer)
      .values({
        auctionId: auction.id,
        displayName: name,
        normalizedName: normalizeBuyerName(name),
        privateGroup: name === 'Elaine Ressler',
        packageStatus: 'unpacked',
        invoiceStatus: 'not_ready',
      })
      .returning({ id: auctionBuyer.id, displayName: auctionBuyer.displayName })

    buyerIdByName.set(buyer.displayName, buyer.id)
  }

  for (const [itemName, buyerName, priceCents] of rows) {
    await db.insert(auctionItem).values({
      auctionId: auction.id,
      buyerId: buyerName ? buyerIdByName.get(buyerName) ?? null : null,
      itemName,
      priceCents,
      saleType: 'legacy',
      status: buyerName ? 'sold' : 'unsold',
    })
  }

  return auction.id
}


export async function resetLatestAuctionPreview(userId: string) {
  if (process.env.VERCEL_ENV !== 'preview' || userId !== PREVIEW_OWNER) {
    throw new Error('Preview reset is unavailable.')
  }

  await ensureAuctionSchema()

  const [auction] = await db
    .select({ id: auctionSession.id })
    .from(auctionSession)
    .where(and(eq(auctionSession.userId, PREVIEW_OWNER), eq(auctionSession.title, TITLE)))
    .limit(1)

  const auctionId = auction?.id ?? await ensureLatestAuctionPreview(userId)
  if (!auctionId) throw new Error('Auction not found.')

  await db.delete(auctionItem).where(eq(auctionItem.auctionId, auctionId))
  await db.delete(auctionBuyer).where(eq(auctionBuyer.auctionId, auctionId))

  await db
    .update(auctionSession)
    .set({
      saleDate: '2026-09-21',
      status: 'packaging',
      updatedAt: new Date(),
    })
    .where(eq(auctionSession.id, auctionId))

  const names = [...new Set(
    rows
      .map((row) => row[1])
      .filter((name): name is Exclude<typeof name, ''> => Boolean(name)),
  )]
  const buyerIdByName = new Map<string, number>()

  for (const name of names) {
    const [buyer] = await db
      .insert(auctionBuyer)
      .values({
        auctionId,
        displayName: name,
        normalizedName: normalizeBuyerName(name),
        privateGroup: name === 'Elaine Ressler',
        shippingCents: null,
        packageStatus: 'unpacked',
        invoiceStatus: 'not_ready',
        invoiceMethod: null,
        shopifyDraftOrderId: null,
        invoiceSentAt: null,
        paymentMethod: null,
        paymentTransactionId: null,
        paidCents: null,
        paidAt: null,
      })
      .returning({ id: auctionBuyer.id, displayName: auctionBuyer.displayName })

    buyerIdByName.set(buyer.displayName, buyer.id)
  }

  for (const [itemName, buyerName, priceCents] of rows) {
    await db.insert(auctionItem).values({
      auctionId,
      buyerId: buyerName ? buyerIdByName.get(buyerName) ?? null : null,
      itemName,
      priceCents,
      saleType: 'legacy',
      status: buyerName ? 'sold' : 'unsold',
      lastBidAt: null,
      backupBidderName: null,
      backupBidCents: null,
      voidedAt: null,
    })
  }

  return auctionId
}
