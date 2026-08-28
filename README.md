# SmallBizzWizz

SmallBizzWizz is a public-source website capture scanner for local service businesses. It follows a shallow public conversion path and flags observable friction around calling, requesting service, booking, trust evidence, measurement, mobile setup, search clarity, and basic technical signals.

Live application: https://smallbizzwizz.com

Proof and validation: https://smallbizzwizz.com/proof

Methodology and limitations: https://smallbizzwizz.com/methodology

Illustrative Fix Pack: https://smallbizzwizz.com/sample

## Evidence standard

SmallBizzWizz is intentionally narrow about what it claims.

The scanner can report public signals it observes. It does not know a business's traffic, close rate, average job value, CRM behavior, or private analytics, so it does not claim a specific conversion rate or dollar loss from a public scan.

Synthetic validation fixtures are labeled synthetic. They are acceptance tests for scanner behavior, not customer case studies or proof of revenue lift.

Customer outcomes will only be published as outcomes after there is an actual implementation, a defined measurement window, and enough post-change data to support the claim.

## Controlled validation

The repository ships two public, noindex validation fixtures for a fictional HVAC business:

- `/validation/before` deliberately contains weaker capture signals.
- `/validation/after` deliberately adds a tap-to-call action, quote CTA, short form, trust evidence, and LocalBusiness structured data.

The public proof page links both fixtures directly into the same `/scan` route used for normal scans. This allows anyone to reproduce the scanner's behavior against known inputs without relying on a testimonial or screenshot.

## Current product flow

1. Normalize and safety-check the submitted public URL.
2. Resolve the hostname and reject private/internal network targets.
3. Fetch the homepage with bounded redirects, timeouts, content-type checks, and page-size limits.
4. Identify up to three likely internal contact, quote, booking, appointment, or service-request pages.
5. Evaluate the combined public source for deterministic capture, trust, measurement, technical, and speed signals.
6. Return observable findings and positive signals.
7. Offer a $49 DIY Revenue Fix Pack only when findings exist.
8. Generate site-specific repair tickets with implementation steps, ready-to-adapt code or copy where applicable, and verification checks.

## Important implementation areas

- `lib/revenue-audit.ts` — URL safety, shallow conversion crawl, signal detection, findings, priorities, and recovery-plan logic.
- `lib/revenue-fix-pack.ts` — converts detected findings into implementation-oriented repair tickets.
- `app/scan/page.tsx` — public pre-scanned prospect result surface.
- `app/audit/report/page.tsx` — Stripe-gated paid Fix Pack.
- `app/proof/page.tsx` — public evidence and validation surface.
- `app/methodology/page.tsx` — published scope and limitations.
- `app/validation/before/page.tsx` and `app/validation/after/page.tsx` — controlled acceptance-test fixtures.

## What the scanner can miss

The current implementation primarily evaluates fetched public HTML. It can miss or under-detect behavior that only appears after client-side JavaScript executes, private analytics and CRM configuration, authenticated flows, off-site workflows, or conditional UI that is not present in the fetched source.

Performance observations are single-pass signals to verify, not laboratory benchmarks.

The scanner is designed for appointment- and lead-driven local service businesses. Using it as a general-purpose score for unrelated business models is outside its intended scope.

## Verification

Production is deployed through Vercel from the `main` branch. Pull requests and main-branch changes run a GitHub Actions production build check, while Vercel independently builds deployment output.

The `/proof` page exposes the production Git commit and links directly to the scanner implementation so the running product can be traced back to source.

## Technology

- Next.js 16
- React 19
- TypeScript
- Stripe Checkout
- Clerk
- Vercel
- PostgreSQL / Neon and Drizzle ORM for legacy and authenticated application surfaces still present in the repository

## Legacy code

This repository predates the current SmallBizzWizz product direction and still contains older authenticated business-advisor and skilled-nursing workflow code. Those modules are not evidence for the current scanner and are not presented as part of the active public offer. They remain in the repository while the product is being simplified rather than being hidden or rewritten out of history.

## Development

```bash
npm ci
npm run dev
```

Production verification:

```bash
npm run build
```

Linting:

```bash
npm run lint
```

## Current proof gap

SmallBizzWizz does not yet have a real customer implementation case study with measured pre/post conversion data. That is the next evidence milestone. Until then, controlled validation, inspectable source, transparent limitations, deployment traceability, and real prospect-specific observations are the available proof layers.
