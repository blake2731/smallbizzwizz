import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'
import { buildPirateShipExport, pirateShipExportResponse, PIRATE_SHIP_HEADERS } from '../lib/auction-shipping-export.ts'

function fixture() {
  return {
    auction: { id: 42, title: 'Synthetic Auction' },
    buyers: [{
      id: 101, displayName: 'Test Recipient', email: 'recipient@example.invalid',
      shippingProfile: { address1: '1 Test Way', address2: '', city: 'Testville', state: 'VA', postalCode: '00001', countryCode: 'US', email: null, phone: '' },
      packageStatus: 'packed', packageWeightOunces: null, packageLengthHundredths: null,
      packageWidthHundredths: null, packageHeightHundredths: null,
      subtotalCents: 3001, discountCents: 300,
      packages: [
        { id: 201, buyerId: 101, packageNumber: 1, status: 'packed', weightOunces: 33, lengthHundredths: 1600, widthHundredths: 900, heightHundredths: 500 },
        { id: 202, buyerId: 101, packageNumber: 2, status: 'packed', weightOunces: 34, lengthHundredths: 1600, widthHundredths: 1300, heightHundredths: 100 },
      ],
      items: [
        { id: 301, buyerId: 101, packageId: 201, itemName: 'Test item A', priceCents: 1001, status: 'sold' },
        { id: 302, buyerId: 101, packageId: 202, itemName: 'Test item B', priceCents: 2000, status: 'sold' },
      ],
    }],
  }
}
function legacyFixture() {
  const state = fixture()
  Object.assign(state.buyers[0], {
    packages: [], packageWeightOunces: 67, packageLengthHundredths: 1600,
    packageWidthHundredths: 1300, packageHeightHundredths: 500,
  })
  state.buyers[0].items.forEach((item) => { item.packageId = null })
  return state
}
const column = (row, name) => row[PIRATE_SHIP_HEADERS.indexOf(name)]

// Load the real route source, replacing only its external imports with isolated test doubles.
// The baseline blob hash below proves that the old implementation was not rewritten for this test.
async function routeAt(path, state, userId = 'synthetic-owner') {
  globalThis.__auctionExportTest = { state, userId, calls: [], render: pirateShipExportResponse }
  const raw = await readFile(new URL(path, import.meta.url), 'utf8')
  const source = raw.replace(/^import .*\n/gm, '')
  const injected = `const auth = async () => ({userId: globalThis.__auctionExportTest.userId});
const getAuctionState = async (...args) => { globalThis.__auctionExportTest.calls.push(args); return globalThis.__auctionExportTest.state; };
const pirateShipExportResponse = (...args) => globalThis.__auctionExportTest.render(...args);
`
  const code = stripTypeScriptTypes(injected + source)
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

await test('baseline is byte identical to the inspected repository blob', async () => {
  const raw = await readFile(new URL('./fixtures/pirate-ship-route-before.txt', import.meta.url))
  const hash = createHash('sha1').update('blob ' + raw.length + '\0').update(raw).digest('hex')
  assert.equal(hash, 'd641a1d69ac604fb6d15816fa28202a39f5de08c')
})
await test('real old handler rejects two complete saved parcels; new handler exports both', async () => {
  const previous = process.env.VERCEL_ENV
  process.env.VERCEL_ENV = 'production'
  try {
    const state = fixture()
    const old = await routeAt('./fixtures/pirate-ship-route-before.txt', state)
    const before = await old.GET(new Request('https://example.invalid/auction/pirate-ship?auction=42'))
    assert.equal(before.status, 400)
    assert.match(await before.text(), /No packages are ready/)
    const current = await routeAt('../app/auction/pirate-ship/route.ts', state)
    const after = await current.GET(new Request('https://example.invalid/auction/pirate-ship?auction=42'))
    assert.equal(after.status, 200)
    assert.equal(after.headers.get('X-Export-Package-Count'), '2')
    assert.deepEqual(globalThis.__auctionExportTest.calls, [['synthetic-owner', 42]])
  } finally { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous }
})
await test('parcel dimensions and ounce remainders come from each package', () => {
  const result = buildPirateShipExport(fixture())
  assert.deepEqual(result.rows.map((row) => row.slice(9, 14)), [[2, 1, 16, 9, 5], [2, 2, 16, 13, 1]])
  assert.equal(result.errors.length, 0)
})
await test('each package receives a distinct stable ID despite package renumbering', () => {
  const state = fixture()
  const before = buildPirateShipExport(state).rows.map((row) => column(row, 'Order ID')).sort()
  state.buyers[0].packages.reverse()
  state.buyers[0].packages[0].packageNumber = 5
  const after = buildPirateShipExport(state).rows.map((row) => column(row, 'Order ID')).sort()
  assert.deepEqual(before, after)
  assert.equal(new Set(after).size, 2)
})
await test('a stale buyer summary never overrides canonical packages', () => {
  const state = fixture()
  Object.assign(state.buyers[0], { packageStatus: 'unpacked', packageWeightOunces: 9999, packageLengthHundredths: 9999 })
  assert.deepEqual(buildPirateShipExport(state).rows, buildPirateShipExport(fixture()).rows)
})
await test('legacy single parcel fallback preserves previous order key and net value', () => {
  const result = buildPirateShipExport(legacyFixture())
  assert.equal(result.rows.length, 1)
  assert.equal(column(result.rows[0], 'Order ID'), 'auction-42-buyer-101')
  assert.equal(column(result.rows[0], 'Order Value'), '27.01')
})
await test('a single canonical parcel can contain unassigned legacy items', () => {
  const state = fixture()
  state.buyers[0].packages.pop()
  state.buyers[0].items.forEach((item) => { item.packageId = null })
  const result = buildPirateShipExport(state)
  assert.equal(column(result.rows[0], 'Order Value'), '27.01')
  assert.equal(result.warnings.length, 0)
})
await test('only packed parcels are exported, even when buyer summary is packed', () => {
  const state = fixture()
  state.buyers[0].packages[1].status = 'unpacked'
  const result = buildPirateShipExport(state)
  assert.equal(result.rows.length, 1)
  assert.equal(result.skipped.length, 1)
  assert.equal(column(result.rows[0], 'Order Value'), '9.01')
})
await test('known Shippo purchase, label, or tracking evidence prevents that parcel being reexported', () => {
  for (const field of ['shippoTransactionId', 'shippoLabelUrl', 'shippoTrackingNumber']) {
    const state = fixture()
    state.buyers[0].packages[0][field] = 'synthetic-record'
    assert.equal(buildPirateShipExport(state).rows.length, 1, field)
  }
})
await test('buyer level Shopify label evidence is held without guessing which parcel it covers', () => {
  for (const field of ['shopifyLabelPurchasedAt', 'shopifyLabelPurchaseResultId', 'shopifyLabelUrl']) {
    const state = fixture()
    state.buyers[0][field] = 'synthetic-record'
    const result = buildPirateShipExport(state)
    assert.equal(result.rows.length, 0, field)
    assert.match(result.skipped[0].reason, /Shopify label/)
  }
})
await test('missing or whitespace address fields remain excluded, including pickup style records', () => {
  for (const field of ['address1', 'city', 'state', 'postalCode']) {
    const state = fixture()
    state.buyers[0].shippingProfile[field] = '  '
    assert.equal(buildPirateShipExport(state).rows.length, 0, field)
  }
  const state = fixture(); state.buyers[0].shippingProfile = null
  assert.equal(buildPirateShipExport(state).rows.length, 0)
})
await test('bad measurements on a packed parcel return an explicit error instead of a partial CSV', async () => {
  for (const field of ['weightOunces', 'lengthHundredths', 'widthHundredths', 'heightHundredths']) {
    for (const value of [null, 0, -1, NaN, Infinity, 1.5]) {
      const state = fixture(); state.buyers[0].packages[1][field] = value
      const response = pirateShipExportResponse(state)
      assert.equal(response.status, 422, field + ' ' + value)
      assert.equal(response.headers.get('Content-Disposition'), null)
    }
  }
})
await test('canonical bad measurement does not fall back to stale buyer measurements', () => {
  const state = legacyFixture()
  state.buyers[0].packages = fixture().buyers[0].packages
  state.buyers[0].packages[0].weightOunces = null
  assert.equal(pirateShipExportResponse(state).status, 422)
})
await test('wrong owner, duplicate parcel, and duplicate package number stop the export', () => {
  for (const mutate of [
    (s) => { s.buyers[0].packages[1].buyerId = 999 },
    (s) => { s.buyers[0].packages[1].id = 201 },
    (s) => { s.buyers[0].packages[1].packageNumber = 1 },
  ]) {
    const state = fixture(); mutate(state)
    assert.equal(pirateShipExportResponse(state).status, 422)
  }
})
await test('duplicate buyer records cannot produce duplicate labels', () => {
  const state = fixture(); state.buyers.push(structuredClone(state.buyers[0]))
  assert.equal(pirateShipExportResponse(state).status, 422)
})
await test('each package note contains only its assigned contents', () => {
  const rows = buildPirateShipExport(fixture()).rows
  assert.match(column(rows[0], 'Note'), /Test item A/)
  assert.doesNotMatch(column(rows[0], 'Note'), /Test item B/)
  assert.match(column(rows[1], 'Note'), /Test item B/)
})
await test('unknown package assignments do not duplicate buyer value or guess contents', () => {
  for (const value of [null, 999]) {
    const state = fixture(); state.buyers[0].items[0].packageId = value
    const result = buildPirateShipExport(state)
    assert.equal(result.rows.length, 2)
    assert.ok(result.rows.every((row) => column(row, 'Order Value') === ''))
    assert.ok(result.rows.every((row) => !column(row, 'Note').includes('Test item')))
    assert.equal(result.warnings.length, 2)
  }
})
await test('items from a different buyer or non sold items cannot leak into parcel contents', () => {
  for (const mutate of [
    (s) => { s.buyers[0].items[0].buyerId = 999 },
    (s) => { s.buyers[0].items[0].status = 'void' },
  ]) {
    const state = fixture(); mutate(state)
    assert.ok(buildPirateShipExport(state).rows.every((row) => column(row, 'Order Value') === ''))
  }
})
await test('subtotal discrepancies, invalid discount, and empty contents leave value explicitly unknown', () => {
  for (const mutate of [
    (s) => { s.buyers[0].subtotalCents++ },
    (s) => { s.buyers[0].discountCents = 9999 },
    (s) => { s.buyers[0].items = [] },
    (s) => { s.buyers[0].discountCents = -1 },
  ]) {
    const state = fixture(); mutate(state)
    assert.ok(buildPirateShipExport(state).rows.every((row) => column(row, 'Order Value') === ''))
  }
})
await test('discount allocation preserves cents and never duplicates full buyer value', () => {
  const rows = buildPirateShipExport(fixture()).rows
  assert.deepEqual(rows.map((row) => column(row, 'Order Value')), ['9.01', '18.00'])
  assert.equal(rows.reduce((sum, row) => sum + Math.round(Number(column(row, 'Order Value')) * 100), 0), 2701)
})
await test('exact cent allocation holds across 500 deterministic synthetic cases', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const state = fixture(); const buyer = state.buyers[0]
    const a = seed * 13 % 701, b = seed * 29 % 503
    buyer.items[0].priceCents = a; buyer.items[1].priceCents = b
    buyer.subtotalCents = a + b; buyer.discountCents = seed % (a + b + 1)
    const values = buildPirateShipExport(state).rows.map((row) => Math.round(Number(column(row, 'Order Value')) * 100))
    assert.equal(values.reduce((x, y) => x + y, 0), a + b - buyer.discountCents)
    assert.ok(values[0] >= 0 && values[0] <= a && values[1] >= 0 && values[1] <= b)
  }
})
await test('free items retain a legitimate zero value', () => {
  const state = fixture(); const buyer = state.buyers[0]
  buyer.items.forEach((item) => { item.priceCents = 0 }); buyer.subtotalCents = 0; buyer.discountCents = 0
  assert.deepEqual(buildPirateShipExport(state).rows.map((row) => column(row, 'Order Value')), ['0.00', '0.00'])
})
await test('leading zero postal codes, email fallback, fractional dimensions, and quoting survive', async () => {
  const state = fixture(); const buyer = state.buyers[0]
  buyer.displayName = 'Test, "Recipient"'; buyer.email = '  '; buyer.shippingProfile.email = 'fallback@example.invalid'
  buyer.packages[0].widthHundredths = 925
  const result = buildPirateShipExport(state)
  assert.equal(column(result.rows[0], 'Zip'), '00001')
  assert.equal(column(result.rows[0], 'Email'), 'fallback@example.invalid')
  assert.equal(column(result.rows[0], 'Width'), 9.25)
  const csv = await pirateShipExportResponse(state).text()
  assert.match(csv, /"Test, ""Recipient"""/)
  assert.match(csv, /"00001"/)
  assert.ok(csv.includes('\r\n'))
  assert.ok(result.rows.every((row) => row.length === PIRATE_SHIP_HEADERS.length))
})
await test('report mode explains excluded and unknown rows without downloading a CSV', async () => {
  const state = fixture(); state.buyers[0].packages[0].status = 'unpacked'; state.buyers[0].items[0].packageId = null
  const response = pirateShipExportResponse(state, true)
  const body = await response.json()
  assert.equal(body.rows.length, 1); assert.equal(body.skipped.length, 1); assert.equal(body.warnings.length, 1)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})
await test('CSV filenames cannot inject headers and every response disables caching', () => {
  const state = fixture(); state.auction.title = '\r\n"Injected: title/../../'
  const response = pirateShipExportResponse(state)
  assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="injected-title-pirate-ship.csv"')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
})
await test('empty export is explicit and the input is never mutated', async () => {
  const state = fixture(); const before = structuredClone(state)
  buildPirateShipExport(state); assert.deepEqual(state, before)
  state.buyers = []
  assert.equal(pirateShipExportResponse(state).status, 400)
})
await test('production route rejects signed out requests before reading any auction', async () => {
  const previous = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production'
  try {
    const route = await routeAt('../app/auction/pirate-ship/route.ts', fixture(), null)
    const response = await route.GET(new Request('https://example.invalid/?auction=42'))
    assert.equal(response.status, 401); assert.equal(globalThis.__auctionExportTest.calls.length, 0)
  } finally { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous }
})
await test('route rejects malformed auction identifiers before reading data', async () => {
  for (const query of ['', '42junk', '-1', '0', '1.5', '9007199254740992', '1e2']) {
    const route = await routeAt('../app/auction/pirate-ship/route.ts', fixture())
    const response = await route.GET(new Request('https://example.invalid/?auction=' + query))
    assert.equal(response.status, 400, query); assert.equal(globalThis.__auctionExportTest.calls.length, 0)
  }
})
await test('route returns 404 for missing owned auction', async () => {
  const route = await routeAt('../app/auction/pirate-ship/route.ts', null)
  assert.equal((await route.GET(new Request('https://example.invalid/?auction=42'))).status, 404)
})
await test('route report query uses the same export implementation', async () => {
  const route = await routeAt('../app/auction/pirate-ship/route.ts', fixture())
  const response = await route.GET(new Request('https://example.invalid/?auction=42&report=1'))
  assert.equal((await response.json()).rows.length, 2)
})
