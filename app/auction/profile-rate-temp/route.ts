import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auctionBuyer,
  auctionCustomerProfile,
  auctionPackage,
  auctionSession,
} from '@/lib/auction-schema'
import { ensureAuctionSchema, normalizeBuyerName } from '@/lib/auction'
import { resolveShippoOriginAddressId, shippoRequest } from '@/lib/shippo'

type ShippoRate = {
  object_id: string
  amount: string
  currency: string
  provider: string
  servicelevel?: {
    name?: string
    token?: string
  }
}

type ShippoShipment = {
  object_id: string
  rates?: ShippoRate[]
  messages?: Array<{ text?: string }>
}

async function latestAuction(userId: string) {
  const [auction] = await db
    .select()
    .from(auctionSession)
    .where(eq(auctionSession.userId, userId))
    .orderBy(desc(auctionSession.updatedAt))
    .limit(1)

  return auction ?? null
}

async function saveProfile(url: URL, userId: string) {
  const auction = await latestAuction(userId)
  if (!auction) {
    return Response.json({ error: 'No auction found' }, { status: 404 })
  }

  const name = url.searchParams.get('name')?.trim() ?? ''
  if (!name) {
    return Response.json({ error: 'Missing name' }, { status: 400 })
  }

  const normalizedName = normalizeBuyerName(name)
  const [buyer] = await db
    .select()
    .from(auctionBuyer)
    .where(
      and(
        eq(auctionBuyer.auctionId, auction.id),
        eq(auctionBuyer.normalizedName, normalizedName),
      ),
    )
    .limit(1)

  if (!buyer) {
    return Response.json({ error: 'Buyer not found', name }, { status: 404 })
  }

  const address1 = url.searchParams.get('address1')?.trim() ?? ''
  const address2 = url.searchParams.get('address2')?.trim() ?? ''
  const city = url.searchParams.get('city')?.trim() ?? ''
  const state = url.searchParams.get('state')?.trim().toUpperCase() ?? ''
  const postalCode = url.searchParams.get('postalCode')?.trim() ?? ''
  const email = url.searchParams.get('email')?.trim().toLowerCase() ?? ''
  const phone = url.searchParams.get('phone')?.trim() ?? ''
  const countryCode = url.searchParams.get('countryCode')?.trim().toUpperCase() || 'US'

  if (!address1 || !city || !state || !postalCode) {
    return Response.json(
      { error: 'Address, city, state, and postalCode are required' },
      { status: 400 },
    )
  }

  const now = new Date()
  await db
    .insert(auctionCustomerProfile)
    .values({
      userId,
      normalizedName,
      displayName: buyer.displayName,
      email: email || null,
      phone: phone || null,
      address1,
      address2: address2 || null,
      city,
      state,
      postalCode,
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
        address1,
        address2: address2 || null,
        city,
        state,
        postalCode,
        countryCode,
        updatedAt: now,
      },
    })

  if (email) {
    await db
      .update(auctionBuyer)
      .set({ email, updatedAt: now })
      .where(eq(auctionBuyer.id, buyer.id))
  }

  return Response.json({
    ok: true,
    name: buyer.displayName,
    saved: true,
  })
}

async function rateAll(userId: string) {
  const auction = await latestAuction(userId)
  if (!auction) {
    return Response.json({ error: 'No auction found' }, { status: 404 })
  }

  const buyers = await db
    .select()
    .from(auctionBuyer)
    .where(eq(auctionBuyer.auctionId, auction.id))

  const originAddressId = await resolveShippoOriginAddressId()
  const rated: Array<{
    name: string
    packageNumber: number
    provider: string
    service: string
    amountCents: number
  }> = []
  const failures: Array<{
    name: string
    packageNumber: number
    error: string
  }> = []

  for (const buyer of buyers) {
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

    const packages = await db
      .select()
      .from(auctionPackage)
      .where(eq(auctionPackage.buyerId, buyer.id))
      .orderBy(auctionPackage.packageNumber)

    if (!profile?.address1 || !profile.city || !profile.state || !profile.postalCode) {
      for (const pkg of packages) {
        failures.push({
          name: buyer.displayName,
          packageNumber: pkg.packageNumber,
          error: 'Missing shipping address',
        })
      }
      continue
    }

    for (const pkg of packages) {
      if (
        !pkg.weightOunces ||
        !pkg.lengthHundredths ||
        !pkg.widthHundredths ||
        !pkg.heightHundredths
      ) {
        failures.push({
          name: buyer.displayName,
          packageNumber: pkg.packageNumber,
          error: 'Missing package measurements',
        })
        continue
      }

      try {
        const shipment = await shippoRequest<ShippoShipment>('/shipments/', {
          method: 'POST',
          body: JSON.stringify({
            address_from: originAddressId,
            address_to: {
              name: buyer.displayName,
              street1: profile.address1,
              street2: profile.address2 || undefined,
              city: profile.city,
              state: profile.state,
              zip: profile.postalCode,
              country: profile.countryCode || 'US',
              phone: profile.phone || undefined,
              email: buyer.email || profile.email || undefined,
              object_purpose: 'PURCHASE',
            },
            parcels: [
              {
                length: String(pkg.lengthHundredths / 100),
                width: String(pkg.widthHundredths / 100),
                height: String(pkg.heightHundredths / 100),
                distance_unit: 'in',
                weight: String(pkg.weightOunces),
                mass_unit: 'oz',
              },
            ],
            object_purpose: 'PURCHASE',
            async: false,
          }),
        })

        const rates = (shipment.rates ?? [])
          .map((rate) => ({
            id: rate.object_id,
            provider: rate.provider,
            service: rate.servicelevel?.name || rate.servicelevel?.token || 'Shipping',
            amountCents: Math.round(Number(rate.amount) * 100),
            currency: rate.currency,
          }))
          .filter(
            (rate) =>
              Number.isFinite(rate.amountCents) &&
              rate.amountCents >= 0 &&
              rate.currency.toUpperCase() === 'USD',
          )
          .sort((a, b) => a.amountCents - b.amountCents)

        const cheapest = rates[0]
        if (!cheapest) {
          const detail = (shipment.messages ?? [])
            .map((message) => message.text)
            .filter(Boolean)
            .join('; ')

          failures.push({
            name: buyer.displayName,
            packageNumber: pkg.packageNumber,
            error: detail || 'No rates returned',
          })
          continue
        }

        await db
          .update(auctionPackage)
          .set({
            shippingCents: cheapest.amountCents,
            shippoShipmentId: shipment.object_id,
            shippoRateId: cheapest.id,
            shippoProvider: cheapest.provider,
            shippoService: cheapest.service,
            shippoRateCents: cheapest.amountCents,
            shippoQuotedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(auctionPackage.id, pkg.id))

        rated.push({
          name: buyer.displayName,
          packageNumber: pkg.packageNumber,
          provider: cheapest.provider,
          service: cheapest.service,
          amountCents: cheapest.amountCents,
        })
      } catch (error) {
        failures.push({
          name: buyer.displayName,
          packageNumber: pkg.packageNumber,
          error: error instanceof Error ? error.message : 'Rate lookup failed',
        })
      }
    }

    const refreshedPackages = await db
      .select()
      .from(auctionPackage)
      .where(eq(auctionPackage.buyerId, buyer.id))

    const allRated =
      refreshedPackages.length > 0 &&
      refreshedPackages.every((pkg) => pkg.shippingCents !== null)

    const shippingCents = allRated
      ? refreshedPackages.reduce((sum, pkg) => sum + (pkg.shippingCents ?? 0), 0)
      : null

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
        invoiceStatus,
        updatedAt: new Date(),
      })
      .where(eq(auctionBuyer.id, buyer.id))
  }

  return Response.json({
    ok: true,
    auction: auction.title,
    ratedCount: rated.length,
    rated,
    failures,
  })
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  await ensureAuctionSchema()

  const userId = 'auction-preview-owner'
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (action === 'save-profile') {
    return saveProfile(url, userId)
  }

  if (action === 'rate-all') {
    return rateAll(userId)
  }

  return Response.json({ ok: true, actions: ['save-profile', 'rate-all'] })
}
