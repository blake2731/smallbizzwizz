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

type PackingBuyer = NonNullable<Awaited<ReturnType<typeof getAuctionState>>>['buyers'][number]

function groupItems(items: Array<{ itemName: string; priceCents: number }>) {
  const groups = new Map<string, { name: string; priceCents: number; quantity: number }>()
  for (const item of items) {
    const name = item.itemName.trim()
    const key = name.toLowerCase() + '::' + item.priceCents
    const existing = groups.get(key)
    if (existing) {
      existing.quantity += 1
    } else {
      groups.set(key, { name, priceCents: item.priceCents, quantity: 1 })
    }
  }
  return [...groups.values()]
}

function packageGroups(buyer: PackingBuyer) {
  const packages = [...buyer.packages].sort((a, b) => a.packageNumber - b.packageNumber)
  if (!packages.length) {
    return [{ id: 0, packageNumber: 1, items: buyer.items }]
  }

  return packages.map((pkg, index) => ({
    id: pkg.id,
    packageNumber: pkg.packageNumber,
    items: buyer.items.filter(
      (item) => item.packageId === pkg.id || (item.packageId === null && index === 0),
    ),
  }))
}

function pageWeight(buyer: PackingBuyer) {
  return 1.35 + groupItems(buyer.items).length
}

function paginateBuyers(buyers: PackingBuyer[]) {
  const pages: PackingBuyer[][] = []
  let page: PackingBuyer[] = []
  let weight = 0

  for (const buyer of buyers) {
    const nextWeight = pageWeight(buyer)
    const wouldExceedBuyerCap = page.length >= 30
    const wouldExceedReadableWeight = page.length > 0 && weight + nextWeight > 92

    if (wouldExceedBuyerCap || wouldExceedReadableWeight) {
      pages.push(page)
      page = []
      weight = 0
    }

    page.push(buyer)
    weight += nextWeight
  }

  if (page.length) pages.push(page)
  return pages
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
  const pages = paginateBuyers(buyers)

  return (
    <main className={styles.screen}>
      <div className={styles.toolbar}>
        <Link href={'/auction?auction=' + auction.id + '&view=pack'}>← Back to Pack</Link>
        <div>
          <strong>Packing List Preview</strong>
          <span>Letter · Landscape · maximum 30 buyers per page.</span>
        </div>
        <PrintPackingButton />
      </div>

      <div className={styles.pageStack}>
        {pages.map((pageBuyers, pageIndex) => {
          const pageItemCount = pageBuyers.reduce((sum, buyer) => sum + buyer.items.length, 0)
          const pageValue = pageBuyers.reduce((sum, buyer) => sum + buyer.subtotalCents, 0)
          const columnClass = pageBuyers.length > 18 ? styles.columnsFour : styles.columnsThree

          return (
            <section className={styles.sheet} key={pageIndex}>
              <header className={styles.header}>
                <div>
                  <div className={styles.brand}>THE CRAFTY BROTHER</div>
                  <h1>PACKING LIST</h1>
                  <div className={styles.auctionTitle}>{auction.title}</div>
                </div>

                <div className={styles.pageMeta}>
                  <div className={styles.pageNumber}>PAGE {pageIndex + 1} OF {pages.length}</div>
                  <div className={styles.headerStats}>
                    <div><strong>{pageBuyers.length}</strong><span>Buyers</span></div>
                    <div><strong>{pageItemCount}</strong><span>Items</span></div>
                    <div><strong>{money(pageValue)}</strong><span>Merchandise</span></div>
                  </div>
                </div>
              </header>

              <div className={styles.columns + ' ' + columnClass}>
                {pageBuyers.map((buyer) => {
                   return (
                    <article className={styles.buyerBlock} key={buyer.id}>
                      <div className={styles.buyerHeader}>
                        <div className={styles.packBox}>□</div>
                        <div className={styles.buyerIdentity}>
                          <strong>{buyer.displayName}</strong>
                          <span>
                            {buyer.items.length} {buyer.items.length === 1 ? 'item' : 'items'}
                            {buyer.packages.length > 1 ? ' · ' + buyer.packages.length + ' packages' : ''}
                            {buyer.privateGroup ? ' · PG' : ''}
                          </span>
                        </div>
                        <div className={styles.buyerTotal}>{money(buyer.subtotalCents)}</div>
                      </div>

                      {packageGroups(buyer).map((pkg) => {
                        const packageItems = groupItems(pkg.items)
                        return (
                          <div className={styles.packageGroup} key={pkg.id || pkg.packageNumber}>
                            {buyer.packages.length > 1 ? (
                              <div className={styles.packageGroupTitle}>
                                □ Package {pkg.packageNumber}
                              </div>
                            ) : null}
                            <ul className={styles.items}>
                              {packageItems.map((item) => (
                                <li key={pkg.packageNumber + '-' + item.name + '-' + item.priceCents}>
                                  <span className={styles.itemBox}>□</span>
                                  <span className={styles.itemName}>{item.name}</span>
                                  {item.quantity > 1 ? (
                                    <span className={styles.quantity}>×{item.quantity}</span>
                                  ) : null}
                                  <strong className={styles.itemPrice}>
                                    {money(item.priceCents)}
                                    {item.quantity > 1 ? ' ea' : ''}
                                  </strong>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                    </article>
                  )
                })}
              </div>

              <footer className={styles.sheetFooter}>
                <div className={styles.pageChecks}>
                  <span>□ All buyers on this page packed</span>
                  <span>□ All items accounted for</span>
                </div>
                <div className={styles.packSignature}>
                  <span>Packed by: ____________________</span>
                  <span>Date: __________</span>
                </div>
              </footer>
            </section>
          )
        })}
      </div>
    </main>
  )
}
