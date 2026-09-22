import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auctionBuyer,
  auctionCustomerPreference,
  auctionCustomerProfile,
  auctionItem,
  auctionSession,
  type AuctionBuyer,
  type AuctionCustomerProfile,
  type AuctionItem,
  type AuctionSession,
} from '@/lib/auction-schema'

let schemaReady: Promise<void> | null = null

export function normalizeBuyerName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function displayBuyerName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function parseMoneyToCents(value: string) {
  const cleaned = value.trim().replace(/[$,]/g, '')
  if (!cleaned) return null
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

export function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export async function ensureAuctionSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS auction_session (
          id serial PRIMARY KEY,
          user_id text NOT NULL,
          title text NOT NULL,
          sale_date date NOT NULL,
          status text NOT NULL DEFAULT 'live',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS auction_session_user_updated_idx
        ON auction_session (user_id, updated_at)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS auction_session_user_status_idx
        ON auction_session (user_id, status)
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS auction_buyer (
          id serial PRIMARY KEY,
          auction_id integer NOT NULL REFERENCES auction_session(id) ON DELETE CASCADE,
          display_name text NOT NULL,
          normalized_name text NOT NULL,
          private_group boolean NOT NULL DEFAULT false,
          email text,
          shopify_customer_id text,
          shipping_cents integer,
          package_status text NOT NULL DEFAULT 'unpacked',
          invoice_status text NOT NULL DEFAULT 'not_ready',
          invoice_method text,
          shopify_draft_order_id text,
          invoice_sent_at timestamptz,
          payment_method text,
          payment_transaction_id text,
          paid_cents integer,
          paid_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS auction_buyer_auction_name_unique
        ON auction_buyer (auction_id, normalized_name)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS auction_buyer_auction_updated_idx
        ON auction_buyer (auction_id, updated_at)
      `)

      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS payment_method text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS payment_transaction_id text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS paid_cents integer
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_draft_order_name text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_invoice_url text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_draft_order_total_cents integer
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_order_id text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_order_name text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_financial_status text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_fulfillment_order_id text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_label_purchase_result_id text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_label_url text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_tracking_number text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_tracking_url text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_carrier text
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS shopify_label_purchased_at timestamptz
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS package_weight_ounces integer
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS package_length_hundredths integer
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS package_width_hundredths integer
      `)
      await db.execute(sql`
        ALTER TABLE auction_buyer ADD COLUMN IF NOT EXISTS package_height_hundredths integer
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS auction_customer_profile (
          id serial PRIMARY KEY,
          user_id text NOT NULL,
          normalized_name text NOT NULL,
          display_name text NOT NULL,
          email text,
          phone text,
          address_1 text,
          address_2 text,
          city text,
          state text,
          postal_code text,
          country_code text NOT NULL DEFAULT 'US',
          shopify_customer_id text,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS auction_customer_profile_user_name_unique
        ON auction_customer_profile (user_id, normalized_name)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS auction_customer_profile_user_updated_idx
        ON auction_customer_profile (user_id, updated_at)
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS auction_customer_preference (
          id serial PRIMARY KEY,
          user_id text NOT NULL,
          normalized_name text NOT NULL,
          display_name text NOT NULL,
          preferred_payment_method text NOT NULL,
          source text NOT NULL DEFAULT 'observed_payment',
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS auction_customer_preference_user_name_unique
        ON auction_customer_preference (user_id, normalized_name)
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS auction_item (
          id serial PRIMARY KEY,
          auction_id integer NOT NULL REFERENCES auction_session(id) ON DELETE CASCADE,
          buyer_id integer REFERENCES auction_buyer(id) ON DELETE SET NULL,
          item_name text NOT NULL,
          price_cents integer NOT NULL,
          sale_type text NOT NULL DEFAULT 'quick',
          status text NOT NULL,
          last_bid_at timestamptz,
          backup_bidder_name text,
          backup_bid_cents integer,
          voided_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await db.execute(sql`
        ALTER TABLE auction_item
        ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'quick'
      `)
      await db.execute(sql`
        ALTER TABLE auction_item
        ADD COLUMN IF NOT EXISTS last_bid_at timestamptz
      `)
      await db.execute(sql`
        ALTER TABLE auction_item
        ADD COLUMN IF NOT EXISTS backup_bidder_name text
      `)
      await db.execute(sql`
        ALTER TABLE auction_item
        ADD COLUMN IF NOT EXISTS backup_bid_cents integer
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS auction_item_auction_created_idx
        ON auction_item (auction_id, created_at)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS auction_item_buyer_created_idx
        ON auction_item (buyer_id, created_at)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS auction_item_auction_status_idx
        ON auction_item (auction_id, status)
      `)
    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }

  return schemaReady
}

export type AuctionBuyerView = AuctionBuyer & {
  shippingProfile: AuctionCustomerProfile | null
  items: AuctionItem[]
  subtotalCents: number
  discountCents: number
  dueCents: number | null
  preferredPaymentMethod: 'venmo' | 'meta_pay' | null
}

export type KnownBuyer = {
  id: number
  displayName: string
  normalizedName: string
}

export type AuctionItemView = AuctionItem & {
  buyerName: string | null
}

export type AuctionState = {
  auction: AuctionSession
  buyers: AuctionBuyerView[]
  recentBuyers: KnownBuyer[]
  items: AuctionItemView[]
  openLot: AuctionItemView | null
  metrics: {
    soldCents: number
    soldCount: number
    unsoldCents: number
    unsoldCount: number
    buyerCount: number
    packedCount: number
    invoicedCount: number
    paidCount: number
  }
}

export async function getAuctionList(userId: string) {
  await ensureAuctionSchema()
  return db
    .select()
    .from(auctionSession)
    .where(eq(auctionSession.userId, userId))
    .orderBy(desc(auctionSession.updatedAt))
    .limit(20)
}

export async function getAuctionState(userId: string, requestedId?: number | null): Promise<AuctionState | null> {
  await ensureAuctionSchema()

  const auctionRows = requestedId
    ? await db
        .select()
        .from(auctionSession)
        .where(and(eq(auctionSession.id, requestedId), eq(auctionSession.userId, userId)))
        .limit(1)
    : await db
        .select()
        .from(auctionSession)
        .where(eq(auctionSession.userId, userId))
        .orderBy(desc(auctionSession.updatedAt))
        .limit(1)

  const auction = auctionRows[0]
  if (!auction) return null

  const [buyers, allItems, buyerHistory, preferences, profiles] = await Promise.all([
    db
      .select()
      .from(auctionBuyer)
      .where(eq(auctionBuyer.auctionId, auction.id))
      .orderBy(desc(auctionBuyer.updatedAt)),
    db
      .select()
      .from(auctionItem)
      .where(and(eq(auctionItem.auctionId, auction.id), ne(auctionItem.status, 'void')))
      .orderBy(asc(auctionItem.createdAt)),
    db
      .select({
        id: auctionBuyer.id,
        displayName: auctionBuyer.displayName,
        normalizedName: auctionBuyer.normalizedName,
        updatedAt: auctionBuyer.updatedAt,
      })
      .from(auctionBuyer)
      .innerJoin(auctionSession, eq(auctionBuyer.auctionId, auctionSession.id))
      .where(eq(auctionSession.userId, userId))
      .orderBy(desc(auctionBuyer.updatedAt))
      .limit(150),
    db
      .select()
      .from(auctionCustomerPreference)
      .where(eq(auctionCustomerPreference.userId, userId)),
    db
      .select()
      .from(auctionCustomerProfile)
      .where(eq(auctionCustomerProfile.userId, userId)),
  ])

  const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]))
  const preferenceByName = new Map(
    preferences.map((preference) => [preference.normalizedName, preference.preferredPaymentMethod]),
  )
  const profileByName = new Map(
    profiles.map((profile) => [profile.normalizedName, profile]),
  )
  const buyerViews: AuctionBuyerView[] = buyers
    .map((buyer) => {
      const profile = profileByName.get(buyer.normalizedName) ?? null
      const items = allItems.filter((item) => item.status === 'sold' && item.buyerId === buyer.id)
      const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0)
      const discountCents = buyer.privateGroup ? Math.round(subtotalCents * 0.1) : 0
      const dueCents =
        buyer.shippingCents === null
          ? null
          : subtotalCents - discountCents + buyer.shippingCents

      return {
        ...buyer,
        email: buyer.email ?? profile?.email ?? null,
        shippingProfile: profile,
        items,
        subtotalCents,
        discountCents,
        dueCents,
        preferredPaymentMethod: preferenceByName.get(buyer.normalizedName) ?? null,
      }
    })
    .filter((buyer) => buyer.items.length > 0)

  const knownBuyerMap = new Map<string, KnownBuyer>()
  for (const buyer of buyerHistory) {
    if (!knownBuyerMap.has(buyer.normalizedName)) {
      knownBuyerMap.set(buyer.normalizedName, {
        id: buyer.id,
        displayName: buyer.displayName,
        normalizedName: buyer.normalizedName,
      })
    }
    if (knownBuyerMap.size >= 24) break
  }

  const items: AuctionItemView[] = [...allItems]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((item) => ({
      ...item,
      buyerName: item.buyerId ? buyerById.get(item.buyerId)?.displayName ?? null : null,
    }))

  const sold = allItems.filter((item) => item.status === 'sold')
  const unsold = allItems.filter((item) => item.status === 'unsold')
  const openLot = items.find((item) => item.status === 'open') ?? null

  return {
    auction,
    buyers: buyerViews,
    recentBuyers: [...knownBuyerMap.values()],
    items,
    openLot,
    metrics: {
      soldCents: sold.reduce((sum, item) => sum + item.priceCents, 0),
      soldCount: sold.length,
      unsoldCents: unsold.reduce((sum, item) => sum + item.priceCents, 0),
      unsoldCount: unsold.length,
      buyerCount: buyerViews.length,
      packedCount: buyerViews.filter((buyer) => buyer.packageStatus === 'packed').length,
      invoicedCount: buyerViews.filter((buyer) => buyer.invoiceStatus === 'sent').length,
      paidCount: buyerViews.filter((buyer) => buyer.paidAt !== null).length,
    },
  }
}
