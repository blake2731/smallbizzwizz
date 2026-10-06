import {randomBytes} from 'node:crypto'
import {sql,type SQL} from 'drizzle-orm'
import {db} from '@/lib/db'
import {readPrivateBill,tokenHash} from './auction-bills'
import {configuredPayPalAdapter} from './paypal-runtime'
type Attempt={id:string;account_id:number;bill_id:number;content_hash:string;amount_cents:number;order_id:string|null;approval_url:string|null;state:string;payment_event_id:number|null;created_at:string}
type Context={bill_id:number;account_id:number;content_hash:string;reference:string}
async function rows<T>(query:SQL){try{return (await db.execute(query)).rows as unknown as T[]}catch{throw Error('Checkout needs seller review; reuse the existing attempt')}}
async function context(token:string,reconcile=false){
 const view=await readPrivateBill(token);
 if(!view||view.reviewMode||!['unpaid','partial',...(reconcile?['pending','paid']:[])].includes(view.status))throw Error('Invoice is not ready for checkout');
 const [c]=await rows<Context>(sql`SELECT b.id AS bill_id,b.account_id,b.content_hash,b.reference FROM auction_bill_token t JOIN auction_bill_snapshot b ON b.id=t.bill_id JOIN auction_bill_account a ON a.id=b.account_id WHERE t.token_hash=${tokenHash(token)} AND t.revoked_at IS NULL AND t.expires_at>now() AND a.active_bill_id=b.id`);
 if(!c)throw Error('Invoice link is unavailable');return {view,c};
}
function binding(t:Attempt,c:Context){return {billReference:c.reference,attemptReference:t.id,amountCents:t.amount_cents,...(t.order_id?{orderId:t.order_id}:{})}}
export async function beginBuyerCheckout(token:string){
 const {view,c}=await context(token);const provider=configuredPayPalAdapter();
 const [t]=await rows<Attempt>(sql`SELECT * FROM auction_begin_checkout(${c.account_id},${c.bill_id},${c.content_hash},${view.outstandingCents},${randomBytes(16).toString('hex')})`);
 if(t.state==='review'||t.state==='pending'||t.state==='captured')throw Error('Existing payment needs reconciliation');
 if(t.order_id){if(!t.approval_url)throw Error('Checkout approval is unavailable');return {approvalUrl:t.approval_url};}
 if(Date.now()-new Date(t.created_at).getTime()>5*60*1000)throw Error('Uncertain old checkout needs seller reconciliation');
 const order=await provider.createOrder(binding(t,c));
 const [saved]=await rows<Attempt>(sql`UPDATE auction_bill_checkout_attempt SET order_id=${order.orderId},approval_url=${order.approvalUrl},state='ready',updated_at=now() WHERE id=${t.id} AND (order_id IS NULL OR order_id=${order.orderId}) RETURNING *`);
 if(!saved)throw Error('Order conflict requires reconciliation');
 // Save provider identity before rechecking; a changed invoice cannot redirect,
 // but its existing remote order remains available for seller reconciliation.
 const current=await context(token);if(current.view.outstandingCents!==t.amount_cents||current.c.content_hash!==t.content_hash)throw Error('Invoice changed; checkout needs review');
 return {approvalUrl:saved.approval_url!};
}
export async function buyerCheckoutReturn(token:string,returnedOrderId:string){
 const {c}=await context(token,true);const [t]=await rows<Attempt>(sql`SELECT * FROM auction_bill_checkout_attempt WHERE account_id=${c.account_id} AND bill_id=${c.bill_id}`);
 if(!t?.order_id||t.order_id!==returnedOrderId||t.content_hash!==c.content_hash)throw Error('Return does not match this invoice');return t.order_id;
}
export async function verifyBuyerCheckout(token:string,captureApproved=false,expectedOrderId?:string){
 const {view,c}=await context(token,true);const [t]=await rows<Attempt>(sql`SELECT * FROM auction_bill_checkout_attempt WHERE account_id=${c.account_id} AND bill_id=${c.bill_id}`);
 if(!t?.order_id||t.content_hash!==c.content_hash)throw Error('No matching saved checkout');
 if(expectedOrderId&&t.order_id!==expectedOrderId)throw Error('Return does not match this invoice');
 if(t.state!=='captured'&&view.status!=='pending'&&view.outstandingCents!==t.amount_cents)throw Error('Invoice amount changed; checkout needs review');
 const provider=configuredPayPalAdapter();
 const result=captureApproved?await provider.captureApprovedOrder(binding(t,c)):(await provider.inspectOrder(binding(t,c))).payment;
 if(!result)return {status:'awaiting_approval'};
 // If inputs changed while the provider completed payment, retain the real
 // verified receipt and hold the account for reconciliation instead of losing it.
 let changed=false;try{const current=await context(token,true);changed=current.c.content_hash!==t.content_hash}catch{changed=true}
 if(changed)await rows(sql`UPDATE auction_bill_account SET review_hold='Invoice changed during checkout; reconcile verified payment' WHERE id=${c.account_id}`);
 const [credit]=await rows<{event_id:number}>(sql`SELECT auction_credit_checkout(${t.id},${result.transactionRef},${result.grossCents},${result.status}) AS event_id`);
 return {status:result.status,eventId:credit.event_id};
}
