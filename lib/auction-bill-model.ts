export type BillSnapshot = {
  auctionId: number; buyerId: number; customerProfileId: number; auctionTitle: string;
  buyerName: string; currency: 'USD'; privateGroup: boolean;
  items: { id: number; name: string; cents: number; packageId: number | null }[];
  packages: { id: number; number: number; shippingCents: number; packagingType: string;
    weightOunces: number; lengthHundredths: number; widthHundredths: number; heightHundredths: number | null }[];
  subtotalCents: number; discountCents: number; shippingCents: number; dueCents: number;
}
export type BillEvent = {
  id: number; kind: 'receipt' | 'pending' | 'settlement' | 'reject' | 'refund' | 'reversal';
  provider: 'paypal' | 'venmo' | 'other'; transaction_ref: string; amount_cents: number;
  credit_cents: number; original_event_id: number | null; funds_available: boolean;
  evidence_note: string; created_at: string;
}
export type BillPublicView = {
  membershipVerified?: boolean; checkoutOptions?: {label:string;url:string;amountCents:number;currency:'USD';billReference:string;verification:'provider'}[]; reference: string; revision: number; createdAt: string; auctionTitle: string; buyerName: string;
  items: { name: string; cents: number }[]; packages: { number: number; shippingCents: number }[];
  subtotalCents: number; discountCents: number; shippingCents: number; dueCents: number;
  creditedCents: number; outstandingCents: number; overpaidCents: number;
  status: 'unpaid' | 'partial' | 'paid' | 'no_payment_due' | 'overpaid' | 'pending' | 'review' | 'superseded';
  heldFunds: boolean; paypalUrl: string | null; venmoUrl: string | null; reviewMode: boolean;
}
export function paymentTotals(dueCents: number, events: BillEvent[]) {
  const creditedCents = events.reduce((n,e)=>n+e.credit_cents,0)
  const hasPending = events.some(e=>e.kind==='pending' &&
    !events.some(r=>r.original_event_id===e.id && (r.kind==='settlement'||r.kind==='reject')))
  return { creditedCents, outstandingCents: Math.max(0,dueCents-creditedCents),
    overpaidCents: Math.max(0,creditedCents-dueCents), hasPending,
    heldFunds: events.some(e=>e.credit_cents>0&&!e.funds_available) }
}
export function paypalPaymentUrl(cents: number) {
  if (!Number.isSafeInteger(cents)||cents<=0||cents>100000000) return null
  // Exact destination confirmed by Blake. No caller-controlled redirect target.
  return 'https://paypal.me/justincrouse2/' + (cents/100).toFixed(2) + 'USD'
}
export function venmoPaymentUrl(){return 'https://venmo.com/u/Justin-Crouse-6'}
export function parseActualMoney(value: string) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter an exact positive USD amount')
  const [dollars,cents='']=value.trim().split('.')
  const result=Number(dollars)*100+Number(cents.padEnd(2,'0'))
  if(result<=0||result>100000000)throw new Error('Enter an exact positive USD amount')
  return result
}
