/* Vouch store + seed. localStorage-backed, deterministic seed so the demo world is stable. */
(function(){
const KEY = "vouch_state_v1";

// deterministic PRNG (mulberry32) — stable demo across reloads
function rng(seed){ return function(){ seed|=0; seed = seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const pick = (r,a)=> a[Math.floor(r()*a.length)];

const CHIPS = ["Attentive","Fast","Went above & beyond","Made my day","Knew their stuff","Warm & welcoming",
  "Remembered me","Fixed a problem","Great recommendations","Calm under pressure","Genuinely kind","Handled a rush",
  "Treated me with respect","Made it easy","Honest & trustworthy","Knew exactly what I needed","Patient with me","Trusted them completely"];

// role-agnostic quote pools (stylists, drivers, cleaners, trainers — not just food service)
const AGNOSTIC_Q5 = [
  "Best I've ever had — remembered exactly what I wanted from last time.",
  "Turned a stressful day around completely. A true professional.",
  "Went so far out of their way for me I couldn't believe it.",
  "I trust them completely. That's rare, and I don't say it lightly.",
  "Kind, quick, and made the whole thing easy. Exactly what I needed.",
  "Came in frazzled, left smiling — entirely because of them.",
  "Knew their craft cold and made it look effortless.",
  "Quietly fixed a problem before it became one. Class act.",
  "The only reason I keep coming back. Full stop.",
  "Warm without being fake. Made my whole week."];
const AGNOSTIC_Q4 = ["Great work, clearly knew what they were doing.","Friendly, quick, and got it right.",
  "Really solid — I'd happily come back to them.","Helpful without hovering. Nice balance."];
const AGNOSTIC_Q3 = ["Good overall, a little rushed at the end but fine.","Decent — friendly enough."];
const AGNOSTIC_REFQ = [
  "I've worked with a lot of people over the years. I'd vouch for them to anyone.",
  "If they ever need a reference, my number's right here. I don't say that lightly.",
  "They treated my family like their own. I'll vouch for them anywhere.",
  "We come back specifically because of them — that loyalty is real.",
  "Saved the day when it genuinely mattered. I'd put my name on their record any day.",
  "Most composed, capable person I've watched work. Genuinely impressive.",
  "Remembered a small detail about me a month later. That's trust earned.",
  "If you're hiring and reading this — call me. They're the real deal."];

// ATTESTATION channel — "witnessed proof of conduct" for workers whose customers can't leave feedback
// (care workers, housekeepers, bussers). The vulnerable person is NEVER named. Specific behavior + relationship + tenure.
const ATTEST_WITNESSED = [
  "Caught a medication mix-up the rest of us missed. Quietly, no drama.",
  "Sat with someone through a panic attack on her own unpaid break. Twice.",
  "Talks to every resident like they're a whole person, never a task.",
  "Never once cut a corner on the overnight, even with no one watching.",
  "Stayed two hours late, off the clock, so a family wouldn't be alone at the end.",
  "Learned three residents' whole bedtime routines by heart in a week.",
  "Calmed a frightened patient when even the nurse couldn't.",
  "The one we all ask for when a shift gets hard. Steady, kind, reliable.",
  "Spotted a fall risk and fixed it before anyone got hurt.",
  "Treats this work like it matters — because to the families, it does.",
  "Held it together for a grieving family with more grace than people twice her age.",
  "Showed up every single day for two years and never made it about herself."];
const ATTEST_RELATIONS = [
  ["Family of a client","2 years"],["Charge nurse, same floor","1 year"],["Shift supervisor","3 years"],
  ["Coworker, same team","18 months"],["Family of a client","8 months"],["Coworker","2 years"],
  ["Daughter of a resident","1 year"],["Floor supervisor","2 years"],["Family member","3 years"]];
const ATTEST_NAMES = ["Karen W.","Nurse Adeyemi","Sandra Reyes","Marcus (coworker)","The Okafor family",
  "Joy (coworker)","Elena V.","Supervisor Diaz","David & Ruth H."];

function genCareWorker(meta, count, now){
  const r = rng(meta.seed);
  const list = [];
  for (let k=0;k<count;k++){
    const day = Math.floor(meta.spanDays * (1 - Math.pow(r(),1.5)));
    const rel = ATTEST_RELATIONS[Math.floor(r()*ATTEST_RELATIONS.length)];
    list.push({
      id:"a_"+meta.handle+"_"+k, workerHandle:meta.handle, kind:"attestation",
      rating:5, comment: ATTEST_WITNESSED[Math.floor(r()*ATTEST_WITNESSED.length)],
      attestorRelation: rel[0], attestorTenure: rel[1],
      attestorName: ATTEST_NAMES[Math.floor(r()*ATTEST_NAMES.length)],
      chips:[], customerHash:"att_"+meta.handle+"_"+k,
      customerName: ATTEST_NAMES[Math.floor(r()*ATTEST_NAMES.length)],
      contactable: r()<0.45, solicited:false, venue: meta.workplace,
      createdAt: daysAgoISO(now, day, r), authSignals:["identity_verified","relationship_verified"],
    });
  }
  list.sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  return { worker:{ handle:meta.handle, name:meta.name, role:meta.role, city:meta.city,
    headline:meta.headline, color:meta.color, workplace:meta.workplace, careWorker:true,
    createdAt: daysAgoISO(now, meta.spanDays, null) }, interactions:list };
}

const QUOTES_5 = [
  "Honestly the best service I've had in this city. Remembered my order from last time.",
  "Turned a stressful work dinner around completely. Total pro.",
  "Recommended a drink I'd never have tried — it was perfect.",
  "We were a table of 9 and not one thing went wrong. Unreal.",
  "Kind to my kids, fast with the check, read the room perfectly.",
  "Came in wrecked after a flight delay and left smiling because of them.",
  "Knew the menu cold and made great calls when I couldn't decide.",
  "Quietly fixed a kitchen mistake before it became a problem. Class act.",
  "The reason we keep coming back to this place, full stop.",
  "Warm without being fake. Exactly what you want on a bad day.",
];
const QUOTES_4 = [
  "Great service, place was slammed and they still kept up.",
  "Friendly and quick. Drinks were perfect.",
  "Really solid — would happily be served by them again.",
  "Attentive without hovering. Nice balance.",
];
const QUOTES_3 = ["Good service overall, a little slow at the end but it was busy.","Fine visit, friendly enough."];

const REF_NAMES = ["Sarah Klein","Daniel Moreno","Priya R.","Marcus Webb","Elena Sandoval","Tom Becker",
  "Aisha N('Diaye","Greg Tanaka","Nadia Hassan","Chris Vogel","Lena Park","Jordan Ellis"];
const REF_QUOTES = [
  "I've been served by a lot of people in 20 years of business dinners. I'd hire them in a heartbeat.",
  "I run a 40-seat restaurant. If they ever want a job, my number's on this. That's not a thing I say.",
  "Took care of my elderly mother like she was family. I'll vouch for them to anyone.",
  "We come back every Friday specifically because of them. That's loyalty you can't train.",
  "Saved a deal-closing dinner when the kitchen was drowning. I'd put my name on their record any day.",
  "Most composed person I've watched work a packed bar. Genuinely impressive.",
  "They remembered my daughter's allergy a month later without being reminded. Trust earned.",
  "If you're hiring and reading this — call me. They're the real deal.",
];
const CITY_VENUE = { "Chicago":"The Gilded Owl","Austin":"Lark & Larder","Denver":"Foundry Room" };

function daysAgoISO(now, days, r){
  const d = new Date(now.getTime() - days*86400000);
  d.setHours(17 + Math.floor((r?r():0.5)*6), Math.floor((r?r():0.5)*60), 0, 0); // evening shifts
  return d.toISOString();
}

function genWorker(meta, count, opts, now){
  const r = rng(meta.seed);
  const Q5=meta.agnostic?AGNOSTIC_Q5:QUOTES_5, Q4=meta.agnostic?AGNOSTIC_Q4:QUOTES_4,
        Q3=meta.agnostic?AGNOSTIC_Q3:QUOTES_3, RQ=meta.agnostic?AGNOSTIC_REFQ:REF_QUOTES;
  const venue = meta.workplace || CITY_VENUE[meta.city] || "The Gilded Owl";
  const interactions = [];
  // customer pool with some repeats
  const poolSize = Math.max(8, Math.floor(count*0.7));
  const repeaters = Math.floor(poolSize*0.18);
  const custIds = Array.from({length:poolSize},(_,i)=>"c_"+meta.handle+"_"+i);
  let refsLeft = opts.refs||0;
  for (let k=0;k<count;k++){
    // recency-weighted day within span
    const span = opts.spanDays;
    const day = Math.floor(span * (1 - Math.pow(r(),1.7))); // more recent
    // choose customer (bias repeaters to reuse)
    let cust;
    if (r() < 0.30 && repeaters>0){ cust = custIds[Math.floor(r()*repeaters)]; }
    else { cust = custIds[Math.floor(r()*poolSize)]; }
    // rating distribution
    const rr = r(); let rating, q;
    if (opts.gamed){ rating = 5; q = pick(r,Q5); }
    else if (rr<opts.r5){ rating=5; q=pick(r,Q5); }
    else if (rr<opts.r5+0.25){ rating=4; q=pick(r,Q4); }
    else if (rr<opts.r5+0.33){ rating=3; q=pick(r,Q3); }
    else { rating=4; q=pick(r,Q4); }
    // auth signals
    const sig = [];
    if (opts.gamed){
      // gamed records: thin verification, no organic, recycled hashes, bursty
      if (r()<0.5) sig.push("phone_otp");
    } else {
      sig.push("phone_otp");
      if (r()<0.82) sig.push("geofence");
      if (r()<opts.receiptRate) sig.push("receipt");
      if (r()<opts.payRate) sig.push("payment");
    }
    // chips
    const cset = new Set(); const nc = 1+Math.floor(r()* (rating>=5?3:2));
    while(cset.size<nc) cset.add(pick(r,CHIPS));
    // named reference?
    let customerName=null, contactable=false;
    if (!opts.gamed && refsLeft>0 && rating===5 && r()<0.5){
      customerName = REF_NAMES[(opts.refs-refsLeft)%REF_NAMES.length];
      contactable=true; refsLeft--;
      sig.push("contactable_ref");
      q = RQ[(opts.refs-refsLeft)%RQ.length];
    }
    interactions.push({
      id: "i_"+meta.handle+"_"+k,
      workerHandle: meta.handle,
      rating, comment:q, chips:[...cset],
      customerHash: cust,
      customerName, contactable,
      solicited: opts.gamed ? true : (r()<opts.solicitedRate),
      venue,
      createdAt: daysAgoISO(now, day, r),
      authSignals: sig,
    });
  }
  // inject burst for gamed worker: one customer 6 reviews in 8 min
  if (opts.gamed){
    const t0 = now.getTime() - 3*86400000;
    for (let b=0;b<6;b++){
      interactions.push({ id:"i_"+meta.handle+"_burst"+b, workerHandle:meta.handle, rating:5,
        comment:pick(r,Q5), chips:[pick(r,CHIPS)], customerHash:"c_"+meta.handle+"_botA",
        customerName:null, contactable:false, solicited:true, venue,
        createdAt:new Date(t0 + b*80000).toISOString(), authSignals:["phone_otp"] });
    }
  }
  interactions.sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  return {
    worker:{ handle:meta.handle, name:meta.name, role:meta.role, city:meta.city,
      headline:meta.headline, color:meta.color, createdAt: daysAgoISO(now, opts.spanDays, null) },
    interactions,
  };
}

function buildSeed(){
  const now = new Date();
  const defs = [
    { meta:{handle:"maria-reyes",name:"Maria Reyes",role:"Lead Bartender",city:"Chicago",
            headline:"Five years behind the bar. I remember your order and your kid's name.",color:"#0f9b6c",seed:1011},
      count:138, opts:{spanDays:430,r5:0.66,receiptRate:0.58,payRate:0.34,refs:12,solicitedRate:0.30} },
    { meta:{handle:"james-okafor",name:"James Okafor",role:"Server",city:"Chicago",
            headline:"Fine dining floor. I run a section like a calm cockpit.",color:"#2f6df0",seed:2022},
      count:74, opts:{spanDays:300,r5:0.6,receiptRate:0.5,payRate:0.28,refs:6,solicitedRate:0.34} },
    { meta:{handle:"priya-nair",name:"Priya Nair",role:"Barista",city:"Austin",
            headline:"Morning rush specialist. Latte art and actual eye contact.",color:"#b8852a",seed:3033},
      count:46, opts:{spanDays:210,r5:0.62,receiptRate:0.4,payRate:0.5,refs:4,solicitedRate:0.4} },
    { meta:{handle:"renee-adams",name:"Renée Adams",role:"Hairstylist",city:"Austin",
            workplace:"Shear Studio (chair-renter)",agnostic:true,
            headline:"Your color, your story. My chair, my clients — and now, finally, my record.",color:"#b5497f",seed:5055},
      count:88, opts:{spanDays:380,r5:0.7,receiptRate:0.5,payRate:0.4,refs:9,solicitedRate:0.25} },
    { meta:{handle:"devon-carter",name:"Devon Carter",role:"Rideshare Driver",city:"Chicago",
            workplace:"5,000+ trips",agnostic:true,
            headline:"4.9 stars across 5,000 rides. The apps own that number. This one is mine.",color:"#2f9b8f",seed:6066},
      count:96, opts:{spanDays:300,r5:0.72,receiptRate:0.2,payRate:0.45,refs:7,solicitedRate:0.2} },
    { meta:{handle:"tyler-brooks",name:"Tyler Brooks",role:"Server",city:"Denver",
            headline:"",color:"#6b6f7d",seed:4044},
      count:26, opts:{spanDays:70,r5:1,receiptRate:0,payRate:0,refs:0,solicitedRate:1,gamed:true} },
  ];
  const workers = {}, interactions = [];
  defs.forEach(d=>{ const g = genWorker(d.meta, d.count, d.opts, now); workers[d.meta.handle]=g.worker; interactions.push(...g.interactions); });
  // care worker — attestation-only record (the equity case: customers can't leave feedback)
  const gloria = genCareWorker({ handle:"gloria-mendez", name:"Gloria Mendez", role:"Home Health Aide",
    city:"Phoenix", workplace:"In-home & assisted living", spanDays:760, seed:7077, color:"#7a5cc4",
    headline:"Eight years of care no one ever saw. Now it's witnessed — and it's mine." }, 24, now);
  workers["gloria-mendez"]=gloria.worker; interactions.push(...gloria.interactions);
  // Tag the whole demo world so it stays LOCAL-ONLY and never syncs to the real backend.
  Object.values(workers).forEach(w=>{ w.demo=true; });
  interactions.forEach(i=>{ i.demo=true; });
  return { workers, interactions, session:{ current:"maria-reyes" }, seededAt: now.toISOString() };
}

// ---- store API ----
let STORAGE_ERROR = null;   // surfaced in Settings — a failed save must never be silent
function load(){
  let s = null, raw = null;
  try{ raw = localStorage.getItem(KEY); s = raw ? JSON.parse(raw) : null; }catch(e){ STORAGE_ERROR = "Stored data was unreadable and has been set aside (vouch_data_corrupt)."; }
  if(s && (!s.workers || typeof s.workers!=="object")) { s = null; }
  if(!s){ if(raw){ try{ localStorage.setItem("vouch_data_corrupt", raw); }catch(e){} } s = buildSeed(); save(s); }
  if(!Array.isArray(s.interactions)) s.interactions = [];
  if(!s.session || typeof s.session!=="object") s.session = { current: Object.keys(s.workers)[0]||null };
  return s;
}
function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); STORAGE_ERROR=null; return true; }
  catch(e){ STORAGE_ERROR = "Couldn't save on this device (storage full or blocked). Changes may be lost — export your record."; return false; } }
let STATE = load();

// ---- cloud sync (local-first; opt-in) ----
// CONSENT: nothing leaves the device until the worker explicitly publishes (Settings / onboarding).
// `vouch_sync` is "1" only after that choice; signing out or switching accounts turns it off again.
let SYNC = { online:false, enabled:(()=>{ try{ return localStorage.getItem("vouch_sync")==="1"; }catch(e){ return false; } })(), last:null, busy:false, lastError:null };
let syncTimer=null;
const api = ()=> (window.Vouch && window.Vouch.api);
const signedIn = ()=> !!(api() && api().token());
// After the worker chooses to publish, an anonymous device token is minted so the record can
// reach the server (customers can then vouch). Email sign-in stays optional — it adds recovery.
async function ensureToken(){
  if(signedIn()) return true;
  if(!api()) return false;
  const r=await api().authDevice();
  if(r&&r.ok&&r.token){ api().setToken(r.token); return true; }
  return false;
}
function scheduleSync(){ if(!SYNC.enabled||!SYNC.online) return; clearTimeout(syncTimer); syncTimer=setTimeout(doSync, 900); }
// ---- deletion tombstones: a delete is "pending" until the server confirms; never resurrected ----
function tombstones(){ try{ return JSON.parse(localStorage.getItem("vouch_tombstones")||"[]"); }catch(e){ return []; } }
function saveTombstones(t){ try{ localStorage.setItem("vouch_tombstones", JSON.stringify(t)); }catch(e){} }
let flushing=null;
async function flushTombstones(){
  if(flushing) return flushing;                    // single-flight: overlapping flushes dropped deletions
  if(!api()||!SYNC.online) return;
  if(!tombstones().length) return;
  flushing=(async()=>{
    for(const ts of tombstones()){
      const r=await api().deleteWorker(ts.handle);
      // 200 = deleted; 410 = already tombstoned. A bare 404 may be a misrouted base, so only treat
      // the app's own "worker not found" as confirmation. Anything else stays pending and retries.
      const gone = r && (r.ok || r.status===410 || (r.status===404 && /worker not found/i.test(r.detail||"")));
      if(gone) saveTombstones(tombstones().filter(x=>x.handle!==ts.handle));   // re-read: never write a stale snapshot
      else if(r && (r.status===401||r.status===403)) { const t2=tombstones(); const e=t2.find(x=>x.handle===ts.handle); if(e){ e.blocked=true; saveTombstones(t2); } }
    }
  })().finally(()=>{ flushing=null; });
  return flushing;
}
function accountId(){ try{ return localStorage.getItem("vouch_account")||""; }catch(e){ return ""; } }
function realState(only){
  // Push only: this device's OWN, non-demo records, not being deleted, not owned by a DIFFERENT
  // account (switching accounts must never upload the previous person's records), and never the
  // server rows we just pulled (echoing them back would mint evidence-free duplicates).
  const dead=new Set(tombstones().map(t=>t.handle)); const me=accountId();
  const workers={}; Object.values(STATE.workers||{}).forEach(w=>{
    if(w.demo || dead.has(w.handle)) return;
    if(only && w.handle!==only) return;
    if(w.syncedTo && me && w.syncedTo!==me) return;      // belongs to another signed-in account
    workers[w.handle]=w; });
  const interactions=(STATE.interactions||[]).filter(i=>!i.demo && workers[i.workerHandle]
    && i.origin!=="server" && !i.serverId && !(typeof i.id==="string" && i.id.startsWith("srv_")));
  return { workers, interactions };
}
async function doSync(only){ if(!SYNC.enabled) return false;
  await flushTombstones();
  const real=realState(only); const want=Object.keys(real.workers);
  if(!want.length) return false;                                  // nothing of ours to publish
  if(!await ensureToken()) return false; SYNC.busy=true; const r=await api().sync(real); SYNC.busy=false;
  if(!(r&&r.ok)){
    SYNC.lastError = r&&r.status===401 ? "Sign-in expired — publish again to reconnect."
      : (r&&r.timeout ? "Server slow — will retry." : "Couldn't reach the server — will retry.");
    return false; }
  SYNC.last=Date.now(); SYNC.lastError=null;
  // THIS account deleted these handles: the device must drop its stale copies.
  if(Array.isArray(r.tombstoned)&&r.tombstoned.length){
    r.tombstoned.forEach(h=>{ delete STATE.workers[h]; STATE.interactions=STATE.interactions.filter(i=>i.workerHandle!==h); });
    if(!STATE.workers[STATE.session.current]) STATE.session.current=Object.keys(STATE.workers)[0]||null; }
  // Someone else's deleted handle: KEEP the local record, report the failure, let the app re-slug.
  const blocked=[].concat(r.handle_unavailable||[]);
  if(r.skipped) SYNC.lastError="Some records belong to another account and were not published.";
  if(blocked.length) SYNC.lastError="That name is taken — publish again to pick another.";
  const accepted=(r.workers||0)>0;
  if(accepted){ const me=accountId(); want.forEach(h=>{ if(STATE.workers[h] && !blocked.includes(h)) STATE.workers[h].syncedTo=me||"device"; }); }
  save(STATE);
  return accepted && !blocked.length; }
async function checkOnline(){ if(!api()){ SYNC.online=false; return false; } const r=await api().health(); SYNC.online=!!(r&&r.ok); if(SYNC.online){ SYNC.health=r; flushTombstones(); if(SYNC.enabled) doSync(); } return SYNC.online; }
// retry pending work as soon as the device is actually back, not only on reload
if(typeof window!=="undefined" && window.addEventListener){
  window.addEventListener("online", ()=>checkOnline());
  if(typeof document!=="undefined" && document.addEventListener)
    document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) checkOnline(); });
}
// Non-destructive merge of server state into local (adds what's missing, never deletes local work).
function mergeServerState(r){
  let changed=0;
  let everDeleted=[]; try{ everDeleted=JSON.parse(localStorage.getItem("vouch_deleted")||"[]"); }catch(e){}
  const dead=new Set([...tombstones().map(t=>t.handle), ...everDeleted]);
  (r.workers||[]).forEach(w=>{ if(dead.has(w.handle)) return; if(!STATE.workers[w.handle]){ STATE.workers[w.handle]=w; changed++; } });
  const byId={}, bySrv={}; STATE.interactions.forEach(x=>{ if(x.id) byId[x.id]=x; if(x.serverId) bySrv[x.serverId]=x; });
  (r.interactions||[]).forEach(i=>{ if(!STATE.workers[i.workerHandle]) return;
    const ex=(i.id&&byId[i.id])||(i.serverId&&bySrv[i.serverId]);
    if(ex){ // keep local text; adopt the server's authoritative evidence + moderation flags
      let d=false; ["serverId","authSignals","hidden","withdrawn","quarantined","origin"].forEach(k=>{ if(i[k]!==undefined && JSON.stringify(ex[k])!==JSON.stringify(i[k])){ ex[k]=i[k]; d=true; } });
      if(d) changed++; return; }
    STATE.interactions.unshift(i); changed++; });
  if(changed){ if(!STATE.workers[STATE.session.current]) STATE.session.current=Object.keys(STATE.workers)[0]||null; save(STATE); }
  return changed;
}

const store = {
  state(){ return STATE; },
  reset(){ localStorage.removeItem(KEY); STATE = load(); return STATE; },
  worker(h){ return STATE.workers[h]; },
  allWorkers(){ return Object.values(STATE.workers); },
  interactionsFor(h){ return STATE.interactions.filter(i=>i.workerHandle===h)
      .sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt)); },
  current(){ return STATE.workers[STATE.session.current]; },
  setCurrent(h){ STATE.session.current=h; save(STATE); },
  addWorker(w){ STATE.workers[w.handle]=w; STATE.session.current=w.handle; save(STATE); scheduleSync(); },
  updateWorker(h,patch){ if(STATE.workers[h]){ Object.assign(STATE.workers[h],patch); save(STATE); scheduleSync(); } },
  async deleteWorker(h){
    const w=STATE.workers[h]; const wasDemo=!!(w&&w.demo);
    delete STATE.workers[h]; STATE.interactions=STATE.interactions.filter(i=>i.workerHandle!==h);
    if(STATE.session.current===h) STATE.session.current=Object.keys(STATE.workers)[0]||null; save(STATE);
    if(wasDemo) return { local:true, cloud:"n/a" };                       // demo never existed on the server
    const t=tombstones().filter(x=>x.handle!==h); t.push({handle:h, at:new Date().toISOString(), owner:(()=>{ try{ return localStorage.getItem("vouch_email")||""; }catch(e){ return ""; } })()}); saveTombstones(t);
    try{ const gone=JSON.parse(localStorage.getItem("vouch_deleted")||"[]"); if(!gone.includes(h)){ gone.push(h); localStorage.setItem("vouch_deleted",JSON.stringify(gone)); } }catch(e){}
    if(!api()||!signedIn()) return { local:true, cloud:"pending" };
    await flushTombstones();
    return { local:true, cloud: tombstones().some(x=>x.handle===h) ? "pending" : "deleted" }; },
  pendingDeletions(){ return tombstones().map(t=>t.handle); },
  patchInteraction(serverId, patch){ const x=STATE.interactions.find(i=>i.serverId===serverId); if(x){ Object.assign(x,patch); save(STATE); } return !!x; },
  storageError(){ return STORAGE_ERROR; },
  addInteraction(i){ STATE.interactions.unshift(i); save(STATE); scheduleSync(); },
  // sync surface for the UI
  sync:{
    status(){ return { online:SYNC.online, enabled:SYNC.enabled, last:SYNC.last, busy:SYNC.busy, lastError:SYNC.lastError,
      support:(SYNC.health&&SYNC.health.support_contact)||"", moderation:(SYNC.health&&SYNC.health.moderation)||"unknown",
      pendingDeletions: tombstones().length, pendingBlocked: tombstones().filter(t=>t.blocked).length,
      anonymous: signedIn() && !((()=>{ try{ return localStorage.getItem("vouch_email")||""; }catch(e){ return ""; } })()),
      base: api()?api().base():"", signedIn:signedIn(),
      email:(()=>{ try{ return localStorage.getItem("vouch_email")||""; }catch(e){ return ""; } })() }; },
    setEnabled(b){ SYNC.enabled=!!b; try{ localStorage.setItem("vouch_sync", b?"1":"0"); }catch(e){} if(b) checkOnline(); },
    async refresh(){ return checkOnline(); },
    async backup(){ const ok=await doSync(); return ok; },
    // PUBLISH = the explicit consent step. Turns cloud sync on and pushes now.
    async publish(only){ SYNC.enabled=true; try{ localStorage.setItem("vouch_sync","1"); }catch(e){} if(!SYNC.online) await checkOnline(); return await doSync(only); },
    // Pull the server's copy and MERGE it in (new customer vouches appear; local work is never discarded).
    async pullMerge(){ if(!signedIn()||!api()) return 0; const r=await api().pull(); if(!(r&&r.ok&&Array.isArray(r.workers))) return 0; return mergeServerState(r); },
    async restore(){ if(!signedIn()) return false; const r=await api().pull(); if(r&&r.ok&&Array.isArray(r.workers)){ mergeServerState(r); return true; } return false; },
  },
  // auth surface
  auth:{
    signedIn(){ return signedIn(); },
    email(){ try{ return localStorage.getItem("vouch_email")||""; }catch(e){ return ""; } },
    async request(email){ if(!api()) return {ok:false,offline:true}; return await api().authRequest(email); },
    async verify(email,code){ if(!api()) return {ok:false}; const r=await api().authVerify(email,code);
      if(r&&r.ok&&r.token){
        let prev=""; try{ prev=localStorage.getItem("vouch_email")||""; }catch(e){}
        api().setToken(r.token);
        try{ localStorage.setItem("vouch_email", r.email||email); localStorage.setItem("vouch_account", r.email||email); }catch(e){}
        SYNC.online=true;
        // The server re-parented anything this device had published anonymously.
        (r.migrated||[]).forEach(h=>{ if(STATE.workers[h]) STATE.workers[h].syncedTo=r.email||email; });
        if(r.migrated&&r.migrated.length) save(STATE);
        // ACCOUNT ISOLATION: signing into a DIFFERENT account never uploads this device's existing
        // records to it. Publishing is a fresh, explicit choice for the new account.
        if(prev && prev!==(r.email||email)){ SYNC.enabled=false; try{ localStorage.setItem("vouch_sync","0"); }catch(e){} r.switchedAccount=true; }
        else if(SYNC.enabled){ await doSync(); }
      }
      return r; },
    // Signing out revokes this device's key. For an ANONYMOUS device account that key is the ONLY
    // way back to the published record, so the caller must confirm; pending deletions flush first.
    anonymous(){ return signedIn() && !((()=>{ try{ return localStorage.getItem("vouch_email")||""; }catch(e){ return ""; } })()); },
    async signout(){ await flushTombstones();
      if(api()){ try{ await api().signout(); }catch(e){} api().setToken(""); } try{ localStorage.removeItem("vouch_email"); localStorage.removeItem("vouch_account"); }catch(e){}
      // signing out is a privacy boundary: no automatic republishing until the worker chooses again
      SYNC.enabled=false; try{ localStorage.setItem("vouch_sync","0"); }catch(e){} },
  },
  hashPhone(p){ // tiny stable hash → customer id
    let h=0; const s=(p||"").replace(/\D/g,"")||("anon"+Date.now());
    for(let k=0;k<s.length;k++){ h=(h*31 + s.charCodeAt(k))>>>0; } return "c_phone_"+h; },
};
window.Vouch = window.Vouch || {};
window.Vouch.store = store;
window.Vouch.CHIPS = CHIPS;
window.Vouch.CITY_VENUE = CITY_VENUE;
// detect the cloud on load (fire-and-forget); re-render settings if it's open when status resolves
checkOnline().then(()=>{ if(location.hash.indexOf("settings")>=0 && window.Vouch.renderSettings) window.Vouch.renderSettings(); });
})();
