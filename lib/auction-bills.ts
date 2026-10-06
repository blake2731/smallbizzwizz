import { createHash, randomBytes } from 'node:crypto'
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auctionBuyer, auctionItem, auctionPackage, auctionSession } from './auction-schema'
import { requireCustomer } from './auction-customer'
import { paymentTotals, parseActualMoney, type BillEvent, type BillPublicView, type BillSnapshot } from './auction-bill-model'

type Account = { id:number; user_id:string; auction_id:number; buyer_id:number; active_bill_id:number|null;
  revision:number; cleared_external_hash:string|null; review_hold:string|null }
type SavedBill = { id:number; account_id:number; revision:number; reference:string; content_hash:string;
  snapshot:BillSnapshot; due_cents:number; created_at:string; adjustment_reason:string|null }
export function privateBillsEnabled() { return process.env.AUCTION_PRIVATE_BILLS_ENABLED === 'true' }
function enabled() { if(!privateBillsEnabled()) throw new Error('Private bill review is disabled') }
function id(value:number) { if(!Number.isSafeInteger(value)||value<=0) throw new Error('Invalid bill identifier') }
function requestKey(value:string) { if(!/^[a-zA-Z0-9_-]{16,100}$/.test(value))throw new Error('Invalid request key') }
export function billHash(value:unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
export function tokenHash(token:string) { return createHash('sha256').update(token).digest('hex') }
async function rows<T>(query:SQL) {
  try{return (await db.execute(query)).rows as unknown as T[]}
  catch(error){
    const cause=(error as {cause?:{code?:string;message?:string}}).cause
    if(cause?.code==='23505')throw new Error('Duplicate transaction or request already recorded')
    const message=cause?.message??''
    if(cause?.code==='P0001'&&/^(Buyer not found|Bill not found|Request key|Bill changed|Explain|Invalid payment|Receipt cannot|Original payment|Resolve the exact|Reference the original|Refund exceeds|Payment evidence changed)/.test(message))throw new Error(message)
    throw new Error('Bill operation failed; refresh and review before retrying')
  }
}

async function source(userId:string,auctionId:number,buyerId:number) {
  id(auctionId); id(buyerId)
  const [sale]=await db.select().from(auctionSession).where(and(eq(auctionSession.id,auctionId),eq(auctionSession.userId,userId))).limit(1)
  const [buyer]=await db.select().from(auctionBuyer).where(and(eq(auctionBuyer.id,buyerId),eq(auctionBuyer.auctionId,auctionId))).limit(1)
  if(!sale||!buyer||!buyer.customerProfileId)throw new Error('Buyer not found')
  const profile=await requireCustomer(userId,buyer.customerProfileId)
  const [items,allPackages]=await Promise.all([
    db.select().from(auctionItem).where(and(eq(auctionItem.auctionId,auctionId),eq(auctionItem.buyerId,buyerId),eq(auctionItem.status,'sold'),isNull(auctionItem.voidedAt))).orderBy(asc(auctionItem.id)),
    db.select().from(auctionPackage).where(eq(auctionPackage.buyerId,buyerId)).orderBy(asc(auctionPackage.id)),
  ])
  const externalHash=billHash({shopifyDraftOrderId:buyer.shopifyDraftOrderId,shopifyOrderId:buyer.shopifyOrderId,
    invoiceSentAt:buyer.invoiceSentAt,invoiceMethod:buyer.invoiceMethod,paidAt:buyer.paidAt,
    paidCents:buyer.paidCents,paymentMethod:buyer.paymentMethod,paymentTransactionId:buyer.paymentTransactionId})
  const externalEvidence=Boolean(buyer.shopifyDraftOrderId||buyer.shopifyOrderId||buyer.invoiceSentAt||buyer.paidAt||buyer.paidCents||buyer.paymentTransactionId)
  if(!items.length){
    const [existing]=await rows<{id:number}>(sql`SELECT id FROM auction_bill_account WHERE user_id=${userId} AND auction_id=${auctionId} AND buyer_id=${buyerId} AND active_bill_id IS NOT NULL`)
    if(!existing)throw new Error('A new bill requires sold wins')
  }
  const packages=items.length?allPackages:[]
  if((items.length&&!packages.length)||packages.some(p=>p.status!=='packed'||p.shippingCents===null))throw new Error('Pack and quote every package before preparing a bill')
  if(packages.some(p=>!items.some(i=>i.packageId===p.id)))throw new Error('Remove or fill empty packages before billing')
  for(const p of packages) {
    if(!p.weightOunces||!p.lengthHundredths||!p.widthHundredths||(p.packagingType==='box'&&!p.heightHundredths))throw new Error('Package measurements are incomplete')
    if(p.shippingCents!<0)throw new Error('Invalid shipping amount')
  }
  if(items.some(item=>!item.packageId||!packages.some(p=>p.id===item.packageId)))throw new Error('Assign every win to its package')
  if(items.some(item=>!Number.isSafeInteger(item.priceCents)||item.priceCents<0))throw new Error('Invalid item amount')
  const subtotalCents=items.reduce((n,i)=>n+i.priceCents,0)
  let verifiedMember=buyer.privateGroup;
  if(process.env.AUCTION_PRIVATE_BILLS_LIVE==='true'){
    const [review]=await rows<{membership_status:string;evidence_note:string}>(sql`SELECT membership_status,evidence_note FROM auction_bill_membership_review WHERE user_id=${userId} AND auction_id=${auctionId} AND buyer_id=${buyerId}`)
    if(!review||!['member','nonmember'].includes(review.membership_status)||!review.evidence_note)throw new Error('Verify membership before finalizing this invoice')
    verifiedMember=review.membership_status==='member';
  }
  const discountCents=verifiedMember?Math.round(subtotalCents*.1):0
  const shippingCents=packages.reduce((n,p)=>n+p.shippingCents!,0)
  const snapshot:BillSnapshot={auctionId,buyerId,customerProfileId:profile.id,auctionTitle:sale.title,
    buyerName:profile.displayName,currency:'USD',privateGroup:verifiedMember,
    items:items.map(i=>({id:i.id,name:i.itemName,cents:i.priceCents,packageId:i.packageId})),
    packages:packages.map(p=>({id:p.id,number:p.packageNumber,shippingCents:p.shippingCents!,packagingType:p.packagingType,
      weightOunces:p.weightOunces!,lengthHundredths:p.lengthHundredths!,widthHundredths:p.widthHundredths!,heightHundredths:p.heightHundredths})),
    subtotalCents,discountCents,shippingCents,dueCents:subtotalCents-discountCents+shippingCents}
  if(!Number.isSafeInteger(snapshot.dueCents)||snapshot.dueCents>100000000)throw new Error('Bill amount is out of range')
  return {snapshot,hash:billHash(snapshot),externalHash,externalEvidence}
}
async function accountForBill(userId:string,billId:number) {
  id(billId)
  const [bill]=await rows<SavedBill>(sql`SELECT * FROM auction_bill_snapshot WHERE id=${billId}`)
  const [account]=bill?await rows<Account>(sql`SELECT * FROM auction_bill_account WHERE id=${bill.account_id} AND user_id=${userId}`):[]
  if(!bill||!account)throw new Error('Bill not found')
  return {bill,account}
}
async function events(accountId:number) {
  return rows<BillEvent>(sql`SELECT * FROM auction_bill_payment_event WHERE account_id=${accountId} ORDER BY id`)
}
export async function preparePrivateBill(userId:string,input:{auctionId:number;buyerId:number;requestKey:string;expectedRevision:number;adjustmentReason?:string}) {
  enabled(); requestKey(input.requestKey)
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw new Error('Invalid bill revision')
  const current=await source(userId,input.auctionId,input.buyerId)
  const reason=(input.adjustmentReason??'').trim().slice(0,500)
  const [result]=await rows<{id:number}>(sql`SELECT auction_prepare_private_bill(${userId},${input.auctionId},${input.buyerId},
    ${current.hash},${JSON.stringify(current.snapshot)}::jsonb,${input.requestKey},${input.expectedRevision},${reason}) AS id`)
  const token=randomBytes(32).toString('hex')
  await db.execute(sql`INSERT INTO auction_bill_token(token_hash,bill_id,expires_at) VALUES(${tokenHash(token)},${result.id},now()+interval '14 days')`)
  const {bill}=await accountForBill(userId,result.id)
  return {billId:bill.id,reference:bill.reference,revision:bill.revision,path:'/auction/bill/'+token}
}
export async function getPrivateBillReview(userId:string,auctionId:number,buyerId:number) {
  enabled()
  let current
  try {current=await source(userId,auctionId,buyerId)} catch(error) {
    // Ownership is always checked independently even if packing readiness fails.
    const [owned]=await db.select({id:auctionSession.id}).from(auctionSession).where(and(eq(auctionSession.id,auctionId),eq(auctionSession.userId,userId))).limit(1)
    if(!owned)throw new Error('Buyer not found')
    const [valid]=await db.select({id:auctionBuyer.id}).from(auctionBuyer).where(and(eq(auctionBuyer.id,buyerId),eq(auctionBuyer.auctionId,auctionId))).limit(1)
    if(!valid)throw new Error('Buyer not found')
    return {revision:0,bill:null,events:[] as BillEvent[],ready:false,problem:error instanceof Error?error.message:'Bill unavailable'}
  }
  const [account]=await rows<Account>(sql`SELECT * FROM auction_bill_account WHERE user_id=${userId} AND auction_id=${auctionId} AND buyer_id=${buyerId}`)
  const [bill]=account?.active_bill_id?await rows<SavedBill>(sql`SELECT * FROM auction_bill_snapshot WHERE id=${account.active_bill_id}`):[]
  const ledger=account?await events(account.id):[]
  const held=Boolean(account?.review_hold||(current.externalEvidence&&account?.cleared_external_hash!==current.externalHash))
  return {revision:account?.revision??0,bill:bill??null,events:ledger,ready:true,problem:held?'Existing billing/payment evidence requires manual review':null,
    changed:Boolean(bill&&bill.content_hash!==current.hash),totals:paymentTotals(bill?.due_cents??current.snapshot.dueCents,ledger)}
}
export async function readPrivateBill(token:string):Promise<BillPublicView|null> {
  if(!privateBillsEnabled()||!/^[a-f0-9]{64}$/.test(token))return null
  const [access]=await rows<{bill_id:number}>(sql`SELECT bill_id FROM auction_bill_token WHERE token_hash=${tokenHash(token)} AND revoked_at IS NULL AND expires_at>now()`)
  if(!access)return null
  const [bill]=await rows<SavedBill>(sql`SELECT * FROM auction_bill_snapshot WHERE id=${access.bill_id}`)
  const [account]=bill?await rows<Account>(sql`SELECT * FROM auction_bill_account WHERE id=${bill.account_id}`):[]
  if(!bill||!account)return null
  const ledger=await events(account.id)
  const totals=paymentTotals(bill.due_cents,ledger)
  let changed=true,held=true
  try {
    const current=await source(account.user_id,account.auction_id,account.buyer_id)
    changed=current.hash!==bill.content_hash
    held=Boolean(account.review_hold||(current.externalEvidence&&account.cleared_external_hash!==current.externalHash))
  } catch { /* Changed/cancelled/unpacked source must never leave a payable stale bill. */ }
  const superseded=account.active_bill_id!==bill.id
  const status:BillPublicView['status']=superseded?'superseded':changed||held?'review':totals.hasPending?'pending':
    totals.overpaidCents?'overpaid':bill.due_cents===0&&totals.creditedCents===0?'no_payment_due':totals.outstandingCents===0?'paid':totals.creditedCents>0?'partial':'unpaid'

  // Explicit public whitelist: no customer IDs, address/contact/notes, transactions or token hash.
  return {reference:bill.reference,revision:bill.revision,createdAt:String(bill.created_at),auctionTitle:bill.snapshot.auctionTitle,
    buyerName:bill.snapshot.buyerName,items:bill.snapshot.items.map(i=>({name:i.name,cents:i.cents})),
    packages:bill.snapshot.packages.map(p=>({number:p.number,shippingCents:p.shippingCents})),
    subtotalCents:bill.snapshot.subtotalCents,discountCents:bill.snapshot.discountCents,shippingCents:bill.snapshot.shippingCents,
    dueCents:bill.due_cents,creditedCents:totals.creditedCents,outstandingCents:totals.outstandingCents,overpaidCents:totals.overpaidCents,
    membershipVerified:bill.snapshot.privateGroup,checkoutOptions:[],status,heldFunds:totals.heldFunds,paypalUrl:null,venmoUrl:null,
    reviewMode:process.env.AUCTION_PRIVATE_BILLS_LIVE!=='true'}
}
export async function recordPrivateBillPayment(userId:string,input:{billId:number;requestKey:string;kind:BillEvent['kind'];
  provider:BillEvent['provider'];transactionRef:string;amount:string;currency:string;originalEventId?:number;
  fundsAvailable:boolean;evidenceNote:string;confirmed:boolean}) {
  enabled();requestKey(input.requestKey)
  const {account}=await accountForBill(userId,input.billId)
  if(input.currency!=='USD'||input.confirmed!==true)throw new Error('Verify actual USD payment evidence first')
  if(!['receipt','pending','settlement','reject','refund','reversal'].includes(input.kind)||!['paypal','venmo','other'].includes(input.provider))throw new Error('Invalid payment event')
  const transactionRef=input.transactionRef.trim()
  if(!/^[A-Za-z0-9_.:-]{3,128}$/.test(transactionRef))throw new Error('Enter the actual provider transaction reference')
  const evidenceNote=input.evidenceNote.trim()
  if(evidenceNote.length<5||evidenceNote.length>500)throw new Error('Describe the evidence reviewed')
  if(typeof input.fundsAvailable!=='boolean')throw new Error('Confirm funds availability separately')
  const amount=parseActualMoney(input.amount)
  if(input.originalEventId!=null)id(input.originalEventId)
  const payload={kind:input.kind,provider:input.provider,transactionRef,amount,originalEventId:input.originalEventId??null,
    fundsAvailable:input.fundsAvailable,evidenceNote,currency:'USD'}
  const [result]=await rows<{id:number}>(sql`SELECT auction_record_bill_event(${userId},${account.id},${input.requestKey},${billHash(payload)},
    ${input.kind},${input.provider},${transactionRef},${amount},${input.originalEventId??null},${input.fundsAvailable},${evidenceNote}) AS id`)
  return {eventId:result.id}
}
export async function resolvePrivateBillHold(userId:string,input:{billId:number;note:string;expectedEventCount:number}) {
  enabled()
  const {account}=await accountForBill(userId,input.billId)
  const note=input.note.trim()
  if(note.length<10||note.length>500)throw new Error('Describe the existing invoices/payments and why another request is safe')
  const current=await source(userId,account.auction_id,account.buyer_id)
  if((await events(account.id)).length!==input.expectedEventCount)throw new Error('Payment evidence changed; refresh before reviewing')
  await db.execute(sql`SELECT auction_review_bill_hold(${userId},${account.id},${current.externalHash},${note},${input.expectedEventCount})`)
  return {ok:true}
}
export async function revokePrivateBillLinks(userId:string,billId:number) {
  enabled();await accountForBill(userId,billId)
  await db.execute(sql`UPDATE auction_bill_token SET revoked_at=now() WHERE bill_id=${billId} AND revoked_at IS NULL`)
  return {ok:true}
}
export async function billReconciliationCsv(userId:string,auctionId:number) {
  enabled();id(auctionId)
  const [owned]=await db.select().from(auctionSession).where(and(eq(auctionSession.id,auctionId),eq(auctionSession.userId,userId))).limit(1)
  if(!owned)throw new Error('Auction not found')
  const accounts=await rows<Account>(sql`SELECT * FROM auction_bill_account WHERE user_id=${userId} AND auction_id=${auctionId} ORDER BY id`)
  const data:unknown[][]=[['Reference','Revision','Buyer ID','Customer ID','Merchandise cents','PG discount cents','Package shipping cents','Due cents',
    'Verified credited cents','Outstanding cents','Overpaid cents','Pending','Funds held','Currency','Transaction events JSON']]
  for(const account of accounts) {
    const [bill]=await rows<SavedBill>(sql`SELECT * FROM auction_bill_snapshot WHERE id=${account.active_bill_id}`)
    const ledger=await events(account.id),total=paymentTotals(bill.due_cents,ledger)
    data.push([bill.reference,bill.revision,account.buyer_id,bill.snapshot.customerProfileId,
      bill.snapshot.subtotalCents,bill.snapshot.discountCents,bill.snapshot.shippingCents,bill.due_cents,total.creditedCents,
      total.outstandingCents,total.overpaidCents,total.hasPending,total.heldFunds,'USD',
      JSON.stringify(ledger.map(e=>({id:e.id,kind:e.kind,provider:e.provider,transactionRef:e.transaction_ref,actualCents:e.amount_cents,
        creditCents:e.credit_cents,originalEventId:e.original_event_id,fundsAvailable:e.funds_available,reviewedAt:e.created_at})))])
  }
  const cell=(value:unknown)=>{let text=String(value??'');if(/^[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
  return data.map(row=>row.map(cell).join(',')).join('\r\n')
}

export async function reviewBillMembership(userId:string,input:{auctionId:number;buyerId:number;status:'member'|'nonmember';evidenceNote:string}){
 enabled();id(input.auctionId);id(input.buyerId);
 const [owned]=await db.select({id:auctionSession.id}).from(auctionSession).where(and(eq(auctionSession.id,input.auctionId),eq(auctionSession.userId,userId))).limit(1);
 const [buyer]=await db.select({id:auctionBuyer.id}).from(auctionBuyer).where(and(eq(auctionBuyer.id,input.buyerId),eq(auctionBuyer.auctionId,input.auctionId))).limit(1);
 if(!owned||!buyer)throw Error('Buyer not found');
 if(!['member','nonmember'].includes(input.status)||input.evidenceNote.trim().length<10)throw Error('Record verified membership evidence');
 await db.execute(sql`INSERT INTO auction_bill_membership_review(user_id,auction_id,buyer_id,membership_status,evidence_note) VALUES(${userId},${input.auctionId},${input.buyerId},${input.status},${input.evidenceNote.trim().slice(0,500)}) ON CONFLICT(user_id,auction_id,buyer_id) DO UPDATE SET membership_status=EXCLUDED.membership_status,evidence_note=EXCLUDED.evidence_note,reviewed_at=now()`);
 return {ok:true};
}

