import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auctionBuyer,
  auctionCustomerProfile,
  auctionItem,
  auctionPackage,
  auctionSession,
} from '@/lib/auction-schema'
import { ensureAuctionSchema, normalizeBuyerName } from '@/lib/auction'

const measurements = [
  { name: 'Cheryl Fraser', packageNumber: 2, pounds: 13, ounces: 12, length: 18, width: 16, height: 13 },
  { name: 'Cheryl Fraser', packageNumber: 1, pounds: 4, ounces: 9, length: 20, width: 13, height: 6 },
  { name: 'Dala Lawrence', packageNumber: 1, pounds: 30, ounces: 7, length: 33, width: 16, height: 15 },
  { name: 'Kathryn Lasch', packageNumber: 1, pounds: 8, ounces: 14, length: 15, width: 15, height: 10 },
  { name: 'Cheryl Horn', packageNumber: 1, pounds: 8, ounces: 3, length: 16, width: 15, height: 10 },
  { name: 'Rhonda Griffin', packageNumber: 1, pounds: 7, ounces: 9, length: 16, width: 15, height: 10 },
  { name: 'Mitzi Grant', packageNumber: 1, pounds: 4, ounces: 10, length: 18, width: 13, height: 6 },
  { name: 'Cheryl Horn', packageNumber: 2, pounds: 5, ounces: 9, length: 16, width: 1, height: 10 },
  { name: 'Marie Doss', packageNumber: 1, pounds: 7, ounces: 1, length: 21, width: 8, height: 6 },
  { name: 'Rhonda Griffin', packageNumber: 2, pounds: 5, ounces: 9, length: 18, width: 11, height: 10 },
  { name: 'Becky Ross', packageNumber: 1, pounds: 3, ounces: 4, length: 14, width: 13, height: 6 },
  { name: 'Amy Stout', packageNumber: 1, pounds: 11, ounces: 8, length: 22, width: 18, height: 12 },
  { name: 'Suzy Cassingham', packageNumber: 1, pounds: 4, ounces: 11, length: 15, width: 13, height: 11 },
  { name: 'Teresa Mcswain', packageNumber: 1, pounds: 2, ounces: 1, length: 16, width: 9, height: 5 },
  { name: 'Teresa Mcswain', packageNumber: 2, pounds: 2, ounces: 2, length: 16, width: 13, height: 1 },
  { name: 'Nancy Burton', packageNumber: 1, pounds: 9, ounces: 8, length: 15, width: 15, height: 10 },
  { name: 'Sally Bennett', packageNumber: 1, pounds: 2, ounces: 1, length: 16, width: 9, height: 6 },
  { name: 'Connie Costello', packageNumber: 1, pounds: 5, ounces: 0, length: 10, width: 9, height: 6 },
] as const

async function latestAuction() {
  const userId = 'auction-preview-owner'
  const [auction] = await db
    .select()
    .from(auctionSession)
    .where(eq(auctionSession.userId, userId))
    .orderBy(desc(auctionSession.updatedAt))
    .limit(1)

  return { userId, auction }
}

async function inspect() {
  const { userId, auction } = await latestAuction()
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

async function applyMeasurements() {
  const { auction } = await latestAuction()
  if (!auction) {
    return Response.json({ error: 'No preview auction found' }, { status: 404 })
  }

  const buyers = await db
    .select()
    .from(auctionBuyer)
    .where(eq(auctionBuyer.auctionId, auction.id))
  const buyerByName = new Map(buyers.map((buyer) => [buyer.normalizedName, buyer]))

  const applied: Array<{
    name: string
    packageNumber: number
    weight: string
    dimensions: string
  }> = []
  const missing: string[] = []

  for (const row of measurements) {
    const buyer = buyerByName.get(normalizeBuyerName(row.name))
    if (!buyer) {
      missing.push(row.name)
      continue
    }

    let [pkg] = await db
      .select()
      .from(auctionPackage)
      .where(
        and(
          eq(auctionPackage.buyerId, buyer.id),
          eq(auctionPackage.packageNumber, row.packageNumber),
        ),
      )
      .limit(1)

    if (!pkg) {
      ;[pkg] = await db
        .insert(auctionPackage)
        .values({
          buyerId: buyer.id,
          packageNumber: row.packageNumber,
        })
        .returning()

      if (row.packageNumber === 1) {
        await db
          .update(auctionItem)
          .set({ packageId: pkg.id })
          .where(
            and(
              eq(auctionItem.auctionId, auction.id),
              eq(auctionItem.buyerId, buyer.id),
            ),
          )
      }
    }

    const totalOunces = row.pounds * 16 + row.ounces

    await db
      .update(auctionPackage)
      .set({
        weightOunces: totalOunces,
        lengthHundredths: row.length * 100,
        widthHundredths: row.width * 100,
        heightHundredths: row.height * 100,
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

    applied.push({
      name: buyer.displayName,
      packageNumber: row.packageNumber,
      weight: row.pounds + ' lb ' + row.ounces + ' oz',
      dimensions: row.length + ' x ' + row.width + ' x ' + row.height,
    })
  }

  for (const buyer of buyers) {
    const packages = await db
      .select()
      .from(auctionPackage)
      .where(eq(auctionPackage.buyerId, buyer.id))

    if (!packages.length) continue

    const allPacked = packages.every((pkg) => pkg.status === 'packed')
    const allShippingKnown = packages.every((pkg) => pkg.shippingCents !== null)
    const shippingCents = allShippingKnown
      ? packages.reduce((sum, pkg) => sum + (pkg.shippingCents ?? 0), 0)
      : null
    const sole = packages.length === 1 ? packages[0] : null

    await db
      .update(auctionBuyer)
      .set({
        packageStatus: allPacked ? 'packed' : 'unpacked',
        shippingCents,
        packageWeightOunces: sole?.weightOunces ?? null,
        packageLengthHundredths: sole?.lengthHundredths ?? null,
        packageWidthHundredths: sole?.widthHundredths ?? null,
        packageHeightHundredths: sole?.heightHundredths ?? null,
        updatedAt: new Date(),
      })
      .where(eq(auctionBuyer.id, buyer.id))
  }

  return Response.json({
    ok: true,
    auction: auction.title,
    appliedCount: applied.length,
    applied,
    missing: [...new Set(missing)],
    skipped: [
      {
        name: 'Gerry Saunders',
        reason: 'The supplied weight and dimensions are ambiguous: 18.14.3 1.11',
      },
    ],
  })
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  await ensureAuctionSchema()
  const url = new URL(request.url)

  if (url.searchParams.get('apply') === '1') {
    return applyMeasurements()
  }

  return inspect()
}
