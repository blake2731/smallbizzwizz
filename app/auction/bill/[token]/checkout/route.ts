import {beginBuyerCheckout} from '@/lib/auction-checkout'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Invalid checkout origin',{status:403});
 const {token}=await params;if(!/^[a-f0-9]{64}$/.test(token))return new Response('Invoice unavailable',{status:404});
 try{const result=await beginBuyerCheckout(token);return new Response(null,{status:303,headers:{Location:result.approvalUrl,'Set-Cookie':`tcb_checkout=${token}; Path=/auction/paypal/return; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})}
 catch{return new Response('Your invoice needs seller review before checkout. No new payment is confirmed.',{status:409,headers:{'Cache-Control':'no-store'}})}
}
