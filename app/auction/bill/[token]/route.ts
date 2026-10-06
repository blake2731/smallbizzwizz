import { readPrivateBill } from '@/lib/auction-bills'
import { privateBillResponse } from '@/lib/auction-bill-page'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params
  try{return privateBillResponse(await readPrivateBill(token),process.env.AUCTION_PAYPAL_CHECKOUT_ENABLED==='true'?'/auction/bill/'+token+'/checkout':undefined)}
  catch{return privateBillResponse(null)}
}
