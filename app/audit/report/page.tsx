import Link from 'next/link'
import Stripe from 'stripe'
import { auditWebsite, buildRecoveryPlan } from '@/lib/revenue-audit'
import { buildFixPack } from '@/lib/revenue-fix-pack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export default async function PaidAuditReport(props: {
  searchParams: Promise<{ session_id?: string | string[] }>
}) {
  const searchParams = await props.searchParams
  const sessionId = Array.isArray(searchParams.session_id)
    ? searchParams.session_id[0]
    : searchParams.session_id

  if (!sessionId) return <ReportError message="This report link is missing its payment session." />

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      return <ReportError message="Payment has not completed for this report." />
    }

    const targetUrl = session.metadata?.targetUrl
    if (!targetUrl) return <ReportError message="This payment does not contain a website to audit." />

    const result = await auditWebsite(targetUrl)
    const plan = buildRecoveryPlan(result)
    const fixPack = buildFixPack(result)

    return (
      <main style={styles.page}>
        <div style={styles.shell}>
          <header style={styles.header}>
            <Link href="/" style={styles.brand}>SmallBizzWizz</Link>
            <span style={styles.paidBadge}>PAID REVENUE FIX PACK</span>
          </header>

          <section style={styles.hero}>
            <div>
              <div style={styles.eyebrow}>FULL DIAGNOSTIC + IMPLEMENTATION</div>
              <h1 style={styles.h1}>Your website is scoring {result.score}/100.</h1>
              <p style={styles.lead}>{result.summary}</p>
              <div style={styles.url}>{result.finalUrl}</div>
            </div>
            <div style={styles.scoreCard}>
              <div style={styles.grade}>{result.grade}</div>
              <div style={styles.scoreLabel}>Revenue capture grade</div>
            </div>
          </section>

          <section style={styles.panel}>
            <div style={styles.sectionEyebrow}>PRIORITY ORDER</div>
            <h2 style={styles.h2}>Fix these first</h2>
            <div style={styles.stack}>
              {plan.length === 0 ? (
                <div style={styles.goodBox}>No major observable leaks were found in this scan.</div>
              ) : plan.map((item) => (
                <article key={item.priority} style={styles.findingCard}>
                  <div style={styles.priority}>{String(item.priority).padStart(2, '0')}</div>
                  <div>
                    <div style={styles.cardCategory}>{item.category}</div>
                    <h3 style={styles.cardTitle}>{item.title}</h3>
                    <p style={styles.cardCopy}>{item.why}</p>
                    <div style={styles.fixBox}>
                      <strong>Recovery action:</strong> {item.action}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {fixPack.length > 0 ? (
            <section style={styles.panel}>
              <div style={styles.sectionEyebrow}>IMPLEMENTATION PACK</div>
              <h2 style={styles.h2}>Turn the findings into changes</h2>
              <div style={styles.stack}>
                {fixPack.map((item, index) => (
                  <article key={item.findingId} style={styles.implementationCard}>
                    <div style={styles.implementationHeader}>
                      <span style={styles.priority}>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <h3 style={styles.cardTitle}>{item.title}</h3>
                        <p style={styles.cardCopy}>{item.outcome}</p>
                      </div>
                    </div>
                    <ol style={styles.steps}>
                      {item.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    {item.template ? (
                      <pre style={styles.codeBlock}><code>{item.template}</code></pre>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section style={styles.panel}>
            <div style={styles.sectionEyebrow}>WHAT IS WORKING</div>
            <h2 style={styles.h2}>Keep these intact</h2>
            <div style={styles.goodGrid}>
              {result.positives.map((positive) => (
                <div key={positive} style={styles.goodItem}>✓ {positive}</div>
              ))}
            </div>
          </section>

          <section style={styles.panel}>
            <div style={styles.sectionEyebrow}>SCAN DETAILS</div>
            <h2 style={styles.h2}>What this pass measured</h2>
            <div style={styles.metrics}>
              <Metric label="Pages scanned" value={String(result.pagesScanned?.length ?? 1)} />
              <Metric label="Homepage response" value={`${(result.responseMs / 1000).toFixed(1)} sec`} />
              <Metric label="Leaks found" value={String(result.findings.length)} />
              <Metric label="Positive signals" value={String(result.positives.length)} />
            </div>
            <p style={styles.disclaimer}>
              This diagnostic evaluates observable website conversion signals. It does not estimate lost dollars without the business&apos;s actual traffic, call volume, close rate, and average job value. Performance observations from a single scan should be verified with repeated field or lab measurements before major changes are made.
            </p>
          </section>

          <footer style={styles.footer}>
            <div>SmallBizzWizz</div>
            <div>Find the leaks. Fix the path. Capture more of the demand you already paid for.</div>
          </footer>
        </div>
      </main>
    )
  } catch (error) {
    console.error('Paid report error', error)
    return <ReportError message="The report could not be generated from this payment link." />
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metric}>
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricLabel}>{label}</div>
    </div>
  )
}

function ReportError({ message }: { message: string }) {
  return (
    <main style={styles.page}>
      <div style={{ ...styles.shell, paddingTop: 100 }}>
        <section style={styles.panel}>
          <div style={styles.sectionEyebrow}>REPORT UNAVAILABLE</div>
          <h1 style={styles.h1}>{message}</h1>
          <Link href="/" style={styles.button}>Run a new scan</Link>
        </section>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#07110f', color: '#f5f7f4', fontFamily: 'Arial, Helvetica, sans-serif', padding: '0 20px 60px' },
  shell: { maxWidth: 1080, margin: '0 auto' },
  header: { minHeight: 78, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, borderBottom: '1px solid #21312c' },
  brand: { color: '#f5f7f4', textDecoration: 'none', fontWeight: 800, letterSpacing: '-0.03em', fontSize: 20 },
  paidBadge: { fontSize: 11, letterSpacing: '0.12em', color: '#99f2bd', border: '1px solid #315946', borderRadius: 999, padding: '7px 10px' },
  hero: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 210px', gap: 30, padding: '70px 0 34px', alignItems: 'end' },
  eyebrow: { color: '#99f2bd', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', marginBottom: 14 },
  h1: { fontSize: 'clamp(38px, 7vw, 72px)', lineHeight: 0.98, letterSpacing: '-0.055em', margin: 0, maxWidth: 760 },
  lead: { color: '#b6c4be', fontSize: 18, lineHeight: 1.7, maxWidth: 720, margin: '22px 0 14px' },
  url: { color: '#7f918a', fontSize: 13, overflowWrap: 'anywhere' },
  scoreCard: { border: '1px solid #29443a', background: '#0d1a16', borderRadius: 24, padding: 28, textAlign: 'center' },
  grade: { fontSize: 76, fontWeight: 900, lineHeight: 1, color: '#99f2bd', letterSpacing: '-0.06em' },
  scoreLabel: { marginTop: 8, color: '#8da098', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' },
  panel: { background: '#0c1814', border: '1px solid #21312c', borderRadius: 24, padding: '30px', marginTop: 22 },
  sectionEyebrow: { color: '#67d995', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em' },
  h2: { fontSize: 30, letterSpacing: '-0.035em', margin: '8px 0 24px' },
  stack: { display: 'grid', gap: 12 },
  findingCard: { display: 'grid', gridTemplateColumns: '54px minmax(0,1fr)', gap: 18, padding: 20, borderRadius: 18, background: '#101f1a', border: '1px solid #263d34' },
  implementationCard: { padding: 22, borderRadius: 18, background: '#101f1a', border: '1px solid #315044' },
  implementationHeader: { display: 'grid', gridTemplateColumns: '54px minmax(0,1fr)', gap: 18, alignItems: 'start' },
  priority: { width: 44, height: 44, borderRadius: 12, background: '#183126', color: '#99f2bd', display: 'grid', placeItems: 'center', fontWeight: 800 },
  cardCategory: { color: '#729183', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800 },
  cardTitle: { margin: '5px 0 8px', fontSize: 20 },
  cardCopy: { color: '#b0c0b8', lineHeight: 1.6, margin: 0 },
  fixBox: { marginTop: 14, padding: 14, borderRadius: 12, background: '#142820', color: '#d9e7df', lineHeight: 1.55 },
  steps: { margin: '18px 0 0 72px', paddingLeft: 18, color: '#c3d1ca', lineHeight: 1.65 },
  codeBlock: { margin: '18px 0 0 72px', padding: 16, borderRadius: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', background: '#07110f', border: '1px solid #263d34', color: '#bce8ce', fontSize: 13, lineHeight: 1.5 },
  goodGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 },
  goodItem: { padding: 14, background: '#10231b', border: '1px solid #254333', borderRadius: 12, color: '#bce8ce' },
  goodBox: { padding: 18, background: '#10231b', border: '1px solid #254333', borderRadius: 14, color: '#bce8ce' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 },
  metric: { padding: 18, background: '#101f1a', borderRadius: 14, border: '1px solid #263d34' },
  metricValue: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em' },
  metricLabel: { color: '#82978e', fontSize: 12, marginTop: 4 },
  disclaimer: { color: '#71847b', lineHeight: 1.6, fontSize: 12, margin: '18px 0 0' },
  button: { display: 'inline-block', marginTop: 22, background: '#99f2bd', color: '#07110f', padding: '14px 18px', borderRadius: 12, textDecoration: 'none', fontWeight: 800 },
  footer: { display: 'flex', justifyContent: 'space-between', gap: 20, color: '#62766d', fontSize: 12, padding: '36px 2px 0', flexWrap: 'wrap' },
}
