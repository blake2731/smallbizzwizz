# Parcel export repair

## Status and scope

Prepared against commit ebcc031ff670e6f3730984645edeaa020995f485 on feature/tablet-auction-console. This change addresses the Pirate Ship CSV export only. It does not modify invoices, payments, package records, Shopify label purchasing, or Shippo rate selection. No customer data appears in the tests.

## Reproduced failure

syncBuyerPackageSummary intentionally clears the buyer measurement summary when a buyer has more than one package. The original export route then requires those cleared summary fields, rejecting a buyer even when both canonical parcels are packed and fully measured. The regression runs the actual original handler, replacing only its external imports with isolated test doubles. Its fixture bytes match repository blob d641a1d69ac604fb6d15816fa28202a39f5de08c.

Observed test result: original handler returns HTTP 400 for two complete parcels; repaired handler returns HTTP 200 and two CSV package rows. This proves a code defect, not which customers experienced it in production.

## Behavior

Each canonical parcel supplies its own weight, three dimensions, and stable package ID. Legacy buyer measurements are used only when no canonical parcels exist. One ready parcel can export even when another is unpacked. Recorded label or purchase evidence is conservatively excluded, with the reason available in report mode. Missing address records are still excluded, preserving the previous behavior for local pickup without a shipping profile.

A packed parcel with invalid measurements, duplicate identity, or mismatched ownership stops the CSV with HTTP 422 instead of producing a misleading partial success. Parcel contents and values are allocated only when item assignments and totals reconcile. Otherwise the physical shipping row is still usable but its Order Value is blank and its Note explains the uncertainty. No insurance value is guessed. Order Value remains informational and does not purchase insurance.

Append &report=1 to the existing export URL to inspect rows, exclusions, warnings, and errors without downloading a CSV. This uses the existing access boundary; it is not a new public route.

## Verification

Run from the repository root with Node 22.6 or newer:

    node --experimental-strip-types --test tests/auction-shipping-export.test.mjs

Thirty local tests passed on Node 22.16.0, including 500 deterministic cent allocation cases within one property test. The pure helper also passed strict TypeScript 5.8.3 checking with ES2020 and DOM libraries. HTTP handler tests replace external authentication and database imports; they do not prove the deployed application's authentication, database state, or third party import behavior.

The existing CI workflow now runs these regressions before dependency installation and the full application build. A completed CI run must be inspected before merging. The full application build was not run locally because the local runtime has no repository dependency installation and cannot resolve GitHub.

## Deployment guardrails

This is a review branch, not a production release. Preserve concurrent work and recheck the target branch before merge. Run the production build and test the download through a protected preview with synthetic data. Do not query a live auction only for a supposedly read only test: the existing getAuctionState routine can initialize package records. Confirm the deployed version before claiming the operator's export is fixed.

The existing preview identity handling is unchanged. Its access protection needs independent verification before exposing any new preview; the production auth test is not evidence about preview protection. This change does not authorize publishing or bypassing access controls.

Recorded label evidence is not a universal duplicate purchase check. An external Pirate Ship label that is absent from the app can still exist. Reimporting a CSV is not idempotent. Canonical single package IDs now include the package database ID; existing old buyer keyed imports must not be imported again blindly. Unassigned contents intentionally produce blank values rather than duplicated buyer totals.

## References

Original review: https://github.com/blake2731/smallbizzwizz/pull/29#discussion_r4074683304

Pirate Ship accepts size and weight columns per row: https://support.pirateship.com/en/articles/1068428-how-do-i-upload-address-spreadsheets-into-pirate-ship

Different package types, extra services and customs options still require separate suitable batches: https://support.pirateship.com/en/articles/2797613-how-do-i-upload-a-spreadsheet-with-different-weights-and-dimensions

Node type stripping executes TypeScript without type checking: https://nodejs.org/download/release/v22.16.0/docs/api/cli.html#--experimental-strip-types

## Review branch protection

Automatic Vercel deployment is disabled only for review_parcel_export_20260924 in the added vercel.json. Unspecified branches retain their default deployment behavior. The connected Vercel project read returned an argument mapping error, so preview protection was not verified. This targeted configuration avoids intentionally publishing another preview while the existing access boundary remains unverified. No live project setting was changed.

Reference: https://vercel.com/docs/project-configuration/git-configuration
