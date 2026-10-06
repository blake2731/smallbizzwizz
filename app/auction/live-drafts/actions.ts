'use server'
import {auth} from '@clerk/nextjs/server'
import {createLiveDraftAdapter,validateLiveManifest} from '@/lib/paypal-live-drafts'

async function reviewed(raw:string,reference:string){
 const {userId}=await auth();if(userId!=='user_3DIBttvEBM7MAjqDQf8nO1U3xIS')throw Error('Unauthorized invoice owner');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='feature/private-invoices'||process.env.PAYPAL_LIVE_DRAFTS_ENABLED!=='true')throw Error('Live draft-only workflow is disabled');
 const merchantEmail=process.env.PAYPAL_LIVE_INVOICE_MERCHANT_EMAIL??'';
 const plans=validateLiveManifest(raw,process.env.PAYPAL_LIVE_INVOICE_MANIFEST_SHA256??'',merchantEmail);const plan=plans.find(p=>p.reference===reference);if(!plan)throw Error('Buyer is outside the approved manifest');
 const adapter=createLiveDraftAdapter({clientId:process.env.PAYPAL_LIVE_INVOICE_CLIENT_ID??'',clientSecret:process.env.PAYPAL_LIVE_INVOICE_CLIENT_SECRET??'',merchantEmail,anchorId:'INV2-BNTD-CBFA-YHPK-YRP5',enabled:true});return{plan,adapter};
}
export async function inspectLiveDraft(raw:string,reference:string){try{const{plan,adapter}=await reviewed(raw,reference);return{ok:true as const,result:await adapter.reconcile(plan)}}catch(e){return{ok:false as const,error:e instanceof Error?e.message:'Draft review failed'}}}
export async function createLiveDraft(raw:string,reference:string){try{const{plan,adapter}=await reviewed(raw,reference);return{ok:true as const,result:await adapter.createDraft(plan)}}catch(e){return{ok:false as const,error:e instanceof Error?e.message:'Draft preparation failed'}}}
