import type { RevenueAuditResult, RevenueFinding } from '@/lib/revenue-audit'

export interface FixPackSection {
  findingId: string
  title: string
  outcome: string
  whyThisSite: string
  effort: string
  steps: string[]
  verify: string[]
  template?: string
}

function businessLabel(result: RevenueAuditResult) {
  const title = result.pageTitle?.trim()
  if (title) {
    const first = title.split(/\s[|–—-]\s/)[0]?.trim()
    if (first && first.length <= 80) return first
  }

  return new URL(result.finalUrl).hostname.replace(/^www\./, '')
}

function pageScope(result: RevenueAuditResult) {
  const count = result.pagesScanned?.length ?? 1
  return `${count} scanned page${count === 1 ? '' : 's'}`
}

function telHref(phoneNumber: string | null) {
  if (!phoneNumber) return null
  const digits = phoneNumber.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

function sectionForFinding(finding: RevenueFinding, result: RevenueAuditResult): FixPackSection {
  const business = businessLabel(result)
  const host = new URL(result.finalUrl).hostname.replace(/^www\./, '')
  const scope = pageScope(result)
  const callableNumber = telHref(result.phoneNumber)

  switch (finding.id) {
    case 'click-to-call':
      return {
        findingId: finding.id,
        title: 'Make every visible phone number a one tap call',
        outcome: 'Remove friction between an urgent mobile visitor and the phone call that can become a booked job.',
        whyThisSite: `Across ${scope} for ${business}, the scanner found ${result.phoneNumber ? `the public number ${result.phoneNumber}` : 'a phone number'} in the page content but did not detect a direct tel: call path.`,
        effort: '20 to 40 minutes',
        steps: [
          'Use the same public business number already shown on the site and wrap it in a tel: link.',
          'Put the primary call action in the mobile header where it is visible without scrolling.',
          'Repeat the call action after the strongest service or trust section and near the bottom of the page.',
          'Track phone taps as a conversion event so traffic sources can be compared.',
        ],
        verify: [
          'Open the site on an iPhone or Android phone and tap the number.',
          'Confirm the phone dialer opens with the correct business number.',
          'Confirm the phone_click analytics event fires once per tap.',
        ],
        template: callableNumber && result.phoneNumber
          ? `<a href="tel:${callableNumber}" aria-label="Call ${business}">${result.phoneNumber}</a>`
          : `<!-- Replace with the public number already displayed on ${host}. -->\n<a href="tel:+1XXXXXXXXXX" aria-label="Call ${business}">Call ${business}</a>`,
      }

    case 'form':
      return {
        findingId: finding.id,
        title: 'Give people who cannot call a fast way to raise their hand',
        outcome: 'Capture interested visitors who are at work, comparing providers, or simply prefer not to call.',
        whyThisSite: `The scanner checked ${scope} and could not detect a standard or recognized embedded lead form. If a client rendered form already exists, verify it manually before changing anything.`,
        effort: '1 to 3 hours',
        steps: [
          'Use a short service request form on the most obvious contact, quote, or booking page.',
          'Ask only for the information needed to respond: name, phone or email, ZIP code, service needed, and optional details.',
          'Do not require an account or long questionnaire before the lead is captured.',
          'Show a clear confirmation after submission and route the lead to a monitored inbox or CRM.',
          'Track successful submissions as a lead_form_submit conversion event.',
        ],
        verify: [
          'Submit the form from a phone using test information.',
          'Confirm the lead arrives at the intended destination.',
          'Confirm the visitor sees a success state and the analytics event fires.',
        ],
        template: `Suggested ${business} form copy:\n\nHeadline: Need help from ${business}?\nSubhead: Tell us what you need and the best way to reach you.\n\nFields:\n1. Name\n2. Phone or email\n3. ZIP code\n4. Service needed\n5. Optional details\n\nButton: Request service`,
      }

    case 'booking-cta':
      return {
        findingId: finding.id,
        title: 'Give the page one unmistakable next step',
        outcome: 'Make it obvious what a high intent visitor should do instead of asking them to interpret the navigation.',
        whyThisSite: `Across ${scope}, the scanner did not find a strong repeated booking, quote, estimate, inspection, or service request action.`,
        effort: '30 to 60 minutes',
        steps: [
          'Choose one primary action and keep the wording consistent in the hero, header, and major service sections.',
          'Use language tied to the buyer outcome instead of a generic Learn more button.',
          'Keep secondary navigation visually subordinate to the primary conversion action.',
          'Send the primary action to the shortest working conversion path.',
        ],
        verify: [
          'Ask someone unfamiliar with the site what they would click to become a customer within five seconds.',
          'Test the primary action on mobile and desktop.',
          'Confirm the destination works without login or unnecessary intermediate steps.',
        ],
        template: `Recommended primary CTA for ${business}:\nRequest service\n\nGood alternatives depending on the job type:\nGet an estimate\nBook an inspection\nSchedule service\nGet a quote`,
      }

    case 'trust-proof':
      return {
        findingId: finding.id,
        title: 'Move proof next to the moment a visitor decides',
        outcome: 'Reduce the uncertainty that makes a local buyer open another provider in a new tab.',
        whyThisSite: `The scanner did not find strong review, credential, license, guarantee, or customer proof across ${scope}.`,
        effort: '45 to 90 minutes',
        steps: [
          'Place recent review proof close to the first conversion action.',
          'Show truthful licensing, insurance, certifications, guarantees, or years in business where they matter.',
          'Use specific project or customer outcomes instead of unsupported superlatives.',
          'Repeat the strongest proof near the final call or quote action.',
        ],
        verify: [
          'Every credential or rating shown can be substantiated.',
          'The strongest proof is visible before the visitor has to make a conversion decision.',
          'The proof remains readable on a phone.',
        ],
        template: `Suggested proof block for ${business}:\n★★★★★ [recent review or rating proof]\n[Specific credential, guarantee, or years in business]\n[One short customer outcome]\n[Primary CTA]`,
      }

    case 'analytics':
      return {
        findingId: finding.id,
        title: 'Measure the actions that can actually become revenue',
        outcome: 'Know which traffic sources produce calls, forms, and bookings instead of optimizing around pageviews.',
        whyThisSite: `The homepage source for ${business} did not expose a common analytics or measurement installation during this scan. That is a detection result, not proof that all measurement is absent.`,
        effort: '1 to 3 hours',
        steps: [
          'Verify whether analytics or a tag manager is already active in production before installing anything new.',
          'Create separate conversion events for phone taps, successful forms, and completed bookings.',
          'Preserve campaign parameters through the conversion path where possible.',
          'Test every event from a real phone and desktop browser before using the data for ad decisions.',
        ],
        verify: [
          'A real time analytics view records each test conversion.',
          'Phone clicks and form submissions appear as separate events.',
          'Campaign tagged test visits retain their source information.',
        ],
        template: `Minimum conversion event plan for ${business}:\nphone_click\nlead_form_submit\nbooking_complete\nquote_request`,
      }

    case 'meta-description':
      return {
        findingId: finding.id,
        title: 'Own the search result sales message',
        outcome: 'Give qualified searchers a clearer reason to choose this result before they ever reach the website.',
        whyThisSite: `The homepage on ${host} did not expose a meta description during the scan.`,
        effort: '15 to 30 minutes',
        steps: [
          'Write one natural homepage description that states the core service, market, and next action.',
          'Put the useful promise near the beginning instead of stuffing keywords.',
          'Give major service pages distinct descriptions that match the search intent for that service.',
        ],
        verify: [
          'View page source and confirm exactly one meta description is present.',
          'Keep the copy natural and useful when read as a search result snippet.',
          'Recheck the page after deployment to make sure the CMS did not overwrite it.',
        ],
        template: `Starting point for ${business}:\n[Primary service] in [primary market]. [One specific trust or value statement]. [Primary action].`,
      }

    case 'schema':
      return {
        findingId: finding.id,
        title: 'Add explicit local business data',
        outcome: 'Give search engines a machine readable statement of the business identity and contact details.',
        whyThisSite: `No JSON LD structured business data was detected on the homepage for ${business}.`,
        effort: '30 to 60 minutes',
        steps: [
          'Add one valid JSON LD LocalBusiness object to the homepage.',
          'Keep name, URL, phone, address or service area consistent with the visible site and business profiles.',
          'Use the most specific truthful business subtype supported by Schema.org.',
          'Validate the markup before publishing.',
        ],
        verify: [
          'Run the deployed page through a structured data validator.',
          'Confirm the name, URL, phone, and service area match what customers see.',
          'Resolve all syntax errors before considering the task complete.',
        ],
        template: `{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": ${JSON.stringify(business)},
  "url": ${JSON.stringify(result.finalUrl)},
  "telephone": ${JSON.stringify(callableNumber ?? result.phoneNumber ?? '+1-REPLACE-WITH-PUBLIC-NUMBER')},
  "areaServed": "REPLACE-WITH-ACTUAL-SERVICE-AREA"
}`,
      }

    case 'chat':
      return {
        findingId: finding.id,
        title: 'Add a secondary contact path only if somebody will answer it',
        outcome: 'Recover visitors who prefer messaging without creating an unattended inbox that damages trust.',
        whyThisSite: `No common chat, SMS, or messenger path was detected across ${scope}. This is a lower priority issue when call and form paths are strong.`,
        effort: '1 to 2 hours',
        steps: [
          'Use SMS, web chat, or another monitored message channel only when response ownership is clear.',
          'Set an honest response time expectation.',
          'If messages cannot be answered quickly, prioritize call and form recovery first.',
        ],
        verify: [
          'Send a test message from a phone.',
          'Confirm the responsible person receives it.',
          'Confirm the site states a realistic response expectation.',
        ],
      }

    case 'service-area':
      return {
        findingId: finding.id,
        title: 'Answer “do you serve me?” before the visitor has to hunt',
        outcome: 'Prevent qualified local visitors from leaving just to confirm geographic coverage somewhere else.',
        whyThisSite: `The homepage for ${business} did not expose clear service area language to the scanner.`,
        effort: '30 to 60 minutes',
        steps: [
          'State the primary city or region near the top of the homepage.',
          'Link to useful service area pages when the business genuinely serves distinct markets.',
          'Keep geographic claims consistent with the actual operating footprint.',
        ],
        verify: [
          'A first time visitor can tell where the business works without opening the contact page.',
          'The same service area is reflected in major business profiles.',
        ],
        template: `${business} serves [primary market] and nearby communities including [area 1], [area 2], and [area 3].`,
      }

    case 'speed':
      return {
        findingId: finding.id,
        title: 'Verify the observed slowdown before changing the site',
        outcome: 'Avoid optimizing around one noisy measurement while still catching a reproducible performance problem.',
        whyThisSite: `This scan observed a slower homepage server response on ${host}. One request is evidence to investigate, not a performance benchmark.`,
        effort: '1 to 3 hours to diagnose',
        steps: [
          'Run several measurements from mobile and desktop conditions.',
          'Check field performance data when enough real user data exists.',
          'If server response is consistently slow, inspect hosting, redirects, uncached work, and blocking third party code.',
          'Retest after each material change.',
        ],
        verify: [
          'The slowdown reproduces across multiple measurements before work begins.',
          'The same test improves after the change.',
        ],
      }

    case 'viewport':
      return {
        findingId: finding.id,
        title: 'Restore predictable mobile rendering',
        outcome: 'Keep mobile buyers from fighting a desktop scaled page.',
        whyThisSite: `The homepage on ${host} did not expose the standard responsive viewport declaration.`,
        effort: '15 to 30 minutes',
        steps: [
          'Add the standard responsive viewport declaration.',
          'Verify the hero, call action, form, and navigation at common phone widths.',
          'Confirm buttons are easy to tap without zooming.',
        ],
        verify: [
          'The page renders at device width on a real phone.',
          'Primary controls are readable and easy to tap without zooming.',
        ],
        template: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      }

    case 'title':
      return {
        findingId: finding.id,
        title: 'Give the homepage a specific title',
        outcome: 'Improve relevance and clarity in search results and browser tabs.',
        whyThisSite: `The homepage on ${host} did not expose a page title during the scan.`,
        effort: '15 minutes',
        steps: [
          'Lead with the primary service or business name.',
          'Include the primary market when locality matters.',
          'Keep the title readable rather than repeating every service keyword.',
        ],
        verify: [
          'The title is visible in page source and browser tabs.',
          'It accurately reflects the page and does not repeat keywords unnaturally.',
        ],
        template: `[Primary service] in [primary market] | ${business}`,
      }

    case 'https':
      return {
        findingId: finding.id,
        title: 'Protect the entire conversion path with HTTPS',
        outcome: 'Remove browser trust warnings and keep customer data encrypted in transit.',
        whyThisSite: `${result.finalUrl} did not complete the scan over HTTPS.`,
        effort: '1 to 2 hours',
        steps: [
          'Install a valid TLS certificate for the production hostname.',
          'Redirect every HTTP request to the HTTPS version.',
          'Remove mixed content resources that still load over HTTP.',
        ],
        verify: [
          'HTTP requests redirect to HTTPS.',
          'The browser reports a valid secure connection.',
          'No mixed content errors remain in the browser console.',
        ],
      }

    default:
      return {
        findingId: finding.id,
        title: finding.title,
        outcome: finding.detail,
        whyThisSite: finding.detail,
        effort: 'Varies',
        steps: [finding.fix],
        verify: ['Re-run the SmallBizzWizz scan after the change and confirm the finding clears.'],
      }
  }
}

export function buildFixPack(result: RevenueAuditResult): FixPackSection[] {
  return result.findings.map((finding) => sectionForFinding(finding, result))
}
