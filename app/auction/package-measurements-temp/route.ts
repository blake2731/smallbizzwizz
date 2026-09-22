import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auctionBuyer,
  auctionCustomerProfile,
  auctionPackage,
  auctionSession,
} from '@/lib/auction-schema'
import { ensureAuctionSchema } from '@/lib/auction'

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
    return Response.json({ error: 'No preview auction found' }, { status: 404 })
  }

  const buyers = await db
    .select()
    .from(auctionBuyer)
    .where(eq(auctionBuyer.auctionId, auction.id))

  const profiles = await db
    .select()
    .from(auctionCustomerProfile)
    .where(eq(auctionCustomerProfile.userId, userId))

  const profileByName = new Map(profiles.map((profile) => [profile.normalizedName, profile]))

  const result = await Promise.all(
    buyers.map(async (buyer) => {
      const packages = await db
        .select()
        .from(auctionPackage)
        .where(eq(auctionPackage.buyerId, buyer.id))
        .orderBy(auctionPackage.packageNumber)

      const profile = profileByName.get(buyer.normalizedName)
      return {
        buyerId: buyer.id,
        name: buyer.displayName,
        normalizedName: buyer.normalizedName,
        addressComplete: Boolean(
          profile?.address1 && profile?.city && profile?.state && profile?.postalCode,
        ),
        packages: packages.map((pkg) => ({
          id: pkg.id,
          number: pkg.packageNumber,
          weightOunces: pkg.weightOunces,
          lengthHundredths: pkg.lengthHundredths,
          widthHundredths: pkg.widthHundredths,
          heightHundredths: pkg.heightHundredths,
          shippingCents: pkg.shippingCents,
          status: pkg.status,
        })),
      }
    }),
  )

  return Response.json({
    auction: {
      id: auction.id,
      title: auction.title,
      saleDate: auction.saleDate,
    },
    buyers: result.sort((a, b) => a.name.localeCompare(b.name)),
  })
}
