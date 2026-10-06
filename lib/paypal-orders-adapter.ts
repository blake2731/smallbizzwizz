// Server-only integration boundary. No environment reads, credential logging or startup calls.
// The deployment must inject existing app credentials securely; writes default disabled.
export type PayPalBinding={billReference:string;attemptReference:string;amountCents:number;orderId?:string}
type Money={currency_code?:string;value?:string}
type Capture={id?:string;status?:string;amount?:Money;final_capture?:boolean}
type Unit={reference_id?:string;custom_id?:string;invoice_id?:string;amount?:Money;payee?:{merchant_id?:string};payments?:{captures?:Capture[]}}
type Order={id?:string;status?:string;intent?:string;purchase_units?:Unit[];links?:{rel?:string;href?:string;method?:string}[]}
export type PayPalVerifiedResult={provider:'paypal';orderId:string;transactionRef:string;billReference:string;currency:'USD';grossCents:number;status:'completed'|'pending';fundsAvailable:false}
export type PayPalConfig={environment:'sandbox'|'live';clientId:string;clientSecret:string;merchantId:string;returnUrl:string;cancelUrl:string;writesEnabled?:boolean}
export type PayPalTransport=(url:string,init:RequestInit)=>Promise<Response>
function money(cents:number){if(!Number.isSafeInteger(cents)||cents<=0||cents>100000000)throw Error('Invalid finalized invoice amount');return (cents/100).toFixed(2)}
function cents(value:string|undefined){if(!value||!/^\d{1,8}\.\d{2}$/.test(value))throw Error('Invalid provider amount');const [d,c]=value.split('.');return Number(d)*100+Number(c)}
function reference(value:string){if(!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw Error('Invalid invoice reference');return value}
function binding(b:PayPalBinding){reference(b.billReference);reference(b.attemptReference);money(b.amountCents)}
function orderId(value:string){if(!/^[A-Z0-9]{8,32}$/.test(value))throw Error('Invalid order identifier');return value}
function callback(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('Checkout callbacks require trusted HTTPS URLs');return url.href}
export function createPayPalOrdersAdapter(config:PayPalConfig,transport:PayPalTransport=fetch){
 if(!['sandbox','live'].includes(config.environment)||!config.clientId||!config.clientSecret||!config.merchantId)throw Error('Existing PayPal app configuration is incomplete');
 const base=config.environment==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
 const returnUrl=callback(config.returnUrl),cancelUrl=callback(config.cancelUrl);
 const allowedHosts=config.environment==='live'?['www.paypal.com','paypal.com']:['www.sandbox.paypal.com','sandbox.paypal.com'];
 async function send(url:string,init:RequestInit){try{return await transport(url,init)}catch{throw Error('PayPal transport failed; reconcile the existing order before retrying')}}
 async function token(){
  const r=await send(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('PayPal authentication failed');
  let data:{access_token?:string};try{data=await r.json()}catch{throw Error('Invalid PayPal authentication response')}
  if(!data.access_token)throw Error('Invalid PayPal authentication response');return data.access_token;
 }
 async function request(path:string,method:'GET'|'POST',payload?:unknown,key?:string):Promise<Order>{
  const access=await token();const r=await send(base+path,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',Prefer:'return=representation',...(key?{'PayPal-Request-Id':key}:{})},...(payload?{body:JSON.stringify(payload)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('PayPal request failed; reconcile the existing order before retrying');
  try{return await r.json()}catch{throw Error('Invalid PayPal order response')}
 }
 function match(order:Order,b:PayPalBinding){
  binding(b);if(!order.id||(b.orderId&&order.id!==b.orderId)||order.intent!=='CAPTURE'||order.purchase_units?.length!==1)throw Error('Order does not match this invoice');
  const u=order.purchase_units[0];
  if(u.reference_id!==b.billReference||u.custom_id!==b.billReference||u.invoice_id!==b.attemptReference||u.payee?.merchant_id!==config.merchantId||u.amount?.currency_code!=='USD'||cents(u.amount.value)!==b.amountCents)throw Error('Order does not match this invoice');
  return u;
 }
 function verified(order:Order,b:PayPalBinding):PayPalVerifiedResult|null{
  const u=match(order,b),captures=u.payments?.captures??[];
  if(!captures.length)return null;
  if(captures.length!==1)throw Error('Multiple captures need reconciliation');
  const c=captures[0];
  if(!c.id||c.amount?.currency_code!=='USD'||cents(c.amount.value)!==b.amountCents||c.final_capture!==true)throw Error('Capture does not match this invoice');
  if(c.status!=='COMPLETED'&&c.status!=='PENDING')throw Error('Capture refund, reversal or failure needs reconciliation');
  if(c.status==='COMPLETED'&&order.status!=='COMPLETED')throw Error('Order is not completed');
  return {provider:'paypal',orderId:order.id!,transactionRef:c.id,billReference:b.billReference,currency:'USD',grossCents:b.amountCents,status:c.status==='COMPLETED'?'completed':'pending',fundsAvailable:false};
 }
 return {
  async createOrder(b:PayPalBinding){
   binding(b);if(b.orderId)throw Error('Reuse and reconcile the saved order');if(!config.writesEnabled)throw Error('PayPal provider writes are disabled');
   const order=await request('/v2/checkout/orders','POST',{intent:'CAPTURE',purchase_units:[{reference_id:b.billReference,custom_id:b.billReference,invoice_id:b.attemptReference,amount:{currency_code:'USD',value:money(b.amountCents)},payee:{merchant_id:config.merchantId}}],payment_source:{paypal:{experience_context:{brand_name:'The Crafty Brother',user_action:'PAY_NOW',return_url:returnUrl,cancel_url:cancelUrl}}}},'create-'+b.attemptReference);
   match(order,b);orderId(order.id!);
   if(!['CREATED','PAYER_ACTION_REQUIRED'].includes(order.status??''))throw Error('Order requires reconciliation');
   const href=order.links?.find(l=>['payer-action','approve'].includes(l.rel??'')&&(!l.method||l.method==='GET'))?.href;
   if(!href)throw Error('PayPal approval link is unavailable');const url=new URL(href);
   if(url.protocol!=='https:'||!allowedHosts.includes(url.hostname)||url.username||url.password||url.hash)throw Error('Unexpected approval destination');
   return {orderId:order.id!,approvalUrl:url.href,billReference:b.billReference,attemptReference:b.attemptReference,amountCents:b.amountCents};
  },
  async inspectOrder(b:PayPalBinding){binding(b);if(!b.orderId)throw Error('A saved order is required');const order=await request('/v2/checkout/orders/'+orderId(b.orderId),'GET');const result=verified(order,b);return {orderId:order.id!,status:order.status,payment:result};},
  async captureApprovedOrder(b:PayPalBinding){
   binding(b);if(!b.orderId)throw Error('A saved order is required');
   const order=await request('/v2/checkout/orders/'+orderId(b.orderId),'GET');const existing=verified(order,b);if(existing)return existing;
   if(order.status!=='APPROVED')throw Error('Buyer approval is required before capture');
   if(!config.writesEnabled)throw Error('PayPal provider writes are disabled');
   const result=verified(await request('/v2/checkout/orders/'+orderId(b.orderId)+'/capture','POST',{},'capture-'+b.attemptReference),b);
   if(!result)throw Error('Capture is not verified; reconcile this order');return result;
  }
 };
}
