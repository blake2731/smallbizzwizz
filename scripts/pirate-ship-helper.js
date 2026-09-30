function shippingRunner(packages, shipWindow, practiceRoot) {
  'use strict';
  const practice = Boolean(practiceRoot);
  const appOrigin = 'https://smallbizzwizz-git-feature-tablet-57809b-blake-schmitts-projects.vercel.app';
  const appPath = '/auction/pirate-ship/capture?auction=3';
  const packageLabels = {box:'Box or Rigid Packaging',envelope:'Envelope, Padded Envelope, Poly Bag, Soft Pack, or Box in a Bag'};
  const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
  const nameKey = value => norm(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\bdeborah\b/g,'debbie').replace(/\s+/g,' ').trim();
  const pause = ms => new Promise(resolve => window.setTimeout(resolve,ms));
  let items = packages.map(p=>({...p,packagingType:p.packagingType || 'box'}));
  let index = 0, busy = false, alive = true, filled = null, pending = null, appWindow = null, connected = false;
  const channel = crypto.randomUUID();
  const host = document.createElement('div');host.id='crafty-shipping-runner-v3';
  if(practice)host.style.cssText='position:fixed;right:16px;top:16px;width:390px;max-width:calc(100vw - 32px);z-index:2147483647';
  document.getElementById(host.id)?.dispatchEvent(new Event('shipping-close'));
  document.body.appendChild(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>:host{all:initial;font:14px/1.5 system-ui,sans-serif;color:#19382d}*{box-sizing:border-box}.card{background:#fff;padding:20px;border:2px solid #176b58;border-radius:14px;box-shadow:0 5px 26px #0002}h1{font-size:22px;margin:0 0 5px}p{margin:10px 0}.muted{font-size:12px;color:#516b5e}label{display:block;margin:12px 0 5px;font-weight:650}input,select{width:100%;padding:10px;font:inherit;border:1px solid #adc4b6;border-radius:8px;background:#fff;color:#19382d}.measure,.status{padding:12px;border-radius:8px;background:#edf7f0;margin:12px 0}.measure{font-weight:700}.error{background:#fff0e8;color:#773a1c}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}button{border:1px solid #aac7b7;border-radius:8px;padding:10px 12px;background:#f3f8f4;color:#19382d;font:inherit;cursor:pointer}button.primary{background:#176b58;color:#fff;font-weight:700;flex:1}button:disabled{opacity:.5;cursor:default}a{color:#176b58}#manual{font-size:12px}header{display:flex;justify-content:space-between;align-items:start}header button{padding:4px 8px;font-size:12px}</style>
  <section class="card"><header><div><h1>Shipping helper</h1><div class="muted">September 28 auction · Manual shipping amounts</div></div><button id="close" type="button">Close</button></header>
  <label for="search">Find a buyer</label><input id="search" type="search" placeholder="Type a buyer’s name" autocomplete="off">
  <label for="box">Buyer and package</label><select id="box"></select><div id="measure" class="measure"></div>
  <div class="actions"><button id="fill" class="primary" type="button">Fill package</button><button id="connect" type="button">Connect app</button></div>
  <label for="amount">Shipping amount, $</label><input id="amount" type="text" inputmode="decimal" placeholder="Enter the price from Pirate Ship" autocomplete="off" disabled>
  <div class="actions"><button id="save" class="primary" type="button" disabled>Save shipping</button><button id="retry" type="button" hidden>Retry save</button></div>
  <div id="status" class="status" role="status" aria-live="polite"></div>
  <p id="manual" hidden><a id="fallback" target="CraftyShippingQuoteFallback" rel="noopener">Open the app to save this entered amount</a></p>
  <p class="muted">Fill the package, get rates in Pirate Ship, then enter the cheapest shipping amount here and save it.</p></section>`;
  const get=id=>root.getElementById(id);
  const say=(text,error=false)=>{get('status').textContent=text;get('status').classList.toggle('error',error);};
  const page=()=>{if(practice)return practiceRoot.ownerDocument;try{if(!shipWindow||shipWindow.closed||shipWindow.location.origin!=='https://ship.pirateship.com')throw Error();return shipWindow.document;}catch(_){throw Error('Keep the Pirate Ship tab open and signed in.');}};
  const scope=()=>practiceRoot||page();
  const visible=el=>{if(!el||!el.isConnected||el.disabled||el.getClientRects().length===0)return false;const css=el.ownerDocument.defaultView.getComputedStyle(el);return css.display!=='none'&&css.visibility!=='hidden'&&css.visibility!=='collapse';};
  const labels=el=>[el.getAttribute('placeholder'),el.getAttribute('aria-label'),...(el.labels?Array.from(el.labels).map(label=>label.textContent):[])].map(norm);
  const lookup=(aliases,rootScope=scope())=>{const found=Array.from(rootScope.querySelectorAll('input')).filter(el=>visible(el)&&!el.readOnly&&['text','number','tel'].includes(el.type)&&labels(el).some(label=>aliases.includes(label)));if(found.length!==1)throw Error('Could not identify one '+aliases[0]+' field. Open the package form and try again.');return found[0];};
  const aliases={length:['length'],width:['width'],height:['height'],pounds:['pounds','pounds (lb)','pounds (lbs)','lb','lbs'],ounces:['ounces','ounces (oz)','oz']};
  const fields=p=>p.packagingType==='envelope'?['length','width','pounds','ounces']:['length','width','height','pounds','ounces'];
  const inputs=p=>fields(p).map(key=>lookup(aliases[key]));
  const text=el=>(el.innerText===undefined?el.textContent:el.innerText).trim();
  const matchingText=(value,doc=page())=>Array.from(doc.querySelectorAll('button,div,span,p,label,a,li,[role=option]')).filter(el=>visible(el)&&norm(text(el))===norm(value)).sort((a,b)=>a.children.length-b.children.length)[0];
  async function choosePackaging(p){
    if(practice)return;
    let hasHeight;try{hasHeight=Boolean(lookup(aliases.height));}catch(_){hasHeight=false;}
    if((p.packagingType==='box'&&hasHeight)||(p.packagingType==='envelope'&&!hasHeight)){inputs(p);return;}
    let option=matchingText(packageLabels[p.packagingType]);
    if(!option){const current=matchingText(packageLabels[p.packagingType==='box'?'envelope':'box']);if(!current)throw Error('Choose '+packageLabels[p.packagingType]+' in Pirate Ship, then try again.');current.click();await pause(200);option=matchingText(packageLabels[p.packagingType]);}
    if(!option)throw Error('Choose '+packageLabels[p.packagingType]+' in Pirate Ship.');option.click();await pause(200);inputs(p);
  }
  const nativeSet=(el,value)=>{const win=el.ownerDocument.defaultView;Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new win.Event('input',{bubbles:true}));el.dispatchEvent(new win.Event('change',{bubbles:true}));el.dispatchEvent(new win.Event('blur',{bubbles:true}));};
  function render(){const p=items[index];get('box').value=String(p?.packageId||'');get('measure').textContent=p?(p.packagingType==='envelope'?'Envelope · '+p.length+' × '+p.width:'Box · '+p.length+' × '+p.width+' × '+p.height)+' in · '+p.pounds+' lb '+p.ounces+' oz':'';const locked=busy||Boolean(pending);get('fill').disabled=locked||!p;get('box').disabled=locked;get('search').disabled=locked;get('amount').disabled=locked||!filled;get('save').disabled=locked||!filled;}
  function options(){const filter=nameKey(get('search').value);get('box').replaceChildren();items.forEach(p=>{if(p.saved||!nameKey(p.buyer).includes(filter))return;const option=document.createElement('option');option.value=String(p.packageId);option.textContent=p.buyer+' · package '+p.box;get('box').appendChild(option);});if(!Array.from(get('box').options).some(option=>option.value===String(items[index]?.packageId))){const first=get('box').options[0];index=first?items.findIndex(p=>String(p.packageId)===first.value):-1;}render();}
  function selectPackage(id){if(busy||pending)return;const next=items.findIndex(p=>String(p.packageId)===String(id));if(next<0)return;index=next;filled=null;get('amount').value='';render();say('Choose '+items[index].buyer+'’s saved address, then click Fill package.');}
  async function fillCurrent(){
    if(busy||pending)return;const p=items[index];if(!p)return;busy=true;filled=null;get('amount').value='';render();
    try{await choosePackaging(p);const keys=fields(p),values=keys.map(key=>p[key]),controls=inputs(p);if(new Set(controls).size!==keys.length)throw Error('The measurements need separate fields.');values.forEach((value,i)=>{const key=keys[i];if(!Number.isFinite(value)||value<0||(['length','width','height'].includes(key)&&value<=0)||(['pounds','ounces'].includes(key)&&!Number.isInteger(value))||(key==='ounces'&&value>15))throw Error('Update the incomplete measurements in the app first.');for(const attr of ['min','max']){const limit=controls[i].getAttribute(attr);if(limit!==null&&limit!==''&&Number.isFinite(Number(limit))&&((attr==='min'&&value<Number(limit))||(attr==='max'&&value>Number(limit))))throw Error('Check the packaging choice and measurement range.');}});for(let i=0;i<keys.length;i++){nativeSet(inputs(p)[i],values[i]);await pause(35);if(!alive)return;}await pause(150);if(inputs(p).some((el,i)=>!el.value.trim()||Number(el.value)!==values[i]))throw Error('Pirate Ship did not keep every measurement. Review the fields.');filled={...p};say('Filled '+p.buyer+', package '+p.box+'. Get rates in Pirate Ship, then enter the shipping amount below.');}
    catch(error){say(error.message,true);}finally{busy=false;render();}
  }
  function connectApp(){if(practice){say('Practice mode. No data is sent.');return;}if(appWindow&&!appWindow.closed){appWindow.postMessage({type:'crafty-shipping-hello',channel},appOrigin);return;}connected=false;appWindow=window.open(appOrigin+appPath+'#channel='+encodeURIComponent(channel),'CraftyShippingQuoteReceiver_'+channel);if(!appWindow)say('Allow the app tab to open, then click Connect app again.',true);else say('The app is opening. Keep that tab open.');}
  function sendPending(){if(!pending||!connected||!appWindow||appWindow.closed)return;appWindow.postMessage({type:'crafty-shipping-quote',channel,requestId:pending.requestId,quote:pending.quote},appOrigin);pending.sentAt=Date.now();}
  function saveShipping(){
    if(!filled||busy||pending)return;let amount=get('amount').value.trim().replace(/^\$\s*/,'');if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(amount)){say('Enter a shipping amount such as 12.34.',true);return;}const amountCents=Math.round(Number(amount)*100);if(amountCents>1000000){say('Check the shipping amount.',true);return;}
    const p={...filled};if(practice){say('Practice amount $'+(amountCents/100).toFixed(2)+'. No data was sent.');return;}
    pending={requestId:crypto.randomUUID(),buyer:p.buyer,startedAt:Date.now(),sentAt:0,quote:{auctionId:3,buyerId:p.buyerId,packageId:p.packageId,packageNumber:p.box,packagingType:p.packagingType,weightOunces:p.pounds*16+p.ounces,lengthHundredths:Math.round(p.length*100),widthHundredths:Math.round(p.width*100),heightHundredths:p.height===null?null:Math.round(p.height*100),amountCents,provider:'Pirate Ship',service:'Manually entered quote'}};
    get('retry').hidden=false;get('manual').hidden=true;get('fallback').href=appOrigin+appPath+'#quote='+encodeURIComponent(JSON.stringify(pending.quote));if(!appWindow||appWindow.closed)connectApp();say('Saving $'+(amountCents/100).toFixed(2)+' for '+p.buyer+', package '+p.box+'…');render();sendPending();
  }
  function onMessage(event){
    if(event.origin!==appOrigin||event.source!==appWindow||!event.data||event.data.channel!==channel)return;const message=event.data;
    if(message.type==='crafty-shipping-ready'&&message.auctionId===3){const first=!connected;connected=true;if(first&&Array.isArray(message.packages)&&!busy&&!filled&&!pending){const previous=items[index]?.packageId;items=message.packages.map(p=>({...p}));index=items.findIndex(p=>p.packageId===previous);options();}if(pending&&(!pending.sentAt||Date.now()-pending.sentAt>5000))sendPending();else if(first)say('App connected. Choose a buyer, then Fill package.');}
    if(message.type==='crafty-shipping-result'&&pending&&message.requestId===pending.requestId){const result=message.result;if(result?.ok&&result.packageId===pending.quote.packageId&&result.amountCents===pending.quote.amountCents){const completed=items.find(p=>p.packageId===result.packageId);if(completed)completed.saved=true;say('Saved $'+(result.amountCents/100).toFixed(2)+' for '+pending.buyer+', package '+result.packageNumber+'. Choose the next buyer.');pending=null;filled=null;get('retry').hidden=true;get('manual').hidden=true;get('amount').value='';get('search').value='';options();}else{say(result?.error||'The app did not confirm this package and amount. Retry the save.',true);get('manual').hidden=false;}}
  }
  get('search').addEventListener('input',()=>{if(busy||pending)return;options();filled=null;get('amount').value='';render();});
  get('search').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(get('box').options.length===1){selectPackage(get('box').value);void fillCurrent();}else say('Choose the correct package from the list, then Fill package.');}});
  get('box').addEventListener('change',()=>selectPackage(get('box').value));get('fill').addEventListener('click',()=>void fillCurrent());get('connect').addEventListener('click',connectApp);get('save').addEventListener('click',saveShipping);get('amount').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveShipping();}});get('retry').addEventListener('click',()=>{if(!pending)return;if(!appWindow||appWindow.closed)connectApp();else sendPending();});
  function close(){alive=false;window.clearInterval(timer);window.removeEventListener('message',onMessage);host.remove();}
  get('close').addEventListener('click',()=>{close();if(!practice)window.close();});host.addEventListener('shipping-close',close);window.addEventListener('message',onMessage);
  const timer=window.setInterval(()=>{if(!alive||!pending)return;if(connected&&Date.now()-pending.sentAt>5000)sendPending();if(Date.now()-pending.startedAt>20000){get('manual').hidden=false;say('The app has not confirmed the save. Use Retry save or open the entered amount in the app.',true);}},700);
  options();say(practice?'Choose a buyer and click Fill package.':'Connect the app once, choose a buyer, then Fill package.');
}
function shippingFillHelper(packages,practiceRootId){
  if(practiceRootId){shippingRunner(packages,window,document.getElementById(practiceRootId));return;}
  if(location.origin!=='https://ship.pirateship.com'){alert('Open Pirate Ship in your signed in browser, then click the Shipping helper bookmark.');return;}
  const popup=window.open('','CraftyBrotherShippingHelperV3','popup,width=440,height=790');if(!popup){alert('Allow this bookmark to open its small helper window, then click it again.');return;}
  const data=JSON.stringify(packages).replace(/</g,'\\u003c');popup.document.open();popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Shipping helper</title><style>body{margin:0;padding:12px;background:#f3f7f4}</style></head><body><scr'+'ipt>'+shippingRunner.toString()+';shippingRunner('+data+',window.opener);</scr'+'ipt></body></html>');popup.document.close();popup.focus();
}
