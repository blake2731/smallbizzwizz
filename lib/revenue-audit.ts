import { lookup } from 'node:dns/promises'

export type FindingCategory = 'capture' | 'trust' | 'measurement' | 'technical' | 'speed'
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface RevenueFinding {
  id: string
  category: FindingCategory
  severity: FindingSeverity
  title: string
  detail: string
  fix: string
  points: number
}

export interface RevenueAuditResult {
  url: string
  finalUrl: string
  scannedAt: string
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  responseMs: number
  pageTitle: string | null
  metaDescription: string | null
  findings: RevenueFinding[]
  positives: string[]
  summary: string
}

const MAX_HTML_CHARS = 1_500_000

export function normalizeAuditUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 2048) throw new Error('Enter a valid business website URL.')

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(candidate)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only public http and https websites can be scanned.')
  }
  if (url.username || url.password || url.port) {
    throw new Error('Use the public website address without credentials or a custom port.')
  }

  url.hash = ''
  return url.toString()
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized.includes(':')) {
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    )
  }
  return isPrivateIpv4(normalized)
}

async function assertPublicTarget(url: URL) {
  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Only public business websites can be scanned.')
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('Only public business websites can be scanned.')
  }
}

async function fetchPublicHtml(initialUrl: string): Promise<{
  finalUrl: string
  html: string
  responseMs: number
}> {
  let current = new URL(initialUrl)
  const started = Date.now()

  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicTarget(current)

    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(9000),
      headers: {
        'user-agent': 'SmallBizzWizz Revenue Leak Scanner/1.0 (+https://smallbizzwizz.com)',
        accept: 'text/html,application/xhtml+xml',
      },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('The website returned an incomplete redirect.')
      current = new URL(location, current)
      if (!['http:', 'https:'].includes(current.protocol)) {
        throw new Error('The website redirected to an unsupported address.')
      }
      continue
    }

    if (!response.ok) {
      throw new Error(`The website returned HTTP ${response.status}.`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('That address did not return a public web page.')
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > 3_000_000) throw new Error('The page is too large to scan safely.')

    const html = (await response.text()).slice(0, MAX_HTML_CHARS)
    return {
      finalUrl: current.toString(),
      html,
      responseMs: Date.now() - started,
    }
  }

  throw new Error('The website redirected too many times.')
}

function textFromMatch(html: string, expression: RegExp): string | null {
  const match = html.match(expression)
  if (!match?.[1]) return null
  return match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220) || null
}

function has(html: string, expression: RegExp) {
  return expression.test(html)
}

function severity(points: number): FindingSeverity {
  if (points >= 12) return 'critical'
  if (points >= 8) return 'high'
  if (points >= 5) return 'medium'
  return 'low'
}

function finding(
  id: string,
  category: FindingCategory,
  points: number,
  title: string,
  detail: string,
  fix: string,
): RevenueFinding {
  return { id, category, points, severity: severity(points), title, detail, fix }
}

function grade(score: number): RevenueAuditResult['grade'] {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

export async function auditWebsite(input: string): Promise<RevenueAuditResult> {
  const normalized = normalizeAuditUrl(input)
  const { finalUrl, html, responseMs } = await fetchPublicHtml(normalized)
  const lower = html.toLowerCase()
  const findings: RevenueFinding[] = []
  const positives: string[] = []

  const pageTitle = textFromMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  const metaDescription =
    textFromMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ??
    textFromMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)

  if (!finalUrl.startsWith('https://')) {
    findings.push(
      finding('https', 'technical', 12, 'Visitors are not protected by HTTPS', 'Browsers can warn or downgrade trust before a buyer ever reaches the contact step.', 'Serve the entire site over HTTPS and redirect every HTTP request to HTTPS.'),
    )
  } else positives.push('HTTPS is active')

  if (responseMs > 3000) {
    findings.push(
      finding('speed', 'speed', 12, 'The first page response is slow', `The scan waited about ${(responseMs / 1000).toFixed(1)} seconds for the page response. Slow first impressions increase abandonment, especially on mobile.`, 'Reduce server response time, remove blocking third party scripts, and optimize the heaviest above the fold assets.'),
    )
  } else if (responseMs > 1500) {
    findings.push(
      finding('speed', 'speed', 6, 'Page response could be faster', `The initial response took about ${(responseMs / 1000).toFixed(1)} seconds.`, 'Target a materially faster first response and defer nonessential scripts.'),
    )
  } else positives.push('Initial page response is reasonably fast')

  if (!pageTitle) {
    findings.push(finding('title', 'technical', 8, 'No page title was detected', 'Search results and browser tabs lose an important relevance signal.', 'Add a concise title that includes the primary service and market.' ))
  } else positives.push('A page title is present')

  if (!metaDescription) {
    findings.push(finding('meta-description', 'technical', 5, 'No meta description was detected', 'The business gives up control over an important search result sales message.', 'Write a specific description that states the service, location, and next action.' ))
  } else positives.push('A meta description is present')

  if (!has(html, /<meta[^>]+name=["']viewport["']/i)) {
    findings.push(finding('viewport', 'technical', 8, 'Mobile viewport setup is missing', 'A poor mobile presentation can make a ready buyer abandon the page.', 'Add a responsive viewport declaration and verify the page at common phone widths.' ))
  } else positives.push('Mobile viewport support is declared')

  if (!has(html, /href\s*=\s*["']tel:/i)) {
    findings.push(finding('click-to-call', 'capture', 16, 'No click to call path was detected', 'For a local service buyer, forcing someone to copy a phone number adds friction at the exact moment they are ready to contact the business.', 'Add a prominent tel: call action in the header and a persistent mobile call action.' ))
  } else positives.push('Visitors can tap to call')

  if (!has(html, /<form\b/i)) {
    findings.push(finding('form', 'capture', 10, 'No lead form was detected', 'Visitors who cannot call immediately have no obvious structured fallback.', 'Add a short quote or service request form asking only for the information needed to respond.' ))
  } else positives.push('A lead form is available')

  const hasBookingAction = /\b(book|schedule|request|get)\b[\s\S]{0,35}\b(service|appointment|quote|estimate|consultation)\b/i.test(lower)
  if (!hasBookingAction) {
    findings.push(finding('booking-cta', 'capture', 12, 'No clear booking or quote action was detected', 'A visitor should not have to decide what to do next. Ambiguous navigation leaks high intent traffic.', 'Use one primary action such as “Get an estimate”, “Book service”, or “Request a quote” above the fold and repeat it through the page.' ))
  } else positives.push('A booking or quote action is visible')

  const hasTrustProof = /testimonial|reviews?|rated\s+[45]|stars?|google reviews?|customer stories|what our customers say/i.test(lower)
  if (!hasTrustProof) {
    findings.push(finding('trust-proof', 'trust', 7, 'Strong trust proof was not detected', 'Local buyers often compare several providers. Without visible proof, the site makes price and familiarity do too much work.', 'Place recent reviews, rating proof, licenses, guarantees, or recognizable customer outcomes near the first conversion action.' ))
  } else positives.push('Trust or review proof is visible')

  const hasAnalytics = /googletagmanager|gtag\(|google-analytics|analytics\.js|clarity\.ms|plausible\.io|segment\.com|fathom/i.test(lower)
  if (!hasAnalytics) {
    findings.push(finding('analytics', 'measurement', 7, 'Conversion measurement was not detected', 'Without measurement, the business cannot tell which traffic produces calls, forms, or bookings.', 'Install analytics and track calls, form submissions, bookings, and the source that generated each lead.' ))
  } else positives.push('A common analytics system is present')

  if (!has(html, /application\/ld\+json/i)) {
    findings.push(finding('schema', 'technical', 4, 'Structured business data was not detected', 'Search engines have less explicit information about the business and its services.', 'Add valid LocalBusiness or relevant service structured data with consistent name, address, phone, service area, and URLs.' ))
  } else positives.push('Structured data is present')

  const hasChat = /intercom|crisp\.chat|tawk\.to|drift\.com|livechat|chatwoot|podium|birdeye/i.test(lower)
  if (!hasChat) {
    findings.push(finding('chat', 'capture', 4, 'No live or automated message path was detected', 'Some visitors will message when they will not call or complete a form.', 'Consider a lightweight message or missed lead recovery channel if the business can respond quickly.' ))
  } else positives.push('A messaging channel is present')

  const hasServiceArea = /service area|areas we serve|serving\s+[a-z]|locally owned|nearby communities/i.test(lower)
  if (!hasServiceArea) {
    findings.push(finding('service-area', 'trust', 4, 'Service area clarity is weak', 'A local buyer should be able to confirm immediately that the company serves their location.', 'State the primary service area near the top of the page and link to useful location pages where appropriate.' ))
  } else positives.push('Local service area language is present')

  const totalRisk = Math.min(100, findings.reduce((sum, item) => sum + item.points, 0))
  const score = Math.max(0, 100 - totalRisk)
  findings.sort((a, b) => b.points - a.points)

  const top = findings.slice(0, 2).map((item) => item.title.toLowerCase())
  const summary = findings.length === 0
    ? 'No major observable conversion leaks were found in this first pass.'
    : `The scan found ${findings.length} observable leak${findings.length === 1 ? '' : 's'}. The highest priority issues are ${top.join(' and ')}.`

  return {
    url: normalized,
    finalUrl,
    scannedAt: new Date().toISOString(),
    score,
    grade: grade(score),
    responseMs,
    pageTitle,
    metaDescription,
    findings,
    positives,
    summary,
  }
}

export function buildRecoveryPlan(result: RevenueAuditResult) {
  return result.findings.map((item, index) => ({
    priority: index + 1,
    title: item.title,
    action: item.fix,
    why: item.detail,
    category: item.category,
  }))
}
