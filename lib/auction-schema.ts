import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const auctionSession = pgTable(
  'auction_session',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    saleDate: date('sale_date').notNull(),
    status: text('status')
      .$type<'live' | 'packaging' | 'invoicing' | 'complete'>()
      .notNull()
      .default('live'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('auction_session_user_updated_idx').on(t.userId, t.updatedAt),
    index('auction_session_user_status_idx').on(t.userId, t.status),
  ],
)

export const auctionBuyer = pgTable(
  'auction_buyer',
  {
    id: serial('id').primaryKey(),
    auctionId: integer('auction_id')
      .notNull()
      .references(() => auctionSession.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    privateGroup: boolean('private_group').notNull().default(false),
    email: text('email'),
    shopifyCustomerId: text('shopify_customer_id'),
    shippingCents: integer('shipping_cents'),
    packageStatus: text('package_status')
      .$type<'unpacked' | 'packed'>()
      .notNull()
      .default('unpacked'),
    invoiceStatus: text('invoice_status')
      .$type<'not_ready' | 'ready' | 'sent' | 'paid'>()
      .notNull()
      .default('not_ready'),
    invoiceMethod: text('invoice_method').$type<'messenger' | 'shopify' | 'other' | null>(),
    shopifyDraftOrderId: text('shopify_draft_order_id'),
    invoiceSentAt: timestamp('invoice_sent_at', { withTimezone: true }),
    paymentMethod: text('payment_method'),
    paymentTransactionId: text('payment_transaction_id'),
    paidCents: integer('paid_cents'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('auction_buyer_auction_name_unique').on(t.auctionId, t.normalizedName),
    index('auction_buyer_auction_updated_idx').on(t.auctionId, t.updatedAt),
  ],
)

export const auctionCustomerPreference = pgTable(
  'auction_customer_preference',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    normalizedName: text('normalized_name').notNull(),
    displayName: text('display_name').notNull(),
    preferredPaymentMethod: text('preferred_payment_method')
      .$type<'venmo' | 'meta_pay'>()
      .notNull(),
    source: text('source')
      .$type<'observed_payment' | 'manual'>()
      .notNull()
      .default('observed_payment'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('auction_customer_preference_user_name_unique').on(t.userId, t.normalizedName),
  ],
)

export const auctionItem = pgTable(
  'auction_item',
  {
    id: serial('id').primaryKey(),
    auctionId: integer('auction_id')
      .notNull()
      .references(() => auctionSession.id, { onDelete: 'cascade' }),
    buyerId: integer('buyer_id').references(() => auctionBuyer.id, { onDelete: 'set null' }),
    itemName: text('item_name').notNull(),
    priceCents: integer('price_cents').notNull(),
    saleType: text('sale_type').$type<'quick' | 'auction' | 'legacy'>().notNull().default('quick'),
    status: text('status').$type<'open' | 'sold' | 'unsold' | 'void'>().notNull(),
    lastBidAt: timestamp('last_bid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('auction_item_auction_created_idx').on(t.auctionId, t.createdAt),
    index('auction_item_buyer_created_idx').on(t.buyerId, t.createdAt),
    index('auction_item_auction_status_idx').on(t.auctionId, t.status),
  ],
)

export type AuctionSession = typeof auctionSession.$inferSelect
export type AuctionBuyer = typeof auctionBuyer.$inferSelect
export type AuctionCustomerPreference = typeof auctionCustomerPreference.$inferSelect
export type AuctionItem = typeof auctionItem.$inferSelect
