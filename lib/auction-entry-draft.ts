export type AuctionEntryDraft = {
  itemName: string; buyerName: string; price: string; keepBuyer: boolean; repeatSale: boolean;
  auctionItemName: string; startingPrice: string; bidderName: string; bid: string;
  customerId: number | null; bidderCustomerId: number | null;
  contactEmail: string; contactPhone: string; contactCity: string; contactNotes: string;
  creationKey: string; mode: 'quick' | 'auction';
}

export function restoreEntryDraft(raw: string | null): Partial<AuctionEntryDraft> {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const result: Partial<AuctionEntryDraft> = {}
    for (const key of ['itemName', 'buyerName', 'price', 'auctionItemName', 'startingPrice', 'bidderName', 'bid',
      'contactEmail', 'contactPhone', 'contactCity', 'contactNotes', 'creationKey'] as const) {
      if (typeof value[key] === 'string') result[key] = value[key]
    }
    for (const key of ['keepBuyer', 'repeatSale'] as const) result[key] = value[key] === true
    for (const key of ['customerId', 'bidderCustomerId'] as const) {
      result[key] = Number.isSafeInteger(value[key]) && value[key] > 0 ? value[key] : null
    }
    if (value.mode === 'quick' || value.mode === 'auction') result.mode = value.mode
    return result
  } catch { return {} }
}

export function customerCue(customer: {id: number; email?: string | null; city?: string | null}) {
  return customer.email || customer.city || '#' + customer.id
}
