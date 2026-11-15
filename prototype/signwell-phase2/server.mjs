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

export function parseVesselValue(input) {
  const text = String(input ?? '').trim();
  const match = text.match(/^\$?\s*((?:\d+(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?))\s*([km]?)$/i);
  if (!match) throw new Error('Enter a valid positive vessel value, such as 1,000,000 or 1.5m.');
  const base = Number(match[1].replaceAll(',', ''));
  const multiplier = match[2].toLowerCase() === 'm' ? 1_000_000 : match[2].toLowerCase() === 'k' ? 1_000 : 1;
  const amount = Math.round(base * multiplier * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid positive vessel value, such as 1,000,000 or 1.5m.');
  return amount;
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
    agreementVersion: 0, signedAgreementVersion: null, signedTermsSnapshot: null,
    eligibilityReview: 'not_required',
    signers: { customer: 'pending', captainWill: 'not_requested' },
    ...input,
  };
}

function assertTermsEditable(enrollment) {
  if (enrollment.signedAt || ['customer_signed','fully_executed_simulated'].includes(enrollment.agreementStatus) || enrollment.paymentStatus === 'succeeded' || ['accepted','declined'].includes(enrollment.hycDecision)) {
    throw new Error('Signed enrollment terms are locked. Material changes require a new agreement version and a new customer signature.');
  }
}

export function assertEnrollmentConsistency(e) {
  if (e.signedAt && (!e.questionnaire || !e.selection || !e.signedTermsSnapshot || e.signedAgreementVersion !== e.agreementVersion || e.signers.customer !== 'signed_simulated')) throw new Error('Enrollment signature/version state is inconsistent.');
  if (e.signedAt && (JSON.stringify(e.signedTermsSnapshot.questionnaire) !== JSON.stringify(e.questionnaire) || JSON.stringify(e.signedTermsSnapshot.selection) !== JSON.stringify(e.selection))) throw new Error('Signed terms changed after customer signature.');
  if (e.paymentStatus === 'succeeded' && (!e.signedAt || !e.paidAt || !['review_pending','accepted'].includes(e.hycDecision))) throw new Error('Payment state is inconsistent with signature or HYC review.');
  if (e.hycDecision === 'accepted' && (e.paymentStatus !== 'succeeded' || e.agreementStatus !== 'fully_executed_simulated' || e.signers.captainWill !== 'signed_simulated')) throw new Error('HYC acceptance state is inconsistent.');
  if (e.hycDecision === 'accepted' && Number(e.questionnaire?.value) > 1_500_000 && !['reviewed_eligible','exception_approved'].includes(e.eligibilityReview)) throw new Error('Above-threshold vessel acceptance lacks eligibility review.');
  if (e.hycDecision === 'declined' && (!e.paidAt || e.paymentStatus !== 'canceled_simulated' || e.refundStatus !== 'manual_refund_pending' || e.signers.captainWill !== 'declined')) throw new Error('HYC decline state is inconsistent.');
  return true;
}

export function applyQuestionnaire(enrollment, data) {
  assertTermsEditable(enrollment);
  const required = ['ownerName','signerName','confirmAuthority','insuranceConfirmed','ownerEmail','ownerPhone','vesselName','vesselModel','loa','value','hin','marina','slip','insurer','policyExpiry','emergencyName','emergencyPhone'];
  for (const key of required) if (!String(data?.[key] ?? '').trim()) throw new Error(`Please complete ${key}.`);
  if (data.confirmAuthority !== 'on' || data.insuranceConfirmed !== 'on') throw new Error('Confirm signer authority and current insurance before continuing.');
  const loa = Number(data.loa);
  const value = parseVesselValue(data.value);
  if (!Number.isFinite(loa) || loa < 30 || loa > 60) throw new Error('Vessel length must be between 30 and 60 feet.');
  if (data.accessCode || data.password || data.alarmPin) throw new Error('Do not submit access codes or passwords in this form.');
  const previous = enrollment.questionnaire;
  const next = Object.fromEntries(required.map(k => [k, String(data[k]).trim()]));
  next.value = value;
  next.businessName = String(data.businessName || '').trim();
  next.signerTitle = String(data.signerTitle || '').trim();
  next.hazards = String(data.hazards || '').trim();
  next.reportEmail = next.ownerEmail;
  next.emergencyCap = 0;
  const materialKeys = ['ownerName','businessName','signerName','signerTitle','ownerEmail','ownerPhone','insuranceConfirmed','vesselName','vesselModel','loa','value','hin','marina','slip','insurer','policyExpiry','emergencyName','emergencyPhone','hazards'];
  const materialChanged = Boolean(previous && materialKeys.some(k => String(previous[k] ?? '') !== String(next[k] ?? '')));
  enrollment.questionnaire = next;
  // §11.2 remains a separate HYC eligibility review; it is not an enrollment-form cap.
  enrollment.eligibilityReview = value > 1_500_000 ? 'review_required' : 'not_required';
  if (materialChanged && enrollment.selection) enrollment.selection = null;
  enrollment.agreementVersion += 1;
  enrollment.agreementStatus = 'awaiting_customer';
  enrollment.updatedAt = new Date().toISOString();
  return enrollment;
}

export function choosePlan(enrollment, plan, visitFrequency, billingCadence = 'Monthly') {
  assertTermsEditable(enrollment);
  if (!enrollment.questionnaire) throw new Error('Complete the questionnaire first.');
  if (!['Monthly','Annual'].includes(billingCadence)) throw new Error('Choose monthly or annual billing.');
  const amounts = getPrice(plan, visitFrequency, Number(enrollment.questionnaire.loa));
  enrollment.selection = { plan, visitFrequency, cadence: billingCadence, monthlyEquivalent: amounts.monthly, amount: billingCadence === 'Annual' ? amounts.annual : amounts.monthly, currency: 'USD' };
  enrollment.agreementVersion += 1;
  enrollment.agreementStatus = 'awaiting_customer';
  enrollment.updatedAt = new Date().toISOString();
  return enrollment;
}

export function signAsCustomer(enrollment) {
  if (!enrollment.questionnaire || !enrollment.selection || enrollment.agreementStatus !== 'awaiting_customer') throw new Error('Review the questionnaire, plan, and agreement before signing.');
  enrollment.agreementStatus = 'customer_signed';
  enrollment.signers.customer = 'signed_simulated';
  enrollment.signedAt = new Date().toISOString();
  enrollment.signedAgreementVersion = enrollment.agreementVersion;
  enrollment.signedTermsSnapshot = structuredClone({ questionnaire: enrollment.questionnaire, selection: enrollment.selection });
  enrollment.paymentStatus = 'pending';
  enrollment.updatedAt = enrollment.signedAt;
  assertEnrollmentConsistency(enrollment);
  return enrollment;
}

export function simulatePayment(enrollment, outcome = 'succeeded', now = new Date()) {
  if (enrollment.agreementStatus !== 'customer_signed') throw new Error('Customer signature is required before checkout.');
  if (enrollment.paymentStatus === 'succeeded' || enrollment.paidAt) throw new Error('Payment is already recorded; duplicate checkout is blocked.');
  if (['accepted','declined'].includes(enrollment.hycDecision) || enrollment.enrollmentStatus === 'declined_refund_pending') throw new Error('HYC has made a final decision; this enrollment cannot be paid or reopened.');
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
  assertEnrollmentConsistency(enrollment);
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
    if (enrollment.eligibilityReview === 'review_required') throw new Error('Review the vessel eligibility threshold or approve a documented exception before acceptance.');
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
  assertEnrollmentConsistency(enrollment);
  return enrollment;
}

export function reviewEligibility(enrollment, disposition) {
  if (enrollment.paymentStatus !== 'succeeded' || enrollment.hycDecision !== 'review_pending') throw new Error('Eligibility review is available after successful payment while HYC acceptance is pending.');
  if (Number(enrollment.questionnaire?.value) <= 1_500_000) throw new Error('This vessel does not require an above-threshold eligibility review.');
  if (!['reviewed_eligible','exception_approved'].includes(disposition)) throw new Error('Choose reviewed eligible or approved exception.');
  enrollment.eligibilityReview = disposition;
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
function publicEnrollment(e){const {inviteToken,...safe}=e;return {...structuredClone(safe),inviteUrl:inviteToken?`/customer.html?invite=${encodeURIComponent(inviteToken)}`:null};}

export function createInvitation(){
  const token=randomBytes(24).toString('base64url');
  const enrollment=createEnrollment({inviteToken:token});
  invites.set(token,enrollment.id);enrollments.set(enrollment.id,enrollment);
  return {id:enrollment.id,inviteUrl:publicEnrollment(enrollment).inviteUrl,entryPath:enrollment.entryPath};
}

export function getInvitationEnrollment(token){const id=invites.get(token);return id?enrollments.get(id)||null:null;}
export function listEnrollments(){return [...enrollments.values()].map(publicEnrollment);}

export function createAppServer() {
  return createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://127.0.0.1');
      if (req.method === 'POST' && url.pathname === '/api/admin/invitations') {
        return send(res,201,createInvitation());
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/enrollments') return send(res,200,listEnrollments());
      const inviteMatch = url.pathname.match(/^\/api\/invites\/([\w-]+)$/);
      if (inviteMatch && req.method === 'GET') {
        const e=getInvitationEnrollment(inviteMatch[1]);
        if(!e)return send(res,404,{error:'Invitation not found. Ask HYC for a new local invite.'});
        return send(res,200,publicEnrollment(e));
      }
      const customerMatch = url.pathname.match(/^\/api\/invites\/([\w-]+)\/(questionnaire|plan|sign|payment)$/);
      if(customerMatch && req.method==='POST'){
        const e=getInvitationEnrollment(customerMatch[1]); if(!e)return send(res,404,{error:'Invitation not found.'});
        const body=await readBody(req); const action=customerMatch[2];
        try {
          if(action==='questionnaire')applyQuestionnaire(e,body);
          else if(action==='plan')choosePlan(e,body.plan,body.visitFrequency,body.billingCadence);
          else if(action==='sign')signAsCustomer(e);
          else simulatePayment(e,body.outcome);
          return send(res,200,publicEnrollment(e));
        } catch(error){return send(res,409,{error:error.message});}
      }
      const adminMatch=url.pathname.match(/^\/api\/admin\/enrollments\/([\w-]+)(?:\/(decision|readiness|eligibility))?$/);
      if(adminMatch){const e=enrollments.get(adminMatch[1]);if(!e)return send(res,404,{error:'Enrollment not found.'});
        if(req.method==='GET'&&!adminMatch[2])return send(res,200,publicEnrollment(e));
        if(req.method==='POST'&&adminMatch[2]==='decision'){const b=await readBody(req);try{decideEnrollment(e,b.decision);return send(res,200,publicEnrollment(e));}catch(error){return send(res,409,{error:error.message});}}
        if(req.method==='POST'&&adminMatch[2]==='eligibility'){const b=await readBody(req);try{reviewEligibility(e,b.disposition);return send(res,200,publicEnrollment(e));}catch(error){return send(res,409,{error:error.message});}}
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
