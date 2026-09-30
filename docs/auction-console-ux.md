# Auction Console UX Direction

## Workflow

The console is organized around one job at a time:

1. Live: record sales and bids quickly.
2. Buyers: review buyer totals and buyer-level exceptions.
3. Pack: gather items, add boxes only when needed, enter final package measurements, and mark packed.
4. Shipping: add or confirm the address, review the package measurements from Pack, get the external shipping quote, and record the customer shipping charge.
5. Invoice: create or send the payment request and reconcile payment.

Do not duplicate an editable field on adjacent workflow steps unless the second step has a real reason to edit it.

## Design rules

The primary screen for a workflow shows only the information needed to complete that workflow. Advanced or uncommon tools stay behind progressive disclosure.

Completed information should normally become a readable summary. Editing should be explicit rather than leaving every previously completed field open.

For large buyer lists, default to compact rows with search and status filters. Expand one buyer at a time.

Prevent invalid input before it reaches a server action. Show actionable, local error text rather than allowing a generic server-render failure.

Preserve recognition cues. Buyer names that participate in bidding stay searchable even if they do not win. New bids are written to the bid ledger.

Keep system status obvious: packed, needs address, needs shipping charge, ready to invoice, invoice sent, and paid.

## Special handling

Seed-only orders are mailed as a letter with two stamps. They do not require parcel weight or dimensions and do not use Pirate Ship labels.

Pirate Ship is the external parcel-postage tool. Package dimensions are captured once in Pack, then shown read-only in Shipping.

The Shopify lane is for customer payment and invoicing. Pirate Ship can import Shopify orders after they become regular unfulfilled orders, but Shopify draft orders do not become regular orders until payment is completed, so the Shopify integration does not solve the pre-invoice shipping-quote step.

## Guardrails

Do not buy postage automatically.

Do not send customer emails or invoices without the user's explicit instruction.

Do not silently merge buyer identities from spelling similarity alone.

Do not change confirmed auction sale quantities or prices as part of UI cleanup.
