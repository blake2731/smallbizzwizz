import { auth } from '@clerk/nextjs/server'
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ensureAuctionSchema } from '@/lib/auction'
import { auctionBuyer, auctionPackage, auctionSession } from '@/lib/auction-schema'
import { db } from '@/lib/db'
import QuoteReceiver from './QuoteReceiver'

export default async function PirateShipCapturePage({ searchParams }: {
  searchParams: Promise<{ auction?: string }>
}) {
  const { auction: rawId } = await searchParams
  const auctionId = Number(rawId)
  const userId = process.env.VERCEL_ENV === 'preview' ? 'auction-preview-owner' : (await auth()).userId
  if (!userId || !Number.isSafeInteger(auctionId) || auctionId <= 0) notFound()
  await ensureAuctionSchema()
  const [auction] = await db.select({ id: auctionSession.id, title: auctionSession.title })
    .from(auctionSession).where(and(eq(auctionSession.id, auctionId), eq(auctionSession.userId, userId))).limit(1)
  if (!auction) notFound()
  const rows = await db.select({
    buyer: auctionBuyer.displayName, buyerId: auctionBuyer.id,
    packageId: auctionPackage.id, box: auctionPackage.packageNumber,
    packagingType: auctionPackage.packagingType, weightOunces: auctionPackage.weightOunces,
    lengthHundredths: auctionPackage.lengthHundredths, widthHundredths: auctionPackage.widthHundredths,
    heightHundredths: auctionPackage.heightHundredths,
  }).from(auctionPackage).innerJoin(auctionBuyer, eq(auctionBuyer.id, auctionPackage.buyerId))
    .where(and(eq(auctionBuyer.auctionId, auctionId), eq(auctionPackage.status, 'packed'),
      isNull(auctionPackage.shippingCents), isNull(auctionPackage.shippoTransactionId), isNull(auctionPackage.shippoLabelUrl),
      or(isNull(auctionPackage.shippoProvider), ne(auctionPackage.shippoProvider, 'Manual mail')),
      sql`exists (select 1 from auction_item i where i.buyer_id = ${auctionBuyer.id} and i.status = 'sold')`,
    )).orderBy(auctionBuyer.displayName, auctionPackage.packageNumber)
  const packages = rows.filter(row => row.weightOunces && row.lengthHundredths && row.widthHundredths &&
    (row.packagingType === 'envelope' || row.heightHundredths)).map(row => ({
      buyer: row.buyer, buyerId: row.buyerId, packageId: row.packageId, box: row.box,
      packagingType: row.packagingType, pounds: Math.floor(row.weightOunces! / 16), ounces: row.weightOunces! % 16,
      length: row.lengthHundredths! / 100, width: row.widthHundredths! / 100,
      height: row.heightHundredths === null ? null : row.heightHundredths / 100,
    }))
  return <QuoteReceiver auctionId={auction.id} title={auction.title} packages={packages} />
}
