/* Vouch API client — talks to the FastAPI backend. Local-first: the app works fully offline;
   this layer is the OPT-IN cloud mirror, scoped to the signed-in worker via a bearer token.
   Every call fails soft (returns {ok:false}) when offline. */
(function(){
  // The hosted production backend. The static app (GitHub Pages, "Add to Home Screen",
  // or a file:// copy) talks to this automatically — no per-device setup.
  var BACKEND = "https://vouch-tr3g.onrender.com";
  function defaultBase(){
    if(typeof window!=="undefined" && window.VOUCH_API_BASE!==undefined) return window.VOUCH_API_BASE;
    if(location.hostname==="localhost"||location.hostname==="127.0.0.1"){
      if(location.port==="4173") return "http://localhost:8077";       // local dev: app server → API on 8077
      return "";                                                        // local single-origin (uvicorn serving both)
    }
    if(location.origin.indexOf("onrender.com")>=0) return "";           // backend serves the app too → same origin
    return BACKEND;                                                     // Pages / installed / file:// → hosted backend
  }
  const DEV = typeof location!=="undefined" && (location.hostname==="localhost"||location.hostname==="127.0.0.1");
  // The destination is compile-time only. A stored override is honored ONLY on a local dev host,
  // and only if it is an http(s) URL — never in production (a crafted link could otherwise
  // redirect the bearer token to an attacker's origin).
  function base(){
    if(!DEV) return defaultBase();
    try{ const v=localStorage.getItem("vouch_api"); return (v!==null && /^https?:\/\//.test(v))?v:defaultBase(); }catch(e){ return defaultBase(); }
  }
  function token(){ try{ return localStorage.getItem("vouch_token")||""; }catch(e){ return ""; } }
  function setToken(t){ try{ if(t) localStorage.setItem("vouch_token",t); else localStorage.removeItem("vouch_token"); }catch(e){} }

  const TIMEOUT_MS = 15000;
  // opts.auth=false → PUBLIC request: the bearer token is never attached (health, public records…).
  async function call(method, path, body, opts){
    opts = opts || {};
    const ctl = typeof AbortController!=="undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(()=>ctl.abort(), TIMEOUT_MS) : null;
    try{
      const h = {};
      if(body!==undefined) h["Content-Type"]="application/json";
      if(opts.auth!==false){ const t = token(); if(t) h["Authorization"]="Bearer "+t; }
      if(opts.idempotencyKey) h["Idempotency-Key"]=String(opts.idempotencyKey).slice(0,128);
      const res = await fetch(base()+path, { method, headers:h, body: body!==undefined?JSON.stringify(body):undefined, signal: ctl?ctl.signal:undefined });
      const data = await res.json().catch(()=>({}));
      if(!res.ok) return { ok:false, status:res.status, data, detail:(data&&data.detail)||"" };
      return Object.assign({ ok:true }, data);
    }catch(e){ return { ok:false, offline:true, timeout: !!(e&&e.name==="AbortError"), error:String(e) }; }
    finally{ if(timer) clearTimeout(timer); }
  }

  const api = {
    base, token, setToken,
    setBase(u){ if(!DEV) return; try{ localStorage.setItem("vouch_api", u==null?"":u); }catch(e){} },   // dev only
    qrUrl(h){ return base()+"/api/qr/"+encodeURIComponent(h)+".svg"; },
    health:       ()      => call("GET",  "/api/health", undefined, {auth:false}),
    ready:        ()      => call("GET",  "/api/ready",  undefined, {auth:false}),
    // auth
    authDevice:   ()      => call("POST", "/api/auth/device"),
    authRequest:  (email) => call("POST", "/api/auth/request", { email }),
    authVerify:   (email,code) => call("POST", "/api/auth/verify", { email, code }),
    me:           ()      => call("GET",  "/api/auth/me"),
    signout:      ()      => call("POST", "/api/auth/signout"),
    // data (scoped to the token)
    sync:         (state) => call("POST", "/api/sync", { workers:Object.values(state.workers||{}), interactions:state.interactions||[] }),
    pull:         ()      => call("GET",  "/api/state"),
    deleteWorker: (h)     => call("DELETE","/api/workers/"+encodeURIComponent(h)),
    deleteAccount:()      => call("DELETE","/api/account"),
    // public
    record:       (h)     => call("GET",  "/api/workers/"+encodeURIComponent(h)+"/record", undefined, {auth:false}),
    leaderboard:  ()      => call("GET",  "/api/employer/leaderboard"),
    businessDigest:(venue)=> call("GET",  "/api/business/digest?venue="+encodeURIComponent(venue||""), undefined, {auth:false}),
    pilotRequest: (body)  => call("POST", "/api/business/pilot", body),
    feedback:     (h,body,key)=> call("POST", "/api/workers/"+encodeURIComponent(h)+"/feedback", body, {auth:false, idempotencyKey:key}),
    attestation:  (h,body)=> call("POST", "/api/workers/"+encodeURIComponent(h)+"/attestation", body, {auth:false}),
    // moderation & consent (OPS-02)
    withdraw:     (iid,token)=> call("POST", "/api/interactions/"+encodeURIComponent(iid)+"/withdraw", { token }, {auth:false}),
    dispute:      (iid,body)=> call("POST", "/api/interactions/"+encodeURIComponent(iid)+"/dispute", body, {auth:false}),
    hideInteraction:(h,iid,hidden)=> call("PATCH", "/api/workers/"+encodeURIComponent(h)+"/interactions/"+encodeURIComponent(iid), { hidden }),
    // verification
    otpSend:      (phone) => call("POST", "/api/verify/otp/send", { phone:phone||"" }, {auth:false}),
    verifyOtp:    (phone,code) => call("POST","/api/verify/otp",{ phone:phone||"", code:code||"" }, {auth:false}),
    ocr:          (opts)  => call("POST", "/api/ocr", typeof opts==="string" ? { text:opts } : (opts||{}), {auth:false}),
    // push
    vapidKey:     ()      => call("GET",  "/api/push/vapid-public-key"),
    pushSubscribe:(sub)   => call("POST", "/api/push/subscribe", { subscription:sub }),
    pushTest:     ()      => call("POST", "/api/push/test"),
  };
  window.Vouch = window.Vouch || {};
  window.Vouch.api = api;
})();
