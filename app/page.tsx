'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { RevenueAuditResult } from '@/lib/revenue-audit'
import styles from './revenue.module.css'

const checks = [
  ['01', 'Lead capture', 'Checks whether a ready buyer can call, request service, book, or leave a structured lead without hunting.'],
  ['02', 'Trust friction', 'Looks for reviews, local proof, service area clarity, and other signals that reduce comparison shopping.'],
  ['03', 'Measurement', 'Checks for common analytics signals so the business can see which traffic actually turns into contact.'],
  ['04', 'Mobile readiness', 'Finds basic mobile setup failures that make urgent buyers fight the page instead of contacting the company.'],
  ['05', 'Search clarity', 'Reviews title, description, structured data, and other basic signals that help qualified traffic understand the offer.'],
  ['06', 'Speed observation', 'Flags a slow server response as a signal to verify, without pretending one scan is a laboratory benchmark.'],
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
          <div className={styles.navTag}>Revenue leakage intelligence for local service businesses</div>
        </nav>

        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>STOP BUYING LEADS YOU FAIL TO CAPTURE</div>
            <h1 className={styles.h1}>Find the money leaking out of your <em>website.</em></h1>
            <p className={styles.lead}>
              SmallBizzWizz follows the conversion path a local service customer can actually take, then flags observable friction that can turn paid traffic, referrals, and urgent buyers into somebody else&apos;s job.
            </p>
            <p className={styles.heroNote}>
              Built for HVAC, plumbing, electrical, roofing, restoration, landscaping, cleaning, pest control, and other appointment driven local services.
            </p>
          </div>

          <form className={styles.scanCard} onSubmit={scan}>
            <label className={styles.scanLabel} htmlFor="website">Run the free revenue leak scan</label>
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
              {scanning ? 'Following conversion paths…' : 'Scan my website'}
            </button>
            {error ? <div className={styles.error}>{error}</div> : null}
            <p className={styles.micro}>No signup. No sales call. Homepage plus likely contact, quote, or booking pages.</p>
          </form>
        </section>
      </div>

      {result ? (
        <div className={styles.shell}>
          <section className={styles.results} aria-live="polite">
            <div className={styles.resultTop}>
              <div className={styles.score}>{result.score}</div>
              <div>
                <h2 className={styles.resultTitle}>Revenue capture grade: {result.grade}</h2>
                <p className={styles.resultSummary}>{result.summary}</p>
              </div>
            </div>

            <div className={styles.findings}>
              {result.findings.slice(0, 3).map((finding) => (
                <div className={styles.finding} key={finding.id}>
                  <div className={styles.severity}>{finding.severity}</div>
                  <div>
                    <div className={styles.findingTitle}>{finding.title}</div>
                    <div className={styles.findingCopy}>{finding.detail}</div>
                  </div>
                </div>
              ))}
              {result.findings.length === 0 ? (
                <div className={styles.findingCopy}>This pass did not find a major observable conversion leak. We are not going to sell you a report just to invent one.</div>
              ) : null}
            </div>

            {result.findings.length > 0 ? (
              <div className={styles.unlock}>
                <div>
                  <div className={styles.unlockTitle}>Unlock the complete Revenue Leak Map</div>
                  <div className={styles.unlockCopy}>
                    Get every detected leak, the exact recovery action for each one, the priority order, and the positive elements you should preserve. Immediate browser delivery after payment.
                  </div>
                </div>
                <button className={styles.checkoutButton} type="button" onClick={buyReport} disabled={paying}>
                  {paying ? 'Opening checkout…' : 'Get full report · $49'}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <section className={styles.proofStrip}>
        <div className={`${styles.shell} ${styles.proofGrid}`}>
          <div className={styles.proofItem}>
            <div className={styles.proofNumber}>52%</div>
            <div className={styles.proofCopy}>
              of home service callers speak with a person across Invoca&apos;s current benchmark. <a href="https://www.invoca.com/reports/the-invoca-call-conversion-benchmarks-report-home-services-2025" target="_blank" rel="noreferrer">Source</a>
            </div>
          </div>
          <div className={styles.proofItem}>
            <div className={styles.proofNumber}>40%</div>
            <div className={styles.proofCopy}>
              of AI using home service pros surveyed say AI helps them respond faster and lose fewer leads. <a href="https://www.housecallpro.com/resources/ai-in-the-trades/" target="_blank" rel="noreferrer">Source</a>
            </div>
          </div>
          <div className={styles.proofItem}>
            <div className={styles.proofNumber}>79%</div>
            <div className={styles.proofCopy}>
              of homeowners surveyed expect to repair or replace at least one home system in 2026. <a href="https://www.housecallpro.com/resources/home-service-spending-report-2026-release/" target="_blank" rel="noreferrer">Source</a>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.shell}>
          <div className={styles.sectionEyebrow}>WHAT THE SCANNER LOOKS FOR</div>
          <h2 className={styles.h2}>Not prettier websites. Better capture paths.</h2>
          <p className={styles.sectionLead}>
            The scan is deterministic. It follows likely conversion pages and looks for observable conditions instead of asking an AI model to invent a score from a screenshot.
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
          <div className={styles.sectionEyebrow}>THE PAID PRODUCT</div>
          <h2 className={styles.h2}>One report. No subscription.</h2>
          <p className={styles.sectionLead}>
            Start with the free scan. Buy the full map only if it finds something worth fixing.
          </p>

          <div className={styles.priceBox}>
            <div className={styles.priceRow}>
              <div className={styles.price}>$49</div>
              <div className={styles.priceMeta}>one time</div>
            </div>
            <div className={styles.priceList}>
              <div>✓ Complete leak inventory</div>
              <div>✓ Severity and priority order</div>
              <div>✓ Concrete recovery action for every issue</div>
              <div>✓ Positive signals to preserve during the fix</div>
              <div>✓ Immediate delivery after Stripe payment</div>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.shell}>
        <footer className={styles.footer}>
          <div>SmallBizzWizz</div>
          <div>Find the leaks. Fix the path. Capture more of the demand you already paid for.</div>
        </footer>
      </div>
    </main>
  )
}
