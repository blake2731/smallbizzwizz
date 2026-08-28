import type { RevenueAuditResult, RevenueFinding } from '@/lib/revenue-audit'

export interface FixPackSection {
  findingId: string
  title: string
  outcome: string
  steps: string[]
  template?: string
}

function sectionForFinding(finding: RevenueFinding, result: RevenueAuditResult): FixPackSection {
  switch (finding.id) {
    case 'click-to-call':
      return {
        findingId: finding.id,
        title: 'Make calling a one tap action',
        outcome: 'Remove friction between urgent mobile visitors and the phone call that can become a booked job.',
        steps: [
          'Put a visible Call now action in the mobile header.',
          'Use a real tel: link instead of plain phone-number text.',
          'Repeat the call action after the primary service proof and near the bottom of the page.',
          'Track taps as a conversion event so paid and organic traffic can be compared.',
        ],
        template: `<a href="tel:+1PHONENUMBER" aria-label="Call us now">Call now</a>`,
      }

    case 'form':
      return {
        findingId: finding.id,
        title: 'Give non-callers a fast fallback',
        outcome: 'Capture people who are interested now but cannot or will not place a call.',
        steps: [
          'Use a short service-request form on a clearly linked contact, quote, or booking page.',
          'Start with name, phone or email, ZIP code, service needed, and one optional message field.',
          'Do not force account creation before the lead is captured.',
          'Send a visible confirmation immediately and route the lead to a monitored destination.',
          'Track successful submissions as a conversion event.',
        ],
        template: `Recommended fields:\n1. Name\n2. Phone or email\n3. ZIP code\n4. Service needed\n5. Optional details`,
      }

    case 'booking-cta':
      return {
        findingId: finding.id,
        title: 'Choose one unmistakable primary action',
        outcome: 'Make the next step obvious instead of asking a high-intent visitor to interpret the navigation.',
        steps: [
          'Choose one primary action and use the same wording in the hero, header, and major service sections.',
          'Use action language tied to the buyer outcome instead of a generic Learn more button.',
          'Keep secondary navigation visually subordinate to the primary conversion action.',
        ],
        template: `CTA options:\n• Get an estimate\n• Request service\n• Book an inspection\n• Schedule service\n• Get a quote`,
      }

    case 'trust-proof':
      return {
        findingId: finding.id,
        title: 'Move proof next to the decision',
        outcome: 'Reduce the uncertainty that makes local buyers open another provider in a new tab.',
        steps: [
          'Place recent review proof close to the first conversion action.',
          'Show relevant licensing, insurance, certifications, guarantees, or years in business where truthful.',
          'Use specific customer outcomes or project proof instead of unsupported superlatives.',
          'Repeat the strongest proof near the final call or quote action.',
        ],
        template: `Proof block structure:\n★★★★★ [rating or review proof]\n[Specific credential or guarantee]\n[Short customer outcome]\n[Primary CTA]`,
      }

    case 'analytics':
      return {
        findingId: finding.id,
        title: 'Measure the actions that can become revenue',
        outcome: 'Know which traffic sources produce calls, forms, and bookings instead of optimizing around pageviews.',
        steps: [
          'Verify a web analytics or tag manager installation is active on production pages.',
          'Create separate conversion events for phone taps, successful forms, and completed bookings.',
          'Preserve campaign parameters through the conversion path where possible.',
          'Test each event from a real phone and desktop browser before using the data for ad decisions.',
        ],
        template: `Minimum event plan:\nphone_click\nlead_form_submit\nbooking_complete\nquote_request`,
      }

    case 'meta-description':
      return {
        findingId: finding.id,
        title: 'Own the search-result sales message',
        outcome: 'Give qualified searchers a clearer reason to choose this result before they reach the website.',
        steps: [
          'Write one natural description for the homepage that states the core service, market, and next action.',
          'Keep the important promise near the beginning instead of stuffing keywords.',
          'Give major service pages distinct descriptions that match the search intent for that service.',
        ],
        template: `[Primary service] in [service area]. [Specific trust or value statement]. [Primary action].`,
      }

    case 'schema':
      return {
        findingId: finding.id,
        title: 'Add explicit local business data',
        outcome: 'Give search engines a machine-readable statement of the business identity and contact details.',
        steps: [
          'Add one valid JSON-LD LocalBusiness object to the homepage.',
          'Keep name, URL, phone, address or service area consistent with the visible site and business profiles.',
          'Use the most specific truthful business subtype when it is supported by Schema.org.',
          'Validate the markup before publishing.',
        ],
        template: `{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": ${JSON.stringify(result.pageTitle ?? 'Business name')},
  "url": ${JSON.stringify(result.finalUrl)},
  "telephone": "+1-PHONE-NUMBER",
  "areaServed": "SERVICE AREA"
}`,
      }

    case 'chat':
      return {
        findingId: finding.id,
        title: 'Add a secondary contact path only if it can be answered',
        outcome: 'Recover visitors who prefer messaging without creating an unattended inbox that damages trust.',
        steps: [
          'Use SMS, web chat, or another monitored message channel only when response ownership is clear.',
          'Set an honest response-time expectation.',
          'If messages cannot be answered quickly, prioritize call and form recovery first.',
        ],
      }

    case 'service-area':
      return {
        findingId: finding.id,
        title: 'Answer “do you serve me?” immediately',
        outcome: 'Prevent qualified local visitors from leaving just to confirm geographic coverage somewhere else.',
        steps: [
          'State the primary city or region near the top of the homepage.',
          'Link to useful service-area pages when the business genuinely serves distinct markets.',
          'Keep geographic claims consistent with the actual operating footprint.',
        ],
        template: `Serving [primary market] and nearby communities including [area 1], [area 2], and [area 3].`,
      }

    case 'speed':
      return {
        findingId: finding.id,
        title: 'Verify the observed response slowdown before changing the site',
        outcome: 'Avoid optimizing around one noisy measurement while still catching a reproducible performance problem.',
        steps: [
          'Run several measurements from mobile and desktop conditions.',
          'Check field performance data when enough real-user data exists.',
          'If server response is consistently slow, inspect hosting, redirects, uncached work, and blocking third-party code.',
          'Re-test after each material change.',
        ],
      }

    case 'viewport':
      return {
        findingId: finding.id,
        title: 'Restore predictable mobile rendering',
        outcome: 'Keep mobile buyers from fighting a desktop-scaled page.',
        steps: [
          'Add the standard responsive viewport declaration.',
          'Verify the hero, call action, form, and navigation at common phone widths.',
          'Confirm buttons are easy to tap without zooming.',
        ],
        template: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      }

    case 'title':
      return {
        findingId: finding.id,
        title: 'Give the homepage a specific title',
        outcome: 'Improve relevance and clarity in search results and browser tabs.',
        steps: [
          'Lead with the primary service or business name.',
          'Include the primary market when locality matters.',
          'Keep the title readable rather than repeating every service keyword.',
        ],
        template: `[Primary service] in [primary market] | [Business name]`,
      }

    case 'https':
      return {
        findingId: finding.id,
        title: 'Protect the entire conversion path with HTTPS',
        outcome: 'Remove browser trust warnings and keep customer data encrypted in transit.',
        steps: [
          'Install a valid TLS certificate for the production hostname.',
          'Redirect every HTTP request to the HTTPS version.',
          'Remove mixed-content resources that still load over HTTP.',
        ],
      }

    default:
      return {
        findingId: finding.id,
        title: finding.title,
        outcome: finding.detail,
        steps: [finding.fix],
      }
  }
}

export function buildFixPack(result: RevenueAuditResult): FixPackSection[] {
  return result.findings.map((finding) => sectionForFinding(finding, result))
}
