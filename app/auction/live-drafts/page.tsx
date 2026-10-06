import {auth} from '@clerk/nextjs/server'
import {notFound} from 'next/navigation'
import DraftBatch from './DraftBatch'
export const dynamic='force-dynamic'
export const maxDuration=60
export const metadata={title:'October 5 unsent PayPal drafts',robots:{index:false,follow:false}}
export default async function LiveDraftPage(){const{userId}=await auth();if(userId!=='user_3DIBttvEBM7MAjqDQf8nO1U3xIS'||process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='feature/private-invoices'||process.env.PAYPAL_LIVE_DRAFTS_ENABLED!=='true')notFound();return <DraftBatch/>}
