import {buyerCheckoutReturn,verifyBuyerCheckout} from '@/lib/auction-checkout'
import {readPrivateBill} from '@/lib/auction-bills'
export const runtime='nodejs'
export const dynamic='force-dynamic'
function privateToken(request:Request){const value=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('tcb_checkout='))?.slice('tcb_checkout='.length);if(!value||!/^[a-f0-9]{64}$/.test(value))throw Error('Checkout session unavailable');return value;}
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"};
export async function GET(request:Request){
 try{const token=privateToken(request);const view=await readPrivateBill(token);if(!view||view.reviewMode||!['unpaid','partial','pending','paid'].includes(view.status))throw Error('Invoice needs review');
 const orderId=await buyerCheckoutReturn(token,new URL(request.url).searchParams.get('token')??'');
 if(new URL(request.url).searchParams.get('cancel')==='1')return new Response(null,{status:303,headers:{...headers,Location:'/auction/bill/'+token,'Set-Cookie':'tcb_checkout_order=; Path=/auction/paypal/return; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}});
 return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your payment</title><style>body{font:18px system-ui;max-width:500px;margin:50px auto;padding:24px}button{font:inherit;padding:16px;width:100%}</style><h1>Finish your PayPal payment</h1><p>Confirm the payment you approved with PayPal. We’ll check the actual transaction before updating your invoice.</p><form method="post" action="/auction/paypal/return"><button>Complete approved payment</button></form></html>',{headers:{...headers,'Set-Cookie':`tcb_checkout_order=${orderId}; Path=/auction/paypal/return; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`}});}
 catch{return new Response('Checkout session unavailable. Return to your private invoice.',{status:404,headers})}
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Invalid checkout origin',{status:403,headers});
 try{const token=privateToken(request);const orderId=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('tcb_checkout_order='))?.slice('tcb_checkout_order='.length);if(!orderId||!/^[A-Z0-9]{8,32}$/.test(orderId))throw Error('Missing checkout return');await verifyBuyerCheckout(token,true,orderId);return new Response(null,{status:303,headers:{...headers,Location:'/auction/bill/'+token}})}
 catch{return new Response('Payment is not confirmed. Ask the seller to check this existing checkout before trying again.',{status:409,headers})}
}
