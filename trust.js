/* Vouch Trust Engine — JS twin of server/trust_engine.py. Pure, deterministic, legible.
   Every number a worker or hiring manager sees can be traced back to this file. Transparency IS trust. */

const AUTH_WEIGHTS = {
  phone_otp: 0.20, geofence: 0.20, receipt: 0.35,
  payment: 0.45, pos: 0.50, contactable_ref: 0.40,
};
const AUTH_LABEL = {
  phone_otp: "Phone-verified", geofence: "On-premises", receipt: "Receipt-matched",
  payment: "Payment-linked", pos: "POS-linked", contactable_ref: "Contactable reference",
};

const WEIGHTS = { volume:0.25, depth:0.25, consistency:0.15, organic:0.10, loyalty:0.15, reference:0.10 };

function compositeAuthStrength(signals){
  const s = (signals||[]).reduce((a,sig)=> a + (AUTH_WEIGHTS[sig]||0), 0);
  return Math.min(s, 1.0);
}

function isVerified(signals){
  const s = new Set(signals||[]);
  return s.has("receipt") || s.has("payment") || s.has("pos") || (s.has("phone_otp") && s.has("geofence"));
}

const MS_MONTH = 1000*60*60*24*30.44;

function computeIntegrity(interactions, byCust, n){
  let penalty = 0;
  const shares = Object.values(byCust);
  const maxShare = shares.length ? Math.max(...shares)/n : 0;
  // single-source flood: one customer dominating the record
  if (maxShare > 0.4) penalty += Math.min((maxShare - 0.4) * 1.0, 0.4);
  // burst: >=5 interactions from same customer inside any 10-minute window
  const groups = {};
  interactions.forEach(i=>{ (groups[i.customerHash] = groups[i.customerHash]||[]).push(new Date(i.createdAt).getTime()); });
  let burst = false;
  Object.values(groups).forEach(ts=>{
    ts.sort((a,b)=>a-b);
    for (let k=0; k+4 < ts.length; k++){ if (ts[k+4]-ts[k] <= 10*60*1000) burst = true; }
  });
  if (burst) penalty += 0.2;
  return Math.min(penalty, 0.6);
}

function gradeFor(score){
  if (score>=900) return "A+"; if (score>=820) return "A"; if (score>=760) return "A-";
  if (score>=700) return "B+"; if (score>=620) return "B"; if (score>=560) return "B-";
  if (score>=500) return "C+"; if (score>=420) return "C"; return "D";
}
function tierFor(depth, V){
  if (depth>=0.45 && V>=150) return "Platinum";
  if (depth>=0.35 && V>=60)  return "Gold";
  if (depth>=0.20 && V>=15)  return "Silver";
  return "Bronze";
}

function emptyTrust(){
  return { score:0, grade:"—", tier:"Bronze", n:0,
    components:{volume:0,depth:0,consistency:0,organic:0,loyalty:0,reference:0},
    metrics:{V:0,depth:0,spanMonths:0,organicRatio:0,repeatRate:0,references:0,
             uniqueCustomers:0,returning:0,integrityPenalty:0,daysSinceLast:0} };
}

function computeTrust(interactions, now){
  now = now || new Date();
  const n = interactions.length;
  if (n === 0) return emptyTrust();

  const strengths = interactions.map(i => compositeAuthStrength(i.authSignals));
  const depth = strengths.reduce((a,b)=>a+b,0)/n;
  const V = interactions.filter(i => isVerified(i.authSignals)).length;

  const times = interactions.map(i=> new Date(i.createdAt).getTime()).sort((a,b)=>a-b);
  const spanMonths = (times[times.length-1] - times[0]) / MS_MONTH;
  const base = Math.min(spanMonths/12, 1);
  const daysSinceLast = (now.getTime() - times[times.length-1]) / (1000*60*60*24);
  let recency;
  if (daysSinceLast <= 60) recency = 1.0;
  else { const extra = Math.ceil((daysSinceLast-60)/60); recency = Math.max(0.3, 1.0 - 0.5*extra); }
  const consistency = 0.5*base + 0.5*recency;

  const organic = interactions.filter(i=> !i.solicited).length;
  const organicRatio = organic / n;

  const byCust = {};
  interactions.forEach(i=>{ byCust[i.customerHash] = (byCust[i.customerHash]||0)+1; });
  const uniqueCustomers = Object.keys(byCust).length;
  const returning = Object.values(byCust).filter(c=>c>1).length;
  const repeatRate = uniqueCustomers>=2 ? returning/uniqueCustomers : 0;

  const references = interactions.filter(i=> i.customerName && i.contactable).length;
  const integrityPenalty = computeIntegrity(interactions, byCust, n);

  const components = {
    volume: Math.min(Math.log10(1+V)/Math.log10(1+500), 1),
    depth: depth,
    consistency: consistency,
    organic: organicRatio,
    loyalty: Math.min(repeatRate, 1),
    reference: Math.min(references/10, 1),
  };
  const raw =
    components.volume*WEIGHTS.volume + components.depth*WEIGHTS.depth +
    components.consistency*WEIGHTS.consistency + components.organic*WEIGHTS.organic +
    components.loyalty*WEIGHTS.loyalty + components.reference*WEIGHTS.reference;

  const score = Math.round(raw*1000*(1-integrityPenalty));
  return {
    score, grade: gradeFor(score), tier: tierFor(depth, V), n,
    components,
    metrics:{ V, depth, spanMonths, organicRatio, repeatRate, references,
              uniqueCustomers, returning, integrityPenalty, daysSinceLast },
  };
}

// expose
window.Vouch = window.Vouch || {};
window.Vouch.trust = { computeTrust, compositeAuthStrength, isVerified, AUTH_WEIGHTS, AUTH_LABEL, WEIGHTS, gradeFor, tierFor };
