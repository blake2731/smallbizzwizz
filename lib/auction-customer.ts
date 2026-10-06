import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auctionBuyer, auctionCustomerProfile, type AuctionBuyer } from './auction-schema'

// Names are search labels. Only the profile primary key identifies a customer.
export async function requireCustomer(userId: string, customerId: number) {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new Error('Select a valid customer')
  const [profile] = await db.select().from(auctionCustomerProfile)
    .where(and(eq(auctionCustomerProfile.id, customerId), eq(auctionCustomerProfile.userId, userId))).limit(1)
  if (!profile) throw new Error('Customer not found')
  return profile
}

export async function buyerCustomer(userId: string, buyer: AuctionBuyer) {
  if (!buyer.customerProfileId) throw new Error('Customer identity migration is required')
  return requireCustomer(userId, buyer.customerProfileId)
}

export async function resolveAuctionBuyer(userId: string, auctionId: number, rawName: string, customerId?: number | null) {
  const displayName = rawName.trim().replace(/\s+/g, ' ')
  const normalizedName = displayName.toLowerCase()
  if (!displayName) throw new Error('Buyer is required')
  let profile
  if (customerId != null) {
    profile = await requireCustomer(userId, customerId)
    if (profile.normalizedName !== normalizedName) throw new Error('Customer name changed; select the customer again')
  } else {
    const matches = await db.select().from(auctionCustomerProfile)
      .where(and(eq(auctionCustomerProfile.userId, userId), eq(auctionCustomerProfile.normalizedName, normalizedName)))
    if (matches.length > 1) throw new Error('Several customers have this name. Select one by email or city.')
    profile = matches[0]
    if (!profile) {
      // Preserve a new prospective identity before creating its auction participation.
      ;[profile] = await db.insert(auctionCustomerProfile).values({ userId, displayName, normalizedName }).returning()
    }
  }
  const [buyer] = await db.insert(auctionBuyer).values({
    auctionId, customerProfileId: profile.id, displayName: profile.displayName,
    normalizedName: profile.normalizedName, email: profile.email,
  }).onConflictDoUpdate({
    target: [auctionBuyer.auctionId, auctionBuyer.customerProfileId],
    set: { displayName: profile.displayName, updatedAt: new Date() },
  }).returning()
  return buyer
}
