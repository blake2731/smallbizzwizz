import { auth } from '@clerk/nextjs/server'
import { billReconciliationCsv } from '@/lib/auction-bills'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request) {
  const {userId}=await auth()
  if(!userId)return new Response('Unauthorized',{status:401,headers:{'Cache-Control':'no-store'}})
  const value=new URL(request.url).searchParams.get('auction')
  if(!value||!/^\d+$/.test(value))return new Response('Invalid auction',{status:400})
  try {
    return new Response(await billReconciliationCsv(userId,Number(value)),{headers:{
      'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="auction-bill-reconciliation.csv"',
      'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})
  } catch{return new Response('Export unavailable',{status:404,headers:{'Cache-Control':'no-store'}})}
}
