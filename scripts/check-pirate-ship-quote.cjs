const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const ts = require('typescript')
const mod = { exports: {} }
new Function('module', 'exports', ts.transpileModule(readFileSync('lib/pirate-ship-quote.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports)
const { validatePirateShipQuote, assertPirateShipPackageMatches, isPirateShipMessage } = mod.exports
const quote = { auctionId: 1, buyerId: 2, packageId: 3, packageNumber: 2, packagingType: 'box', weightOunces: 391, lengthHundredths: 2200, widthHundredths: 1500, heightHundredths: 1300, amountCents: 1234, provider: 'Pirate Ship', service: 'Manually entered quote' }
const pkg = { id: 3, buyerId: 2, packageNumber: 2, status: 'packed', packagingType: 'box', weightOunces: 391, lengthHundredths: 2200, widthHundredths: 1500, heightHundredths: 1300, shippingCents: null, shippoTransactionId: null, shippoLabelUrl: null }
assert.equal(validatePirateShipQuote(quote).amountCents, 1234)
assert.equal(validatePirateShipQuote({ ...quote, amountCents: 0 }).amountCents, 0)
for (const amountCents of [-1, 1.2, Infinity, '12.34']) assert.throws(() => validatePirateShipQuote({ ...quote, amountCents }))
const envelope = validatePirateShipQuote({ ...quote, packagingType: 'envelope', heightHundredths: null })
assertPirateShipPackageMatches(envelope, { ...pkg, packagingType: 'envelope', heightHundredths: null })
assertPirateShipPackageMatches(quote, pkg)
assertPirateShipPackageMatches(quote, { ...pkg, shippingCents: 1234 })
for (const change of [{ shippingCents: 999 }, { packageNumber: 1 }, { weightOunces: 375 }, { packagingType: 'envelope' }, { status: 'unpacked' }, { shippoLabelUrl: 'purchased-label' }]) assert.throws(() => assertPirateShipPackageMatches(quote, { ...pkg, ...change }))
const opener = {}
const channel = '11111111-1111-4111-8111-111111111111'
const event = { origin: 'https://ship.pirateship.com', source: opener, data: { type: 'crafty-shipping-quote', channel, requestId: '22222222-2222-4222-8222-222222222222', quote } }
assert.equal(isPirateShipMessage(event, opener, channel), true)
for (const change of [{ origin: 'https://example.com' }, { source: {} }, { data: { ...event.data, channel: 'wrong-channel' } }]) assert.equal(isPirateShipMessage({ ...event, ...change }, opener, channel), false)
console.log('Shipping quote checks passed: decimals, envelopes, zero shipping, retries, stale packages, purchased labels, and message identity.')
