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
    packageWeightOunces: integer('package_weight_ounces'),
    packageLengthHundredths: integer('package_length_hundredths'),
    packageWidthHundredths: integer('package_width_hundredths'),
    packageHeightHundredths: integer('package_height_hundredths'),
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
    shopifyDraftOrderName: text('shopify_draft_order_name'),
    shopifyInvoiceUrl: text('shopify_invoice_url'),
    shopifyDraftOrderTotalCents: integer('shopify_draft_order_total_cents'),
    shopifyOrderId: text('shopify_order_id'),
    shopifyOrderName: text('shopify_order_name'),
    shopifyFinancialStatus: text('shopify_financial_status'),
    shopifyFulfillmentOrderId: text('shopify_fulfillment_order_id'),
    shopifyLabelPurchaseResultId: text('shopify_label_purchase_result_id'),
    shopifyLabelUrl: text('shopify_label_url'),
    shopifyTrackingNumber: text('shopify_tracking_number'),
    shopifyTrackingUrl: text('shopify_tracking_url'),
    shopifyCarrier: text('shopify_carrier'),
    shopifyLabelPurchasedAt: timestamp('shopify_label_purchased_at', { withTimezone: true }),
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

export const auctionCustomerProfile = pgTable(
  'auction_customer_profile',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    normalizedName: text('normalized_name').notNull(),
    displayName: text('display_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    address1: text('address_1'),
    address2: text('address_2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    countryCode: text('country_code').notNull().default('US'),
    shopifyCustomerId: text('shopify_customer_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('auction_customer_profile_user_name_unique').on(t.userId, t.normalizedName),
    index('auction_customer_profile_user_updated_idx').on(t.userId, t.updatedAt),
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

export const auctionPackage = pgTable(
  'auction_package',
  {
    id: serial('id').primaryKey(),
    buyerId: integer('buyer_id')
      .notNull()
      .references(() => auctionBuyer.id, { onDelete: 'cascade' }),
    packageNumber: integer('package_number').notNull().default(1),
    weightOunces: integer('weight_ounces'),
    lengthHundredths: integer('length_hundredths'),
    widthHundredths: integer('width_hundredths'),
    heightHundredths: integer('height_hundredths'),
    shippingCents: integer('shipping_cents'),
    status: text('status')
      .$type<'unpacked' | 'packed'>()
      .notNull()
      .default('unpacked'),
    shippoShipmentId: text('shippo_shipment_id'),
    shippoRateId: text('shippo_rate_id'),
    shippoProvider: text('shippo_provider'),
    shippoService: text('shippo_service'),
    shippoRateCents: integer('shippo_rate_cents'),
    shippoQuotedAt: timestamp('shippo_quoted_at', { withTimezone: true }),
    shippoTransactionId: text('shippo_transaction_id'),
    shippoLabelUrl: text('shippo_label_url'),
    shippoTrackingNumber: text('shippo_tracking_number'),
    shippoTrackingUrl: text('shippo_tracking_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('auction_package_buyer_number_unique').on(t.buyerId, t.packageNumber),
    index('auction_package_buyer_status_idx').on(t.buyerId, t.status),
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
    packageId: integer('package_id').references(() => auctionPackage.id, { onDelete: 'set null' }),
    itemName: text('item_name').notNull(),
    priceCents: integer('price_cents').notNull(),
    saleType: text('sale_type').$type<'quick' | 'auction' | 'legacy'>().notNull().default('quick'),
    status: text('status').$type<'open' | 'sold' | 'unsold' | 'void'>().notNull(),
    lastBidAt: timestamp('last_bid_at', { withTimezone: true }),
    backupBidderName: text('backup_bidder_name'),
    backupBidCents: integer('backup_bid_cents'),
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
export type AuctionCustomerProfile = typeof auctionCustomerProfile.$inferSelect
export type AuctionCustomerPreference = typeof auctionCustomerPreference.$inferSelect
export type AuctionPackage = typeof auctionPackage.$inferSelect
export type AuctionItem = typeof auctionItem.$inferSelect
