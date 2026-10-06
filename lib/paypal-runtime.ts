import {createPayPalOrdersAdapter} from './paypal-orders-adapter'
export function configuredPayPalAdapter(){
 if(process.env.AUCTION_PAYPAL_CHECKOUT_ENABLED!=='true')throw Error('PayPal checkout is not enabled');
 const environment=process.env.PAYPAL_ENVIRONMENT;
 if(environment!=='sandbox'&&environment!=='live')throw Error('PayPal environment is not configured');
 return createPayPalOrdersAdapter({environment,clientId:process.env.PAYPAL_CLIENT_ID??'',clientSecret:process.env.PAYPAL_CLIENT_SECRET??'',merchantId:process.env.PAYPAL_MERCHANT_ID??'',returnUrl:process.env.PAYPAL_RETURN_URL??'',cancelUrl:process.env.PAYPAL_CANCEL_URL??'',writesEnabled:process.env.PAYPAL_WRITES_ENABLED==='true'});
}
