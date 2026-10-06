export type MembershipReview={status:'unknown'|'member'|'nonmember';evidence:string;reviewedBy:string}
export type CheckoutOption={label:string;url:string;amountCents:number;currency:'USD';billReference:string;verification:'provider';}
export function finalizedAmounts(subtotalCents:number,shippingCents:number|null,membership:MembershipReview){
 if(!Number.isSafeInteger(subtotalCents)||subtotalCents<0)throw Error('Invalid merchandise amount')
 if(shippingCents===null||!Number.isSafeInteger(shippingCents)||shippingCents<0)throw Error('Shipping is pending')
 if(membership.status==='unknown'||!membership.evidence.trim()||!membership.reviewedBy.trim())throw Error('Membership review is pending')
 const discountCents=membership.status==='member'?Math.round(subtotalCents*.1):0;
 const dueCents=subtotalCents-discountCents+shippingCents;
 if(!Number.isSafeInteger(dueCents)||dueCents>100000000)throw Error('Amount out of range')
 return {subtotalCents,discountCents,shippingCents,dueCents};
}
export function checkoutMatches(option:CheckoutOption,reference:string,amountCents:number){
 try{return option.verification==='provider'&&option.currency==='USD'&&option.amountCents===amountCents&&option.billReference===reference&&new URL(option.url).protocol==='https:'}catch{return false}
}
