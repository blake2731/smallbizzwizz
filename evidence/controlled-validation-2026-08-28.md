# Controlled scanner validation — 2026-08-28

## Status

PASS for the stated acceptance test.

This is **product-behavior evidence**, not a customer case study and not evidence of revenue lift.

## Production revision under test

- Production commit: `37fa60561b5314b6744ae0fd776ed02c95058319`
- Production host: `https://smallbizzwizz.com`
- Validation date: 2026-08-28
- Observed production scan responses: approximately 04:57 UTC

## Test design

The same fictional HVAC business is represented by two synthetic public pages.

### Before fixture

`https://smallbizzwizz.com/validation/before`

Intentionally includes a weaker public capture path, including:

- a visible plain-text phone number without a `tel:` link
- no clear quote/booking call to action
- no lead form

### After fixture

`https://smallbizzwizz.com/validation/after`

Intentionally adds the corresponding capture signals, including:

- a `tel:` call action
- a clear request-a-quote action
- a short lead form
- additional trust evidence and LocalBusiness structured data

The fixtures are synthetic, clearly labeled as such, and excluded from search indexing.

## Observed production results

### Before

Production scan URL:

`https://smallbizzwizz.com/scan?url=https%3A%2F%2Fsmallbizzwizz.com%2Fvalidation%2Fbefore`

Observed result:

- **6 observable friction signals**
- **3 high-priority signals**
- highest-priority findings shown by the public result:
  1. `A phone number is visible but not tap to call` — critical
  2. `No clear booking or quote action was detected` — critical
  3. `No lead form was found on the scanned conversion path` — high

### After

Production scan URL:

`https://smallbizzwizz.com/scan?url=https%3A%2F%2Fsmallbizzwizz.com%2Fvalidation%2Fafter`

Observed result:

- **1 observable friction signal**
- **0 high-priority signals**
- remaining finding shown by the public result:
  1. `No secondary messaging path was detected` — low

The three deliberately targeted primary findings from the before fixture were no longer present after the corresponding capture signals were added.

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| Detect non-tappable visible phone in before fixture | PASS |
| Stop raising that finding after `tel:` action is added | PASS |
| Detect missing clear quote/booking action in before fixture | PASS |
| Stop raising that finding after quote CTA is added | PASS |
| Detect missing lead form in before fixture | PASS |
| Stop raising that finding after form is added | PASS |
| High-priority finding count decreases after repairs | PASS: 3 → 0 |
| Total finding count decreases after repairs | PASS: 6 → 1 |

## What this proves

Under this controlled public-source test, the production scanner changed its findings in the expected direction when known conversion-path signals were added. The same production `/scan` surface used for normal scans was used for both fixtures.

## What this does **not** prove

This test does not establish:

- that adding these elements increases revenue by a particular amount
- that every real website is parsed correctly
- that the scanner detects JavaScript-only behavior it cannot see in fetched source
- that the priority heuristic is a calibrated conversion probability
- that a real business will see the same before/after outcome

Those claims require separate evidence. A real business-outcome case study should only be published after an actual implementation, a defined measurement window, and sufficient post-change data.
