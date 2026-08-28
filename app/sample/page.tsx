import Link from 'next/link'

export const metadata = {
  title: 'Sample Revenue Fix Pack | SmallBizzWizz',
  description: 'See what the $49 SmallBizzWizz DIY Revenue Fix Pack contains before buying.',
}

const repairs = [
  {
    number: '01',
    title: 'Make the phone number a one-tap call',
    why: 'Illustrative finding: the public page shows a business phone number, but the scanned HTML does not expose a tel: link.',
    effort: '20–40 minutes',
    steps: ['Wrap the same public business number in a tel: link.', 'Put the call action in the mobile header.', 'Repeat it after trust proof and near the bottom of the page.', 'Track the tap as phone_click.'],
    template: '<a href="tel:+15551234567" aria-label="Call Example HVAC Co">Call Example HVAC Co</a>',
    verify: ['Tap it on a real phone.', 'Confirm the correct number opens in the dialer.', 'Confirm phone_click fires once.'],
  },
  {
    number: '02',
    title: 'Give non-callers a short service-request form',
    why: 'Illustrative finding: no standard or recognized embedded lead form was visible on the scanned conversion path.',
    effort: '1–3 hours',
    steps: ['Use name, phone or email, ZIP code, service needed, and optional details.', 'Do not require an account.', 'Route the lead to a monitored destination.', 'Track successful submissions.'],
    template: 'Need help from Example HVAC Co?\nTell us what you need and the best way to reach you.\n\nName\nPhone or email\nZIP code\nService needed\nOptional details\n\n[ Request service ]',
    verify: ['Submit from a phone.', 'Confirm the lead arrives.', 'Confirm the visitor sees success and lead_form_submit fires.'],
  },
  {
    number: '03',
    title: 'Measure actions that can become revenue',
    why: 'Illustrative finding: a common analytics or tag-manager installation was not visible in homepage source. This must be verified before installing anything new.',
    effort: '1–3 hours',
    steps: ['Verify existing analytics first.', 'Create separate events for calls, forms, bookings, and quotes.', 'Preserve campaign parameters where practical.', 'Test from mobile and desktop.'],
    template: 'phone_click\nlead_form_submit\nbooking_complete\nquote_request',
    verify: ['Each test action appears in real-time analytics.', 'Calls and forms are separate events.', 'Campaign-tagged test visits retain source information.'],
  },
]

export default function SamplePage() {
  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <Link href="/" style={styles.brand}>SmallBizzWizz</Link>
          <span style={styles.badge}>ILLUSTRATIVE SAMPLE</span>
        </header>

        <section style={styles.hero}>
          <div style={styles.eyebrow}>EXAMPLE HVAC CO · NOT A REAL CUSTOMER</div>
          <h1 style={styles.h1}>What a $49 DIY Fix Pack actually looks like.</h1>
          <p style={styles.lead}>This sample uses fictional business details so you can judge the deliverable before paying. A real Fix Pack is generated from the findings on the website that was scanned.</p>
        </section>

        <section style={styles.summary}>
          <div><strong>First move:</strong> remove the easiest contact friction first.</div>
          <div><strong>Then:</strong> add a fallback lead path and verify conversion measurement.</div>
          <div><strong>Rule:</strong> verify every scanner observation against the live site before making a material change.</div>
        </section>

        <div style={styles.stack}>
          {repairs.map((repair) => (
            <article key={repair.number} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.number}>{repair.number}</div>
                <div>
                  <h2 style={styles.h2}>{repair.title}</h2>
                  <div style={styles.effort}>Estimated effort: {repair.effort}</div>
                </div>
              </div>
              <p style={styles.copy}><strong>Why this was raised:</strong> {repair.why}</p>
              <h3 style={styles.h3}>Implementation</h3>
              <ol style={styles.list}>{repair.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <h3 style={styles.h3}>Starting point</h3>
              <pre style={styles.code}><code>{repair.template}</code></pre>
              <h3 style={styles.h3}>Done means verified</h3>
              <ul style={styles.list}>{repair.verify.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>

        <section style={styles.callout}>
          <h2 style={styles.h2}>The important distinction</h2>
          <p style={styles.copy}>The free scan tells you what the system observed. The paid pack turns those observations into repair tickets. If you do not want to implement them yourself, do not buy a DIY report just because it is inexpensive — scope implementation instead.</p>
          <Link href="/" style={styles.button}>Scan a website</Link>
          <Link href="/methodology" style={styles.secondary}>Read methodology</Link>
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
  hero: { padding: '72px 0 36px', maxWidth: 850 },
  eyebrow: { color: '#99f2bd', fontSize: 11, fontWeight: 850, letterSpacing: '0.14em', marginBottom: 14 },
  h1: { fontSize: 'clamp(42px, 8vw, 76px)', lineHeight: 0.98, letterSpacing: '-0.055em', margin: 0 },
  lead: { color: '#b6c4be', fontSize: 18, lineHeight: 1.7, marginTop: 22 },
  summary: { display: 'grid', gap: 9, padding: 22, background: '#11251d', border: '1px solid #376047', borderRadius: 18, color: '#b9cbc2', lineHeight: 1.55 },
  stack: { display: 'grid', gap: 16, marginTop: 18 },
  card: { padding: 26, borderRadius: 20, background: '#0c1814', border: '1px solid #21312c' },
  cardHeader: { display: 'grid', gridTemplateColumns: '54px minmax(0,1fr)', gap: 18, alignItems: 'start' },
  number: { width: 44, height: 44, borderRadius: 12, background: '#183126', color: '#99f2bd', display: 'grid', placeItems: 'center', fontWeight: 850 },
  h2: { fontSize: 27, letterSpacing: '-0.035em', margin: 0 },
  h3: { fontSize: 14, letterSpacing: '0.02em', margin: '22px 0 8px', color: '#99f2bd' },
  effort: { color: '#82978e', fontSize: 12, marginTop: 6 },
  copy: { color: '#b6c4be', lineHeight: 1.65 },
  list: { color: '#c6d3cd', lineHeight: 1.7 },
  code: { padding: 16, borderRadius: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', background: '#050b09', border: '1px solid #263d34', color: '#bce8ce', fontSize: 13, lineHeight: 1.5 },
  callout: { marginTop: 18, padding: 28, borderRadius: 20, background: '#11251d', border: '1px solid #376047' },
  button: { display: 'inline-block', marginTop: 10, background: '#99f2bd', color: '#07110f', padding: '13px 16px', borderRadius: 11, textDecoration: 'none', fontWeight: 850 },
  secondary: { display: 'inline-block', marginLeft: 12, color: '#99f2bd', textDecoration: 'none', fontWeight: 700 },
}
