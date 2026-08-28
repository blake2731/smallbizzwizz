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
  pagesScanned: string[]
  findings: RevenueFinding[]
  positives: string[]
  summary: string
}

const MAX_HTML_CHARS = 1_500_000
const MAX_SUPPORTING_PAGES = 3
const CONVERSION_LINK_TERMS = [
  'contact',
  'quote',
  'estimate',
  'book',
  'booking',
  'appointment',
  'schedule',
  'request-service',
  'request_service',
  'service-request',
  'service_request',
]

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
        'user-agent': 'SmallBizzWizz Revenue Leak Scanner/2.0 (+https://smallbizzwizz.com)',
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

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
}

function extractConversionLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const candidates = new Map<string, number>()
  const linkExpression = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(linkExpression)) {
    const rawHref = decodeHtmlAttribute(match[1] ?? '').trim()
    if (!rawHref || rawHref.startsWith('#') || /^(?:mailto:|tel:|sms:|javascript:)/i.test(rawHref)) continue

    try {
      const candidate = new URL(rawHref, base)
      if (!['http:', 'https:'].includes(candidate.protocol)) continue
      if (candidate.hostname !== base.hostname) continue
      candidate.hash = ''

      const pathText = `${candidate.pathname} ${match[2] ?? ''}`.toLowerCase()
      let score = 0
      for (const term of CONVERSION_LINK_TERMS) {
        if (pathText.includes(term)) score += term === 'contact' ? 5 : 4
      }
      if (!score) continue

      const normalized = candidate.toString()
      candidates.set(normalized, Math.max(candidates.get(normalized) ?? 0, score))
    } catch {
      // Ignore malformed links.
    }
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUPPORTING_PAGES)
    .map(([url]) => url)
}

async function crawlConversionPages(homeUrl: string, homeHtml: string) {
  const candidates = extractConversionLinks(homeHtml, homeUrl)
  const pages = await Promise.all(
    candidates.map(async (url) => {
      try {
        const page = await fetchPublicHtml(url)
        return { url: page.finalUrl, html: page.html }
      } catch {
        return null
      }
    }),
  )

  return pages.filter((page): page is { url: string; html: string } => Boolean(page))
}

function hasLeadForm(html: string) {
  return (
    has(html, /<form\b/i) ||
    has(html, /<(?:iframe|script)\b[^>]*(?:jotform|typeform|formstack|wufoo|hubspot|hsforms|gravityforms|wpforms|calendly|housecallpro|servicetitan|jobber|thumbtack|angi)/i)
  )
}

export async function auditWebsite(input: string): Promise<RevenueAuditResult> {
  const normalized = normalizeAuditUrl(input)
  const { finalUrl, html, responseMs } = await fetchPublicHtml(normalized)
  const supportingPages = await crawlConversionPages(finalUrl, html)
  const allHtml = [html, ...supportingPages.map((page) => page.html)].join('\n')
  const lower = allHtml.toLowerCase()
  const homeLower = html.toLowerCase()
  const findings: RevenueFinding[] = []
  const positives: string[] = []
  const pagesScanned = [finalUrl, ...supportingPages.map((page) => page.url)]

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
      finding('speed', 'speed', 8, 'A slow server response was observed', `This scan observed about ${(responseMs / 1000).toFixed(1)} seconds before the homepage response completed. One scan is not a lab benchmark, but a slow origin response can contribute to abandonment.`, 'Verify performance with repeated field or lab measurements, then reduce server response time and defer nonessential work if the slowdown is reproducible.'),
    )
  } else if (responseMs > 1500) {
    findings.push(
      finding('speed', 'speed', 4, 'Server response deserves a second look', `This scan observed about ${(responseMs / 1000).toFixed(1)} seconds for the homepage response.`, 'Confirm the pattern with repeated performance measurements before treating speed as a conversion issue.'),
    )
  } else positives.push('Homepage server response was reasonably fast in this scan')

  if (!pageTitle) {
    findings.push(finding('title', 'technical', 8, 'No page title was detected', 'Search results and browser tabs lose an important relevance signal.', 'Add a concise title that includes the primary service and market.'))
  } else positives.push('A page title is present')

  if (!metaDescription) {
    findings.push(finding('meta-description', 'technical', 5, 'No meta description was detected', 'The business gives up control over an important search result sales message.', 'Write a specific description that states the service, location, and next action.'))
  } else positives.push('A meta description is present')

  if (!has(html, /<meta[^>]+name=["']viewport["']/i)) {
    findings.push(finding('viewport', 'technical', 8, 'Mobile viewport setup is missing', 'A poor mobile presentation can make a ready buyer abandon the page.', 'Add a responsive viewport declaration and verify the page at common phone widths.'))
  } else positives.push('Mobile viewport support is declared')

  const phoneNumberVisible = /(?:\+?1[\s.()-]*)?(?:\(?\d{3}\)?[\s.()-]*)\d{3}[\s.-]*\d{4}/.test(allHtml)
  if (!has(allHtml, /href\s*=\s*["']tel:/i)) {
    findings.push(
      finding(
        'click-to-call',
        'capture',
        16,
        phoneNumberVisible ? 'A phone number is visible but not tap to call' : 'No tap to call path was detected',
        phoneNumberVisible
          ? 'The site exposes a phone number but the scanned conversion path does not make it directly tappable. That adds friction for mobile buyers who are ready to call.'
          : 'The scanned conversion path did not expose a tap to call action. For urgent local service buyers, phone access is often the fastest path to a job.',
        'Add a prominent tel: call action in the header and a persistent mobile call action.',
      ),
    )
  } else positives.push('Visitors can tap to call on the scanned conversion path')

  if (!hasLeadForm(allHtml)) {
    findings.push(
      finding(
        'form',
        'capture',
        10,
        'No lead form was found on the scanned conversion path',
        `The scanner checked the homepage${supportingPages.length ? ` plus ${supportingPages.length} likely contact or booking page${supportingPages.length === 1 ? '' : 's'}` : ''} and did not find a standard or common embedded lead form. Visitors who cannot call immediately may have no structured fallback.`,
        'Add a short quote or service request form asking only for the information needed to respond.',
      ),
    )
  } else positives.push('A lead form is available on the scanned conversion path')

  const hasBookingAction = /\b(book|schedule|request|get|free)\b[\s\S]{0,45}\b(service|appointment|quote|estimate|consultation|inspection|assessment)\b/i.test(lower)
  if (!hasBookingAction) {
    findings.push(finding('booking-cta', 'capture', 12, 'No clear booking or quote action was detected', 'A visitor should not have to decide what to do next. Ambiguous navigation leaks high intent traffic.', 'Use one primary action such as “Get an estimate”, “Book service”, or “Request a quote” above the fold and repeat it through the conversion path.'))
  } else positives.push('A booking, inspection, or quote action is visible')

  const hasTrustProof = /testimonial|reviews?|rated\s+[45]|stars?|google reviews?|customer stories|what our customers say|bbb|licensed|insured|certified/i.test(lower)
  if (!hasTrustProof) {
    findings.push(finding('trust-proof', 'trust', 7, 'Strong trust proof was not detected', 'Local buyers often compare several providers. Without visible proof, the site makes price and familiarity do too much work.', 'Place recent reviews, rating proof, licenses, guarantees, certifications, or recognizable customer outcomes near the first conversion action.'))
  } else positives.push('Trust, review, or credential proof is visible')

  const hasAnalytics = /googletagmanager|gtag\(|google-analytics|analytics\.js|clarity\.ms|plausible\.io|segment\.com|fathom|matomo|facebook\.net\/en_US\/fbevents|connect\.facebook\.net/i.test(homeLower)
  if (!hasAnalytics) {
    findings.push(finding('analytics', 'measurement', 7, 'Common conversion measurement was not detected', 'The homepage source did not expose a common analytics or measurement system. That does not prove measurement is absent, but without reliable tracking the business cannot attribute calls, forms, or bookings to traffic sources.', 'Verify analytics and conversion tracking are active, then track calls, form submissions, bookings, and the source that generated each lead.'))
  } else positives.push('A common analytics or measurement system is present')

  if (!has(html, /application\/ld\+json/i)) {
    findings.push(finding('schema', 'technical', 4, 'Structured business data was not detected', 'Search engines have less explicit information about the business and its services.', 'Add valid LocalBusiness or relevant service structured data with consistent name, address, phone, service area, and URLs.'))
  } else positives.push('Structured data is present')

  const hasChat = /intercom|crisp\.chat|tawk\.to|drift\.com|livechat|chatwoot|podium|birdeye|href\s*=\s*["']sms:|facebook\.com\/messages|m\.me\//i.test(lower)
  if (!hasChat) {
    findings.push(finding('chat', 'capture', 3, 'No secondary messaging path was detected', 'Some visitors will message when they will not call or complete a form. This is a lower priority signal when the primary conversion paths are strong.', 'Consider a lightweight message or missed lead recovery channel if the business can respond quickly.'))
  } else positives.push('A secondary messaging channel is present')

  const hasServiceArea = /service area|areas we serve|serving\s+[a-z]|locally owned|nearby communities|serves?\s+(?:the\s+)?[a-z]/i.test(homeLower)
  if (!hasServiceArea) {
    findings.push(finding('service-area', 'trust', 4, 'Service area clarity is weak', 'A local buyer should be able to confirm immediately that the company serves their location.', 'State the primary service area near the top of the page and link to useful location pages where appropriate.'))
  } else positives.push('Local service area language is present')

  const totalRisk = Math.min(100, findings.reduce((sum, item) => sum + item.points, 0))
  const score = Math.max(0, 100 - totalRisk)
  findings.sort((a, b) => b.points - a.points)

  const top = findings.slice(0, 2).map((item) => item.title.toLowerCase())
  const summary = findings.length === 0
    ? `No major observable conversion leaks were found across ${pagesScanned.length} scanned page${pagesScanned.length === 1 ? '' : 's'}.`
    : `The scan found ${findings.length} observable leak${findings.length === 1 ? '' : 's'} across ${pagesScanned.length} page${pagesScanned.length === 1 ? '' : 's'}. The highest priority issues are ${top.join(' and ')}.`

  return {
    url: normalized,
    finalUrl,
    scannedAt: new Date().toISOString(),
    score,
    grade: grade(score),
    responseMs,
    pageTitle,
    metaDescription,
    pagesScanned,
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
