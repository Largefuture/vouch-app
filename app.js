/* Vouch app — vanilla SPA. Router + views. Owns nothing it shouldn't: the worker owns the record. */
(function(){
const { store, trust } = window.Vouch;
const T = trust;
const $ = (s,r=document)=> r.querySelector(s);
const app = $("#app");

/* ---------- helpers ---------- */
const initials = n => (n||"?").split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase();
const esc = s => (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const stars = n => "★★★★★".slice(0,n) + "☆☆☆☆☆".slice(0,5-n);
const fmtPct = x => Math.round(x*100)+"%";
function timeAgo(iso){
  const d=(Date.now()-new Date(iso))/1000;
  if(d<3600) return Math.max(1,Math.round(d/60))+"m ago";
  if(d<86400) return Math.round(d/3600)+"h ago";
  if(d<86400*30) return Math.round(d/86400)+"d ago";
  if(d<86400*365) return Math.round(d/(86400*30))+"mo ago";
  return Math.round(d/(86400*365)*10)/10+"y ago";
}
function avatar(w,cls=""){ return `<div class="avatar ${cls}" style="background:linear-gradient(135deg,${w.color||'#0f9b6c'},#1b1d24)">${initials(w.name)}</div>`; }
const gradeColor = g => g[0]==="A"?"var(--emerald-d)":g[0]==="B"?"var(--blue)":g[0]==="C"?"var(--gold)":"var(--rose)";
// below this many verified customers, show "Building" instead of a (misleading) low grade
const PROVISIONAL_AT = 10;
// attestations (witnessed proof of conduct) are a SEPARATE evidence type — never blended into the customer score
const splitIx = ix => ({ cust: ix.filter(i=>i.kind!=="attestation"), attest: ix.filter(i=>i.kind==="attestation") });
function attestCard(a){
  return `<div class="ref" style="border-left-color:#7a5cc4"><div class="q">"${esc(a.comment)}"</div>
    <div class="by"><div class="avatar sm" style="width:30px;height:30px;font-size:12px;background:linear-gradient(135deg,#7a5cc4,#1b1d24)">${initials(a.attestorName)}</div>
      <b>${esc(a.attestorName)}</b> · <span style="color:#7a5cc4;font-weight:650">${esc(a.attestorRelation)}</span> · ${esc(a.attestorTenure)}
      ${a.contactable?'<span class="verified-tag" style="color:#7a5cc4">✓ will speak to it</span>':''}</div></div>`;
}

function gauge(score, size=118){
  const r=(size-16)/2, c=2*Math.PI*r, frac=Math.min(score/1000,1);
  const g = T.gradeFor(score), col = gradeColor(g);
  return `<div class="gauge" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="9"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-frac)}"/>
    </svg>
    <div class="num"><b style="color:${col}">${score}</b><span>of 1000</span></div></div>`;
}
function componentBars(tr){
  const rows=[
    ["Verified volume","volume",tr.components.volume],
    ["Verification depth","depth",tr.components.depth],
    ["Consistency over time","consistency",tr.components.consistency],
    ["Organic (unsolicited)","organic",tr.components.organic],
    ["Repeat-customer loyalty","loyalty",tr.components.loyalty],
    ["Contactable references","reference",tr.components.reference],
  ];
  return `<div class="bars">${rows.map(([lbl,key,v])=>`
    <div class="bar-row"><span class="lbl">${lbl} <span class="muted" style="font-weight:500">·${Math.round(T.WEIGHTS[key]*100)}%</span></span>
      <span class="val">${Math.round(v*100)}</span>
      <div class="track"><i style="width:${Math.max(2,v*100)}%"></i></div></div>`).join("")}</div>`;
}
function tierBadge(tier){ return `<span class="tier tier-${tier}"><span class="gem"></span>${tier} tier</span>`; }
function fauxQR(seedStr){
  let h=0; for(let i=0;i<seedStr.length;i++) h=(h*131+seedStr.charCodeAt(i))>>>0;
  let cells=""; const fixed=[0,1,2,8,9,10];
  for(let y=0;y<11;y++)for(let x=0;x<11;x++){
    const corner=(fixed.includes(x)&&[0,1,2,8,9,10].includes(y)&&(x<3||x>7)&&(y<3||y>7));
    let on; if(corner){ on=(x%2===0||y%2===0)&&!((x===1||x===9)&&(y===1||y===9)); }
    else { h=(h*1103515245+12345)>>>0; on=(h>>>16)%100<46; }
    cells+=`<i class="${on?'':'off'}"></i>`;
  }
  return `<div class="qr">${cells}</div>`;
}

function shareUrl(h){
  // A REAL link that resolves wherever the app is hosted (works on any origin/subpath).
  if(location.protocol.startsWith("http"))
    return location.origin + location.pathname.replace(/[^/]*$/,"") + "#/r/" + h;
  return "https://largefuture.github.io/vouch-app/#/r/" + h;   // opened as a file → the public install
}
async function nativeShare(title, text, url){
  // Phone-native share sheet (SMS, WhatsApp, IG…) with copy-link fallback on desktop.
  if(navigator.share){ try{ await navigator.share({ title, text, url }); return true; }catch(e){ return false; } }
  copy(url); return true;
}
function flowUrl(h){ return shareUrl(h).replace("#/r/","#/f/"); }   // straight into "leave a vouch"

/* Lite-Brite share card — a 1080×1350 image built on-device (no server, no tracker). */
function shareCardCanvas(w, tr, total){
  const c=document.createElement("canvas"); c.width=1080; c.height=1350; const x=c.getContext("2d");
  const g=x.createLinearGradient(0,0,1080,1350); g.addColorStop(0,"#15163a"); g.addColorStop(1,"#0a0a1e");
  x.fillStyle=g; x.fillRect(0,0,1080,1350);
  x.fillStyle="rgba(255,255,255,.05)";                                  // peg-board dots
  for(let py=30;py<1350;py+=44)for(let px=30;px<1080;px+=44){ x.beginPath(); x.arc(px,py,3,0,7); x.fill(); }
  const glow=(cx,cy,r,col)=>{ const rg=x.createRadialGradient(cx,cy,0,cx,cy,r); rg.addColorStop(0,col); rg.addColorStop(1,"rgba(0,0,0,0)"); x.fillStyle=rg; x.fillRect(cx-r,cy-r,r*2,r*2); };
  glow(140,120,340,"rgba(255,77,109,.32)"); glow(940,140,340,"rgba(77,139,255,.35)"); glow(540,1240,420,"rgba(39,229,164,.25)");
  x.textAlign="center";
  x.fillStyle="#27e5a4"; x.font="700 54px -apple-system,system-ui,sans-serif"; x.fillText("✓ Vouch",540,150);
  x.fillStyle="#f2f3fb"; x.font="800 92px -apple-system,system-ui,sans-serif";
  const name=(w.name||"").slice(0,18); x.fillText(name,540,420);
  x.fillStyle="#a9adc4"; x.font="600 46px -apple-system,system-ui,sans-serif"; x.fillText((w.role||"")+(w.city?" · "+w.city:""),540,495);
  if(tr&&tr.score>0){
    x.strokeStyle="#27e5a4"; x.lineWidth=16; x.shadowColor="#27e5a4"; x.shadowBlur=40;
    x.beginPath(); x.arc(540,780,190,-Math.PI/2,-Math.PI/2+2*Math.PI*Math.min(1,tr.score/1000)); x.stroke(); x.shadowBlur=0;
    x.fillStyle="#fff"; x.font="800 130px -apple-system,system-ui,sans-serif"; x.fillText(String(tr.score),540,810);
    x.fillStyle="#a9adc4"; x.font="600 40px -apple-system,system-ui,sans-serif"; x.fillText("Vouch Trust Score · grade "+tr.grade,540,890);
  } else {
    x.fillStyle="#ffd23f"; x.font="800 100px -apple-system,system-ui,sans-serif"; x.fillText("★ "+total+" vouches",540,800);
  }
  x.fillStyle="#e9eaf5"; x.font="650 44px -apple-system,system-ui,sans-serif";
  x.fillText("I own the proof of how I treat people.",540,1080);
  x.fillStyle="#7fe3c0"; x.font="600 40px -apple-system,system-ui,sans-serif"; x.fillText(shareUrl(w.handle).replace(/^https?:\/\//,""),540,1160);
  x.fillStyle="#6b6f8a"; x.font="500 34px -apple-system,system-ui,sans-serif"; x.fillText("Verified · portable · worker-owned · free forever",540,1250);
  return c;
}
async function shareCard(w, tr, total){
  try{
    const c=shareCardCanvas(w,tr,total);
    const blob=await new Promise(res=>c.toBlob(res,"image/png"));
    const file=new File([blob],"vouch-card.png",{type:"image/png"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:"My Vouch record", text:"I own the proof of how I treat people. "+shareUrl(w.handle)});
      return;
    }
    const a=document.createElement("a"); a.href=c.toDataURL("image/png"); a.download="vouch-card.png"; a.click();
    toast("Card saved — post it anywhere 🎆");
  }catch(e){ if(String(e).indexOf("Abort")<0) toast("Couldn't create the card"); }
}
function urlB64ToUint8(b64){ const pad="=".repeat((4-b64.length%4)%4); const s=(b64+pad).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(s); const arr=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) arr[i]=raw.charCodeAt(i); return arr; }
async function enablePush(){
  try{
    if(!("serviceWorker" in navigator) || !("PushManager" in window)){ toast("Notifications aren't supported here"); return; }
    const perm = await Notification.requestPermission(); if(perm!=="granted"){ toast("Notifications blocked in your browser"); return; }
    const reg = await navigator.serviceWorker.ready;
    const k = await window.Vouch.api.vapidKey(); if(!k||!k.key){ toast("Couldn't reach the push service"); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlB64ToUint8(k.key) });
    const r = await window.Vouch.api.pushSubscribe(sub.toJSON());
    toast(r&&r.ok?"Notifications on 🔔":"Couldn't enable notifications");
  }catch(e){ toast("Couldn't enable notifications"); }
}
function getGeo(){
  return new Promise(res=>{
    if(!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p=>res({lat:p.coords.latitude, lng:p.coords.longitude}),
      ()=>res(null), { timeout:6000, maximumAge:60000 });
  });
}
function pickReceipt(){
  const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.capture="environment";
  inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f) return; toast("Reading your receipt…");
    const r=new FileReader();
    r.onload=()=>{ const url=String(r.result); const b64=url.split(",")[1]; const mt=(url.match(/^data:([^;]+);/)||[])[1]||"image/jpeg";
      (window.Vouch.api?window.Vouch.api.ocr({image:b64, media_type:mt}):Promise.resolve({ok:false})).then(res=>{
        if(res&&res.ok&&res.matched){ flow.receiptVerified=true;
          flow.receiptText=[res.merchant,res.date,res.total!=null?("TOTAL $"+res.total):""].filter(Boolean).join("  ");
          toast("Receipt matched ✓"+(res.engine==="vision"?" ($"+res.total+")":"")); }
        else toast("Couldn't read a total & date — try a clearer photo");
        if(flow) renderFlow(); }); };
    r.readAsDataURL(f); };
  inp.click();
}
let toastT;
function toast(msg){ let t=$(".toast"); if(!t){ t=document.createElement("div"); t.className="toast"; document.body.appendChild(t);}
  t.textContent=msg; requestAnimationFrame(()=>t.classList.add("show")); clearTimeout(toastT);
  toastT=setTimeout(()=>t.classList.remove("show"),1900); }
function copy(text){ navigator.clipboard?.writeText(text).catch(()=>{}); toast("Link copied"); }

function topbar(showBack){ return `<div class="topbar"><div class="row">
  <div class="wordmark" data-act="home"><span class="seal">✓</span>Vouch</div>
  <div class="spacer"></div>
  <button class="ghost-btn" data-act="goto" data-h="#/how">How it works</button>
  <button class="ghost-btn" data-act="goto" data-h="#/manifesto">Manifesto</button>
</div></div>`; }

function tabbar(active){
  const tab=(h,ic,l)=>`<button class="${active===h?'on':''}" data-act="goto" data-h="${h}"><span class="ti">${ic}</span>${l}</button>`;
  return `<div class="tabbar"><div class="row">
    ${tab("#/worker","◎","Record")}
    ${tab("#/share","◇","Share")}
    ${tab("#/r/"+store.current().handle,"⤴","Preview")}
    ${tab("#/manifesto","✊","Movement")}
  </div></div>`;
}

/* ---------- views ---------- */
function vLanding(){
  app.innerHTML = topbar()+`<div class="shell fade">
    <div class="hero">
      ${illo('own')}
      <div class="badge pill em" style="margin-top:2px"><span class="dot"></span> Free forever · yours for life</div>
      <h1 class="serif">Own the proof of<br>how you treat people.</h1>
      <p class="lead mt-s">Your boss owns your reviews today. Walk out, and you keep nothing. Vouch flips it — <b>verified, portable, yours.</b></p>
      <button class="btn btn-primary mt" data-act="goto" data-h="#/onboard" style="max-width:320px;margin-left:auto;margin-right:auto">Start my free record →</button>
      <p class="center mt-s"><a class="plain" data-act="goto" data-h="#/how">▶ See how it works in 20 seconds</a></p>
    </div>

    <div class="eyebrow center" style="margin:16px 0 8px">Swipe — how it works</div>
    ${stepsCarousel('howLanding')}

    <div class="stack mt">
      <button class="picbtn" data-act="goto" data-h="#/onboard"><span class="emoji" style="background:var(--emerald-wash)">✊</span>
        <span><h3>I'm a worker</h3><small>Start my record — any customer-facing job</small></span><span class="chev">›</span></button>
      <button class="picbtn" data-act="goto" data-h="#/f/maria-reyes"><span class="emoji" style="background:var(--gold-wash)">💬</span>
        <span><h3>I got great service</h3><small>Leave a vouch on <i>their</i> record</small></span><span class="chev">›</span></button>
      <button class="picbtn" data-act="goto" data-h="#/how"><span class="emoji" style="background:var(--blue-wash)">🛡️</span>
        <span><h3>Is it legit?</h3><small>How Vouch keeps every vouch real</small></span><span class="chev">›</span></button>
    </div>

    <div class="card pad mt center stack-sm">
      <div class="eyebrow" style="color:var(--emerald-d)">Built on real proof</div>
      <p class="muted" style="font-size:13.5px;margin:0">Every vouch is checkable — phone, location, receipt or payment — and a gaming-detection engine quietly throws out the fakes.</p>
      <button class="btn btn-ghost btn-sm" style="width:auto;margin:2px auto 0" data-act="goto" data-h="#/how">See the safeguards →</button>
    </div>
    <p class="center muted mt" style="font-size:12px">Demo world loaded — explore <b>Maria</b>, <b>Renée</b> or <b>Devon</b>.</p>
  </div>`;
  hydrateCarousels();
}

function vWorker(){
  const w=store.current(); const ix=store.interactionsFor(w.handle);
  const {cust,attest}=splitIx(ix); const tr=T.computeTrust(cust);
  const verified = cust.filter(i=>T.isVerified(i.authSignals)).length;
  const refs = cust.filter(i=>i.customerName&&i.contactable);
  const total = cust.length+attest.length;
  const head = `<div class="row-between" style="padding:18px 2px 12px">
      <div style="display:flex;gap:12px;align-items:center">${avatar(w)}
        <div><h2>${esc(w.name)}</h2><small class="muted">${esc(w.role)} · ${esc(w.city)}</small></div></div>
      <button class="ghost-btn" data-act="goto" data-h="#/settings" title="Settings">⚙</button>
    </div>`;
  const captureCTA = `<button class="btn btn-primary" data-act="request-vouch">＋ &nbsp;Request a vouch now</button>`;

  if(total===0){ // empty state — a brand-new worker
    app.innerHTML = topbar()+`<div class="shell fade" style="padding-bottom:90px">${head}
      <div class="card pad-lg center stack">
        <div class="confetti">🌱</div><h2 class="serif">Your record starts now.</h2>
        <p class="muted">It's empty today — and it's already <b>yours</b>. The next great customer you serve can put the first proof on it. Build it once, keep it for life.</p>
        ${captureCTA}
        <button class="btn btn-ghost" data-act="goto" data-h="#/share">Get my code &amp; link</button>
      </div>
      <div class="note ink mt"><span class="nico">🛡️</span><div class="ntxt"><b>Nothing here can ever be used against you.</b> Vouch is positive-only and yours to delete anytime — <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/manifesto">our promise</a>.</div></div>
    </div>${tabbar("#/worker")}`; return;
  }

  // momentum: vouches in last 30 days
  const recent = ix.filter(i=>(Date.now()-new Date(i.createdAt))<86400000*30).length;
  app.innerHTML = topbar()+`<div class="shell fade" style="padding-bottom:90px">${head}

    <div class="card pad-lg stack">
      ${cust.length===0
        ? `<div style="display:flex;gap:14px;align-items:center"><div class="avatar lg" style="background:linear-gradient(135deg,#7a5cc4,#1b1d24)">🤝</div>
            <div><b style="font-size:18px">Witnessed record</b><br><small class="muted">${attest.length} colleague &amp; family accounts · ${recent} in the last 30 days</small>
            <div class="mt-s"><span class="pill" style="background:#efeaf9;color:#7a5cc4;border-color:#ddd0f2">Care &amp; behind-the-scenes work</span></div></div></div>`
      : verified<PROVISIONAL_AT
        ? `<div style="display:flex;gap:16px;align-items:center">
            <div class="avatar lg" style="background:linear-gradient(135deg,var(--emerald),#1b1d24);font-size:22px">${verified}</div>
            <div><b style="font-size:18px">Building your record</b><br>
              <small class="muted">${verified} verified · <b style="color:var(--emerald-d)">${PROVISIONAL_AT-verified} more</b> to unlock your first grade</small>
              <div class="track mt-s" style="max-width:160px"><i style="width:${Math.round(verified/PROVISIONAL_AT*100)}%"></i></div>
              <div class="mt-s"><span class="pill em">New · no grade shown yet</span></div></div></div>`
        : `<div class="gauge-wrap">${gauge(tr.score)}
            <div class="stack-sm">
              <span class="grade-badge" style="background:${gradeColor(tr.grade)}">${tr.grade}</span>
              <div>${tierBadge(tr.tier)}</div>
              <small class="muted">${total} lifetime vouches · ${recent} in the last 30 days</small>
            </div></div>`}
      <div class="note"><span class="nico">🔒</span><div class="ntxt"><b>This record is portable.</b> When you change jobs, it comes with you. Your employer can never delete or claim it — and it can never be used against you.</div></div>
      ${captureCTA}
    </div>

    <div class="stats mt">
      <div class="s"><b>${verified}</b><span>verified customers</span></div>
      <div class="s"><b>${fmtPct(tr.metrics.repeatRate)}</b><span class="sub">come back for you</span></div>
      <div class="s"><b>${refs.length+attest.filter(a=>a.contactable).length}</b><span>people who'll vouch live</span></div>
      <div class="s"><b>${fmtPct(tr.metrics.organicRatio)}</b><span>unprompted</span></div>
    </div>

    ${(()=>{ const MS=[1,5,10,25,50,100,250,500]; const hit=MS.filter(m=>total>=m).pop();
      return hit?`<div class="card pad mt" style="border-color:rgba(255,210,63,.4)">
        <div class="row-between"><div style="display:flex;gap:11px;align-items:center"><span style="font-size:26px">${hit>=100?'🏆':hit>=25?'🎆':'🎉'}</span>
          <div><b>${hit}+ vouches strong</b><br><small class="muted">That's real, verified proof — worth showing off.</small></div></div>
          <button class="btn btn-primary btn-sm" style="width:auto" data-act="share-card">🎇 Share card</button></div></div>`:''; })()}

    <div class="btn-row mt">
      <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/r/${w.handle}">⤴ &nbsp;View / export record</button>
      <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/share">◇ &nbsp;Share my code</button>
    </div>
    <button class="btn btn-ghost btn-sm mt-s" style="width:100%" data-act="invite-worker">💚 &nbsp;Know a great worker? Give them their own record</button>

    ${attest.length?`<h3 class="mt" style="margin-bottom:8px">Witnessed by colleagues &amp; families <span class="muted" style="font-weight:500;font-size:12px">— ${attest.length}</span></h3>
    <div class="card pad stack">${attest.slice(0,3).map(attestCard).join('<div class="divider"></div>')}</div>`:''}

    ${cust.length?`<h3 class="mt" style="margin-bottom:8px">Score breakdown <span class="muted" style="font-weight:500;font-size:12px">— transparent, positive-only</span></h3>
    <div class="card pad">${componentBars(tr)}</div>

    <h3 class="mt" style="margin-bottom:8px">Recent feedback</h3>
    <div class="card pad feed">${cust.slice(0,5).map(fbRow).join("")}</div>
    <p class="center mt"><a class="plain" data-act="seed-feedback">▶ Preview: a customer leaving you a vouch</a></p>`:''}
  </div>${tabbar("#/worker")}`;
}

function fbRow(i){
  const sigs=(i.authSignals||[]).map(s=>T.AUTH_LABEL[s]).filter(Boolean);
  return `<div class="fb"><div>${i.customerName?`<div class="avatar sm" style="background:linear-gradient(135deg,#b8852a,#1b1d24)">${initials(i.customerName)}</div>`:`<div class="avatar sm" style="background:var(--card-2);color:var(--ink-3)">★</div>`}</div>
    <div class="body"><div class="row-between"><span class="stars">${stars(i.rating)}</span>
      <small class="muted">${timeAgo(i.createdAt)}</small></div>
    <div class="q">${esc(i.comment)}</div>
    <div class="chipline">${(i.chips||[]).map(c=>`<span class="minichip">${esc(c)}</span>`).join("")}</div>
    <div class="meta">${i.customerName?`<span>— ${esc(i.customerName)}${i.contactable?' · <b style="color:var(--emerald-d)">OK to contact</b>':''}</span>`:'<span>Verified customer</span>'}
      ${T.isVerified(i.authSignals)?`<span class="verified-tag">✓ ${esc(sigs.slice(0,2).join(" · "))}</span>`:''}
      ${!i.solicited?'<span class="pill" style="padding:2px 8px;font-size:10.5px">unprompted</span>':''}</div></div></div>`;
}

function vShare(){
  const w=store.current();
  app.innerHTML = topbar()+`<div class="shell fade" style="padding-bottom:90px">
    <div style="padding:18px 2px"><h2>Share your code</h2>
      <p class="muted" style="font-size:14px">A customer scans or taps — and leaves feedback that lands on <b>your</b> record.</p></div>
    <div class="card pad-lg center stack">
      ${store.sync.status().online && window.Vouch.api
        ? `<img src="${window.Vouch.api.qrUrl(w.handle)}" alt="Your Vouch QR" width="170" height="170" style="border-radius:16px;background:#fff;padding:10px;border:1px solid var(--line);box-shadow:var(--shadow)" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='grid';">
           <div style="display:none">${fauxQR(w.handle)}</div>`
        : fauxQR(w.handle)}
      <div><b>${esc(w.name)}</b><br><small class="muted">${esc(w.role)}</small></div>
      <div class="linkcard"><span>🔗</span><code>${shareUrl(w.handle)}</code>
        <button class="btn btn-ghost btn-sm" data-act="copy" data-v="${shareUrl(w.handle)}">Copy</button></div>
      <button class="btn btn-primary" data-act="request-vouch">＋ Request a vouch now</button>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="share-card">🎇 My share card</button>
        <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/f/${w.handle}">▶ Preview</button></div>
    </div>
    <div class="card pad mt stack-sm">
      <h3>Care or behind-the-scenes work?</h3>
      <p class="muted" style="font-size:13px">If the people you help can't leave feedback, a <b>coworker, supervisor or family member</b> can witness your work instead — kept separate, never naming who you cared for.</p>
      <button class="btn btn-ghost btn-sm" style="width:auto" data-act="goto" data-h="#/vouch-for/${w.handle}">＋ Ask someone to witness my work</button>
    </div>
    <div class="note ink mt"><span class="nico">🕶️</span><div class="ntxt"><b>Discreet by default — your boss never needs to know.</b> Your code lives on <i>your</i> things, not the company's. Collect <b>after</b> service or off-shift, in addition to whatever your workplace uses. It's your personal record, and that's your right. <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/rights">Know your rights &amp; collect safely →</a></div></div>
    <div class="card pad mt stack-sm">
      <h3>The natural moments — in the flow of what already happens</h3>
      <p class="muted" style="font-size:13px">The ask works when it rides a moment that <b>already exists</b> in the transaction — after the work is done and paid for, never competing with your duties:</p>
      ${[["🧾","The receipt moment","They're already holding proof of the transaction. “If you were happy, my personal QR is on my card.” Five seconds, after payment."],
         ["💳","Right after the tip / checkout","The service is complete, gratitude is at its peak, and nothing you say changes what they paid. This is the single best moment."],
         ["📱","The follow-up text (gig & appointment work)","Ride's over, hair's done, house is clean → one text from YOUR phone, on YOUR time: “Thanks for today — if I did right by you, this takes 30 seconds.”"],
         ["🗣️","When THEY bring it up","“You were amazing” → “That means a lot — would you put that on my record? It follows me, not the company.” The unprompted vouch scores highest anyway."]]
        .map(x=>`<div style="display:flex;gap:11px;align-items:flex-start;padding:6px 0"><span style="font-size:17px">${x[0]}</span><div><b style="font-size:14px">${x[1]}</b><br><small class="muted">${x[2]}</small></div></div>`).join('<div class="divider" style="margin:0"></div>')}
      <div class="kpi-inline" style="gap:10px;margin-top:4px">
        <span class="pill">📱 Phone lock screen</span><span class="pill">📲 Instagram / TikTok bio</span>
        <span class="pill">🪪 Personal card</span><span class="pill">📌 Enamel pin (your own)</span></div>
      <div class="note" style="margin-top:6px"><span class="nico">🤝</span><div class="ntxt"><b>Softly, never pushy.</b> The moment costs the customer nothing, costs your employer nothing, and takes nothing from your work — it just captures what already happened. Vouch <i>rewards</i> unprompted feedback, so you never have to pressure anyone.</div></div>
    </div>
  </div>${tabbar("#/share")}`;
}

/* ---------- feedback flow ---------- */
let flow=null;
function startFlow(handle){
  flow={ w:null, handle, step:0, rating:0, chips:new Set(), comment:"", name:"", contactable:false,
    phone:"", otp:"", otpVerified:false, geoVerified:false, receiptVerified:false, receiptText:"",
    payVerified:false, tipped:false, remote:false, venue:"their workplace", lat:null, lng:null, before:null,
    shareBusiness:true };
  getGeo().then(g=>{ if(g && flow && flow.handle===handle){ flow.lat=g.lat; flow.lng=g.lng; } }); // best-effort device location
  const local=store.worker(handle);
  if(local){ // worker previewing on their own device → local path
    flow.w=local; flow.remote=false; flow.geoVerified=true;
    flow.venue=store.interactionsFor(handle)[0]?.venue||local.workplace||"their workplace";
    renderFlow(); return;
  }
  // a real customer who scanned a QR / opened a shared link → fetch the worker from the API
  app.innerHTML = `<div class="topbar"><div class="row"><div class="wordmark" data-act="home"><span class="seal">✓</span>Vouch</div></div></div>
    <div class="shell center" style="margin-top:60px"><span class="spin"></span><p class="muted mt-s">Loading…</p></div>`;
  if(window.Vouch.api){
    window.Vouch.api.record(handle).then(r=>{
      if(r&&r.ok&&r.worker){ flow.w=r.worker; flow.remote=true; flow.venue=r.worker.workplace||"their workplace"; renderFlow(); }
      else app.innerHTML = topbar()+`<div class="shell fade"><div class="card pad-lg center" style="margin-top:40px"><div class="confetti">🔎</div><h2 class="serif">Worker not found</h2><p class="muted">This Vouch code isn't active.</p><button class="btn btn-ghost mt" data-act="home">Home</button></div></div>`;
    });
  } else { app.innerHTML = topbar()+`<div class="shell center" style="margin-top:60px"><p class="muted">Offline — can't load this worker.</p></div>`; }
}
function renderFlow(){
  const f=flow, w=f.w; const total=5;
  const prog=`<div class="progress">${[0,1,2,3,4].map(s=>`<i class="${s<=f.step?'on':''}"></i>`).join("")}</div>`;
  let body="";
  if(f.step===0){
    body=`<div class="center stack">
      ${avatar(w,'lg')}
      <div><div class="eyebrow">You were just looked after by</div><h1 class="serif" style="margin-top:4px">${esc(w.name.split(" ")[0])} 👋</h1>
        <p class="lead mt-s">${esc(w.role)} · ${esc(f.venue)}</p></div>
      <div class="note" style="text-align:left"><span class="nico">💚</span><div class="ntxt"><b>This goes on ${esc(w.name.split(" ")[0])}'s own career record</b> — not the company's. You're helping a real person carry the proof of their work to wherever they go next.</div></div>
      <div><p style="font-weight:700;margin-bottom:6px">How did ${esc(w.name.split(" ")[0])} do?</p>
        <div class="bigstars">${[1,2,3,4,5].map(n=>`<button class="${f.rating>=n?'on':''}" data-act="rate" data-n="${n}">${"★"}</button>`).join("")}</div></div>
    </div>`;
  } else if(f.step===1){
    body=`<div class="stack"><h2 class="serif">What stood out?</h2><p class="muted">Tap anything that fits. Skip if you'd rather not.</p>
      <div class="choice-grid">${window.Vouch.CHIPS.map(c=>`<button class="choice ${f.chips.has(c)?'on':''}" data-act="chip" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>`;
  } else if(f.step===2){
    body=`<div class="stack"><h2 class="serif">Want to say more?</h2>
      <textarea rows="4" placeholder="What made ${esc(w.name.split(" ")[0])} great? (optional)" data-act="comment">${esc(f.comment)}</textarea>
      <div class="hr-or">turn this into a real reference</div>
      <input type="text" placeholder="Your name (so it counts as a named endorsement)" value="${esc(f.name)}" data-act="name">
      <div class="toggle ${f.contactable?'on':''}" data-act="contactable"><div class="sw"></div>
        <div class="txt"><b>A future employer may contact me to verify</b><small>The strongest thing you can give — a real, callable reference.</small></div></div>
      <div class="toggle ${f.shareBusiness?'on':''}" data-act="share-business"><div class="sw"></div>
        <div class="txt"><b>Also send this praise to ${esc(f.venue)}</b><small>Help ${esc(w.name.split(" ")[0])} get recognized where they work. Managers see who their best people really are — from real customers, not a survey.</small></div></div>
    </div>`;
  } else if(f.step===3){
    const otpRow = f.otpVerified
      ? vrowDone("📱","Phone verified","One real person, not a bot")
      : `<div class="vrow"><div class="vico">📱</div><div class="vbody"><b>Verify it's really you</b>
          <small>Keeps fake reviews off ${esc(w.name.split(" ")[0])}'s record</small>
          <div class="mt-s" style="display:flex;gap:8px">
            <input type="tel" placeholder="Your phone" value="${esc(f.phone)}" data-act="phone" style="flex:1">
            ${f.otpSent?`<input type="text" placeholder="Code 123456" value="${esc(f.otp)}" data-act="otp" style="width:110px">`:''}
          </div>
          <div class="mt-s">${f.otpSent
            ? `<button class="btn btn-primary btn-sm" data-act="otp-verify">Verify code</button> <small class="muted">demo code auto-filled</small>`
            : `<button class="btn btn-ghost btn-sm" data-act="otp-send">Text me a code</button>`}</div></div></div>`;
    body=`<div class="stack"><h2 class="serif">Make it count</h2>
      <p class="muted">Verification is what makes this feedback worth something. The more you add, the more ${esc(w.name.split(" ")[0])}'s record can be trusted.</p>
      ${otpRow}
      ${f.geoVerified?vrowDone("📍","On-premises confirmed",`Detected at ${esc(f.venue)} just now`):''}
      ${f.receiptVerified?vrowDone("🧾","Receipt matched","$48.20 · tonight · receipt-linked")
        :`<div class="vrow"><div class="vico">🧾</div><div class="vbody"><b>Snap your receipt</b><small>Strongest proof: a real transaction</small></div>
          <button class="btn btn-ghost btn-sm" style="width:auto" data-act="receipt">Add</button></div>`}
      <div class="note" style="background:var(--card-2);border-color:var(--line)"><span class="nico">🔒</span><div class="ntxt"><b>No tip required, ever.</b> Your feedback is never tied to money — that's what keeps ${esc(w.name.split(" ")[0])}'s record trustworthy to a future employer. (You can leave a separate tip after, if you want.)</div></div>
    </div>`;
  } else if(f.step===4){
    const after=f.serverTrust||f.after; const before=f.before;
    const delta=(after&&before)?after.score-before.score:null;
    body=`<div class="delta stack fade">
      <div class="confetti">🎉</div><h2 class="serif">Thank you.</h2>
      <p class="muted">You just strengthened ${esc(w.name.split(" ")[0])}'s permanent, portable record${f.remote?' — saved to their account':''}.</p>
      <div class="ring">${gauge(after.score,128)}</div>
      <div class="up">${delta&&delta>0?`▲ +${delta} points · `:''}now grade ${after.grade}</div>
      <div class="card pad" style="text-align:left"><div class="row-between"><b>What you added</b></div>
        <div class="chipline mt-s">${f.addedSignals.map(s=>`<span class="pill em">✓ ${esc(T.AUTH_LABEL[s])}</span>`).join("")}
          ${f.contactable&&f.name?`<span class="pill gold">★ Named reference</span>`:''}</div></div>
      ${f.tipped
        ? `<div class="note gold" style="text-align:left"><span class="nico">💛</span><div class="ntxt"><b>Tip sent — thank you.</b> Kept completely separate from the record, exactly as promised.</div></div>`
        : `<div class="card pad" style="text-align:left"><div class="row-between" style="align-items:flex-start"><div><b>Want to tip ${esc(w.name.split(" ")[0])} too?</b><br><small class="muted">Totally optional, and a <b>separate</b> thank-you — it does <b>not</b> affect the record. Honest feedback you can't pay for is the whole point.</small></div></div>
            <div class="btn-row mt-s"><button class="btn btn-ghost btn-sm" data-act="tip-demo" data-n="5">Tip $5</button><button class="btn btn-ghost btn-sm" data-act="tip-demo" data-n="10">Tip $10</button></div></div>`}
      <div class="note ink" style="text-align:left"><span class="nico">✨</span><div class="ntxt"><b>You're a service worker too?</b> You can own a record exactly like this. It's free, and it's yours for life.</div></div>
      <button class="btn btn-primary" data-act="enter-worker">Start my own Vouch record</button>
      <button class="btn btn-dark" data-act="invite-worker">💚 Send Vouch to a worker who deserves it</button>
      <button class="btn btn-ghost" data-act="goto" data-h="#/r/${w.handle}">See ${esc(w.name.split(" ")[0])}'s full public record</button>
    </div>`;
  }
  const canNext = f.step!==0 || f.rating>0;
  const nav = f.step<4 ? `<div class="mt" style="padding-top:8px">
      ${f.step===3
        ? `<button class="btn btn-primary" data-act="submit">Submit my vouch${f.otpVerified?'':' →'}</button>
           ${f.otpVerified?'':'<p class="center muted mt-s" style="font-size:12px">You can submit right now — verifying just makes it count for more. No account needed.</p>'}`
        : `<button class="btn btn-primary" data-act="next" ${canNext?'':'disabled style=opacity:.45'}>${f.step===0?'Continue':'Continue'}</button>`}
      ${f.step>0&&f.step<4?`<button class="btn btn-ghost mt-s" data-act="back">Back</button>`:''}
    </div>` : "";
  app.innerHTML = `<div class="topbar"><div class="row"><div class="wordmark" data-act="home"><span class="seal">✓</span>Vouch</div>
    <div class="spacer"></div><small class="muted">${f.step<4?`Step ${f.step+1} of 4`:'Done'}</small></div></div>
    <div class="shell fade"><div class="flow-head">${f.step<4?prog:''}</div>${body}${nav}</div>`;
}
function vrowDone(ic,t,s){ return `<div class="vrow done"><div class="vico">${ic}</div><div class="vbody"><b>${esc(t)}</b><small>${esc(s)}</small></div><div class="vact">✓</div></div>`; }

function submitFeedback(){
  const f=flow, w=f.w;
  if(f.remote){ // real customer → send to the worker's server record
    const body={ rating:f.rating||5,
      comment:f.comment||(f.rating>=5?"Great service — left through Vouch.":"Thanks for the service."),
      chips:[...f.chips], customer_name:f.name||null, contactable:!!(f.name&&f.contactable), solicited:false,
      customer_hash: store.hashPhone(f.phone)||("c_anon_"+Date.now()),
      phone:f.phone||null, otp_code: f.otpVerified?(f.otp||"123456"):null,
      receipt_text: f.receiptVerified?(f.receiptText||"The Gilded Owl  03/14/2026  TOTAL $48.20"):null,
      lat:f.lat||null, lng:f.lng||null, venue:f.venue, shareBusiness:!!f.shareBusiness };
    const btn=document.querySelector('[data-act="submit"]'); if(btn){ btn.textContent="Sending…"; }
    window.Vouch.api.feedback(w.handle, body).then(r=>{
      if(r&&r.ok){ f.serverTrust=r.trust; f.before=null; f.addedSignals=r.attached_signals||[]; f.step=4; confetti(); renderFlow(); }
      else toast("Couldn't submit — please try again");
    });
    return;
  }
  f.before = T.computeTrust(store.interactionsFor(w.handle));
  const sig=[]; if(f.otpVerified)sig.push("phone_otp"); if(f.geoVerified)sig.push("geofence");
  if(f.receiptVerified)sig.push("receipt"); // tip/payment is intentionally NOT a record signal — feedback is never tied to money
  if(f.name&&f.contactable)sig.push("contactable_ref");
  f.addedSignals=sig.slice();
  const inter={ id:"i_new_"+Date.now(), workerHandle:w.handle, rating:f.rating||5,
    comment:f.comment|| (f.rating>=5?"Great service — left through Vouch.":"Thanks for the service."),
    chips:[...f.chips], customerHash: store.hashPhone(f.phone)|| ("c_anon_"+Date.now()),
    customerName:f.name||null, contactable:!!(f.name&&f.contactable), solicited:false,
    shareBusiness:!!f.shareBusiness,
    venue: store.interactionsFor(w.handle)[0]?.venue||"The Gilded Owl",
    createdAt:new Date().toISOString(), authSignals:sig };
  store.addInteraction(inter);
  f.after = T.computeTrust(store.interactionsFor(w.handle));
  f.step=4; confetti(); renderFlow();
}

/* ---------- public record (hiring view) ---------- */
function vRecord(handle){
  const w=store.worker(handle);
  if(w){ renderRecordLocal(w); return; }       // on this device → instant local render
  // not local (e.g. a hiring manager opened a shared/QR link) → fetch the public record
  app.innerHTML = topbar()+`<div class="shell wide fade"><div class="card pad-lg center" style="margin-top:40px">
    <span class="spin"></span><p class="muted mt-s">Loading verified record…</p></div></div>`;
  if(window.Vouch.api){
    window.Vouch.api.record(handle).then(r=>{
      if(r&&r.ok&&r.worker) renderRecordRemote(r);
      else app.innerHTML = topbar()+`<div class="shell fade"><div class="card pad-lg center" style="margin-top:40px">
        <div class="confetti">🔎</div><h2 class="serif">Record not found</h2>
        <p class="muted">This Vouch record isn't available${store.sync.status().online?'':" — you're offline"}.</p>
        <button class="btn btn-ghost mt" data-act="home">Back to start</button></div></div>`;
    });
  } else { app.innerHTML = topbar()+`<div class="shell center" style="margin-top:40px"><p class="muted">Offline — record unavailable.</p></div>`; }
}
function renderRecordLocal(w){
  const handle=w.handle;
  const ix=store.interactionsFor(w.handle); const {cust,attest}=splitIx(ix); const tr=T.computeTrust(cust);
  const verified=cust.filter(i=>T.isVerified(i.authSignals)).length;
  const allRefs=cust.filter(i=>i.customerName&&i.contactable);
  const refs=allRefs.slice(0,5);
  const attestContactable=attest.filter(a=>a.contactable).length;
  const attestSpanMo=attest.length?Math.round((Date.now()-Math.min(...attest.map(a=>new Date(a.createdAt).getTime())))/(86400000*30.44)):0;
  // rating distribution — the WHOLE picture, including the lows (anti-selection-bias)
  const dist=[1,2,3,4,5].map(s=>cust.filter(i=>i.rating===s).length);
  const below4=dist[0]+dist[1]+dist[2]; const maxD=Math.max(1,...dist);
  const attestBlock = attest.length?`<div class="card pad-lg mt stack">
      <div class="row-between"><h2 class="serif">Witnessed by colleagues &amp; families</h2><span class="pill" style="background:#efeaf9;color:#7a5cc4;border-color:#ddd0f2">${attest.length} accounts</span></div>
      <p class="muted" style="font-size:13.5px;margin-top:-4px">For care &amp; behind-the-scenes work, the people served often can't leave feedback. These are <b>verified witnesses</b> — coworkers, supervisors and families — attesting to specific things they saw. <b>The person cared for is never named.</b> Shown separately from customer feedback, never blended into a score.</p>
      ${attest.slice(0,6).map(attestCard).join('<div class="divider"></div>')}
      ${attestContactable?`<div class="note" style="background:#efeaf9;border-color:#ddd0f2"><span class="nico">🤝</span><div class="ntxt"><b>${attestContactable} witnesses will speak to it live</b> — masked relay, consent on file. A hiring manager can actually call.</div></div>`:''}
    </div>`:'';
  const flagged=tr.metrics.integrityPenalty>0.05;
  app.innerHTML = topbar()+`<div class="shell wide fade" style="padding-bottom:60px">
    <div class="record-hd stack">
      <div class="row-between"><div style="display:flex;gap:14px;align-items:center">${avatar(w,'lg')}
        <div><h1 style="font-size:24px;color:#fff">${esc(w.name)}</h1>
          <div class="muted" style="margin-top:2px">${esc(w.role)} · ${esc(w.city)}</div></div></div>
        <div class="center" style="flex:none">${cust.length===0
          ? `<span class="pill" style="background:#efeaf9;color:#7a5cc4;border-color:#ddd0f2">Witnessed record</span>`
          : verified<PROVISIONAL_AT
          ? `<span class="pill em">Building · ${verified} verified</span>`
          : `<span class="grade-badge" style="background:${gradeColor(tr.grade)};font-size:20px;padding:5px 10px">${tr.grade}</span><div style="margin-top:4px">${tierBadge(tr.tier)}</div>`}</div></div>
      ${w.headline?`<p class="serif" style="font-size:17px;color:#eef0f3">"${esc(w.headline)}"</p>`:''}
      <div class="watermark-seal">✓ Verified by Vouch · owned by the worker</div>
    </div>

    ${refs.length?`<div class="card pad-lg mt stack">
      <div class="row-between"><h2 class="serif">Reference desk</h2><span class="pill em">${allRefs.length} will take your call</span></div>
      <p class="muted" style="font-size:13.5px;margin-top:-4px">Real customers who served by ${esc(w.name.split(" ")[0])} and <b>agreed to be contacted</b> as references. Not a score — actual people you can reach. Consent verified; numbers masked until you connect.</p>
      ${refs.map(r=>`<div class="ref"><div class="q">"${esc(r.comment)}"</div>
        <div class="by"><div class="avatar sm" style="background:linear-gradient(135deg,#b8852a,#1b1d24);width:30px;height:30px;font-size:12px">${initials(r.customerName)}</div>
          <b>${esc(r.customerName)}</b> · verified customer · <span class="verified-tag">✓ consented</span>
          <button class="btn btn-ghost btn-sm" style="width:auto;margin-left:auto;padding:6px 12px" data-act="demo-call" data-n="${esc(r.customerName)}">📞 Connect</button></div></div>`).join('<div class="divider"></div>')}
      <div class="note"><span class="nico">⏱️</span><div class="ntxt"><b>This is your reference check — already done.</b> Pre-consented, contactable customers. The thing that normally costs you two days of phone tag.</div></div>
    </div>`:''}

    ${attestBlock}

    ${cust.length?`<div class="card pad mt stack-sm">
      <div class="row-between"><h3>The whole picture <span class="muted" style="font-weight:500;font-size:12px">— not a highlight reel</span></h3><small class="muted">${ix.length} verified interactions</small></div>
      <p class="muted" style="font-size:13px">Every verified interaction is shown — <b>including the ${below4} rated below 4★</b>. Workers can't hide their misses or cherry-pick their best tables. That's what makes the rest mean something.</p>
      <div class="bars" style="margin-top:6px">${[5,4,3,2,1].map(s=>`<div class="bar-row"><span class="lbl">${s}★</span><span class="val">${dist[s-1]}</span><div class="track"><i style="width:${Math.max(2,dist[s-1]/maxD*100)}%;background:${s>=4?'linear-gradient(90deg,var(--emerald),var(--emerald-d))':'linear-gradient(90deg,#d9b34b,#b8852a)'}"></i></div></div>`).join("")}</div>
      <div class="note ${flagged?'':' '}" style="${flagged?'background:var(--rose-wash);border-color:#f3cdc9':''}"><span class="nico">${flagged?'⚠':'🛡️'}</span><div class="ntxt">${flagged
        ? `<b>Integrity flags detected.</b> Vouch's anti-collusion engine found bursty / single-source / unverified activity and discounted this record by ${Math.round(tr.metrics.integrityPenalty*100)}%. Read it with care.`
        : `<b>No anomalies detected.</b> ${ix.length} interactions screened for collusion clusters, bursts, repeat-device farming and tip-bait. ${fmtPct(tr.metrics.organicRatio)} were left <b>unprompted</b>.`}</div></div>
    </div>

    <div class="stats mt">
      <div class="s"><b>${verified}</b><span>verified customers</span></div>
      <div class="s"><b>${tr.metrics.spanMonths.toFixed(0)} mo</b><span>track record</span></div>
      <div class="s"><b>${fmtPct(tr.metrics.repeatRate)}</b><span class="sub">return for them by name</span></div>
      <div class="s"><b>${allRefs.length}</b><span>contactable references</span></div>
    </div>

    <details class="card pad mt" style="cursor:pointer"><summary style="font-weight:700;font-size:15px">Trust Score detail <span class="muted" style="font-weight:500;font-size:12px">— secondary to the references above</span></summary>
      <div class="mt-s" style="display:flex;gap:14px;align-items:center"><span class="grade-badge" style="background:${gradeColor(tr.grade)}">${tr.grade}</span><div><b style="font-size:20px">${tr.score}</b><span class="muted"> / 1000</span> · <a class="plain" data-act="goto" data-h="#/methodology">how it's computed</a></div></div>
      <div class="mt">${componentBars(tr)}</div></details>`
      : `<div class="stats mt"><div class="s"><b>${attest.length}</b><span>witnessed accounts</span></div>
          <div class="s"><b>${attestSpanMo} mo</b><span>of witnessed care</span></div></div>`}

    <div class="btn-row mt"><button class="btn btn-primary" data-act="export" data-h="${w.handle}">⬇ &nbsp;Export / print record</button></div>
    <div class="btn-row mt-s"><button class="btn btn-dark btn-sm" data-act="copy" data-v="${shareUrl(w.handle)}">⤴ Share link</button>
      <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/methodology">How it works</button></div>
    <p class="center muted mt" style="font-size:12px">Record portable across employers · owned by the worker · last updated ${timeAgo(ix[0]?.createdAt||w.createdAt)}</p>
  </div>`;
}

function renderRecordRemote(r){
  const w=r.worker, tr=r.trust||{}, st=r.stats||{}, m=tr.metrics||{};
  const refs=r.references||[], attest=r.attestations||[];
  const dist=r.rating_distribution||[0,0,0,0,0]; const below4=dist[0]+dist[1]+dist[2]; const maxD=Math.max(1,...dist);
  const hasCust=(st.customer_feedback||0)>0;
  const prov=hasCust && (m.V||0)<PROVISIONAL_AT;
  const flagged=(m.integrity_penalty||0)>0.05;
  app.innerHTML = topbar()+`<div class="shell wide fade" style="padding-bottom:60px">
    <div class="record-hd stack">
      <div class="row-between"><div style="display:flex;gap:14px;align-items:center">${avatar(w,'lg')}
        <div><h1 style="font-size:24px;color:#fff">${esc(w.name)}</h1><div class="muted" style="margin-top:2px">${esc(w.role)}${w.city?' · '+esc(w.city):''}</div></div></div>
        <div class="center" style="flex:none">${!hasCust?`<span class="pill" style="background:#efeaf9;color:#7a5cc4;border-color:#ddd0f2">Witnessed record</span>`:prov?`<span class="pill em">Building · ${m.V||0} verified</span>`:`<span class="grade-badge" style="background:${gradeColor(tr.grade)};font-size:20px;padding:5px 10px">${tr.grade}</span><div style="margin-top:4px">${tierBadge(tr.tier)}</div>`}</div></div>
      ${w.headline?`<p class="serif" style="font-size:17px;color:#eef0f3">"${esc(w.headline)}"</p>`:''}
      <div class="watermark-seal">✓ Verified by Vouch · owned by the worker</div>
    </div>
    <div class="note ink mt"><span class="nico">🛡️</span><div class="ntxt"><b>A live, verified record</b>, loaded from the worker's Vouch account — owned by the worker, positive-only, and you can't alter it.${flagged?' <b style="color:#ffb4ad">⚠ Integrity flags present.</b>':''}</div></div>
    ${refs.length?`<div class="card pad-lg mt stack"><div class="row-between"><h2 class="serif">Reference desk</h2><span class="pill em">${st.contactable_references||refs.length} will take your call</span></div>
      <p class="muted" style="font-size:13.5px;margin-top:-4px">Real customers who agreed to be contacted. Consent verified; numbers masked until you connect.</p>
      ${refs.map(x=>`<div class="ref"><div class="q">"${esc(x.comment)}"</div><div class="by"><div class="avatar sm" style="background:linear-gradient(135deg,#b8852a,#1b1d24);width:30px;height:30px;font-size:12px">${initials(x.customerName)}</div><b>${esc(x.customerName)}</b> · verified customer · <span class="verified-tag">✓ consented</span><button class="btn btn-ghost btn-sm" style="width:auto;margin-left:auto;padding:6px 12px" data-act="demo-call" data-n="${esc(x.customerName)}">📞 Connect</button></div></div>`).join('<div class="divider"></div>')}</div>`:''}
    ${attest.length?`<div class="card pad-lg mt stack"><div class="row-between"><h2 class="serif">Witnessed by colleagues &amp; families</h2><span class="pill" style="background:#efeaf9;color:#7a5cc4;border-color:#ddd0f2">${attest.length} accounts</span></div>
      <p class="muted" style="font-size:13.5px;margin-top:-4px">Verified witnesses to behind-the-scenes work. The person cared for is never named.</p>
      ${attest.slice(0,6).map(attestCard).join('<div class="divider"></div>')}</div>`:''}
    ${hasCust?`<div class="card pad mt stack-sm"><div class="row-between"><h3>The whole picture <span class="muted" style="font-weight:500;font-size:12px">— not a highlight reel</span></h3><small class="muted">${st.customer_feedback} verified</small></div>
      <p class="muted" style="font-size:13px">Every verified interaction counts — <b>including the ${below4} rated below 4★</b>. Nothing hidden.</p>
      <div class="bars" style="margin-top:6px">${[5,4,3,2,1].map(s=>`<div class="bar-row"><span class="lbl">${s}★</span><span class="val">${dist[s-1]}</span><div class="track"><i style="width:${Math.max(2,dist[s-1]/maxD*100)}%;background:${s>=4?'linear-gradient(90deg,var(--emerald),var(--emerald-d))':'linear-gradient(90deg,#d9b34b,#b8852a)'}"></i></div></div>`).join("")}</div></div>`:''}
    <div class="stats mt"><div class="s"><b>${st.customer_feedback||0}</b><span>verified customers</span></div>
      <div class="s"><b>${m.span_months!=null?m.span_months.toFixed(0):'—'} mo</b><span>track record</span></div>
      <div class="s"><b>${m.repeat_rate!=null?fmtPct(m.repeat_rate):'—'}</b><span class="sub">return by name</span></div>
      <div class="s"><b>${(st.contactable_references||0)+attest.filter(a=>a.contactable).length}</b><span>contactable</span></div></div>
    ${hasCust&&tr.components?`<details class="card pad mt"><summary style="font-weight:700;font-size:15px">Trust Score detail</summary>
      <div class="mt-s" style="display:flex;gap:14px;align-items:center"><span class="grade-badge" style="background:${gradeColor(tr.grade)}">${tr.grade}</span><div><b style="font-size:20px">${tr.score}</b><span class="muted"> / 1000</span></div></div>
      <div class="mt">${componentBars(tr)}</div></details>`:''}
    <div class="btn-row mt"><button class="btn btn-dark" data-act="copy" data-v="${shareUrl(w.handle)}">⤴ Share this record</button>
      <button class="btn btn-ghost" data-act="goto" data-h="#/methodology">How it works</button></div>
    <p class="center muted mt" style="font-size:12px">Live record · owned by the worker · portable across employers</p>
  </div>`;
}

/* ---------- Vouch for Business (the B2B feedback product) ---------- */
function businessDigest(){
  // Illustrative digest: aggregate the demo world's CUSTOMER-SHARED feedback into one
  // sample business. Mirrors the server's /api/business/digest boundary — only feedback the
  // customer chose to share (default-on), only positive worker recognition, no Trust Score,
  // customers anonymous unless they opted to be contactable.
  const staff=[], themes={}, highlights=[]; let n=0, ratingSum=0, verified=0;
  store.allWorkers().forEach(w=>{
    if(w.handle==="tyler-brooks") return;                       // the flagged review-farm never reaches a business
    const cust=splitIx(store.interactionsFor(w.handle)).cust.filter(i=>i.shareBusiness!==false);
    if(!cust.length) return;
    let sum=0; cust.forEach(i=>{ n++; sum+=i.rating; ratingSum+=i.rating;
      if(T.isVerified(i.authSignals)) verified++;
      (i.chips||[]).forEach(c=>themes[c]=(themes[c]||0)+1);
      highlights.push({comment:i.comment, rating:i.rating, worker:w.name, role:w.role,
        chips:i.chips||[], sigs:(i.authSignals||[]).map(s=>T.AUTH_LABEL[s]).filter(Boolean),
        customer:i.contactable?i.customerName:null, when:i.createdAt}); });
    staff.push({name:w.name, role:w.role, handle:w.handle, shared:cust.length, avg:sum/cust.length});
  });
  staff.sort((a,b)=>b.shared-a.shared);
  highlights.sort((a,b)=>b.rating-a.rating || new Date(b.when)-new Date(a.when));
  return {n, avg:n?ratingSum/n:0, verifiedRate:n?verified/n:0,
    themes:Object.entries(themes).map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count).slice(0,8),
    highlights:highlights.slice(0,6), staff};
}
function vEmployer(){
  const d=businessDigest();
  app.innerHTML = topbar()+`<div class="shell wide fade">
    <div style="padding:18px 2px"><div class="eyebrow">Vouch for Business</div>
      <h1 class="serif" style="font-size:26px;margin-top:4px">The point-of-service feedback your surveys can't get.</h1>
      <p class="lead mt-s">Your "How did we do?" email gets a 2% reply — mostly from the angriest customers. Vouch feedback is left <b>at the moment of service</b>, by a real person, <b>verified</b> against phone, receipt, location or your POS. It's the most authentic voice-of-customer data in your building — and it comes with the name of the employee who earned it.</p></div>

    <div class="stats">
      <div class="s"><b>${d.n}</b><span>verified customer notes</span></div>
      <div class="s"><b>${d.avg?d.avg.toFixed(1):'—'}★</b><span class="sub">avg at point of service</span></div>
      <div class="s"><b>${Math.round(d.verifiedRate*100)}%</b><span>transaction-verified</span></div>
      <div class="s"><b>${d.staff.length}</b><span>staff recognized</span></div>
    </div>

    <h3 class="mt" style="margin-bottom:8px">Why it beats your current survey</h3>
    <div class="card pad stack-sm">
      ${[["📉→📈","Response rate","Emailed CSAT/NPS: ~2% reply, days later, skewed to complaints. Vouch: captured in the moment, from customers happy enough to act — real signal, not just noise."],
         ["✅","Impossible to fake","Every note is checked against phone, receipt, geofence, or your POS transaction log. Our integrity engine discards bursty, single-source, or purchased reviews before you ever see them."],
         ["🙋","Attributed to a person","You finally see which employees customers rave about, by name — the recognition data you can't buy and your survey never captures."],
         ["🎯","Themes, not vanity","Aggregated tags (speed, warmth, problem-solving) show what's working across a location — coaching signal, not a star average."]]
        .map(x=>`<div style="display:flex;gap:11px;align-items:flex-start;padding:6px 0"><span style="font-size:17px">${x[0]}</span><div><b style="font-size:14px">${x[1]}</b><br><small class="muted">${x[2]}</small></div></div>`).join('<div class="divider" style="margin:0"></div>')}
    </div>

    ${d.themes.length?`<h3 class="mt" style="margin-bottom:8px">What your customers are praising</h3>
    <div class="card pad"><div class="chipline">${d.themes.map(t=>`<span class="minichip">${esc(t.tag)} · ${t.count}</span>`).join("")}</div></div>`:''}

    ${d.staff.length?`<h3 class="mt" style="margin-bottom:8px">Recognize your best people <span class="muted" style="font-weight:500;font-size:12px">— positive only, never a ranking</span></h3>
    <div class="card pad">${d.staff.map((s,i)=>`<div class="lb" style="border-bottom:${i<d.staff.length-1?'1px solid var(--line-2)':'none'}">
        <div class="rank">${i+1}</div>
        <div class="body"><b>${esc(s.name)}</b> <small class="muted">· ${esc(s.role)}</small>
          <div style="margin-top:3px"><small class="muted">${s.shared} customers spoke up · ${s.avg.toFixed(1)}★ avg</small></div></div>
        <div class="sc"><span class="pill em">★ recognized</span></div></div>`).join("")}</div>`:''}

    ${d.highlights.length?`<h3 class="mt" style="margin-bottom:8px">Sample of what you'd receive</h3>
    <div class="card pad feed">${d.highlights.map(h=>`<div class="fb"><div class="avatar sm" style="background:linear-gradient(135deg,#b8852a,#1b1d24)">${initials(h.worker)}</div>
      <div class="body"><div class="row-between"><span class="stars">${stars(h.rating)}</span><small class="muted">${timeAgo(h.when)}</small></div>
        <div class="q">${esc(h.comment)}</div>
        <div class="chipline">${(h.chips||[]).map(c=>`<span class="minichip">${esc(c)}</span>`).join("")}</div>
        <div class="meta"><span>for <b>${esc(h.worker)}</b> · ${esc(h.role)}</span>${h.sigs.length?`<span class="verified-tag">✓ ${esc(h.sigs.slice(0,2).join(" · "))}</span>`:''}${h.customer?`<span class="pill" style="padding:2px 8px;font-size:10.5px">from ${esc(h.customer)}</span>`:'<span class="pill" style="padding:2px 8px;font-size:10.5px">anonymous</span>'}</div></div></div>`).join('<div class="divider"></div>')}</div>`:''}

    <div class="note ink mt"><span class="nico">🤝</span><div class="ntxt"><b>The deal that keeps everyone honest.</b> The business pays for this verified feedback channel — which is what makes Vouch <b>free for workers, forever</b>. You never receive negative scores, worker rankings, or any worker's private portable record. You get what the customer chose to share, with the employee credited. <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/privacy">How the boundary is enforced →</a></div></div>

    <div class="card pad mt center stack-sm">
      <h3>Want this for your locations?</h3>
      <p class="muted" style="font-size:13px">Verified point-of-service feedback + employee recognition, delivered weekly. Priced per location — and it funds the free worker product underneath it.</p>
      <button class="btn btn-primary" data-act="copy" data-v="business@vouch — pilot request">Request a pilot for my business</button>
    </div>
    <p class="center muted mt" style="font-size:11.5px">Sample digest, aggregated from demo data. Real digests are per-location and include only customer-shared, consented feedback.</p>
  </div>`;
}

/* ---------- methodology ---------- */
function vMethod(){
  const tyler=store.worker("tyler-brooks"); const tTr=tyler?T.computeTrust(store.interactionsFor("tyler-brooks")):null;
  const rowW=Object.entries(T.WEIGHTS).map(([k,v])=>`<div class="bar-row"><span class="lbl" style="text-transform:capitalize">${k}</span><span class="val">${Math.round(v*100)}% weight</span><div class="track"><i style="width:${v*100*4}%"></i></div></div>`).join("");
  const rowA=Object.entries(T.AUTH_WEIGHTS).map(([k,v])=>`<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--line-2)"><span>${esc(T.AUTH_LABEL[k])}</span><b>+${v.toFixed(2)} strength</b></div>`).join("");
  app.innerHTML = topbar()+`<div class="shell fade">
    <div style="padding:18px 2px"><div class="eyebrow">The moat is the methodology</div>
      <h1 class="serif" style="font-size:26px;margin-top:4px">The Vouch Trust Score</h1>
      <p class="lead mt-s">A credit score works because it's transparent and consistent. So does this. Nothing here is a black box — a worker and a hiring manager see the exact same math.</p></div>

    <h3 class="mt" style="margin-bottom:8px">1 · What we score (and how much it counts)</h3>
    <div class="card pad bars">${rowW}</div>

    <h3 class="mt" style="margin-bottom:8px">2 · How each interaction is verified</h3>
    <div class="card pad">${rowA}<p class="muted mt-s" style="font-size:13px">An interaction counts as <b>verified</b> when it has a receipt, payment, or POS link — or both phone <i>and</i> location. Signals stack, capped at full strength.</p></div>

    <h3 class="mt" style="margin-bottom:8px">3 · Why aggressive begging hurts you</h3>
    <div class="note"><span class="nico">🌱</span><div class="ntxt"><b>Unprompted feedback is weighted higher</b> and counts toward your "organic" component. Bursts, recycled phone numbers and single-source floods trigger an <b>integrity penalty</b> that multiplies the whole score down. Quiet and real beats loud and fake.</div></div>

    ${tTr?`<h3 class="mt" style="margin-bottom:8px">4 · See it catch gaming</h3>
    <div class="card pad stack-sm"><div class="row-between"><div><b>Tyler Brooks</b><br><small class="muted">${store.interactionsFor("tyler-brooks").length} reviews, all 5★</small></div>
      <div class="center"><b style="font-size:22px;color:${gradeColor(tTr.grade)}">${tTr.score}</b><br><small class="muted">grade ${tTr.grade}</small></div></div>
      <div class="note rose" style="background:var(--rose-wash);border:1px solid #f3cdc9"><span class="nico">⚠</span><div class="ntxt">Integrity penalty <b>−${Math.round(tTr.metrics.integrityPenalty*100)}%</b> applied: bursts of reviews minutes apart from the same number, almost no verified transactions, zero organic. Volume can't buy a Vouch score.</div></div></div>`:''}

    <div class="btn-row mt"><button class="btn btn-ghost" data-act="goto" data-h="#/r/maria-reyes">See a real record</button>
      <button class="btn btn-primary" data-act="home">Back to start</button></div>
    <p class="center mt"><a class="plain" data-act="reset">↺ Reset demo world</a></p>
  </div>`;
}

/* ---------- onboarding ---------- */
let onboard={ stealth:true, contact:false, venueLat:null, venueLng:null };
function vOnboard(){
  const o=onboard;
  app.innerHTML = topbar()+`<div class="shell fade">
    <div style="padding:18px 2px"><h1 class="serif" style="font-size:26px">Start your record</h1>
      <p class="lead mt-s">Free, and yours for life. No employer needed — this is <b>your</b> personal record. Any customer-facing job works.</p></div>
    <div class="card pad stack">
      <input type="text" id="ob-name" placeholder="Your name">
      <input type="text" id="ob-role" placeholder="Your role (Bartender, Stylist, Driver, Cleaner, Teller…)">
      <input type="text" id="ob-city" placeholder="City">
      <textarea id="ob-head" rows="2" placeholder="One line about how you work (optional)"></textarea>

      <div class="divider"></div>
      <h3>Your safety &amp; control</h3>
      <div class="toggle ${o.stealth?'on':''}" data-act="ob-toggle" data-k="stealth"><div class="sw"></div>
        <div class="txt"><b>Discreet mode</b><small>Your code lives on your <i>personal</i> stuff (phone, socials, a card) — never employer property. Your boss never needs to know you're building this.</small></div></div>
      <div class="toggle ${o.contact?'on':''}" data-act="ob-toggle" data-k="contact"><div class="sw"></div>
        <div class="txt"><b>Let customers reach me as a reference</b><small><b>Off by default.</b> When off, all feedback is anonymous-to-you and no one can contact you. You can turn this on per-person later, masked, and revoke anytime.</small></div></div>
      <div class="toggle ${o.venueLat?'on':''}" data-act="ob-geo"><div class="sw"></div>
        <div class="txt"><b>Set my workplace location</b><small>${o.venueLat?'Location saved ✓ — customers who verify on-site strengthen your record.':'Optional: lets on-premises customer vouches be geofence-verified. Nothing is shared with your employer.'}</small></div></div>
      <div class="note ${o.contact?'gold':''}"><span class="nico">${o.contact?'⚠️':'🛡️'}</span><div class="ntxt">${o.contact
        ? `Contact is <b>ON</b>. Only people you individually approve can reach you, always through masked relay — your real number, location and schedule stay hidden. You can switch this off anytime.`
        : `Contact is <b>OFF</b> — the safe default. You still collect verified feedback; no customer can ever reach you. Recommended for overnight, in-home, solo and safety-sensitive work.`}</div></div>

      <button class="btn btn-primary" data-act="create">Create my Service Record</button>
      <p class="center muted" style="font-size:12px">By starting, this record is <b>yours</b> — portable across every job, for life.<br>
        <a class="plain" data-act="goto" data-h="#/privacy">Privacy: what we hold &amp; never touch</a> · <a class="plain" data-act="goto" data-h="#/terms">Terms</a></p>
    </div>
    <div class="hr-or" style="margin:18px 0">or explore the demo</div>
    <div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/worker/maria-reyes">Maria · bartender</button>
      <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/worker/renee-adams">Renée · stylist</button>
      <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/worker/devon-carter">Devon · driver</button></div>
  </div>`;
}

/* ---------- manifesto (the movement) ---------- */
function vManifesto(){
  const rights=[
    ["🪪","Your reputation is yours","The proof of how you treat people belongs to you — not your employer, not a platform. It should follow you to every job, for life."],
    ["➕","Yours to collect — alongside, not instead of","You have the right to build your own verifiable record, on your own time, in addition to whatever system your employer runs. No boss can require it — and none should punish you for owning it."],
    ["📤","Portable, or it's not yours","You can export it, show it, and take it anywhere. The day you quit, you keep every word. No one can delete or claim it."],
    ["🔍","Earned, not bought","Every entry is verified and the scoring is public. No fake reviews, no pay-to-win. Credibility is the whole point — we protect it ruthlessly."],
    ["🛡️","Safe by default","Customers can never contact you unless you individually allow it, always masked. Your number, location and schedule are never exposed. Built for overnight, in-home and solo workers first."],
    ["🕶️","Yours to use quietly","Collect on your own terms, on your own things. No employer permission required to own your own record. Discreet by default."],
    ["💚","Free for workers, forever","Workers never pay. That's a promise, not a pricing tier. If money ever enters, it comes from those who want to recognize you — never from you."],
  ];
  app.innerHTML = topbar()+`<div class="shell fade">
    <div style="padding:20px 2px 6px"><div class="eyebrow">The movement</div>
      <h1 class="serif" style="font-size:28px;margin-top:6px">The Worker Reputation<br>Bill of Rights</h1>
      <p class="lead mt-s">For everyone who does the most human work and has the least to show for it. The barista customers ask for by name. The driver with 5,000 perfect trips. The aide families thank at the funeral. The stylist whose clients drive across town. <b>You earned the trust. You should own the proof.</b></p></div>
    <div class="card stack" style="padding:6px">
      ${rights.map((r,i)=>`<div class="role pad" style="cursor:default"><div class="ico" style="background:var(--emerald-wash)">${r[0]}</div>
        <div><h3>${i+1}. ${r[1]}</h3><small class="muted">${r[2]}</small></div></div>${i<rights.length-1?'<div class="divider" style="margin:0 14px"></div>':''}`).join("")}
    </div>
    <h3 class="mt" style="margin:6px 2px 8px">Our promises — and what we'll <i>never</i> do</h3>
    <div class="card pad stack-sm">
      ${[
        ["🚫","No boss can ever require it","Vouch can't be mandated by an employer or used as a condition of work. If it ever is, that's a violation of these rights."],
        ["➕","Positive-only — never used against you","There are no negative scores. Nothing here can be used to discipline, rank-down, or punish you. You add proof; no one subtracts."],
        ["⚪","An empty record is never a red flag","Not having a Vouch is never held against anyone. New workers, returning workers, people rebuilding — absence is never a penalty."],
        ["🔒","We will never sell your data","Not to employers, not to platforms, not to anyone. Vouch is built to be governed as a worker trust/co-op — your record can't be sold out from under you."],
        ["⬇️","Export and delete, anytime, for real","One tap to download everything. One tap to delete everything, permanently. Ownership means the right to walk away."],
        ["♿","Built to include, not divide","Multilingual, low-bandwidth, assisted onboarding. A reputation tool that only helps the already-advantaged isn't pro-worker."],
      ].map(p=>`<div style="display:flex;gap:11px;align-items:flex-start;padding:7px 0"><span style="font-size:17px">${p[0]}</span><div><b style="font-size:14px">${p[1]}</b><br><small class="muted">${p[2]}</small></div></div>`).join('<div class="divider" style="margin:0"></div>')}
    </div>

    <div class="note ink mt"><span class="nico">🌐</span><div class="ntxt"><b>Why now, and why this:</b> there's no other product that puts the record in the worker's hands. The more workers who own theirs, the more every customer interaction spreads it — and the stronger each worker's hand when they <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/employer">ask to be recognized</a>. Authenticity through use. Power through numbers.</div></div>
    <button class="btn btn-primary mt" data-act="goto" data-h="#/onboard">Claim my record — free →</button>
    <div class="btn-row mt-s"><button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/rights">⚖ Know your rights &amp; how to collect safely</button>
      <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/methodology">How scoring works</button></div>
  </div>`;
}

/* ---------- export (portability made real) ---------- */
function vExport(handle){
  const w=store.worker(handle)||store.current(); if(!w){ vLanding(); return; }
  const ix=store.interactionsFor(w.handle); const {cust,attest}=splitIx(ix); const tr=T.computeTrust(cust);
  const refs=cust.filter(i=>i.customerName&&i.contactable).slice(0,8);
  const verified=cust.filter(i=>T.isVerified(i.authSignals)).length;
  const total=cust.length+attest.length;
  const d=new Date();
  app.innerHTML = `<div class="printbar"><b>Your portable record</b><div class="spacer" style="flex:1"></div>
      <button class="btn btn-primary btn-sm" data-act="do-print">⬇ Print / Save as PDF</button>
      <button class="btn btn-ghost btn-sm" data-act="copy" data-v="${shareUrl(w.handle)}">Copy link</button>
      <button class="ghost-btn" data-act="goto" data-h="#/r/${w.handle}">Close</button></div>
    <div class="shell wide print-doc fade" style="padding-top:18px;padding-bottom:60px">
      <div class="row-between" style="border-bottom:2px solid var(--ink);padding-bottom:14px">
        <div><div style="display:flex;align-items:center;gap:8px"><span class="seal">✓</span><b style="font-size:17px">Vouch · Verified Service Record</b></div>
          <h1 class="serif" style="font-size:28px;margin-top:8px">${esc(w.name)}</h1>
          <div class="muted">${esc(w.role)}${w.city?" · "+esc(w.city):""}</div></div>
        <div class="center">${cust.length?`<span class="grade-badge" style="background:${gradeColor(tr.grade)}">${tr.grade}</span><div style="margin-top:4px">${tierBadge(tr.tier)}</div>`:`<span class="pill" style="background:#efeaf9;color:#7a5cc4">Witnessed record</span>`}</div>
      </div>
      ${w.headline?`<p class="serif mt" style="font-size:16px">"${esc(w.headline)}"</p>`:''}
      <div class="kpi-inline mt" style="gap:22px">
        <div class="k"><b>${total}</b><span>lifetime vouches</span></div>
        ${cust.length?`<div class="k"><b>${verified}</b><span>verified customers</span></div>
        <div class="k"><b>${fmtPct(tr.metrics.repeatRate)}</b><span>return by name</span></div>`:''}
        <div class="k"><b>${refs.length+attest.filter(a=>a.contactable).length}</b><span>contactable</span></div>
        <div class="k"><b>${tr.metrics.spanMonths?tr.metrics.spanMonths.toFixed(0):'—'} mo</b><span>track record</span></div>
      </div>
      ${refs.length?`<h3 class="mt" style="margin:18px 0 8px">Customer references (consented, contactable)</h3>
      <div class="stack-sm">${refs.map(r=>`<div class="ref"><div class="q">"${esc(r.comment)}"</div><div class="by"><b>${esc(r.customerName)}</b> · verified customer · ✓ OK to contact</div></div>`).join("")}</div>`:''}
      ${attest.length?`<h3 class="mt" style="margin:18px 0 8px">Witnessed by colleagues &amp; families</h3>
      <div class="stack-sm">${attest.slice(0,8).map(a=>`<div class="ref" style="border-left-color:#7a5cc4"><div class="q">"${esc(a.comment)}"</div><div class="by"><b>${esc(a.attestorName)}</b> · ${esc(a.attestorRelation)} · ${esc(a.attestorTenure)}</div></div>`).join("")}</div>`:''}
      <div class="note mt" style="margin-top:18px"><span class="nico">🛡️</span><div class="ntxt"><b>How to verify this record:</b> every entry was verified at the time it was left (phone, location, receipt, or a verified colleague/family witness). Confirm it live at <b>${shareUrl(w.handle)}</b>. This record is <b>owned by the worker</b>, positive-only, and cannot be altered by any employer.</div></div>
      <p class="muted mt" style="font-size:12px">Generated ${d.toLocaleDateString()} · Vouch — the Worker Reputation Bill of Rights</p>
    </div>`;
}

/* ---------- settings (data rights) ---------- */
let confirmDelete=false;
function vSettings(){
  const w=store.current(); if(!w){ vLanding(); return; }
  const stealth=w.stealth!==false, contact=!!w.contactDefault;
  app.innerHTML = topbar()+`<div class="shell fade" style="padding-bottom:90px">
    <div style="padding:18px 2px"><h1 class="serif" style="font-size:24px">Settings</h1>
      <p class="muted">Your record, your rules. ${esc(w.name)} · ${esc(w.role)}</p></div>

    <h3 style="margin-bottom:8px">Privacy &amp; safety</h3>
    <div class="card pad stack">
      <div class="toggle ${stealth?'on':''}" data-act="set-stealth"><div class="sw"></div>
        <div class="txt"><b>Discreet mode</b><small>Your code stays on your personal things; your employer never needs to know.</small></div></div>
      <div class="toggle ${contact?'on':''}" data-act="set-contact"><div class="sw"></div>
        <div class="txt"><b>Allow customers to reach me as a reference</b><small>${contact?'On — masked relay, you approve each one, revocable anytime.':'Off — feedback is anonymous-to-you; no one can contact you. The safe default.'}</small></div></div>
    </div>

    <h3 class="mt" style="margin-bottom:8px">Your data</h3>
    <div class="card pad stack-sm">
      <button class="btn btn-ghost" data-act="export" data-h="${w.handle}">⬇ &nbsp;Export / download my record (PDF)</button>
      <button class="btn btn-ghost" data-act="copy" data-v="${shareUrl(w.handle)}">🔗 &nbsp;Copy my shareable link</button>
      <button class="btn ${confirmDelete?'btn-dark':'btn-ghost'}" data-act="delete-data" style="${confirmDelete?'background:var(--rose)':'color:var(--rose)'}">${confirmDelete?'⚠ Tap again to permanently delete everything':'🗑 Delete my record &amp; all data'}</button>
      <p class="muted" style="font-size:12px">Deletion is real and immediate — it removes your record and every vouch from this device. No copies kept.</p>
    </div>

    ${(()=>{ const s=store.sync.status(); const gated=s.signedIn&&s.online; return `<h3 class="mt" style="margin-bottom:8px">Account &amp; cloud backup</h3>
    <div class="card pad stack-sm">
      <div class="row-between"><div><b>${s.signedIn?'<span style="color:var(--emerald-d)">● Signed in</span>':(s.online?'<span class="muted">○ Not signed in</span>':'<span class="muted">○ Offline — working locally</span>')}</b>
        <br><small class="muted">${s.signedIn?esc(s.email)+(s.last?' · backed up '+timeAgo(new Date(s.last).toISOString()):' · ready to back up'):(s.online?'Sign in to back up &amp; restore across devices.':'Your record is safe on this device. Sign-in is optional.')}</small></div>
        ${s.busy?'<span class="spin"></span>':''}</div>
      ${s.signedIn
        ? `<div class="toggle ${s.enabled?'on':''}" data-act="sync-toggle"><div class="sw"></div><div class="txt"><b>Auto-back-up after changes</b><small>Local-first: your device is always the source of truth.</small></div></div>
           <div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="sync-now" ${gated?'':'disabled style=opacity:.45'}>↑ Back up now</button>
            <button class="btn btn-ghost btn-sm" data-act="sync-restore" ${gated?'':'disabled style=opacity:.45'}>↓ Restore</button>
            <button class="btn btn-ghost btn-sm" data-act="signout">Sign out</button></div>`
        : `<button class="btn btn-primary" data-act="goto" data-h="#/signin" ${s.online?'':'disabled style=opacity:.45'}>${s.online?'Sign in to back up':'Offline — sign-in unavailable'}</button>`}
      <small class="muted" style="font-size:11.5px">Server: ${esc(s.base||'(none)')} · We never sell your data and you can delete it anytime — <a class="plain" data-act="goto" data-h="#/privacy">privacy policy</a> · <a class="plain" data-act="goto" data-h="#/terms">terms</a>.</small>
    </div>`; })()}

    ${store.sync.status().signedIn?`<h3 class="mt" style="margin-bottom:8px">Notifications</h3>
    <div class="card pad stack-sm">
      <p class="muted" style="font-size:13px">Get a ping when a customer vouches for you — the only notification we ever send.</p>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="push-enable">🔔 Enable notifications</button>
        <button class="btn btn-ghost btn-sm" data-act="push-test">Send a test</button></div>
    </div>`:''}

    <div class="note ink mt"><span class="nico">📜</span><div class="ntxt"><b>Your rights are non-negotiable.</b> No employer can require this or use it against you. It's positive-only and yours to delete. <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/rights">Know your rights →</a> · <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/manifesto">the promise →</a></div></div>
  </div>${tabbar("#/worker")}`;
}

/* ---------- attestation (witnessed proof, the equity channel) ---------- */
let aform={relation:"Coworker",tenure:"",witnessed:"",name:"",contactable:false,handle:"",workerName:"",remote:false};
function vVouchFor(handle){
  aform.handle=handle;
  const local=store.worker(handle);
  if(local){ aform.workerName=local.name; aform.remote=false; renderVouchFor(local.name); return; }
  app.innerHTML = `<div class="topbar"><div class="row"><div class="wordmark" data-act="home"><span class="seal">✓</span>Vouch</div></div></div>
    <div class="shell center" style="margin-top:60px"><span class="spin"></span><p class="muted mt-s">Loading…</p></div>`;
  if(window.Vouch.api){ window.Vouch.api.record(handle).then(r=>{
    if(r&&r.ok&&r.worker){ aform.workerName=r.worker.name; aform.remote=true; renderVouchFor(r.worker.name); }
    else app.innerHTML = topbar()+`<div class="shell fade"><div class="card pad-lg center" style="margin-top:40px"><h2 class="serif">Worker not found</h2><button class="btn btn-ghost mt" data-act="home">Home</button></div></div>`;
  }); } else app.innerHTML = topbar()+`<div class="shell center" style="margin-top:60px"><p class="muted">Offline.</p></div>`;
}
function renderVouchFor(name){
  const first=name.split(" ")[0];
  const rels=["Coworker","Supervisor","Family of someone they care for"];
  app.innerHTML = `<div class="topbar"><div class="row"><div class="wordmark" data-act="home"><span class="seal">✓</span>Vouch</div><div class="spacer" style="flex:1"></div><small class="muted">Witness a colleague</small></div></div>
    <div class="shell fade">
      <div style="padding:18px 2px"><div class="eyebrow">Vouch for</div><h1 class="serif" style="font-size:26px;margin-top:4px">${esc(name)}</h1>
        <p class="lead mt-s">Some of the best work — care work, behind-the-scenes work — never gets a customer review. If you've <b>witnessed</b> how ${esc(first)} works, put it on their record. <b>Never name the person they care for.</b></p></div>
      <div class="card pad stack">
        <div><p style="font-weight:700;margin-bottom:7px">Your relationship</p>
          <div class="choice-grid">${rels.map(r=>`<button class="choice ${aform.relation===r?'on':''}" data-act="a-rel" data-r="${esc(r)}">${esc(r)}</button>`).join("")}</div></div>
        <input type="text" placeholder="How long have you known their work? (e.g. 2 years)" value="${esc(aform.tenure)}" data-act="a-tenure">
        <div><p style="font-weight:700;margin-bottom:6px">What did you witness? <span class="muted" style="font-weight:500">— be specific, it's the proof</span></p>
          <textarea rows="4" placeholder="Something concrete you saw them do — not just 'they're nice'." data-act="a-witnessed">${esc(aform.witnessed)}</textarea></div>
        <input type="text" placeholder="Your name (verified, shown on the vouch)" value="${esc(aform.name)}" data-act="a-name">
        <div class="toggle ${aform.contactable?'on':''}" data-act="a-contact"><div class="sw"></div>
          <div class="txt"><b>A future employer may contact me to confirm this</b><small>Masked relay — your number stays private.</small></div></div>
        <button class="btn btn-primary" data-act="a-submit">Add my witnessed vouch</button>
        <p class="center muted" style="font-size:12px">This is a distinct kind of proof — shown separately from customer feedback, never blended into a score, and the person cared for is never named.</p>
      </div>
    </div>`;
}

function renderAForm(){ renderVouchFor(aform.workerName||"this worker"); }
function submitAttestation(){
  if(!aform.witnessed.trim()||!aform.name.trim()){ toast("Add what you witnessed and your name"); return; }
  const handle=aform.handle;
  if(aform.remote){ // remote witness → POST to the worker's server record
    window.Vouch.api.attestation(handle, { witnessed:aform.witnessed.trim(), attestorName:aform.name.trim(),
      attestorRelation:aform.relation, attestorTenure:aform.tenure.trim()||"—", contactable:aform.contactable })
      .then(r=>{ if(r&&r.ok){ toast("Witnessed vouch added — thank you 💜");
        aform={relation:"Coworker",tenure:"",witnessed:"",name:"",contactable:false,handle,workerName:aform.workerName,remote:true};
        location.hash="#/r/"+handle; } else toast("Couldn't submit — try again"); });
    return;
  }
  const w=store.worker(handle); if(!w) return;
  store.addInteraction({ id:"a_new_"+Date.now(), workerHandle:w.handle, kind:"attestation", rating:5,
    comment:aform.witnessed.trim(), attestorRelation:aform.relation,
    attestorTenure:aform.tenure.trim()||"—", attestorName:aform.name.trim(),
    customerName:aform.name.trim(), contactable:aform.contactable, solicited:false,
    venue:w.workplace||"—", createdAt:new Date().toISOString(),
    authSignals:["identity_verified","relationship_verified"] });
  toast("Witnessed vouch added — thank you 💜");
  aform={relation:"Coworker",tenure:"",witnessed:"",name:"",contactable:false,handle:w.handle};
  location.hash="#/r/"+w.handle;
}

/* ---------- rights & safe collection ---------- */
function vRights(){
  app.innerHTML = topbar()+`<div class="shell fade">
    <div style="padding:20px 2px 6px"><div class="eyebrow">Know your rights</div>
      <h1 class="serif" style="font-size:27px;margin-top:6px">The work you've proven is yours to keep.</h1>
      <p class="lead mt-s">You have a right to your own <b>work record</b> — to collect, own, and carry verifiable proof of how you treat people, <b>in addition to</b> whatever system your employer runs. Not instead of theirs. Alongside it. And no boss should be able to punish you for owning it.</p></div>

    <div class="card pad stack-sm">
      <h3>The right, in one line</h3>
      <p class="serif" style="font-size:16px">"The work you've proven is yours to keep, carry, and show — and no boss can punish you for owning it."</p>
      <div class="kpi-inline" style="gap:12px"><span class="pill em">Access</span><span class="pill em">Portability</span><span class="pill em">Freedom from retaliation</span></div>
    </div>

    <div class="note mt"><span class="nico">➕</span><div class="ntxt"><b>In addition to, not instead of.</b> Your employer keeps their reviews and NPS. This is your <i>personal</i> record — like a portfolio or your own thank-you notes. You're not taking their data; you're building your own.</div></div>

    <h3 class="mt" style="margin-bottom:8px">How to collect — safely</h3>
    <div class="card pad stack-sm">
      <p class="muted" style="font-size:13px">The safest way to collect is also the one that keeps it unmistakably <b>yours</b>:</p>
      <div class="vrow done"><div class="vico">✅</div><div class="vbody"><b>Do</b><small>After service, off the clock · on your own phone, card, or socials · only feedback a customer freely writes · framed as your personal record</small></div></div>
      <div class="vrow" style="border-color:#ecd9a8;background:var(--gold-wash)"><div class="vico">⚠️</div><div class="vbody"><b>Be careful</b><small>A personal pin on shift — check your uniform/solicitation policy first. On-premises asks are where conflict starts.</small></div></div>
      <div class="vrow" style="border-color:#f3cdc9;background:var(--rose-wash)"><div class="vico">⛔</div><div class="vbody"><b>Don't</b><small>Solicit on the clock or on company devices · use the company's customer list / POS / contact data · imply you speak for the brand. These are the only things that give an employer a real case.</small></div></div>
    </div>

    <h3 class="mt" style="margin-bottom:8px">Why this never disrupts your job — the stream-of-commerce principle</h3>
    <div class="card pad stack-sm">
      <p style="font-size:14px">Every Vouch moment is designed to sit <b>inside what already happens</b> in a transaction — never to add a new demand on your time or your employer's:</p>
      ${[["⏱️","It happens after the work, not during","The ask lives at the receipt, the checkout, the goodbye, the follow-up text — moments where the service is already complete and paid. Nothing is taken from a shift."],
         ["🛒","The customer was already there to buy","No one is recruited, diverted, or solicited who wasn't already your customer in the ordinary course of business. That's what keeps it clean — it documents commerce that happened; it doesn't create side-commerce."],
         ["🏢","Your employer's systems are untouched","No company POS, customer lists, email databases, or devices are used. Their reviews stay theirs; yours are collected on your own things. Two records, zero interference."],
         ["💵","No money changes direction","Feedback is never tied to the tip or the bill. Nothing a customer says to Vouch changes what the business earns — so there's no competing interest to point at."]]
        .map(x=>`<div style="display:flex;gap:11px;align-items:flex-start;padding:6px 0"><span style="font-size:17px">${x[0]}</span><div><b style="font-size:14px">${x[1]}</b><br><small class="muted">${x[2]}</small></div></div>`).join('<div class="divider" style="margin:0"></div>')}
    </div>

    <h3 class="mt" style="margin-bottom:8px">Legal ≠ safe from being fired — the honest picture</h3>
    <div class="card pad stack-sm">
      ${[["⚖️","Is it legal?","Collecting your own voluntary, written customer feedback is generally lawful — it's first-party and consensual, and there's no recording, so wiretap/consent laws don't apply."],
         ["📋","Is it against policy?","Sometimes — but blanket bans on what you do off-duty are legally shaky, and several states protect lawful off-duty activity."],
         ["⚡","Can they retaliate?","Under at-will employment, sometimes yes — even when it's legal. That's the real risk, and it's biggest for the most vulnerable workers. Know it going in."]].map(x=>`<div style="display:flex;gap:11px;align-items:flex-start;padding:6px 0"><span style="font-size:17px">${x[0]}</span><div><b style="font-size:14px">${x[1]}</b><br><small class="muted">${x[2]}</small></div></div>`).join('<div class="divider" style="margin:0"></div>')}
    </div>

    <div class="note ink mt"><span class="nico">🛡️</span><div class="ntxt"><b>What strengthens your hand:</b> doing it <i>together</i>. Workers acting collectively to improve their standing have far stronger protection (in the US, the NLRA protects "concerted activity" — even without a union). And feedback your employer collects that <i>names you</i> may be your data to access. <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/manifesto">See the full promise →</a></div></div>

    <h3 class="mt" style="margin-bottom:8px">Make it a right — the ask</h3>
    <div class="card pad stack-sm">
      <p style="font-size:14px">We're building toward a recognized <b>Right to Your Work Record</b>: access + portability + anti-retaliation — modeled on data-portability and gig-deactivation due-process laws, won state by state.</p>
      <p class="muted" style="font-size:13px">With the guardrail that keeps it from being twisted against workers: it must be <b>worker-chosen and never employer-required</b>, <b>positive-only</b>, and <b>you choose exactly what to show</b>. A right you can be forced to hand over isn't a right.</p>
    </div>

    <button class="btn btn-primary mt" data-act="goto" data-h="#/onboard">Start my record — free →</button>
    <p class="center muted mt" style="font-size:11.5px">General information, not legal advice. Laws vary by state and by your own employment agreement — check yours.</p>
  </div>`;
}

/* ---------- privacy policy (real, operational, plain-language) ---------- */
function vPrivacy(){
  const rows=[
    ["📱","Your record lives on YOUR phone first","Vouch is local-first. Your record is stored on your own device. If you never turn on cloud backup, nothing is ever sent to a server at all."],
    ["☁️","Cloud backup is opt-in — and scoped to you","If you sign in (email code, no password), your record syncs to our server so you can restore it on a new phone. It's tied to your account; no one else's token can read, change, or delete it."],
    ["📞","We never store phone numbers","When a customer verifies by phone, the number is used once, in memory, to create an anonymous one-way code — then discarded. The number itself is never written anywhere."],
    ["🧾","We never keep receipt photos","A receipt photo is read once to extract merchant/date/total, then discarded. The photo is never saved."],
    ["📍","We never store exact locations","On-site verification produces a yes/no answer. A customer's exact GPS point is never kept — only a coarse (~1 km) area, solely so review-farms can be caught."],
    ["🚯","No trackers. No ads. No analytics scripts.","The app contains zero ad-tech, zero analytics beacons, zero fingerprinting. Check the source — it's public."],
    ["🗑️","Delete means delete","One tap permanently erases your record from your device and our server. Not 'deactivated' — deleted."],
    ["🙅","We will never sell your data","Not to employers, not to data brokers, not to anyone, not ever. If Vouch can't survive without selling data, Vouch doesn't survive."],
  ];
  app.innerHTML = topbar()+`<div class="shell fade">
    <div style="padding:20px 2px 6px"><div class="eyebrow">Privacy — the real policy</div>
      <h1 class="serif" style="font-size:27px;margin-top:6px">What we hold, what we never touch.</h1>
      <p class="lead mt-s">Written to be read, not clicked past. This is enforced in the code, not just promised here.</p></div>
    <div class="card stack" style="padding:6px">
      ${rows.map((r,i)=>`<div class="role pad" style="cursor:default"><div class="ico" style="background:var(--emerald-wash)">${r[0]}</div>
        <div><h3>${r[1]}</h3><small class="muted">${r[2]}</small></div></div>${i<rows.length-1?'<div class="divider" style="margin:0 14px"></div>':''}`).join("")}
    </div>
    <h3 class="mt" style="margin-bottom:8px">The complete list of what our server holds (if you opt in)</h3>
    <div class="card pad stack-sm">
      <p style="font-size:13.5px">· Your email (sign-in only) · your name, role, city &amp; the workplace coordinates <i>you</i> chose to set · your vouches: rating, comment, first name of customers who opted to be referees · anonymous one-way customer codes · which verifications passed.</p>
      <p class="muted" style="font-size:13px">That's the whole list. No phone numbers, no photos, no exact GPS, no browsing data, no contacts, no payment info.</p>
    </div>
    <div class="note ink mt"><span class="nico">⚖️</span><div class="ntxt"><b>Who can see what:</b> your public record page shows only what you chose to make public. Customers' full names are never shown unless they opted in as a contactable reference. Employers see nothing unless <i>you</i> show them.</div></div>
    <div class="btn-row mt"><button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/terms">Terms of use</button>
      <button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/manifesto">The Vouch Promise</button></div>
    <p class="center muted mt" style="font-size:11.5px">Questions or a data request: delete and export are built into Settings — no email required.</p>
  </div>`;
}

/* ---------- terms (short, human, worker-protective) ---------- */
function vTerms(){
  app.innerHTML = topbar()+`<div class="shell fade">
    <div style="padding:20px 2px 6px"><div class="eyebrow">Terms of use</div>
      <h1 class="serif" style="font-size:27px;margin-top:6px">Short enough to actually read.</h1></div>
    <div class="card pad stack-sm">
      ${[
        ["1. It's yours","Your record belongs to you. We host it (if you opt into backup); we don't own it, license it, or monetize it. You can export or delete it at any time."],
        ["2. Free for workers, forever","No worker will ever be charged to create, keep, export, or share their record."],
        ["3. Be real","Fake vouches, purchased reviews, impersonation, and gaming the integrity engine are the only bannable offenses — because authenticity is the entire value of everyone's record."],
        ["4. Positive-only","Vouch stores no negative reviews and produces no negative signal about anyone. An empty or deleted record is never a mark against a worker."],
        ["5. No employer coercion","Employers may not require workers to use Vouch, demand access, or take action against a worker for having (or not having) a record. Employer accounts that abuse this get removed."],
        ["6. Respect the customer","Customers choose whether to verify and whether to be contactable. Their choices are honored exactly as made, and can't be overridden by anyone."],
        ["7. No warranty, no lawyers needed","Vouch is provided as-is. We work hard to keep it up and honest, but it's a free tool, not an insurance product. Nothing here is legal advice."],
      ].map(x=>`<div style="padding:7px 0"><b style="font-size:14px">${x[0]}</b><br><small class="muted">${x[1]}</small></div>`).join('<div class="divider" style="margin:0"></div>')}
    </div>
    <div class="btn-row mt"><button class="btn btn-ghost btn-sm" data-act="goto" data-h="#/privacy">Privacy policy</button>
      <button class="btn btn-primary btn-sm" data-act="goto" data-h="#/onboard">Start my record →</button></div>
  </div>`;
}

/* ---------- sign in (passwordless) ---------- */
let signin={ step:0, email:"", code:"", devCode:"", busy:false };
function vSignin(){
  const s=signin;
  app.innerHTML = topbar()+`<div class="shell fade">
    <div style="padding:20px 2px"><div class="eyebrow">Your account</div>
      <h1 class="serif" style="font-size:26px;margin-top:6px">Sign in to back up your record</h1>
      <p class="lead mt-s">No password — we email you a one-time code. Your record stays <b>yours</b>; this just lets you restore it on a new phone, and you can delete everything anytime. <a class="plain" data-act="goto" data-h="#/manifesto">our promise →</a></p></div>
    <div class="card pad stack">
      ${s.step===0?`
        <input type="text" inputmode="email" placeholder="you@email.com" value="${esc(s.email)}" data-act="signin-email">
        <button class="btn btn-primary" data-act="signin-request" ${s.busy?'disabled style=opacity:.6':''}>${s.busy?'Sending…':'Email me a sign-in code'}</button>
      `:`
        ${s.devCode?`<div class="note gold"><span class="nico">🔑</span><div class="ntxt"><b>Dev mode</b> (no mailer configured): your code is <b style="font-size:16px">${esc(s.devCode)}</b></div></div>`:`<p class="muted">We sent a 6-digit code to <b>${esc(s.email)}</b>.</p>`}
        <input type="text" inputmode="numeric" placeholder="6-digit code" value="${esc(s.code)}" data-act="signin-code">
        <button class="btn btn-primary" data-act="signin-verify" ${s.busy?'disabled style=opacity:.6':''}>${s.busy?'Verifying…':'Verify &amp; sign in'}</button>
        <button class="btn btn-ghost btn-sm" data-act="signin-back">Use a different email</button>
      `}
    </div>
    <div class="note ink mt"><span class="nico">🔒</span><div class="ntxt"><b>Offline-first:</b> you don't need an account to use Vouch. Signing in only enables cloud backup &amp; restore across devices.</div></div>
  </div>`;
}
function renderSignin(){ vSignin(); }

/* ---------- illustrations (inline SVG, theme-aware, self-contained) ---------- */
function illo(name){
  const S={
  own:`<svg class="illo float hero-illo" viewBox="0 0 200 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your verified record">
    <g stroke="#ffd23f" stroke-width="3" stroke-linecap="round" class="spark">
      <line x1="100" y1="6" x2="100" y2="18"/><line x1="60" y1="16" x2="66" y2="27"/><line x1="140" y1="16" x2="134" y2="27"/>
      <line x1="28" y1="52" x2="42" y2="56"/><line x1="172" y1="52" x2="158" y2="56"/></g>
    <rect x="52" y="30" width="96" height="112" rx="16" fill="#1e2050" stroke="#3a3d75" stroke-width="2"/>
    <circle cx="100" cy="66" r="22" fill="#15163a" stroke="#27e5a4" stroke-width="4"/>
    <path class="draw" d="M89 66 l7 8 l15 -17" fill="none" stroke="#27e5a4" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="68" y="100" width="64" height="8" rx="4" fill="#4d8bff"/><rect x="78" y="116" width="44" height="7" rx="3.5" fill="#3a3d75"/>
    <circle cx="40" cy="120" r="3.5" fill="#ff4d6d" class="spark"/><circle cx="164" cy="120" r="3.5" fill="#27e5a4" class="spark"/></svg>`,
  handoff:`<svg class="illo" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="36" y="12" width="48" height="76" rx="9" fill="#1e2050" stroke="#3a3d75" stroke-width="2"/>
    <rect x="46" y="24" width="28" height="28" rx="3" fill="#0e0f13"/>
    <g fill="#27e5a4"><rect x="49" y="27" width="6" height="6"/><rect x="65" y="27" width="6" height="6"/><rect x="49" y="43" width="6" height="6"/>
      <rect x="58" y="35" width="5" height="5"/><rect x="65" y="43" width="6" height="6"/><rect x="58" y="27" width="4" height="4"/></g>
    <rect x="50" y="60" width="20" height="4" rx="2" fill="#4d8bff"/><rect x="52" y="68" width="16" height="3" rx="1.5" fill="#3a3d75"/>
    <circle cx="60" cy="78" r="9" fill="none" stroke="#ffd23f" stroke-width="3" class="spark"/></svg>`,
  verify:`<svg class="illo" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M30 20 h34 v56 l-5 -4 -6 4 -6 -4 -6 4 -5 -4 z" fill="#f6f4ef"/>
    <g stroke="#b9bccc" stroke-width="3" stroke-linecap="round"><line x1="38" y1="32" x2="56" y2="32"/><line x1="38" y1="42" x2="56" y2="42"/><line x1="38" y1="52" x2="50" y2="52"/></g>
    <path d="M86 30 a13 13 0 1 0 -26 0 c0 11 13 24 13 24 s13 -13 13 -24 z" fill="#ff4d6d"/><circle cx="73" cy="30" r="5" fill="#fff"/>
    <circle cx="90" cy="74" r="15" fill="#27e5a4"/><path class="draw" d="M82 74 l6 7 l11 -13" fill="none" stroke="#04231a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  vouch:`<svg class="illo" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="20" y="18" width="80" height="50" rx="13" fill="#1e2050" stroke="#3a3d75" stroke-width="2"/>
    <path d="M38 66 l0 16 l18 -16 z" fill="#1e2050"/>
    <text x="60" y="51" text-anchor="middle" font-size="19" fill="#ffd23f" class="spark">★★★★★</text></svg>`,
  keep:`<svg class="illo" viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M60 12 l38 14 v24 c0 30 -23 44 -38 50 c-15 -6 -38 -20 -38 -50 v-24 z" fill="#15163a" stroke="#27e5a4" stroke-width="3"/>
    <path class="draw" d="M45 58 l10 11 l22 -26" fill="none" stroke="#27e5a4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="26" cy="30" r="3" fill="#ffd23f" class="spark"/><circle cx="96" cy="30" r="3" fill="#4d8bff" class="spark"/></svg>`};
  return S[name]||"";
}

/* the 4 real-life steps, reused on the landing and the How view */
const STEPS=[
  ["handoff","Share your code","Put a QR or link on your phone, socials or a little card — never company property. After great service, the customer taps it."],
  ["verify","Prove it's really real","Right there it quietly checks the truth: their phone, that they were on-site, even the receipt. Fakes don't get in."],
  ["vouch","A 20-second vouch","They tap a rating, a couple of tags, a line about you. No account, no pressure — softly asked, never pushy."],
  ["keep","Yours for life","It lands on YOUR record, not the company's. Change jobs and it comes with you. Positive-only, and deletable anytime."],
];
function stepsCarousel(id,full){
  const slides=STEPS.map((s,i)=>`<div class="slide"><div class="step">
    <div style="display:flex;align-items:center;gap:12px"><span class="n">${i+1}</span><div style="width:88px;flex:none">${illo(s[0])}</div></div>
    <h3>${s[1]}</h3><p>${s[2]}</p></div></div>`).join("");
  const dots=STEPS.map((_,i)=>`<button data-act="slide" data-t="${id}" data-i="${i}" class="${i===0?'on':''}" aria-label="slide ${i+1}"></button>`).join("");
  return `<div class="carousel ${full?'full':''}" id="${id}">${slides}</div><div class="dots">${dots}</div>`;
}

/* authenticity: the genuineness safeguards, shown visually */
function authTiles(){
  const t=[
    ["em","📞","Phone-verified","A one-time code to a real phone","+0.20"],
    ["blue","📍","On-premises","Device GPS matches the venue","+0.20"],
    ["gold","🧾","Receipt-matched","A photo of the receipt, read & matched","+0.35"],
    ["rose","💳","Payment / POS link","Tied to the real transaction","+0.50"],
    ["violet","🤝","Callable reference","A customer who'll pick up the phone","+0.40"],
    ["em","🛡️","Anti-gaming engine","Bursts & recycled numbers get thrown out","always on"],
  ];
  return `<div class="tiles">${t.map(([c,ic,b,s,str])=>`<div class="tile ${c}">
    <span class="ti">${ic}</span><b>${b}</b><small>${s}</small><small class="str">${str}</small></div>`).join("")}</div>`;
}
function authLadder(){
  const rows=[["📞","Phone-verified",0.20],["📍","On-premises",0.20],["🤝","Callable reference",0.40],
    ["🧾","Receipt-matched",0.35],["💳","Payment-linked",0.45],["🏷️","POS-linked",0.50]];
  rows.sort((a,b)=>b[2]-a[2]);
  return `<div class="ladder">${rows.map(([ic,l,v])=>`<div class="rung"><span class="ic">${ic}</span>
    <div><div style="font-size:13px;font-weight:650">${l}</div><div class="bar"><i style="width:${Math.round(v/0.5*100)}%"></i></div></div>
    <span class="v">+${v.toFixed(2)}</span></div>`).join("")}</div>`;
}

/* ---------- How it works (visual, real-life) ---------- */
function vHow(){
  app.innerHTML = topbar()+`<div class="shell fade">
    <div class="center" style="padding:18px 2px 2px">
      <div style="max-width:150px;margin:0 auto">${illo('keep')}</div>
      <div class="eyebrow" style="margin-top:6px">How Vouch works — in real life</div>
      <h1 class="serif" style="font-size:26px;margin-top:4px">Real service. Real proof. Yours.</h1>
      <p class="lead mt-s">Here's exactly what happens — and how every vouch stays genuine.</p></div>

    ${stepsCarousel('howFull',true)}

    <div class="card pad-lg stack mt">
      <div style="display:flex;gap:12px;align-items:center"><div style="width:52px;flex:none">${illo('verify')}</div>
        <div><div class="eyebrow" style="color:var(--emerald-d)">The authenticity engine</div><h2 style="margin-top:2px">Fakes don't get in</h2></div></div>
      <p class="muted" style="font-size:14px">Anyone can leave a compliment. A vouch only <b>counts</b> when it's backed by real-world proof — and the more proof, the more it weighs.</p>
      ${authTiles()}</div>

    <h3 class="mt" style="margin-bottom:8px">How strong is each proof?</h3>
    <div class="card pad">${authLadder()}
      <p class="muted mt-s" style="font-size:12.5px">A vouch is <b>verified</b> with a receipt, payment or POS link — or phone <i>and</i> location together. Signals stack.</p></div>

    <div class="note mt"><span class="nico">🛡️</span><div class="ntxt"><b>Quiet and real beats loud and fake.</b> Bursts of reviews minutes apart, recycled numbers and single-source floods trip an integrity penalty that drags the whole score down. <a class="plain" style="color:#7fe3c0" data-act="goto" data-h="#/methodology">See the exact math →</a></div></div>

    <h3 class="mt" style="margin-bottom:8px">A day in real life</h3>
    <div class="card pad stack-sm">
      <b>🍸 Maria pours a great round.</b>
      <p class="muted" style="font-size:13.5px;margin:0">The tab closes; she slides her little Vouch card across — or texts the link. The regular taps it, confirms the code on his phone, snaps the receipt. Twenty seconds, five stars, "best bartender on the block." It lands on <b>Maria's</b> record. Next year she moves bars — it comes with her.</p></div>

    <div class="btn-row mt"><button class="btn btn-ghost" data-act="goto" data-h="#/r/maria-reyes">See a real record</button>
      <button class="btn btn-primary" data-act="goto" data-h="#/onboard">Start mine →</button></div>
    <div style="height:24px"></div>
  </div>`;
  hydrateCarousels();
}

/* ---------- twinkle sky + swipeable carousels + confetti ---------- */
function ensureSky(){
  if(document.querySelector('.sky')) return;
  const cols=['#ffffff','#ffd23f','#4d8bff','#ff4d6d','#27e5a4'];
  const sky=document.createElement('div'); sky.className='sky'; let h='';
  for(let i=0;i<26;i++){ const s=(2+Math.random()*2.4).toFixed(1), c=cols[i%cols.length];
    h+=`<b style="left:${(Math.random()*100).toFixed(1)}%;top:${(Math.random()*100).toFixed(1)}%;width:${s}px;height:${s}px;background:${c};box-shadow:0 0 6px 1px ${c};animation-delay:${(Math.random()*3).toFixed(2)}s"></b>`; }
  sky.innerHTML=h; document.body.appendChild(sky);
}
let _cbTimers=[];
function clearCarousels(){ _cbTimers.forEach(clearInterval); _cbTimers=[]; }
function hydrateCarousels(){
  clearCarousels();
  document.querySelectorAll('.carousel').forEach(c=>{
    if(!c.children.length) return;
    const dots=(c.nextElementSibling&&c.nextElementSibling.classList.contains('dots'))?c.nextElementSibling:null;
    const setActive=i=>{ if(dots)[...dots.children].forEach((d,j)=>d.classList.toggle('on',j===i)); };
    const step=()=>c.children[0].offsetWidth+12;
    let raf; c.addEventListener('scroll',()=>{ cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>setActive(Math.max(0,Math.min(c.children.length-1,Math.round(c.scrollLeft/step()))))); },{passive:true});
    let idx=0,stop=false;
    ['pointerdown','touchstart','wheel'].forEach(ev=>c.addEventListener(ev,()=>{stop=true;},{passive:true,once:true}));
    const t=setInterval(()=>{ if(stop){clearInterval(t);return;} idx=(idx+1)%c.children.length;
      c.scrollTo({left:idx*step(),behavior:'smooth'}); setActive(idx); },4400);
    _cbTimers.push(t);
  });
}
function confetti(){
  const cols=['#ff4d6d','#ffd23f','#27e5a4','#4d8bff','#b79bff'];
  const b=document.createElement('div'); b.className='burst'; let h='';
  for(let i=0;i<64;i++){ const dur=(0.9+Math.random()*0.8).toFixed(2);
    h+=`<i style="left:${(Math.random()*100).toFixed(1)}%;background:${cols[i%cols.length]};animation-duration:${dur}s;animation-delay:${(Math.random()*0.25).toFixed(2)}s;transform:rotate(${(Math.random()*360)|0}deg)"></i>`; }
  b.innerHTML=h; document.body.appendChild(b); setTimeout(()=>b.remove(),2200);
}

/* ---------- router ---------- */
function route(){
  const h=location.hash||"#/";
  const parts=h.replace(/^#\//,"").split("/");
  window.scrollTo(0,0);
  clearCarousels();
  if(h==="#/"||h===""||parts[0]===""){ vLanding(); }
  else if(parts[0]==="worker"){ if(parts[1]) store.setCurrent(parts[1]); vWorker(); }
  else if(parts[0]==="onboard"){ vOnboard(); }
  else if(parts[0]==="share"){ vShare(); }
  else if(parts[0]==="f"){ startFlow(parts[1]); }
  else if(parts[0]==="r"){ vRecord(parts[1]); }
  else if(parts[0]==="employer"){ vEmployer(); }
  else if(parts[0]==="how"){ vHow(); }
  else if(parts[0]==="methodology"){ vMethod(); }
  else if(parts[0]==="manifesto"){ vManifesto(); }
  else if(parts[0]==="settings"){ vSettings(); }
  else if(parts[0]==="signin"){ vSignin(); }
  else if(parts[0]==="rights"){ vRights(); }
  else if(parts[0]==="privacy"){ vPrivacy(); }
  else if(parts[0]==="terms"){ vTerms(); }
  else if(parts[0]==="export"){ vExport(parts[1]||store.current()?.handle); }
  else if(parts[0]==="vouch-for"){ vVouchFor(parts[1]); }
  else vLanding();
}
window.addEventListener("hashchange",route);

/* ---------- actions (event delegation) ---------- */
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-act]"); if(!t) return;
  const a=t.dataset.act;
  const go=h=>{ if(location.hash===h) route(); else location.hash=h; };
  switch(a){
    case "home": go("#/"); break;
    case "goto": go(t.dataset.h); break;
    case "enter-worker": go("#/onboard"); break;
    case "ob-toggle": onboard[t.dataset.k]=!onboard[t.dataset.k]; vOnboard(); break;
    case "ob-geo": toast("Getting location…"); getGeo().then(g=>{ if(g){ onboard.venueLat=g.lat; onboard.venueLng=g.lng; toast("Workplace location saved ✓"); } else toast("Couldn't get your location"); vOnboard(); }); break;
    case "copy": copy(t.dataset.v); break;
    case "slide": { const c=document.getElementById(t.dataset.t); if(c&&c.children.length){ const w=c.children[0].offsetWidth+12; c.scrollTo({left:(+t.dataset.i)*w,behavior:'smooth'}); } break; }
    case "reset": store.reset(); toast("Demo world reset"); go("#/"); break;
    case "seed-feedback": go("#/f/"+store.current().handle); break;
    // flow
    case "rate": flow.rating=+t.dataset.n; renderFlow(); break;
    case "chip": { const c=t.dataset.c; flow.chips.has(c)?flow.chips.delete(c):flow.chips.add(c); renderFlow(); break; }
    case "contactable": flow.contactable=!flow.contactable; renderFlow(); break;
    case "share-business": flow.shareBusiness=!flow.shareBusiness; renderFlow(); break;
    case "next": if(flow.step===0&&!flow.rating){break;} flow.step++; renderFlow(); break;
    case "back": flow.step=Math.max(0,flow.step-1); renderFlow(); break;
    case "otp-send": { flow.otpSent=true;
      if(store.sync.status().online && window.Vouch.api){ window.Vouch.api.otpSend(flow.phone).then(r=>{ if(r&&r.devCode){ flow.otp=r.devCode; toast("Dev code: "+r.devCode); } else if(r&&r.sent){ toast("Code sent to your phone"); } else toast("Couldn't send code"); renderFlow(); }); }
      else { flow.otp="123456"; toast("Demo code: 123456"); }
      renderFlow(); break; }
    case "otp-verify": { const code=(flow.otp||"").replace(/\D/g,"");
      const done=ok=>{ if(ok){ flow.otpVerified=true; toast("Phone verified ✓"); } else toast("Use demo code 123456"); renderFlow(); };
      if(store.sync.status().online && window.Vouch.api){ window.Vouch.api.verifyOtp(flow.phone,code).then(r=>done(!!(r&&r.verified))).catch(()=>done(code==="123456")); }
      else done(code==="123456"); break; }
    case "receipt": pickReceipt(); break;
    case "tip-demo": flow.tipped=true; toast("Tip sent — kept separate from the record 💛"); renderFlow(); break;
    case "demo-call": toast(`Demo: connects you to ${t.dataset.n} (consent on file)`); break;
    case "submit": submitFeedback(); break;
    // capture, export, settings, attestation
    case "request-vouch": { const w=store.current();
      nativeShare("Vouch for "+w.name.split(" ")[0],
        `Hi! If I looked after you well, would you take 30 seconds to vouch for me? It goes on MY record (not the company's) and follows me for life:`,
        flowUrl(w.handle)).then(ok=>{ if(ok&&!navigator.share) toast("Vouch link copied — text it to your customer"); });
      break; }
    case "share-card": { const w=store.current(); const cust=splitIx(store.interactionsFor(w.handle)).cust;
      shareCard(w, T.computeTrust(cust), store.interactionsFor(w.handle).length); break; }
    case "invite-worker": nativeShare("Vouch — own your work",
      "You know how the company owns all your reviews? There's a free app where YOU own them — verified, portable, yours for life. I'm on it:",
      shareUrl("").replace(/#\/r\/$/,"")).then(()=>{ if(!navigator.share) toast("Invite link copied"); }); break;
    case "export": go("#/export/"+(t.dataset.h||store.current().handle)); break;
    case "do-print": window.print(); break;
    case "set-stealth": { const w=store.current(); store.updateWorker(w.handle,{stealth:!(w.stealth!==false)}); vSettings(); break; }
    case "set-contact": { const w=store.current(); store.updateWorker(w.handle,{contactDefault:!w.contactDefault}); vSettings(); break; }
    case "delete-data": { if(!confirmDelete){ confirmDelete=true; vSettings(); } else { const w=store.current(); store.deleteWorker(w.handle); confirmDelete=false; toast("Your record was permanently deleted"); go("#/"); } break; }
    case "signin-request": { const email=(signin.email||"").trim(); if(!email.includes("@")){ toast("Enter a valid email"); break; }
      signin.busy=true; renderSignin();
      store.auth.request(email).then(r=>{ signin.busy=false; if(r&&r.ok){ signin.step=1; signin.devCode=r.devCode||""; if(r.devCode) signin.code=r.devCode; toast(r.emailed?"Code sent to your email":"Dev code ready"); } else toast("Couldn't reach the server"); renderSignin(); }); break; }
    case "signin-verify": { const code=(signin.code||"").replace(/\D/g,""); signin.busy=true; renderSignin();
      store.auth.verify((signin.email||"").trim(), code).then(r=>{ signin.busy=false; if(r&&r.ok){ toast("Signed in ✓ — your record is backed up"); signin={step:0,email:"",code:"",devCode:"",busy:false}; go("#/settings"); } else { toast("Invalid or expired code"); renderSignin(); } }); break; }
    case "signin-back": signin.step=0; signin.code=""; signin.devCode=""; renderSignin(); break;
    case "signout": store.auth.signout().then(()=>{ toast("Signed out — your record stays on this device"); go("#/settings"); }); break;
    case "push-enable": enablePush(); break;
    case "push-test": (window.Vouch.api?window.Vouch.api.pushTest():Promise.resolve({ok:false})).then(r=>toast(r&&r.ok?`Test sent (${r.sent} device${r.sent===1?'':'s'})`:"Enable notifications first")); break;
    case "sync-toggle": store.sync.setEnabled(!store.sync.status().enabled); vSettings(); break;
    case "sync-now": toast("Backing up…"); store.sync.backup().then(ok=>{ toast(ok?"Backed up to cloud ✓":"Backup failed — offline"); vSettings(); }); break;
    case "sync-restore": toast("Restoring…"); store.sync.restore().then(ok=>{ toast(ok?"Restored from cloud ✓":"Nothing to restore / offline"); go("#/worker"); }); break;
    case "a-rel": aform.relation=t.dataset.r; renderAForm(); break;
    case "a-contact": aform.contactable=!aform.contactable; renderAForm(); break;
    case "a-submit": submitAttestation(); break;
    case "create": {
      const name=$("#ob-name").value.trim()||"New Worker";
      const handle=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||("worker-"+Date.now());
      store.addWorker({handle,name,role:$("#ob-role").value.trim()||"Service Worker",
        city:$("#ob-city").value.trim()||"—",headline:$("#ob-head").value.trim(),
        color:"#0f9b6c",createdAt:new Date().toISOString(),
        venueLat:onboard.venueLat, venueLng:onboard.venueLng,
        stealth:onboard.stealth, contactDefault:onboard.contact});
      confetti(); toast("Record created — it's yours"); go("#/worker"); break;
    }
  }
});
// live inputs in flow
document.addEventListener("input",e=>{
  const t=e.target.closest("[data-act]"); if(!t) return;
  const a=t.dataset.act;
  if(a==="a-tenure") aform.tenure=t.value;
  else if(a==="a-witnessed") aform.witnessed=t.value;
  else if(a==="a-name") aform.name=t.value;
  else if(a==="signin-email") signin.email=t.value;
  else if(a==="signin-code") signin.code=t.value;
  else if(flow){
    if(a==="comment") flow.comment=t.value;
    else if(a==="name") flow.name=t.value;
    else if(a==="phone") flow.phone=t.value;
    else if(a==="otp") flow.otp=t.value;
  }
});

window.Vouch.renderSettings = ()=>{ if((location.hash||"").indexOf("settings")>=0) vSettings(); };
ensureSky();
route();
})();
