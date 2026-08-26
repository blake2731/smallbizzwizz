# SmallBizzWizz

SmallBizzWizz is a production business software application that combines a conversational business advisor with a structured financial workflow for skilled nursing operators.

The engineering principle behind the structured workflow is simple: calculations and data integrity belong in deterministic code. AI is used after the system has parsed, validated, normalized, and analyzed the source data.

Live application: https://smallbizzwizz.com

## What the system does

SmallBizzWizz currently has two major product surfaces.

### 1. Business advisor

Authenticated users can ask business questions, maintain conversation history, upload supported documents, and receive responses informed by profile and industry context.

### 2. Skilled nursing operator workflow

The application accepts supported Excel financial workbooks and turns them into persisted, inspectable business intelligence.

The processing path is:

1. Authenticate the user.
2. Validate the workbook and reporting period.
3. Select or create the facility within the authenticated user scope.
4. Compute a SHA 256 checksum for the workbook.
5. Create an upload record and reporting period.
6. Parse workbook structure and values with ExcelJS.
7. Validate totals against child records and record integrity issues.
8. Normalize source rows into a stable financial data model.
9. Generate deterministic insight packets from normalized records.
10. Generate audience specific narrative explanations from the structured insight data.
11. Persist normalized records, insights, narratives, processing state, diagnostics, and failures.

## Why the pipeline is designed this way

A language model should not be the source of numerical truth for financial analysis.

SmallBizzWizz separates deterministic processing from generated narrative output so the underlying facts can be inspected independently of the AI layer.

The workbook parser reads hierarchy encoded by Excel outline levels and validates supported totals against accumulated child rows. Unsupported layouts are reported explicitly instead of being silently interpreted.

Upload processing also records named stages such as parsing, validating, normalizing, insights, narratives, persisting, complete, and failed. This makes partial and failed processing states visible instead of reducing the workflow to a single success flag.

## Reliability and safety behavior

Current implementation evidence includes:

1. Workbook format validation before the structured parser runs.
2. Authenticated facility selection scoped to the current user.
3. SHA 256 workbook checksums.
4. Explicit upload states for processing, completion, partial completion, validation failure, normalization failure, and general processing failure.
5. Persisted diagnostics, validation statistics, integrity scores, and processing errors.
6. Unique database constraints that protect important record identities.
7. Cascade relationships for dependent records.
8. MIME validation before chat attachments are sent to the model provider.
9. A token protected health diagnostic endpoint that is hidden when disabled or unauthorized.
10. Sensitive business file patterns excluded from version control.
11. Production maintenance for mobile onboarding, spreadsheet upload behavior, bot traffic, and deployment configuration.

## Data model

The PostgreSQL model includes:

1. User profiles.
2. Conversations and messages.
3. Facilities.
4. Upload records and processing state.
5. Reporting periods.
6. Normalized financial records.
7. Deterministic insight packets.
8. Generated narratives with source context and supporting insight identifiers.

Drizzle ORM defines the schema, indexes, relationships, and migrations.

## Technology

1. Next.js 16.
2. React 19.
3. TypeScript.
4. PostgreSQL through Neon.
5. Drizzle ORM.
6. Clerk authentication.
7. ExcelJS workbook processing.
8. Anthropic API.
9. Stripe.
10. Tailwind CSS 4.
11. Vercel deployment.

## Repository map

Important implementation areas include:

`app/api/uploads/route.ts`: authenticated workbook intake and validation.

`lib/parsers/cypress.ts`: deterministic workbook parsing and total validation.

`lib/verticals/nursing-home/pipeline.ts`: staged financial processing workflow.

`lib/verticals/nursing-home/financialMappings.ts`: normalization rules.

`lib/verticals/nursing-home/insights.ts`: deterministic operational insight generation.

`lib/verticals/nursing-home/narratives.ts`: narrative generation from structured source data.

`lib/db/schema.ts`: persistent data model and constraints.

`app/api/healthcheck/route.ts`: protected production diagnostics.

## Development

Install dependencies:

```bash
npm ci
```

Run the development server:

```bash
npm run dev
```

Run linting:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Database commands are available for Drizzle generation, migration, push, and Studio workflows.

## Current engineering gap

The repository does not yet expose an automated application test suite through `package.json`.

That is a known quality gap rather than something this README hides. The next reliability step is to extract deterministic workbook fixtures and pipeline rules into automated tests, then add user visible critical path testing around upload and authentication behavior.

## Product status

SmallBizzWizz is publicly deployed and has continued to receive production maintenance. The repository should be read as an evolving product system rather than a finished reference implementation.
