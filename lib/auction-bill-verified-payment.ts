// Future adapter boundary only. No credentials, provider calls or webhook trust.
export type VerifiedProviderPayment={provider:'paypal'|'venmo';transactionRef:string;currency:'USD';grossCents:number;
  status:'completed'|'pending'|'refunded'|'reversed';fundsAvailable:boolean;billReference:string}
export interface VerifiedPaymentAdapter {lookup(transactionRef:string):Promise<VerifiedProviderPayment>}
export const disabledPaymentAdapter:VerifiedPaymentAdapter={
  async lookup(){throw new Error('Automatic payment verification is not configured; review actual provider evidence manually')}
}
