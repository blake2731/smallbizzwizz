const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
test('sandbox status requires authentication, private Preview and exact read-only database; exposes only allowlisted diagnostics',async()=>{
 const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','DATABASE_URL','AUCTION_PAYPAL_CHECKOUT_ENABLED','PAYPAL_WRITES_ENABLED'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 let owner='synthetic-development-owner',database='auction_invoice_sandbox',calls=0
 const mod={exports:{}},source=fs.readFileSync(path.join(__dirname,'../app/api/sandbox-status/route.ts'),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='@clerk/nextjs/server')return{auth:async()=>({userId:owner})}
  if(name==='@neondatabase/serverless')return{neon:()=>async(strings)=>{assert.equal(strings.join(''),'SELECT current_database() AS database');calls++;return[{database}]}}
  throw Error('Unexpected import')
 },mod,mod.exports)
 const valid=()=>Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature/private-invoices',DATABASE_URL:'postgresql://synthetic:unused@ep-withered-queen-aqf01v2f-pooler.c-8.us-east-1.aws.neon.tech/auction_invoice_sandbox',AUCTION_PAYPAL_CHECKOUT_ENABLED:'false',PAYPAL_WRITES_ENABLED:'false'})
 try{
  valid();let response=await mod.exports.GET();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(await response.json(),{environment:'preview',branch:'feature/private-invoices',database,owner,paypalEnabled:false,paypalWritesEnabled:false});assert.equal(calls,1)
  owner=null;assert.equal((await mod.exports.GET()).status,401);assert.equal(calls,1);owner='synthetic-development-owner'
  for(const [key,value] of [['VERCEL_ENV','production'],['VERCEL_GIT_COMMIT_REF','feature/tablet-auction-console'],['DATABASE_URL','postgresql://synthetic:unused@ep-withered-queen-aqf01v2f-pooler.c-8.us-east-1.aws.neon.tech/neondb']]){valid();process.env[key]=value;assert.equal((await mod.exports.GET()).status,503);assert.equal(calls,1)}
  valid();database='neondb';assert.equal((await mod.exports.GET()).status,503)
 }finally{for(const key of keys)old[key]===undefined?delete process.env[key]:process.env[key]=old[key]}
})
