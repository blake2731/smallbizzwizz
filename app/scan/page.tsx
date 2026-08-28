import type { Metadata } from 'next'
import Link from 'next/link'
import { auditWebsite } from '@/lib/revenue-audit'
import CheckoutButton from './CheckoutButton'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Website Capture Scan | SmallBizzWizz',
  robots: { index: false, follow: false },
}

export default async function ShareableScanPage(props: {
  searchParams: Promise<{ url?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  const input = Array.isArray(searchParams.url) ? searchParams.url[0] : searchParams.url

  if (!input) {
    return <ScanError message="This scan link is missing a website." />
  }

  try {
    const result = await auditWebsite(input)
    const topFindings = result.findings.slice(0, 3)
    const pagesScanned = [...new Set(result.pagesScanned)]
    const highPriority = result.findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high').length
    const summary = result.findings.length === 0
      ? `No major observable conversion issues were found across ${pagesScanned.length} scanned page${pagesScanned.length === 1 ? '' : 's'}.`
      : `The scanner found ${result.findings.length} observable friction signal${result.findings.length === 1 ? '' : 's'} across ${pagesScanned.length} page${pagesScanned.length === 1 ? '' : 's'}. These are public-source observations, not a predicted conversion rate or revenue-loss estimate.`

    return (
      <main style={styles.page}>
        <div style={styles.shell}>
          <header style={styles.header}>
            <Link href="/" style={styles.brand}>SmallBizzWizz</Link>
            <span style={styles.badge}>PUBLIC WEBSITE SCAN</span>
          </header>

          <section style={styles.hero}>
            <div>
              <div style={styles.eyebrow}>WE CHECKED THE PUBLIC CONVERSION PATH</div>
              <h1 style={styles.h1}>{result.findings.length} observable friction signal{result.findings.length === 1 ? '' : 's'} found.</h1>
              <p style={styles.lead}>{summary}</p>
              <div style={styles.url}>{result.finalUrl}</div>
            </div>
            <div style={styles.scoreCard}>
              <div style={styles.grade}>{highPriority}</div>
              <div style={styles.scoreLabel}>high-priority signal{highPriority === 1 ? '' : 's'}</div>
            </div>
          </section>

          {topFindings.length ? (
            <section style={styles.panel}>
              <div style={styles.sectionEyebrow}>HIGHEST PRIORITY FINDINGS</div>
              <h2 style={styles.h2}>What is worth checking first</h2>
              <div style={styles.stack}>
                {topFindings.map((finding, index) => (
                  <article key={finding.id} style={styles.findingCard}>
                    <div style={styles.priority}>{String(index + 1).padStart(2, '0')}</div>
                    <div>
                      <div style={styles.severity}>{finding.severity} priority</div>
                      <h3 style={styles.cardTitle}>{finding.title}</h3>
                      <p style={styles.cardCopy}>{finding.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section style={styles.panel}>
              <div style={styles.sectionEyebrow}>STRONG RESULT</div>
              <h2 style={styles.h2}>No major observable conversion issue was found.</h2>
              <p style={styles.cardCopy}>We do not sell a Fix Pack when the scan does not find a meaningful problem to fix.</p>
            </section>
          )}

          <section style={styles.panel}>
            <div style={styles.sectionEyebrow}>WHAT WAS CHECKED</div>
            <h2 style={styles.h2}>{pagesScanned.length} page{pagesScanned.length === 1 ? '' : 's'} scanned</h2>
            <div style={styles.pages}>
              {pagesScanned.map((page) => <div key={page} style={styles.pageUrl}>{page}</div>)}
            </div>
            <p style={styles.disclaimer}>
              SmallBizzWizz evaluates observable public website signals. Static page-source checks can miss JavaScript-rendered forms, private analytics, or other client-side behavior. Findings should be verified before implementation. The scan does not estimate lost dollars without actual business data.
            </p>
            <p style={styles.disclaimer}><Link href="/methodology" style={styles.textLink}>Read the methodology and limitations.</Link></p>
          </section>

          {result.findings.length ? (
            <section style={styles.offer}>
              <div>
                <div style={styles.sectionEyebrow}>IF YOU WANT THE REPAIR PLAN</div>
                <h2 style={styles.offerTitle}>DIY instructions are $49. Implementation is scoped separately.</h2>
                <p style={styles.offerCopy}>
                  The DIY Revenue Fix Pack includes every observed issue, implementation order, estimated effort, repair steps, verification checks, and copy or code starting points where applicable. If somebody sent you this scan and you would rather have the work done for you, reply to that person instead of buying the DIY pack.
                </p>
                <p style={styles.disclaimer}><Link href="/sample" style={styles.textLink}>See an illustrative Fix Pack sample first.</Link></p>
              </div>
              <div style={styles.checkoutColumn}>
                <div style={styles.price}>$49</div>
                <div style={styles.priceMeta}>DIY · one time · no subscription</div>
                <CheckoutButton url={result.finalUrl} score={result.score} />
              </div>
            </section>
          ) : null}

          <footer style={styles.footer}>
            <div>SmallBizzWizz</div>
            <div><Link href="/sample" style={styles.textLink}>Sample Fix Pack</Link> · <Link href="/methodology" style={styles.textLink}>Methodology</Link></div>
          </footer>
        </div>
      </main>
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'This website could not be scanned.'
    return <ScanError message={message} />
  }
}

function ScanError({ message }: { message: string }) {
  return (
    <main style={styles.page}>
      <div style={{ ...styles.shell, paddingTop: 90 }}>
        <section style={styles.panel}>
          <div style={styles.sectionEyebrow}>SCAN UNAVAILABLE</div>
          <h1 style={styles.h2}>{message}</h1>
          <Link href="/" style={styles.linkButton}>Run a fresh scan</Link>
        </section>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#07110f', color: '#f5f7f4', fontFamily: 'Arial, Helvetica, sans-serif', padding: '0 20px 60px' },
  shell: { maxWidth: 1040, margin: '0 auto' },
  header: { minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, borderBottom: '1px solid #21312c' },
  brand: { color: '#f5f7f4', textDecoration: 'none', fontWeight: 850, letterSpacing: '-0.04em', fontSize: 20 },
  badge: { color: '#99f2bd', fontSize: 10, letterSpacing: '0.12em', border: '1px solid #315946', borderRadius: 999, padding: '7px 10px' },
  hero: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 190px', gap: 30, padding: '68px 0 34px', alignItems: 'end' },
  eyebrow: { color: '#99f2bd', fontSize: 11, fontWeight: 850, letterSpacing: '0.14em', marginBottom: 14 },
  h1: { fontSize: 'clamp(40px, 7vw, 72px)', lineHeight: 0.98, letterSpacing: '-0.055em', margin: 0, maxWidth: 760 },
  lead: { color: '#b6c4be', fontSize: 18, lineHeight: 1.65, maxWidth: 720, margin: '20px 0 12px' },
  url: { color: '#71847b', fontSize: 12, overflowWrap: 'anywhere' },
  scoreCard: { border: '1px solid #29443a', background: '#0d1a16', borderRadius: 22, padding: 25, textAlign: 'center' },
  grade: { fontSize: 70, fontWeight: 900, lineHeight: 1, color: '#99f2bd', letterSpacing: '-0.06em' },
  scoreLabel: { marginTop: 8, color: '#8da098', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' },
  panel: { background: '#0c1814', border: '1px solid #21312c', borderRadius: 22, padding: 28, marginTop: 18 },
  sectionEyebrow: { color: '#67d995', fontSize: 10, fontWeight: 850, letterSpacing: '0.14em' },
  h2: { fontSize: 30, letterSpacing: '-0.04em', margin: '8px 0 22px' },
  stack: { display: 'grid', gap: 10 },
  findingCard: { display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', gap: 17, padding: 19, borderRadius: 16, background: '#101f1a', border: '1px solid #263d34' },
  priority: { width: 42, height: 42, borderRadius: 11, background: '#183126', color: '#99f2bd', display: 'grid', placeItems: 'center', fontWeight: 850 },
  severity: { color: '#82978e', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 850 },
  cardTitle: { margin: '5px 0 7px', fontSize: 20 },
  cardCopy: { color: '#aebfb7', lineHeight: 1.6, margin: 0 },
  pages: { display: 'grid', gap: 7 },
  pageUrl: { padding: '10px 12px', borderRadius: 10, background: '#101f1a', color: '#91a79d', fontSize: 12, overflowWrap: 'anywhere' },
  disclaimer: { color: '#71847b', lineHeight: 1.55, fontSize: 11, margin: '16px 0 0' },
  offer: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 32, alignItems: 'center', marginTop: 18, padding: 30, borderRadius: 22, background: '#11251d', border: '1px solid #376047' },
  offerTitle: { fontSize: 32, letterSpacing: '-0.045em', margin: '8px 0 12px' },
  offerCopy: { color: '#a8bbb2', lineHeight: 1.65, margin: 0 },
  checkoutColumn: { padding: 20, borderRadius: 16, background: '#0b1813', border: '1px solid #2a4738' },
  price: { fontSize: 48, fontWeight: 900, letterSpacing: '-0.06em' },
  priceMeta: { color: '#789087', fontSize: 11, margin: '-2px 0 16px' },
  linkButton: { display: 'inline-block', marginTop: 8, background: '#99f2bd', color: '#07110f', padding: '13px 16px', borderRadius: 11, textDecoration: 'none', fontWeight: 850 },
  textLink: { color: '#99f2bd' },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 20, color: '#62766d', fontSize: 11, padding: '34px 2px 0', flexWrap: 'wrap' },
}
