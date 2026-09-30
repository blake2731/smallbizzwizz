export const PIRATE_SHIP_ORIGIN = 'https://ship.pirateship.com'

export type PirateShipQuote = {
  auctionId: number
  buyerId: number
  packageId: number
  packageNumber: number
  packagingType: 'box' | 'envelope'
  weightOunces: number
  lengthHundredths: number
  widthHundredths: number
  heightHundredths: number | null
  amountCents: number
  provider: string
  service: string
}

export class PirateShipQuoteError extends Error {}

export function validatePirateShipQuote(value: unknown): PirateShipQuote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PirateShipQuoteError('The captured shipping quote is invalid.')
  }
  const input = value as Record<string, unknown>
  const positive = (key: string, max = 1000000) => {
    const n = input[key]
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0 || n > max) {
      throw new PirateShipQuoteError('The captured shipping quote is invalid.')
    }
    return n
  }
  const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
  const service = typeof input.service === 'string' ? input.service.trim() : ''
  const amountCents = input.amountCents
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > 1000000) {
    throw new PirateShipQuoteError('Enter a valid shipping amount.')
  }
  const packagingType = input.packagingType
  if (packagingType !== 'box' && packagingType !== 'envelope') throw new PirateShipQuoteError('Choose Box or Envelope before quoting.')
  if (!['USPS', 'UPS', 'FedEx', 'DHL', 'Pirate Ship'].includes(provider) || service.length > 80 || /[<>\r\n]/.test(service)) {
    throw new PirateShipQuoteError('The captured shipping service is invalid.')
  }
  return {
    auctionId: positive('auctionId'), buyerId: positive('buyerId'),
    packageId: positive('packageId'), packageNumber: positive('packageNumber', 100), packagingType,
    weightOunces: positive('weightOunces', 10000),
    lengthHundredths: positive('lengthHundredths', 99900),
    widthHundredths: positive('widthHundredths', 99900),
    heightHundredths: packagingType === 'envelope' && input.heightHundredths === null ? null : positive('heightHundredths', 99900),
    amountCents, provider, service,
  }
}

export function assertPirateShipPackageMatches(quote: PirateShipQuote, pkg: {
  id: number; buyerId: number; packageNumber: number; status: string; packagingType: string;
  weightOunces: number | null; lengthHundredths: number | null;
  widthHundredths: number | null; heightHundredths: number | null;
  shippingCents: number | null; shippoTransactionId: string | null; shippoLabelUrl: string | null;
}) {
  if (pkg.id !== quote.packageId || pkg.buyerId !== quote.buyerId ||
      pkg.packageNumber !== quote.packageNumber || pkg.status !== 'packed' ||
      pkg.packagingType !== quote.packagingType ||
      pkg.weightOunces !== quote.weightOunces ||
      pkg.lengthHundredths !== quote.lengthHundredths ||
      pkg.widthHundredths !== quote.widthHundredths ||
      pkg.heightHundredths !== quote.heightHundredths) {
    throw new PirateShipQuoteError('This box changed. Fill it again with the current measurements before capturing a price.')
  }
  if (pkg.shippoTransactionId || pkg.shippoLabelUrl) {
    throw new PirateShipQuoteError('This box already has a purchased label. Review its shipping in the app.')
  }
  if (pkg.shippingCents !== null && pkg.shippingCents !== quote.amountCents) {
    throw new PirateShipQuoteError('This box already has a different shipping cost. Review it in the app before changing it.')
  }
}

export function isPirateShipMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, opener: Window | null, channel: string) {
  const message = event.data
  return Boolean(opener && event.origin === PIRATE_SHIP_ORIGIN && event.source === opener &&
    message && typeof message === 'object' && message.channel === channel &&
    /^[0-9a-f-]{36}$/i.test(channel) && message.type === 'crafty-shipping-quote' &&
    typeof message.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(message.requestId))
}
