import Link from 'next/link'

export const metadata = {
  title: 'Methodology | SmallBizzWizz',
  description: 'How the SmallBizzWizz website capture scanner works, what it can observe, and where its limits are.',
}

export default function MethodologyPage() {
  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.brand}>SmallBizzWizz</Link>
          <span style={styles.badge}>METHODOLOGY</span>
        </header>

        <section style={styles.hero}>
          <div style={styles.eyebrow}>WHAT THE SCANNER CAN — AND CANNOT — KNOW</div>
          <h1 style={styles.h1}>A diagnostic, not a crystal ball.</h1>
          <p style={styles.lead}>SmallBizzWizz inspects public website source and follows a shallow set of likely conversion links. It is designed to surface useful things to verify, not to pretend it can see private business data or predict revenue.</p>
        </section>

        <section style={styles.grid}>
          <article style={styles.card}><h2>What it checks</h2><p>Public HTML from the homepage and up to three likely contact, quote, booking, appointment, or service-request pages. It looks for observable signals such as tap-to-call links, common forms, conversion CTAs, trust proof, analytics tags, structured data, service-area language, mobile viewport setup, HTTPS, titles, descriptions, and an initial server-response observation.</p></article>
          <article style={styles.card}><h2>What it can miss</h2><p>JavaScript-rendered forms, dynamically injected phone links, private analytics, CRM behavior, call-center performance, off-site booking tools that are not linked in the scanned path, and anything behind authentication. A missing signal means “verify this,” not “we proved it does not exist.”</p></article>
          <article style={styles.card}><h2>What priority means</h2><p>Priority is a product heuristic based on how directly an observed condition can interfere with contacting the business. It is not a calibrated conversion probability, industry percentile, or financial forecast. That is why public result pages emphasize findings rather than a letter grade.</p></article>
          <article style={styles.card}><h2>What it will not claim</h2><p>The scanner does not know traffic volume, paid-media spend, close rate, average ticket, gross margin, call-answer rate, or actual lost revenue unless the business supplies that data. SmallBizzWizz therefore does not manufacture a monthly “revenue leak” dollar figure from a public website alone.</p></article>
          <article style={styles.card}><h2>Performance caveat</h2><p>A single server-response measurement is a clue, not a benchmark. Any speed finding should be reproduced using repeated measurements and, when available, real-user field data before material work is commissioned.</p></article>
          <article style={styles.card}><h2>Before implementing</h2><p>High-value work should be verified against the live site on real devices. For outbound prospects, SmallBizzWizz manually checks the specific issue mentioned in the first message before using it as the basis of a sales conversation.</p></article>
        </section>

        <section style={styles.callout}>
          <h2 style={styles.h2}>Why be this explicit?</h2>
          <p style={styles.copy}>Because trust is more valuable than a dramatic score. The scanner should make a useful observation, explain its evidence, and tell you how to verify it. If a finding does not survive verification, it should not become paid work.</p>
          <Link href="/" style={styles.button}>Run a scan</Link>
        </section>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#07110f', color: '#f5f7f4', fontFamily: 'Arial, Helvetica, sans-serif', padding: '0 20px 60px' },
  shell: { maxWidth: 1040, margin: '0 auto' },
  header: { minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #21312c' },
  brand: { color: '#f5f7f4', textDecoration: 'none', fontWeight: 850, fontSize: 20 },
  badge: { color: '#99f2bd', fontSize: 10, letterSpacing: '0.12em', border: '1px solid #315946', borderRadius: 999, padding: '7px 10px' },
  hero: { padding: '72px 0 36px', maxWidth: 820 },
  eyebrow: { color: '#99f2bd', fontSize: 11, fontWeight: 850, letterSpacing: '0.14em', marginBottom: 14 },
  h1: { fontSize: 'clamp(42px, 8vw, 76px)', lineHeight: 0.98, letterSpacing: '-0.055em', margin: 0 },
  lead: { color: '#b6c4be', fontSize: 18, lineHeight: 1.7, marginTop: 22 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 },
  card: { background: '#0c1814', border: '1px solid #21312c', borderRadius: 18, padding: 24, color: '#b6c4be', lineHeight: 1.65 },
  callout: { marginTop: 22, background: '#11251d', border: '1px solid #376047', borderRadius: 22, padding: 30 },
  h2: { fontSize: 30, letterSpacing: '-0.04em', margin: '0 0 12px' },
  copy: { color: '#a8bbb2', lineHeight: 1.65, maxWidth: 760 },
  button: { display: 'inline-block', marginTop: 12, background: '#99f2bd', color: '#07110f', padding: '13px 16px', borderRadius: 11, textDecoration: 'none', fontWeight: 850 },
}
