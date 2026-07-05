/* Vouch API client — talks to the FastAPI backend. Local-first: the app works fully offline;
   this layer is the OPT-IN cloud mirror, scoped to the signed-in worker via a bearer token.
   Every call fails soft (returns {ok:false}) when offline. */
(function(){
  function defaultBase(){
    if(typeof window!=="undefined" && window.VOUCH_API_BASE!==undefined) return window.VOUCH_API_BASE;
    if(location.protocol==="file:") return "http://localhost:8077";   // opened as a file
    if(location.port==="4173") return "http://localhost:8077";         // dev: static app server → API on 8077
    return "";                                                          // single-origin / production: same origin
  }
  function base(){ try{ const v=localStorage.getItem("vouch_api"); return v===null?defaultBase():v; }catch(e){ return defaultBase(); } }
  function token(){ try{ return localStorage.getItem("vouch_token")||""; }catch(e){ return ""; } }
  function setToken(t){ try{ if(t) localStorage.setItem("vouch_token",t); else localStorage.removeItem("vouch_token"); }catch(e){} }

  async function call(method, path, body){
    try{
      const h = {};
      if(body!==undefined) h["Content-Type"]="application/json";
      const t = token(); if(t) h["Authorization"]="Bearer "+t;
      const res = await fetch(base()+path, { method, headers:h, body: body!==undefined?JSON.stringify(body):undefined });
      const data = await res.json().catch(()=>({}));
      if(!res.ok) return { ok:false, status:res.status, data };
      return Object.assign({ ok:true }, data);
    }catch(e){ return { ok:false, offline:true, error:String(e) }; }
  }

  const api = {
    base, token, setToken,
    setBase(u){ try{ localStorage.setItem("vouch_api", u==null?"":u); }catch(e){} },
    qrUrl(h){ return base()+"/api/qr/"+encodeURIComponent(h)+".svg"; },
    health:       ()      => call("GET",  "/api/health"),
    // auth
    authRequest:  (email) => call("POST", "/api/auth/request", { email }),
    authVerify:   (email,code) => call("POST", "/api/auth/verify", { email, code }),
    me:           ()      => call("GET",  "/api/auth/me"),
    signout:      ()      => call("POST", "/api/auth/signout"),
    // data (scoped to the token)
    sync:         (state) => call("POST", "/api/sync", { workers:Object.values(state.workers||{}), interactions:state.interactions||[] }),
    pull:         ()      => call("GET",  "/api/state"),
    deleteWorker: (h)     => call("DELETE","/api/workers/"+encodeURIComponent(h)),
    // public
    record:       (h)     => call("GET",  "/api/workers/"+encodeURIComponent(h)+"/record"),
    leaderboard:  ()      => call("GET",  "/api/employer/leaderboard"),
    businessDigest:(venue)=> call("GET",  "/api/business/digest?venue="+encodeURIComponent(venue||"")),
    pilotRequest: (body)  => call("POST", "/api/business/pilot", body),
    feedback:     (h,body)=> call("POST", "/api/workers/"+encodeURIComponent(h)+"/feedback", body),
    attestation:  (h,body)=> call("POST", "/api/workers/"+encodeURIComponent(h)+"/attestation", body),
    // verification
    otpSend:      (phone) => call("POST", "/api/verify/otp/send", { phone:phone||"" }),
    verifyOtp:    (phone,code) => call("POST","/api/verify/otp",{ phone:phone||"", code:code||"" }),
    ocr:          (opts)  => call("POST", "/api/ocr", typeof opts==="string" ? { text:opts } : (opts||{})),
    // push
    vapidKey:     ()      => call("GET",  "/api/push/vapid-public-key"),
    pushSubscribe:(sub)   => call("POST", "/api/push/subscribe", { subscription:sub }),
    pushTest:     ()      => call("POST", "/api/push/test"),
  };
  window.Vouch = window.Vouch || {};
  window.Vouch.api = api;
})();
