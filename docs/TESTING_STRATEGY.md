# Deterministic Financial Testing Strategy

## Purpose

SmallBizzWizz uses deterministic code for workbook interpretation and financial reconciliation before AI narrative generation. The first automated test layer therefore targets the deterministic workbook boundary rather than browser behavior or language model output.

## Current Coverage

The first Vitest suite generates Excel workbooks in memory and verifies:

1. Unsupported layouts are rejected explicitly.
2. Supported Actual versus Budget layouts are recognized.
3. Opening headers, detail rows, closing totals, hierarchy, and source row metadata are parsed correctly.
4. Reconciliation differences at the configured tolerance do not become validation issues.
5. Reconciliation differences beyond tolerance become visible validation issues.
6. Drilldown detail does not incorrectly flow past a missing immediate parent and double count against a grandparent total.
7. Numeric cached formula results are accepted as deterministic metric values.
8. Hidden source rows remain represented as hidden records instead of disappearing silently.

## Why This Layer Comes First

These behaviors determine whether financial source data is interpreted correctly. They can be tested without a database, authentication provider, Stripe, browser, or language model call. Keeping this layer isolated makes failures easier to understand and creates fast regression protection around the highest consequence deterministic logic.

## Next Layers

1. Normalization mapping tests.
2. Deterministic insight threshold tests.
3. Upload state and failure classification tests with persistence boundaries isolated.
4. Sanitized regression fixtures based on historical spreadsheet defects.
5. Browser tests for authentication boundaries, upload validation, and successful result navigation.

## Quality Gate

The branch quality workflow uses locked dependencies, runs the deterministic tests, and runs repository linting. Repository contents permission remains read only during normal CI operation.
