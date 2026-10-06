'use server'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { reviewBillMembership, preparePrivateBill, getPrivateBillReview, recordPrivateBillPayment, resolvePrivateBillHold, revokePrivateBillLinks } from '@/lib/auction-bills'
async function owner(){const {userId}=await auth();if(!userId)throw new Error('Unauthorized');return userId}
export async function preparePrivateBillAction(input:Parameters<typeof preparePrivateBill>[1]){
  const result=await preparePrivateBill(await owner(),input);revalidatePath('/auction');return result
}
export async function getPrivateBillReviewAction(input:{auctionId:number;buyerId:number}){
  return getPrivateBillReview(await owner(),input.auctionId,input.buyerId)
}
export async function recordPrivateBillPaymentAction(input:Parameters<typeof recordPrivateBillPayment>[1]){
  const result=await recordPrivateBillPayment(await owner(),input);revalidatePath('/auction');return result
}
export async function resolvePrivateBillHoldAction(input:Parameters<typeof resolvePrivateBillHold>[1]){
  return resolvePrivateBillHold(await owner(),input)
}
export async function revokePrivateBillLinksAction(input:{billId:number}){
  return revokePrivateBillLinks(await owner(),input.billId)
}

export async function reviewBillMembershipAction(input:Parameters<typeof reviewBillMembership>[1]){return reviewBillMembership(await owner(),input)}
