import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import {
  createAuctionAction,
  importRowsAction,
} from './actions'
import LiveEntry from './LiveEntry'
import BuyerCard from './BuyerCard'
import ActivityItem from './ActivityItem'
import { getAuctionList, getAuctionState, money } from '@/lib/auction'
import { ensureLatestAuctionPreview } from '@/lib/auction-preview-seed'
import styles from './auction.module.css'

export const metadata: Metadata = {
  title: 'Auction Console | The Crafty Brother',
  description: 'Private tablet-first live auction operations console.',
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Auction Console',
  },
}

const VIEWS = [
  ['live', 'Live'],
  ['buyers', 'Buyers'],
  ['pack', 'Pack'],
  ['invoice', 'Invoice'],
] as const

function easternToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return values.year + '-' + values.month + '-' + values.day
}

function stageLabel(status: string) {
  if (status === 'packaging') return 'Packaging'
  if (status === 'invoicing') return 'Invoicing'
  if (status === 'complete') return 'Complete'
  return 'Live'
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date)
}

export default async function AuctionPage({
  searchParams,
}: {
  searchParams: Promise<{ auction?: string | string[]; view?: string | string[] }>
}) {
  const userId = process.env.VERCEL_ENV === 'preview'
    ? 'auction-preview-owner'
    : (await auth()).userId

  if (!userId) redirect('/sign-in')

  const params = await searchParams
  const auctionParam = Array.isArray(params.auction) ? params.auction[0] : params.auction
  const requestedAuctionId = auctionParam ? Number.parseInt(auctionParam, 10) : null
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view
  const view = VIEWS.some(([key]) => key === viewParam) ? viewParam! : 'live'

  const seededAuctionId = await ensureLatestAuctionPreview(userId)
  const selectedAuctionId =
    requestedAuctionId && Number.isFinite(requestedAuctionId)
      ? requestedAuctionId
      : seededAuctionId

  const [auctions, state] = await Promise.all([
    getAuctionList(userId),
    getAuctionState(userId, selectedAuctionId),
  ])

  if (!state) {
    return (
      <main className={styles.shell}>
        <section className={styles.emptyStart}>
          <div className={styles.logoMark}>TCB</div>
          <p className={styles.kicker}>The Crafty Brother</p>
          <h1 className={styles.startTitle}>Auction Console</h1>
          <p className={styles.startCopy}>
            Built for an iPad during a live sale. Start an auction, then record each lot with
            three fields and two large decisions: sold or unsold.
          </p>

          <form className={styles.startForm} action={createAuctionAction}>
            <label className={styles.fieldGroup}>
              <span>Auction name</span>
              <input
                className={styles.bigInput}
                name="title"
                defaultValue={'Auction ' + new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'America/New_York',
                }).format(new Date())}
                required
              />
            </label>
            <label className={styles.fieldGroup}>
              <span>Date</span>
              <input className={styles.bigInput} name="saleDate" type="date" defaultValue={easternToday()} required />
            </label>
            <button className={styles.soldButton} type="submit">Start auction</button>
          </form>
        </section>
      </main>
    )
  }

  const { auction, buyers, recentBuyers, items, openLot, metrics } = state
  const packBuyers = [...buyers].sort((a, b) => {
    if (a.packageStatus !== b.packageStatus) return a.packageStatus === 'packed' ? 1 : -1
    return a.displayName.localeCompare(b.displayName)
  })
  const invoiceBuyers = [...buyers].sort((a, b) => {
    const aReady = a.shippingCents !== null ? 0 : 1
    const bReady = b.shippingCents !== null ? 0 : 1
    if (aReady !== bReady) return aReady - bReady
    return a.displayName.localeCompare(b.displayName)
  })

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.kicker}>The Crafty Brother · Auction Console</p>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{auction.title}</h1>
              <span className={styles.stageBadge}>{stageLabel(auction.status)}</span>
            </div>
            <p className={styles.subtitle}>
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'America/New_York',
              }).format(new Date(auction.saleDate + 'T12:00:00-04:00'))}
            </p>
          </div>

          <details className={styles.auctionSwitcher}>
            <summary>Auctions</summary>
            <div className={styles.switcherMenu}>
              {auctions.map((entry) => (
                <Link
                  key={entry.id}
                  href={'/auction?auction=' + entry.id + '&view=live'}
                  className={entry.id === auction.id ? styles.currentAuction : ''}
                >
                  <span>{entry.title}</span>
                  <small>{entry.saleDate}</small>
                </Link>
              ))}
              <div className={styles.newAuctionBox}>
                <form action={createAuctionAction}>
                  <input name="title" placeholder="New auction name" required />
                  <input name="saleDate" type="date" defaultValue={easternToday()} required />
                  <button type="submit">Create</button>
                </form>
              </div>
            </div>
          </details>
        </header>

        <section className={styles.metricGrid} aria-label="Auction summary">
          <div className={styles.metricPrimary}>
            <span>Sold</span>
            <strong>{money(metrics.soldCents)}</strong>
          </div>
          <div className={styles.metric}>
            <span>Items</span>
            <strong>{metrics.soldCount}</strong>
          </div>
          <div className={styles.metric}>
            <span>Buyers</span>
            <strong>{metrics.buyerCount}</strong>
          </div>
          <div className={styles.metric}>
            <span>Unsold</span>
            <strong>{metrics.unsoldCount}</strong>
          </div>
        </section>

        <nav className={styles.tabs} aria-label="Auction workflow">
          {VIEWS.map(([key, label]) => (
            <Link
              key={key}
              href={'/auction?auction=' + auction.id + '&view=' + key}
              className={view === key ? styles.tabActive : styles.tab}
            >
              {label}
              {key === 'pack' && metrics.buyerCount ? (
                <span>{metrics.packedCount}/{metrics.buyerCount}</span>
              ) : null}
              {key === 'invoice' && metrics.buyerCount ? (
                <span>{metrics.invoicedCount}/{metrics.buyerCount}</span>
              ) : null}
            </Link>
          ))}
        </nav>

        {view === 'live' ? (
          <div className={styles.liveLayout}>
            <div>
              <LiveEntry
                auctionId={auction.id}
                recentBuyers={recentBuyers.map((buyer) => ({
                  id: buyer.id,
                  displayName: buyer.displayName,
                }))}
                openLot={openLot ? {
                  id: openLot.id,
                  itemName: openLot.itemName,
                  priceCents: openLot.priceCents,
                  buyerName: openLot.buyerName,
                } : null}
              />

              <details className={styles.importPanel}>
                <summary>Import rows copied from an old Sheet</summary>
                <form action={importRowsAction}>
                  <input type="hidden" name="auctionId" value={auction.id} />
                  <p>
                    Copy three columns in this order: <strong>Item, Buyer, Price</strong>. Leave Buyer
                    blank for unsold items. Paste the rows below.
                  </p>
                  <textarea
                    name="rows"
                    placeholder={'Item\tBuyer\tPrice\nDual tank humidifier\tJane Doe\t25\nGreen purse\t\t5'}
                    rows={7}
                    required
                  />
                  <button className={styles.secondaryAction} type="submit">Import rows</button>
                </form>
              </details>
            </div>

            <aside className={styles.activityPanel}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.kicker}>Edit anything</p>
                  <h2>Activity & corrections</h2>
                </div>
              </div>

              {items.length ? (
                <div className={styles.activityList}>
                  {items.map((item) => (
                    <ActivityItem
                      key={item.id}
                      auctionId={auction.id}
                      item={item}
                      buyers={recentBuyers}
                      timeLabel={formatTime(item.createdAt)}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.emptyCard}>No lots recorded yet.</div>
              )}

              {metrics.unsoldCount ? (
                <div className={styles.unsoldSummary}>
                  Unsold value: <strong>{money(metrics.unsoldCents)}</strong>
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}

        {view === 'buyers' ? (
          <section>
            <div className={styles.viewHeader}>
              <div>
                <p className={styles.kicker}>Customer rollup</p>
                <h2>Buyer totals</h2>
                <p>One card per buyer. This is where PG status belongs—not in the live-entry flow.</p>
              </div>
            </div>
            <div className={styles.cardGrid}>
              {buyers.map((buyer) => (
                <BuyerCard key={buyer.id} auctionId={auction.id} auctionTitle={auction.title} buyer={buyer} mode="buyers" />
              ))}
            </div>
          </section>
        ) : null}

        {view === 'pack' ? (
          <section>
            <div className={styles.viewHeader}>
              <div>
                <p className={styles.kicker}>After the live</p>
                <h2>Packaging</h2>
                <p>Save the customer address, weigh and measure the package, then move it into shipping.</p>
              </div>
              <div className={styles.packHeaderActions}>
                <Link
                  className={styles.printPackingLink}
                  href={'/auction/packing-list?auction=' + auction.id}
                >
                  🖨 Print packing list
                </Link>
                <a
                  className={styles.printPackingLink}
                  href={'/auction/pirate-ship?auction=' + auction.id}
                >
                  Export Pirate Ship CSV
                </a>
                <div className={styles.progressText}>
                  {metrics.packedCount} of {metrics.buyerCount} packed
                </div>
              </div>
            </div>
            <div className={styles.cardGrid}>
              {packBuyers.map((buyer) => (
                <BuyerCard key={buyer.id} auctionId={auction.id} auctionTitle={auction.title} buyer={buyer} mode="pack" />
              ))}
            </div>
          </section>
        ) : null}

        {view === 'invoice' ? (
          <section>
            <div className={styles.viewHeader}>
              <div>
                <p className={styles.kicker}>Collect payment</p>
                <h2>Invoices</h2>
                <p>
                  The final amount appears only after shipping exists. Messenger works now; customer
                  email is captured here for the Shopify lane.
                </p>
              </div>
              <div className={styles.progressText}>
                {metrics.invoicedCount} sent · {metrics.paidCount} paid
              </div>
            </div>
            <div className={styles.cardGrid}>
              {invoiceBuyers.map((buyer) => (
                <BuyerCard key={buyer.id} auctionId={auction.id} auctionTitle={auction.title} buyer={buyer} mode="invoice" />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}
