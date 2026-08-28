import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Validation Fixture — After',
  description: 'Controlled SmallBizzWizz validation fixture with stronger lead-capture and trust signals.',
  robots: { index: false, follow: false },
}

export default function ValidationAfterPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Pine Ridge Heating & Cooling',
    telephone: '+1-276-555-0148',
    areaServed: 'Pine Ridge',
  }

  return (
    <main style={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <section style={styles.hero}>
        <div style={styles.kicker}>CONTROLLED VALIDATION FIXTURE · AFTER</div>
        <h1 style={styles.h1}>Pine Ridge Heating & Cooling</h1>
        <p style={styles.lead}>Heating and cooling service for homeowners in Pine Ridge and nearby communities.</p>
        <div style={styles.actions}>
          <a href="tel:+12765550148" style={styles.primary}>Call (276) 555-0148</a>
          <a href="#quote" style={styles.secondary}>Request a quote</a>
        </div>
      </section>

      <section style={styles.proof}>
        <strong>Licensed & insured</strong>
        <span>Local residential HVAC service</span>
        <span>Recent customer reviews available</span>
      </section>

      <section id="quote" style={styles.panel}>
        <h2>Request service</h2>
        <form style={styles.form}>
          <label>Name<input name="name" style={styles.input} /></label>
          <label>Phone<input name="phone" inputMode="tel" style={styles.input} /></label>
          <label>What do you need help with?<textarea name="message" style={styles.input} /></label>
          <button type="submit" style={styles.primary}>Request a quote</button>
        </form>
      </section>

      <footer style={styles.footer}>Synthetic validation fixture. Not a real business or customer result.</footer>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', padding: '60px 24px', background: '#f4f1ea', color: '#182019', fontFamily: 'Arial, Helvetica, sans-serif' },
  hero: { maxWidth: 820, margin: '0 auto', padding: '56px 0 36px' },
  kicker: { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em' },
  h1: { fontSize: 'clamp(40px,7vw,72px)', letterSpacing: '-0.05em', margin: '14px 0' },
  lead: { fontSize: 20, lineHeight: 1.6, maxWidth: 680 },
  actions: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 },
  primary: { display: 'inline-block', background: '#173d2d', color: '#fff', padding: '13px 17px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, border: 0 },
  secondary: { display: 'inline-block', border: '1px solid #173d2d', color: '#173d2d', padding: '12px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 800 },
  proof: { maxWidth: 820, margin: '0 auto 28px', display: 'flex', gap: 18, flexWrap: 'wrap', padding: 18, background: '#fff', border: '1px solid #d5d3c9', borderRadius: 12 },
  panel: { maxWidth: 820, margin: '0 auto', borderTop: '1px solid #a9a99f', paddingTop: 28, lineHeight: 1.7 },
  form: { display: 'grid', gap: 14, maxWidth: 520 },
  input: { display: 'block', width: '100%', marginTop: 5, padding: 11, border: '1px solid #aaa', borderRadius: 7, font: 'inherit' },
  footer: { maxWidth: 820, margin: '60px auto 0', fontSize: 12, color: '#667068' },
}
