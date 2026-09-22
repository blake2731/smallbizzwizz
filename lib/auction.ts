import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  auctionBuyer,
  auctionItem,
  auctionSession,
  type AuctionBuyer,
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
        CREATE TABLE IF NOT EXISTS auction_item (
          id serial PRIMARY KEY,
          auction_id integer NOT NULL REFERENCES auction_session(id) ON DELETE CASCADE,
          buyer_id integer REFERENCES auction_buyer(id) ON DELETE SET NULL,
          item_name text NOT NULL,
          price_cents integer NOT NULL,
          status text NOT NULL,
          voided_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
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
  items: AuctionItem[]
  subtotalCents: number
  discountCents: number
  dueCents: number | null
}

export type AuctionState = {
  auction: AuctionSession
  buyers: AuctionBuyerView[]
  recentBuyers: AuctionBuyer[]
  items: Array<AuctionItem & { buyerName: string | null }>
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

  const [buyers, allItems] = await Promise.all([
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
  ])

  const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]))
  const buyerViews: AuctionBuyerView[] = buyers.map((buyer) => {
    const items = allItems.filter((item) => item.status === 'sold' && item.buyerId === buyer.id)
    const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0)
    const discountCents = buyer.privateGroup ? Math.round(subtotalCents * 0.1) : 0
    const dueCents =
      buyer.shippingCents === null
        ? null
        : subtotalCents - discountCents + buyer.shippingCents

    return {
      ...buyer,
      items,
      subtotalCents,
      discountCents,
      dueCents,
    }
  })

  const sold = allItems.filter((item) => item.status === 'sold')
  const unsold = allItems.filter((item) => item.status === 'unsold')
  const items = [...allItems]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((item) => ({
      ...item,
      buyerName: item.buyerId ? buyerById.get(item.buyerId)?.displayName ?? null : null,
    }))

  return {
    auction,
    buyers: buyerViews,
    recentBuyers: buyers.slice(0, 10),
    items,
    metrics: {
      soldCents: sold.reduce((sum, item) => sum + item.priceCents, 0),
      soldCount: sold.length,
      unsoldCents: unsold.reduce((sum, item) => sum + item.priceCents, 0),
      unsoldCount: unsold.length,
      buyerCount: buyers.length,
      packedCount: buyers.filter((buyer) => buyer.packageStatus === 'packed').length,
      invoicedCount: buyers.filter((buyer) => buyer.invoiceStatus === 'sent').length,
      paidCount: buyers.filter((buyer) => buyer.invoiceStatus === 'paid').length,
    },
  }
}
