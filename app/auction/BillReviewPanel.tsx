'use client'
import { useEffect, useState } from 'react'
import { reviewBillMembershipAction, getPrivateBillReviewAction, preparePrivateBillAction, recordPrivateBillPaymentAction, resolvePrivateBillHoldAction, revokePrivateBillLinksAction } from './billing-actions'
import type { BillEvent } from '@/lib/auction-bill-model'
type Review=Awaited<ReturnType<typeof getPrivateBillReviewAction>>
export default function BillReviewPanel({auctionId,buyerId,buyerName}:{auctionId:number;buyerId:number;buyerName:string}) {
  const [review,setReview]=useState<Review|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const [path,setPath]=useState(''),[reason,setReason]=useState(''),[note,setNote]=useState('')
  const [kind,setKind]=useState<BillEvent['kind']>('receipt'),[provider,setProvider]=useState<BillEvent['provider']>('paypal')
  const [amount,setAmount]=useState(''),[transactionRef,setTransactionRef]=useState(''),[original,setOriginal]=useState('')
  const [membership,setMembership]=useState<'unknown'|'member'|'nonmember'>('unknown'),[membershipEvidence,setMembershipEvidence]=useState('')
  const [available,setAvailable]=useState(false),[confirmed,setConfirmed]=useState(false)
  useEffect(()=>{let active=true;void getPrivateBillReviewAction({auctionId,buyerId}).then(r=>{if(active)setReview(r)})
    .catch(e=>{if(active)setMessage(e instanceof Error?e.message:'Could not load bill')});return()=>{active=false}},[auctionId,buyerId])
  async function refresh(){setReview(await getPrivateBillReviewAction({auctionId,buyerId}))}
  async function run(action:()=>Promise<unknown>,success:string){
    if(busy)return
    setBusy(true);setMessage('')
    try{await action();await refresh();setMessage(success)}catch(e){setMessage(e instanceof Error?e.message:'Bill action failed')}
    finally{setBusy(false)}
  }
  function durableKey(kind:string){
    const key='tcb-private-bill-'+kind+'-'+auctionId+'-'+buyerId
    try{let value=localStorage.getItem(key);if(!value){value=crypto.randomUUID();localStorage.setItem(key,value)}return value}
    catch{return crypto.randomUUID()}
  }
  function clearKey(kind:string){try{localStorage.removeItem('tcb-private-bill-'+kind+'-'+auctionId+'-'+buyerId)}catch{}}
  const bill=review?.bill
  return <section style={{border:'1px solid #bccdd4',padding:20,borderRadius:12,margin:'20px 0',background:'#fff'}}>
    <h3>Private bill · {buyerName}</h3>
    <p>Buyer #{buyerId}. This custom bill uses stable identity. Creating or opening its link does not create a provider invoice or confirm payment.</p>
    <details><summary>Verify private-group eligibility</summary><select value={membership} onChange={e=>setMembership(e.target.value as typeof membership)}><option value="unknown">Not reviewed</option><option value="member">Verified member</option><option value="nonmember">Verified nonmember</option></select><textarea aria-label="Membership evidence" value={membershipEvidence} onChange={e=>setMembershipEvidence(e.target.value)} /><button disabled={busy||membership==="unknown"||membershipEvidence.trim().length<10} onClick={()=>void run(()=>reviewBillMembershipAction({auctionId,buyerId,status:membership as "member"|"nonmember",evidenceNote:membershipEvidence}),"Membership review saved")}>Save verified eligibility</button></details>
    {review?.problem?<p role="alert">{review.problem}</p>:null}
    {bill?<p><strong>{bill.reference} · revision {bill.revision}</strong><br />
      {(bill.due_cents/100).toFixed(2)} USD total · {((review.totals?.creditedCents??0)/100).toFixed(2)} recorded · {((review.totals?.outstandingCents??0)/100).toFixed(2)} outstanding</p>:null}
    {review?.changed?<p>Items or package inputs changed. The previous link cannot request payment until a new revision is reviewed.</p>:null}
    <label>Adjustment or revision reason<input style={{display:'block',width:'100%',boxSizing:'border-box',minHeight:46}} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required when changing an existing bill" /></label>
    <button style={{minHeight:46,margin:'12px 6px 12px 0'}} disabled={busy||!review?.ready} onClick={()=>void run(async()=>{
      const result=await preparePrivateBillAction({auctionId,buyerId,requestKey:durableKey('prepare'),expectedRevision:review?.revision??0,adjustmentReason:reason})
      setPath(result.path);clearKey('prepare')
    },'Private link prepared. No customer message or provider invoice was sent.')}>{bill?'Prepare or reuse private bill link':'Prepare private bill link'}</button>
    {path?<><a href={path} target="_blank" rel="noreferrer noopener">Open buyer bill</a>
      <button style={{minHeight:46,margin:8}} onClick={()=>void navigator.clipboard.writeText(location.origin+path).then(()=>setMessage('Private link copied. Keep it buyer-specific and private.')).catch(()=>setMessage('Clipboard unavailable; use Open buyer bill.'))}>Copy private link</button></>:null}
    {bill?<button style={{minHeight:46}} disabled={busy} onClick={()=>void run(async()=>{await revokePrivateBillLinksAction({billId:bill.id});setPath('')},'All links to this revision revoked.')}>Revoke this revision’s links</button>:null}
    <details><summary style={{minHeight:46,cursor:'pointer'}}>Record actual payment evidence</summary>
      <p>Review the actual provider transaction first. A link click, redirect, screenshot or payment notice alone is insufficient. These entries change only the local bill ledger.</p>
      <label>Event<select style={{display:'block',minHeight:46}} value={kind} onChange={e=>setKind(e.target.value as BillEvent['kind'])}>
        <option value="receipt">Completed receipt</option><option value="pending">Pending payment</option><option value="settlement">Pending payment completed</option>
        <option value="reject">Pending payment failed</option><option value="refund">Confirmed refund</option><option value="reversal">Confirmed reversal</option></select></label>
      <label>Provider<select style={{display:'block',minHeight:46}} value={provider} onChange={e=>setProvider(e.target.value as BillEvent['provider'])}><option value="paypal">PayPal</option><option value="venmo">Venmo</option><option value="other">Other</option></select></label>
      <label>Actual amount (USD)<input style={{display:'block',minHeight:46}} value={amount} inputMode="decimal" onChange={e=>setAmount(e.target.value)} /></label>
      <label>Provider transaction reference<input style={{display:'block',minHeight:46}} value={transactionRef} onChange={e=>setTransactionRef(e.target.value)} autoComplete="off" /></label>
      <label>Original payment event<select style={{display:'block',minHeight:46}} value={original} onChange={e=>setOriginal(e.target.value)}><option value="">None — new receipt</option>
        {review?.events.filter(e=>e.kind==='receipt'||e.kind==='pending').map(e=><option key={e.id} value={e.id}>#{e.id} {e.provider} {e.transaction_ref} {(e.amount_cents/100).toFixed(2)}</option>)}</select></label>
      <label>Evidence reviewed<textarea style={{display:'block',width:'100%',boxSizing:'border-box'}} value={note} onChange={e=>setNote(e.target.value)} /></label>
      <label style={{display:'block',padding:12}}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />I verified recipient, reference, currency, actual amount and status in the provider account</label>
      <label style={{display:'block',padding:12}}><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)} />These funds are available to spend (separate from payment completion)</label>
      <button style={{minHeight:46}} disabled={busy||!bill||!confirmed} onClick={()=>void run(async()=>{
        await recordPrivateBillPaymentAction({billId:bill!.id,requestKey:durableKey('payment'),kind,provider,amount,transactionRef,currency:'USD',
          originalEventId:original?Number(original):undefined,fundsAvailable:available,evidenceNote:note,confirmed})
        clearKey('payment');setConfirmed(false)
      },'Actual evidence recorded. No provider payment or refund was executed.')}>Record reviewed payment</button>
    </details>
    {bill?<details><summary style={{minHeight:46}}>Resolve duplicate-billing or refund hold</summary>
      <p>Check existing Shopify/PayPal invoices and transactions. This records your review; it does not cancel or change any external invoice.</p>
      <button style={{minHeight:46}} disabled={busy||note.trim().length<10} onClick={()=>void run(()=>resolvePrivateBillHoldAction({billId:bill.id,note,expectedEventCount:review?.events.length??0}),'Review recorded. Recheck the buyer bill before sharing.')}>Record manual hold review using evidence note above</button></details>:null}
    {review?.events.length?<details><summary style={{minHeight:46}}>Payment ledger ({review.events.length})</summary><ul>{review.events.map(e=><li key={e.id}>#{e.id} {e.kind} · {e.provider} · {e.transaction_ref} · actual {(e.amount_cents/100).toFixed(2)} USD · credited {(e.credit_cents/100).toFixed(2)} USD</li>)}</ul></details>:null}
    {message?<p role="status">{message}</p>:null}
  </section>
}

