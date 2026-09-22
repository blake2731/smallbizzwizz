import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auctionBuyer, auctionItem, auctionSession } from '@/lib/auction-schema'
import { ensureAuctionSchema, normalizeBuyerName } from '@/lib/auction'

const OWNER = 'auction-preview-owner'
const TITLE = 'September 21 Auction — Imported'

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

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse('Preview only', { status: 404 })
  }

  await ensureAuctionSchema()

  const existing = await db
    .select({ id: auctionSession.id })
    .from(auctionSession)
    .where(and(eq(auctionSession.userId, OWNER), eq(auctionSession.title, TITLE)))
    .limit(1)

  let auctionId: number

  if (existing[0]) {
    auctionId = existing[0].id
  } else {
    const [auction] = await db
      .insert(auctionSession)
      .values({
        userId: OWNER,
        title: TITLE,
        saleDate: '2026-09-21',
        status: 'packaging',
      })
      .returning({ id: auctionSession.id })

    auctionId = auction.id

    const names = [...new Set(rows.map((row) => row[1]).filter(Boolean))]
    const buyerIdByName = new Map<string, number>()

    for (const name of names) {
      const [buyer] = await db
        .insert(auctionBuyer)
        .values({
          auctionId,
          displayName: name,
          normalizedName: normalizeBuyerName(name),
          privateGroup: false,
          packageStatus: 'unpacked',
          invoiceStatus: 'not_ready',
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
        saleType: 'quick',
        status: buyerName ? 'sold' : 'unsold',
      })
    }
  }

  const url = new URL('/auction', request.url)
  url.searchParams.set('auction', String(auctionId))
  url.searchParams.set('view', 'live')
  return NextResponse.redirect(url)
}
