import {createPayPalOrdersAdapter} from './paypal-orders-adapter'
export function configuredPayPalAdapter(){
 if(process.env.AUCTION_PAYPAL_CHECKOUT_ENABLED!=='true')throw Error('PayPal checkout is not enabled');
 const environment=process.env.PAYPAL_ENVIRONMENT;
 if(environment!=='sandbox'&&environment!=='live')throw Error('PayPal environment is not configured');
 if(process.env.VERCEL_GIT_COMMIT_REF==='feature/private-invoices'){
  if(process.env.VERCEL_ENV!=='preview'||environment!=='sandbox')throw Error('Private invoice rehearsal requires PayPal Sandbox');
  let target:URL;try{target=new URL(process.env.DATABASE_URL??'')}catch{throw Error('Private invoice rehearsal database is unavailable')}
  if(!['ep-withered-queen-aqf01v2f.c-8.us-east-1.aws.neon.tech','ep-withered-queen-aqf01v2f-pooler.c-8.us-east-1.aws.neon.tech'].includes(target.hostname)||decodeURIComponent(target.pathname.slice(1))!=='auction_invoice_sandbox')throw Error('Private invoice rehearsal requires the isolated test database');
  const host='smallbizzwizz-git-feature-privat-e042a5-blake-schmitts-projects.vercel.app';
  for(const key of ['PAYPAL_RETURN_URL','PAYPAL_CANCEL_URL']){let callback:URL;try{callback=new URL(process.env[key]??'')}catch{throw Error('Private invoice rehearsal callback is unavailable')};if(callback.protocol!=='https:'||callback.hostname!==host||callback.pathname!=='/auction/paypal/return')throw Error('Private invoice rehearsal requires its protected test callback')}
 }
 return createPayPalOrdersAdapter({environment,clientId:process.env.PAYPAL_CLIENT_ID??'',clientSecret:process.env.PAYPAL_CLIENT_SECRET??'',merchantId:process.env.PAYPAL_MERCHANT_ID??'',returnUrl:process.env.PAYPAL_RETURN_URL??'',cancelUrl:process.env.PAYPAL_CANCEL_URL??'',writesEnabled:process.env.PAYPAL_WRITES_ENABLED==='true'});
}
