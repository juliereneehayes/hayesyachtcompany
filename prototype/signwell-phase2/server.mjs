import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4180);
const invites = new Map();
const enrollments = new Map();
const bands = [[30,39],[40,49],[50,60]];
const prices = Object.freeze({
  'Dock Check': { 'Every two weeks': [99,99,99], Weekly: [159,159,159] },
  'Dock Watch': { Monthly: [129,149,169], 'Every two weeks': [179,209,239], Weekly: [239,279,319] },
  'Dock Watch Plus': { Weekly: [399,449,499] },
});

export function getPrice(plan, cadence, loa) {
  const band = bands.findIndex(([min,max]) => loa >= min && loa <= max);
  const monthly = prices[plan]?.[cadence]?.[band];
  if (!monthly) throw new Error('That plan, visit frequency, or vessel length is not available in this prototype.');
  return { monthly, annual: Math.round(monthly * 12 * 0.9 * 100) / 100 };
}

export function createEnrollment(input = {}) {
  const now = new Date().toISOString();
  const id = randomUUID();
  return {
    id, entryPath: 'captain_invited', createdAt: now, updatedAt: now,
    enrollmentStatus: 'in_progress', agreementStatus: 'not_started',
    paymentStatus: 'not_started', hycDecision: 'not_reviewed',
    serviceReadiness: 'not_started', questionnaire: null, selection: null,
    signedAt: null, paidAt: null, nextBillingAt: null, refundStatus: 'not_applicable',
    signers: { customer: 'pending', captainWill: 'not_requested' },
    ...input,
  };
}

export function applyQuestionnaire(enrollment, data) {
  const required = ['ownerName','signerAuthority','confirmAuthority','insuranceConfirmed','ownerEmail','ownerPhone','vesselName','vesselModel','loa','value','marina','slip','insurer','policyExpiry','emergencyName','emergencyPhone','reportEmail'];
  for (const key of required) if (!String(data?.[key] ?? '').trim()) throw new Error(`Please complete ${key}.`);
  if (data.confirmAuthority !== 'on' || data.insuranceConfirmed !== 'on') throw new Error('Confirm signer authority and current insurance before continuing.');
  const loa = Number(data.loa);
  const value = Number(data.value);
  if (!Number.isFinite(loa) || loa < 30 || loa > 60) throw new Error('Vessel length must be between 30 and 60 feet.');
  if (!Number.isFinite(value) || value <= 0 || value > 1_500_000) throw new Error('Vessel value must be at most $1,500,000.');
  if (data.emergencyCap !== undefined && data.emergencyCap !== '' && (!Number.isFinite(Number(data.emergencyCap)) || Number(data.emergencyCap) < 0)) throw new Error('Emergency spending cap must be zero or a positive amount.');
  if (data.accessCode || data.password || data.alarmPin) throw new Error('Do not submit access codes or passwords in this form.');
  enrollment.questionnaire = Object.fromEntries(required.map(k => [k, String(data[k]).trim()]));
  enrollment.questionnaire.hazards = String(data.hazards || '').trim();
  enrollment.questionnaire.hin = String(data.hin || '').trim();
  enrollment.questionnaire.requestedChecks = Array.isArray(data.requestedChecks) ? data.requestedChecks.map(String).slice(0,10) : [];
  enrollment.questionnaire.emergencyCap = Math.max(0, Number(data.emergencyCap) || 0);
  enrollment.agreementStatus = 'awaiting_customer';
  enrollment.updatedAt = new Date().toISOString();
  return enrollment;
}

export function choosePlan(enrollment, plan, visitFrequency, billingCadence = 'Monthly') {
  if (!enrollment.questionnaire) throw new Error('Complete the questionnaire first.');
  if (!['Monthly','Annual'].includes(billingCadence)) throw new Error('Choose monthly or annual billing.');
  const amounts = getPrice(plan, visitFrequency, Number(enrollment.questionnaire.loa));
  enrollment.selection = { plan, visitFrequency, cadence: billingCadence, monthlyEquivalent: amounts.monthly, amount: billingCadence === 'Annual' ? amounts.annual : amounts.monthly, currency: 'USD' };
  enrollment.agreementStatus = 'awaiting_customer';
  enrollment.updatedAt = new Date().toISOString();
  return enrollment;
}

export function signAsCustomer(enrollment) {
  if (!enrollment.questionnaire || !enrollment.selection || enrollment.agreementStatus !== 'awaiting_customer') throw new Error('Review the questionnaire, plan, and agreement before signing.');
  enrollment.agreementStatus = 'customer_signed';
  enrollment.signers.customer = 'signed_simulated';
  enrollment.signedAt = new Date().toISOString();
  enrollment.paymentStatus = 'pending';
  enrollment.updatedAt = enrollment.signedAt;
  return enrollment;
}

export function simulatePayment(enrollment, outcome = 'succeeded', now = new Date()) {
  if (enrollment.agreementStatus !== 'customer_signed') throw new Error('Customer signature is required before checkout.');
  if (enrollment.paymentStatus === 'succeeded') throw new Error('Payment is already recorded; duplicate checkout is blocked.');
  if (!['succeeded','failed','abandoned'].includes(outcome)) throw new Error('Unsupported simulated payment result.');
  enrollment.paymentStatus = outcome;
  if (outcome === 'succeeded') {
    enrollment.paidAt = now.toISOString();
    const next = addAnniversary(now, enrollment.selection.cadence === 'Annual' ? 12 : 1);
    enrollment.nextBillingAt = next.toISOString();
    enrollment.hycDecision = 'review_pending';
    enrollment.enrollmentStatus = 'payment_received_pending_hyc';
    enrollment.signers.captainWill = 'pending_review';
  }
  enrollment.updatedAt = now.toISOString();
  return enrollment;
}

export function addAnniversary(date, months) {
  const original = new Date(date);
  const next = new Date(original);
  const day = original.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const finalDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, finalDay));
  return next;
}

export function decideEnrollment(enrollment, decision) {
  if (enrollment.paymentStatus !== 'succeeded' || enrollment.agreementStatus !== 'customer_signed' || enrollment.hycDecision !== 'review_pending') throw new Error('Only a paid customer-signed enrollment can be reviewed.');
  if (decision === 'accept') {
    enrollment.hycDecision = 'accepted';
    enrollment.signers.captainWill = 'signed_simulated';
    enrollment.agreementStatus = 'fully_executed_simulated';
    enrollment.enrollmentStatus = 'accepted_setup_pending';
    enrollment.serviceReadiness = 'boat_binder_pending';
  } else if (decision === 'decline') {
    enrollment.hycDecision = 'declined';
    enrollment.signers.captainWill = 'declined';
    enrollment.paymentStatus = 'canceled_simulated';
    enrollment.refundStatus = 'manual_refund_pending';
    enrollment.enrollmentStatus = 'declined_refund_pending';
  } else throw new Error('Choose accept or decline.');
  enrollment.updatedAt = new Date().toISOString();
  return enrollment;
}

export function updateReadiness(enrollment, step, done) {
  if (enrollment.hycDecision !== 'accepted') throw new Error('Service setup starts after HYC acceptance.');
  if (!['boatBinder','operationalOnboarding','firstVisit'].includes(step)) throw new Error('Unknown readiness step.');
  if (step === 'firstVisit' && done && !(enrollment.boatBinder && enrollment.operationalOnboarding)) throw new Error('Complete Boat Binder and operational onboarding before scheduling the first visit.');
  enrollment[step] = Boolean(done);
  if (!enrollment.boatBinder || !enrollment.operationalOnboarding) enrollment.firstVisit = false;
  if (enrollment.firstVisit) { enrollment.serviceReadiness = 'scheduled'; enrollment.enrollmentStatus = 'complete'; }
  else if (enrollment.boatBinder && enrollment.operationalOnboarding) enrollment.serviceReadiness = 'ready_to_schedule';
  else if (enrollment.operationalOnboarding) enrollment.serviceReadiness = 'operational_onboarding_pending';
  else enrollment.serviceReadiness = 'boat_binder_pending';
  enrollment.updatedAt = new Date().toISOString();
  return enrollment;
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 50_000) throw new Error('Request too large.'); }
  return body ? JSON.parse(body) : {};
}
function send(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body),'x-content-type-options':'nosniff'});res.end(body);}
function publicEnrollment(e){ return structuredClone(e); }

export function createAppServer() {
  return createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://127.0.0.1');
      if (req.method === 'POST' && url.pathname === '/api/admin/invitations') {
        const token = randomBytes(24).toString('base64url');
        const e = createEnrollment();
        invites.set(token,e.id); enrollments.set(e.id,e);
        return send(res,201,{id:e.id,inviteUrl:`/customer.html?invite=${token}`,entryPath:e.entryPath});
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/enrollments') return send(res,200,[...enrollments.values()].map(publicEnrollment));
      const inviteMatch = url.pathname.match(/^\/api\/invites\/([\w-]+)$/);
      if (inviteMatch && req.method === 'GET') {
        const id=invites.get(inviteMatch[1]); const e=enrollments.get(id);
        if(!e)return send(res,404,{error:'Invitation not found. Ask HYC for a new local invite.'});
        return send(res,200,publicEnrollment(e));
      }
      const customerMatch = url.pathname.match(/^\/api\/invites\/([\w-]+)\/(questionnaire|plan|sign|payment)$/);
      if(customerMatch && req.method==='POST'){
        const id=invites.get(customerMatch[1]); const e=enrollments.get(id); if(!e)return send(res,404,{error:'Invitation not found.'});
        const body=await readBody(req); const action=customerMatch[2];
        try {
          if(action==='questionnaire')applyQuestionnaire(e,body);
          else if(action==='plan')choosePlan(e,body.plan,body.visitFrequency,body.billingCadence);
          else if(action==='sign')signAsCustomer(e);
          else simulatePayment(e,body.outcome);
          return send(res,200,publicEnrollment(e));
        } catch(error){return send(res,409,{error:error.message});}
      }
      const adminMatch=url.pathname.match(/^\/api\/admin\/enrollments\/([\w-]+)(?:\/(decision|readiness))?$/);
      if(adminMatch){const e=enrollments.get(adminMatch[1]);if(!e)return send(res,404,{error:'Enrollment not found.'});
        if(req.method==='GET'&&!adminMatch[2])return send(res,200,publicEnrollment(e));
        if(req.method==='POST'&&adminMatch[2]==='decision'){const b=await readBody(req);try{decideEnrollment(e,b.decision);return send(res,200,publicEnrollment(e));}catch(error){return send(res,409,{error:error.message});}}
        if(req.method==='POST'&&adminMatch[2]==='readiness'){const b=await readBody(req);try{updateReadiness(e,b.step,b.done);return send(res,200,publicEnrollment(e));}catch(error){return send(res,409,{error:error.message});}}
      }
      if(req.method==='GET'){
        const requested=url.pathname==='/customer.html'?'index.html':url.pathname==='/'?'index.html':url.pathname.slice(1);
        const clean=normalize(requested).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, ''); const root=join(here,'public'); const path=join(root,clean);
        if(!path.startsWith(root))return send(res,403,{error:'Forbidden'});
        try{const data=await readFile(path);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});return res.end(data);}catch{return send(res,404,{error:'Not found'});}
      }
      return send(res,405,{error:'Method not allowed'});
    }catch(error){return send(res,error instanceof SyntaxError?400:500,{error:error instanceof SyntaxError?'Invalid request.':error.message});}
  });
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const server=createAppServer();
  server.listen(PORT,'127.0.0.1',()=>console.log(`HYC invited enrollment prototype at http://127.0.0.1:${PORT} (local mock mode)`));
}
