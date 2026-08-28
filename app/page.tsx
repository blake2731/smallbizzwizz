'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { RevenueAuditResult } from '@/lib/revenue-audit'
import styles from './revenue.module.css'

const checks = [
  ['01', 'Lead capture', 'Checks whether a ready buyer can call, request service, book, or leave a structured lead without hunting.'],
  ['02', 'Trust friction', 'Looks for reviews, local proof, service area clarity, and other signals that reduce comparison shopping.'],
  ['03', 'Measurement', 'Checks for common analytics signals so the business can see which traffic actually turns into contact.'],
  ['04', 'Mobile readiness', 'Finds basic mobile setup failures that can make urgent buyers fight the page instead of contacting the company.'],
  ['05', 'Search clarity', 'Reviews title, description, structured data, and other basic signals that help qualified traffic understand the offer.'],
  ['06', 'Speed observation', 'Flags a slow server response as a signal to verify, without pretending one request is a laboratory benchmark.'],
] as const

function track(name: string, parameters: Record<string, string | number | boolean> = {}) {
  if (typeof window === 'undefined') return
  const gtag = (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag
  gtag?.('event', name, parameters)
}

export default function HomePage() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<RevenueAuditResult | null>(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('url')
    if (value) setUrl(value)
  }, [])

  async function scan(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResult(null)
    setScanning(true)
    track('revenue_audit_started')

    try {
      const response = await fetch('/api/revenue-audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The scan failed.')
      const audit = data as RevenueAuditResult
      setResult(audit)
      setUrl(audit.finalUrl)
      track('revenue_audit_completed', {
        score: audit.score,
        grade: audit.grade,
        findings: audit.findings.length,
        pages_scanned: audit.pagesScanned?.length ?? 1,
      })
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : 'The scan failed.'
      setError(message)
      track('revenue_audit_failed')
    } finally {
      setScanning(false)
    }
  }

  async function buyReport() {
    if (!result) return
    setPaying(true)
    setError('')
    track('revenue_report_checkout_started', {
      score: result.score,
      grade: result.grade,
      findings: result.findings.length,
    })

    try {
      const response = await fetch('/api/revenue-audit/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: result.finalUrl }),
      })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.')
      window.location.assign(data.url)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout could not be started.')
      track('revenue_report_checkout_failed')
      setPaying(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <a href="/" className={styles.brand}>SmallBizzWizz</a>
          <div className={styles.navTag}>Website capture diagnostics for local service businesses</div>
        </nav>

        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>CHECK THE PATH BETWEEN INTEREST AND CONTACT</div>
            <h1 className={styles.h1}>Find the friction between a website visit and a <em>real lead.</em></h1>
            <p className={styles.lead}>
              SmallBizzWizz checks public conversion paths for observable problems that can make calling, requesting service, or booking harder. It reports what it can see — not a made-up revenue forecast.
            </p>
            <p className={styles.heroNote}>
              Built for HVAC, plumbing, electrical, roofing, restoration, landscaping, cleaning, pest control, and other appointment-driven local services.
            </p>
          </div>

          <form className={styles.scanCard} onSubmit={scan}>
            <label className={styles.scanLabel} htmlFor="website">Run the free website capture scan</label>
            <input
              id="website"
              className={styles.input}
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="yourbusiness.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
            <button className={styles.primaryButton} type="submit" disabled={scanning}>
              {scanning ? 'Checking conversion paths…' : 'Scan my website'}
            </button>
            {error ? <div className={styles.error}>{error}</div> : null}
            <p className={styles.micro}>No signup. Public pages only. Homepage plus likely contact, quote, or booking pages.</p>
          </form>
        </section>
      </div>

      {result ? (
        <div className={styles.shell}>
          <section className={styles.results} aria-live="polite">
            <div className={styles.resultTop}>
              <div className={styles.score}>{result.findings.length}</div>
              <div>
                <h2 className={styles.resultTitle}>{result.findings.length === 1 ? 'Observable friction signal found' : 'Observable friction signals found'}</h2>
                <p className={styles.resultSummary}>{result.summary}</p>
              </div>
            </div>

            <div className={styles.findings}>
              {result.findings.slice(0, 3).map((finding) => (
                <div className={styles.finding} key={finding.id}>
                  <div className={styles.severity}>{finding.severity} priority</div>
                  <div>
                    <div className={styles.findingTitle}>{finding.title}</div>
                    <div className={styles.findingCopy}>{finding.detail}</div>
                  </div>
                </div>
              ))}
              {result.findings.length === 0 ? (
                <div className={styles.findingCopy}>This pass did not find a major observable conversion issue. We are not going to invent one just to sell a report.</div>
              ) : null}
            </div>

            {result.findings.length > 0 ? (
              <div className={styles.unlock}>
                <div>
                  <div className={styles.unlockTitle}>DIY Revenue Fix Pack</div>
                  <div className={styles.unlockCopy}>
                    If you manage the site yourself, get every detected issue, implementation order, repair steps, verification checks, and copy or code where applicable. The $49 pack is the self-serve option — not the ceiling of what SmallBizzWizz can do.
                  </div>
                </div>
                <button className={styles.checkoutButton} type="button" onClick={buyReport} disabled={paying}>
                  {paying ? 'Opening checkout…' : 'Get the DIY Fix Pack · $49'}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <section className={styles.proofStrip}>
        <div className={`${styles.shell} ${styles.proofGrid}`}>
          <div className={styles.proofItem}>
            <div className={styles.proofNumber}>0</div>
            <div className={styles.proofCopy}>invented dollar-loss claims. A public scan cannot know your traffic, close rate, or job value.</div>
          </div>
          <div className={styles.proofItem}>
            <div className={styles.proofNumber}>4</div>
            <div className={styles.proofCopy}>public pages maximum in the current shallow crawl: the homepage plus likely conversion pages.</div>
          </div>
          <div className={styles.proofItem}>
            <div className={styles.proofNumber}>2</div>
            <div className={styles.proofCopy}>paths forward: use the DIY repair plan, or scope implementation after the findings are verified.</div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionEyebrow}>WHAT THE SCANNER LOOKS FOR</div>
          <h2 className={styles.h2}>Not prettier websites. Cleaner paths to contact.</h2>
          <p className={styles.sectionLead}>
            The scan uses deterministic checks against public page source. That makes it reproducible, but not omniscient: JavaScript-rendered elements and private analytics can be missed. <a href="/methodology">Read the methodology and limitations.</a>
          </p>

          <div className={styles.featureGrid}>
            {checks.map(([number, title, copy]) => (
              <article className={styles.feature} key={number}>
                <div className={styles.featureNumber}>{number}</div>
                <h3 className={styles.featureTitle}>{title}</h3>
                <p className={styles.featureCopy}>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.sectionAlt}>
        <div className={styles.shell}>
          <div className={styles.sectionEyebrow}>VERIFY US BEFORE YOU TRUST US</div>
          <h2 className={styles.h2}>The scanner now has a public validation lab.</h2>
          <p className={styles.sectionLead}>
            We do not have a customer case study yet, and we will not fake one. Instead, the proof page gives you controlled before/after fixtures, links to the scanner&apos;s public source code, the production commit that built the site, the methodology, and the sample deliverable. <a href="/proof">Inspect the proof and run the tests yourself.</a>
          </p>
          <div className={styles.featureGrid}>
            <article className={styles.feature}>
              <div className={styles.featureNumber}>01</div>
              <h3 className={styles.featureTitle}>Reproducible</h3>
              <p className={styles.featureCopy}>Run the same scanner against controlled pages with known differences.</p>
            </article>
            <article className={styles.feature}>
              <div className={styles.featureNumber}>02</div>
              <h3 className={styles.featureTitle}>Inspectable</h3>
              <p className={styles.featureCopy}>Read the actual detection and crawling logic in the public GitHub repository.</p>
            </article>
            <article className={styles.feature}>
              <div className={styles.featureNumber}>03</div>
              <h3 className={styles.featureTitle}>Explicit limits</h3>
              <p className={styles.featureCopy}>Synthetic fixtures are labeled synthetic; revenue lift requires real post-change data.</p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionEyebrow}>WHAT HAPPENS AFTER THE SCAN</div>
          <h2 className={styles.h2}>Use the repair plan yourself — or scope the work.</h2>
          <p className={styles.sectionLead}>
            The $49 Fix Pack is for owners or web managers who want implementation-ready instructions. If somebody sent you a SmallBizzWizz scan and you would rather have the changes made for you, reply to that person. Implementation is quoted only after the finding and website stack are verified.
          </p>

          <div className={styles.priceBox}>
            <div className={styles.priceRow}>
              <div className={styles.price}>$49</div>
              <div className={styles.priceMeta}>DIY · one time</div>
            </div>
            <div className={styles.priceList}>
              <div>✓ Complete observed-issue inventory</div>
              <div>✓ Priority order and estimated effort</div>
              <div>✓ Why each issue was raised on this site</div>
              <div>✓ Step-by-step repair guidance</div>
              <div>✓ Copy and code starting points where applicable</div>
              <div>✓ Verification checklist for every repair</div>
            </div>
          </div>
          <p className={styles.sectionLead}><a href="/sample">See an illustrative Fix Pack sample before paying.</a></p>
        </div>
      </section>

      <div className={styles.shell}>
        <footer className={styles.footer}>
          <div>SmallBizzWizz</div>
          <div><a href="/proof">Proof</a> · <a href="/sample">Sample Fix Pack</a> · <a href="/methodology">Methodology</a></div>
        </footer>
      </div>
    </main>
  )
}
