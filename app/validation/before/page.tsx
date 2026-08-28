import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Validation Fixture — Before',
  description: 'Controlled SmallBizzWizz validation fixture with intentionally weak lead-capture signals.',
  robots: { index: false, follow: false },
}

export default function ValidationBeforePage() {
  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.kicker}>CONTROLLED VALIDATION FIXTURE · BEFORE</div>
        <h1 style={styles.h1}>Pine Ridge Heating & Cooling</h1>
        <p style={styles.lead}>Heating and cooling service for homeowners in Pine Ridge and nearby communities.</p>
        <p style={styles.phone}>Call us: (276) 555-0148</p>
      </section>
      <section style={styles.panel}>
        <h2>Residential HVAC service</h2>
        <p>Repair, maintenance, and equipment replacement for local homeowners.</p>
        <p>This page is intentionally built with weak conversion signals so the SmallBizzWizz scanner has a controlled test target.</p>
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
  phone: { fontSize: 18, fontWeight: 700 },
  panel: { maxWidth: 820, margin: '0 auto', borderTop: '1px solid #a9a99f', paddingTop: 28, lineHeight: 1.7 },
  footer: { maxWidth: 820, margin: '60px auto 0', fontSize: 12, color: '#667068' },
}
