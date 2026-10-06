'use client'
import {useState} from 'react'
import {inspectLiveDraft,createLiveDraft} from './actions'
import type {LiveDraftPlan} from '@/lib/paypal-live-drafts'

export default function DraftBatch(){
 const[raw,setRaw]=useState(''),[busy,setBusy]=useState(false),[results,setResults]=useState<Record<string,unknown>[]>([]),[error,setError]=useState('');
 async function run(create:boolean){setError('');setBusy(true);setResults([]);try{const plans=JSON.parse(raw) as LiveDraftPlan[];if(!Array.isArray(plans)||plans.length>30)throw Error('Invalid reviewed manifest');for(const p of plans){const response=await(create?createLiveDraft:inspectLiveDraft)(raw,p.reference);if(!response.ok)throw Error(p.reference+': '+response.error);setResults(r=>[...r,{...(response.result??{status:'NOT_CREATED'}),reference:p.reference}]);}}catch(e){setError(e instanceof Error?e.message:'Stopped for review')}finally{setBusy(false)}}
 return <main style={{maxWidth:900,margin:'2rem auto',padding:'1rem'}}><h1>October 5 PayPal drafts</h1><p>Review and save unsent invoices in the existing PayPal account. Existing invoices are reused. No customer email or payment request is sent.</p><label htmlFor="reviewed-manifest">Reviewed buyer manifest</label><textarea id="reviewed-manifest" value={raw} onChange={e=>setRaw(e.target.value)} disabled={busy} rows={8} style={{display:'block',width:'100%'}}/><p><button disabled={busy||!raw} onClick={()=>run(false)}>Check existing drafts</button>{' '}<button disabled={busy||!raw} onClick={()=>run(true)}>Save ready buyers as unsent drafts</button></p>{busy&&<p role="status">Preparing drafts… Leave this page open.</p>}{error&&<p role="alert">{error} Stopped. Review the account before retrying.</p>}<pre aria-label="Draft results" style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(results,null,2)}</pre></main>
}

