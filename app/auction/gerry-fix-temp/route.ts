import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auctionBuyer,
  auctionPackage,
  auctionSession,
} from '@/lib/auction-schema'
import { ensureAuctionSchema, normalizeBuyerName } from '@/lib/auction'

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  await ensureAuctionSchema()

  const userId = 'auction-preview-owner'
  const [auction] = await db
    .select()
    .from(auctionSession)
    .where(eq(auctionSession.userId, userId))
    .orderBy(desc(auctionSession.updatedAt))
    .limit(1)

  if (!auction) {
    return Response.json({ error: 'No auction found' }, { status: 404 })
  }

  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(eq(auctionBuyer.normalizedName, normalizeBuyerName('Gerry Saunders')))
    .limit(1)

  if (!buyer || buyer.auctionId !== auction.id) {
    return Response.json({ error: 'Gerry Saunders not found in latest auction' }, { status: 404 })
  }

  let [pkg] = await db
    .select()
    .from(auctionPackage)
    .where(eq(auctionPackage.buyerId, buyer.id))
    .orderBy(auctionPackage.packageNumber)
    .limit(1)

  if (!pkg) {
    ;[pkg] = await db
      .insert(auctionPackage)
      .values({ buyerId: buyer.id, packageNumber: 1 })
      .returning()
  }

  const totalOunces = 1 * 16 + 11

  await db
    .update(auctionPackage)
    .set({
      weightOunces: totalOunces,
      lengthHundredths: 18 * 100,
      widthHundredths: 14 * 100,
      heightHundredths: 3 * 100,
      status: 'packed',
      shippingCents: null,
      shippoShipmentId: null,
      shippoRateId: null,
      shippoProvider: null,
      shippoService: null,
      shippoRateCents: null,
      shippoQuotedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(auctionPackage.id, pkg.id))

  await db
    .update(auctionBuyer)
    .set({
      packageStatus: 'packed',
      shippingCents: null,
      packageWeightOunces: totalOunces,
      packageLengthHundredths: 18 * 100,
      packageWidthHundredths: 14 * 100,
      packageHeightHundredths: 3 * 100,
      updatedAt: new Date(),
    })
    .where(eq(auctionBuyer.id, buyer.id))

  return Response.json({
    ok: true,
    name: buyer.displayName,
    weight: '1 lb 11 oz',
    dimensions: '18 x 14 x 3 in',
  })
}
