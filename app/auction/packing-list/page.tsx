import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getAuctionState } from '@/lib/auction'
import { ensureLatestAuctionPreview } from '@/lib/auction-preview-seed'
import PrintPackingButton from './PrintPackingButton'
import styles from './packing-list.module.css'

function money(cents: number | null) {
  if (cents === null) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function groupItems(items: Array<{ itemName: string }>) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const name = item.itemName.trim()
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, quantity]) => ({ name, quantity }))
}

export default async function PackingListPage({
  searchParams,
}: {
  searchParams: Promise<{ auction?: string | string[] }>
}) {
  const userId = process.env.VERCEL_ENV === 'preview'
    ? 'auction-preview-owner'
    : (await auth()).userId

  if (!userId) redirect('/sign-in')

  const params = await searchParams
  const rawAuction = Array.isArray(params.auction) ? params.auction[0] : params.auction
  const requestedAuctionId = rawAuction ? Number.parseInt(rawAuction, 10) : null
  const seededAuctionId = await ensureLatestAuctionPreview(userId)
  const auctionId =
    requestedAuctionId && Number.isFinite(requestedAuctionId)
      ? requestedAuctionId
      : seededAuctionId

  const state = await getAuctionState(userId, auctionId)
  if (!state) redirect('/auction?view=pack')

  const { auction } = state
  const buyers = [...state.buyers].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const soldItemCount = buyers.reduce((sum, buyer) => sum + buyer.items.length, 0)

  return (
    <main className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={'/auction?auction=' + auction.id + '&view=pack'}>← Back to Pack</Link>
        <div>
          <strong>Packing List Preview</strong>
          <span>Print settings are optimized for Letter · Landscape · one page.</span>
        </div>
        <PrintPackingButton />
      </div>

      <section className={styles.sheet}>
        <header className={styles.header}>
          <div>
            <div className={styles.brand}>THE CRAFTY BROTHER</div>
            <h1>PACKING LIST</h1>
            <div className={styles.auctionTitle}>{auction.title}</div>
          </div>
          <div className={styles.headerStats}>
            <div><strong>{buyers.length}</strong><span>Buyers</span></div>
            <div><strong>{soldItemCount}</strong><span>Items</span></div>
            <div><strong>{state.metrics.packedCount}</strong><span>Packed</span></div>
          </div>
        </header>

        <div className={styles.columns}>
          {buyers.map((buyer) => {
            const grouped = groupItems(buyer.items)
            return (
              <article className={styles.buyerBlock} key={buyer.id}>
                <div className={styles.buyerHeader}>
                  <div className={styles.packBox}>□</div>
                  <div className={styles.buyerIdentity}>
                    <strong>{buyer.displayName}</strong>
                    <span>
                      {buyer.items.length} {buyer.items.length === 1 ? 'item' : 'items'}
                      {buyer.privateGroup ? ' · PG' : ''}
                    </span>
                  </div>
                  <div className={styles.packedLabel}>PACKED</div>
                </div>

                <ul className={styles.items}>
                  {grouped.map((item) => (
                    <li key={item.name}>
                      <span className={styles.itemBox}>□</span>
                      <span>{item.name}</span>
                      {item.quantity > 1 ? <strong>×{item.quantity}</strong> : null}
                    </li>
                  ))}
                </ul>

                <div className={styles.footerLine}>
                  <span>
                    Shipping:{' '}
                    <strong>{buyer.shippingCents === null ? '__________' : money(buyer.shippingCents)}</strong>
                  </span>
                  <span className={styles.notes}>Notes: ____________________</span>
                </div>
              </article>
            )
          })}
        </div>

        <footer className={styles.sheetFooter}>
          <span>□ All buyers packed</span>
          <span>□ Shipping entered</span>
          <span>□ Ready to invoice</span>
        </footer>
      </section>
    </main>
  )
}
