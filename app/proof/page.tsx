import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Proof & Validation | SmallBizzWizz',
  description: 'Verify how SmallBizzWizz works: controlled before/after fixtures, public scanner logic, production commit, methodology, and explicit evidence limits.',
}

const beforeUrl = 'https://smallbizzwizz.com/validation/before'
const afterUrl = 'https://smallbizzwizz.com/validation/after'

export default function ProofPage() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || 'main'
  const shortCommit = commit === 'main' ? 'main' : commit.slice(0, 7)

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.brand}>SmallBizzWizz</Link>
          <span style={styles.badge}>VERIFIABLE PROOF</span>
        </header>

        <section style={styles.hero}>
          <div style={styles.eyebrow}>TRUST SHOULD BE TESTABLE</div>
          <h1 style={styles.h1}>Do not take the scanner&apos;s word for it.</h1>
          <p style={styles.lead}>SmallBizzWizz has no customer case study yet, so we do not manufacture one. Instead, you can inspect the method, inspect the source, and run the scanner against controlled pages where the differences are known in advance.</p>
        </section>

        <section style={styles.panel}>
          <div style={styles.eyebrow}>CONTROLLED VALIDATION</div>
          <h2 style={styles.h2}>Same fictional contractor. Two known conversion paths.</h2>
          <p style={styles.copy}>The two pages below are synthetic fixtures, not customer results. The “before” version deliberately exposes a plain-text phone number without tap-to-call, has no lead form, no clear quote action, and weak trust evidence. The “after” version deliberately adds a tel: call action, quote CTA, short form, trust proof, and LocalBusiness structured data.</p>

          <div style={styles.grid}>
            <article style={styles.card}>
              <div style={styles.cardLabel}>BEFORE FIXTURE</div>
              <h3 style={styles.cardTitle}>Known weak capture path</h3>
              <p style={styles.copy}>Use this to see whether the scanner catches deliberately introduced friction.</p>
              <div style={styles.actions}>
                <a href={beforeUrl} style={styles.secondary}>Open fixture</a>
                <a href={`/scan?url=${encodeURIComponent(beforeUrl)}`} style={styles.primary}>Run scanner</a>
              </div>
            </article>

            <article style={styles.card}>
              <div style={styles.cardLabel}>AFTER FIXTURE</div>
              <h3 style={styles.cardTitle}>Known improved capture path</h3>
              <p style={styles.copy}>Use this to confirm that the same scanner stops raising issues when the relevant signals are actually present.</p>
              <div style={styles.actions}>
                <a href={afterUrl} style={styles.secondary}>Open fixture</a>
                <a href={`/scan?url=${encodeURIComponent(afterUrl)}`} style={styles.primary}>Run scanner</a>
              </div>
            </article>
          </div>

          <p style={styles.note}>This is an acceptance test, not proof of revenue lift. It demonstrates detection behavior under controlled conditions. Real conversion impact requires real traffic and business data.</p>
        </section>

        <section style={styles.panel}>
          <div style={styles.eyebrow}>TECHNICAL EVIDENCE</div>
          <h2 style={styles.h2}>The implementation is inspectable.</h2>
          <div style={styles.factGrid}>
            <div style={styles.fact}><strong>Scanner logic</strong><span>Public source code for URL safety, crawling, detection rules, findings, and priorities.</span><a href="https://github.com/blake2731/smallbizzwizz/blob/main/lib/revenue-audit.ts">Inspect revenue-audit.ts</a></div>
            <div style={styles.fact}><strong>Production revision</strong><span>This page was built from production commit {shortCommit}.</span><a href={`https://github.com/blake2731/smallbizzwizz/commit/${commit}`}>Inspect this commit</a></div>
            <div style={styles.fact}><strong>Method</strong><span>What is checked, what can be missed, and what the scanner explicitly does not claim.</span><Link href="/methodology">Read methodology</Link></div>
            <div style={styles.fact}><strong>Deliverable</strong><span>See the structure of the paid repair plan before paying for one.</span><Link href="/sample">Inspect sample Fix Pack</Link></div>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.eyebrow}>EVIDENCE STANDARD</div>
          <h2 style={styles.h2}>What we will and will not call proof.</h2>
          <div style={styles.standardGrid}>
            <div style={styles.good}><strong>We will call this proof</strong><span>Reproducible detection tests, exact public-page evidence, implementation before/after records, and measured customer outcomes when enough post-change data exists.</span></div>
            <div style={styles.bad}><strong>We will not call this proof</strong><span>Synthetic testimonials, fabricated revenue impact, an unexplained proprietary score, a customer logo without permission, or a before/after claim with no measurement window.</span></div>
          </div>
        </section>

        <footer style={styles.footer}>
          <Link href="/">Run a scan</Link>
          <Link href="/methodology">Methodology</Link>
          <Link href="/sample">Sample Fix Pack</Link>
        </footer>
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
  hero: { padding: '72px 0 36px' },
  eyebrow: { color: '#67d995', fontSize: 10, fontWeight: 850, letterSpacing: '0.14em' },
  h1: { fontSize: 'clamp(42px,7vw,76px)', lineHeight: 0.98, letterSpacing: '-0.055em', margin: '10px 0 20px', maxWidth: 800 },
  h2: { fontSize: 32, letterSpacing: '-0.04em', margin: '9px 0 18px' },
  lead: { color: '#b6c4be', fontSize: 19, lineHeight: 1.7, maxWidth: 780 },
  copy: { color: '#aebfb7', lineHeight: 1.65, margin: 0 },
  panel: { background: '#0c1814', border: '1px solid #21312c', borderRadius: 22, padding: 28, marginTop: 18 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 24 },
  card: { background: '#101f1a', border: '1px solid #2b453a', borderRadius: 16, padding: 20 },
  cardLabel: { color: '#67d995', fontSize: 10, fontWeight: 850, letterSpacing: '0.12em' },
  cardTitle: { fontSize: 22, margin: '8px 0 10px' },
  actions: { display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18 },
  primary: { background: '#99f2bd', color: '#07110f', padding: '11px 14px', borderRadius: 10, textDecoration: 'none', fontWeight: 850 },
  secondary: { border: '1px solid #416050', color: '#d8e4de', padding: '10px 13px', borderRadius: 10, textDecoration: 'none', fontWeight: 750 },
  note: { color: '#71847b', lineHeight: 1.55, fontSize: 11, margin: '18px 0 0' },
  factGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 },
  fact: { display: 'grid', gap: 8, padding: 18, borderRadius: 14, background: '#101f1a', border: '1px solid #263d34', color: '#afc0b7', lineHeight: 1.5 },
  standardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 },
  good: { display: 'grid', gap: 9, padding: 20, borderRadius: 14, background: '#11251d', border: '1px solid #376047', color: '#c5d5cd', lineHeight: 1.6 },
  bad: { display: 'grid', gap: 9, padding: 20, borderRadius: 14, background: '#1b1714', border: '1px solid #4a3930', color: '#d0c2b8', lineHeight: 1.6 },
  footer: { display: 'flex', gap: 18, flexWrap: 'wrap', padding: '34px 2px 0', fontSize: 12 },
}
