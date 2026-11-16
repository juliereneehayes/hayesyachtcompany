import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';
import { createSignWellClient, pdfSha256, readSignWellConfig, signerCompletion } from './signwell.mjs';

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
  const match = text.match(/^\$?\s*((?:\d+(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?))\s*(million|thousand|mil|m|k)?$/i);
  if (!match) throw new Error("I couldn't understand that vessel value. Enter a positive amount such as 850,000, 850k, or 1.5 million.");
  const base = Number(match[1].replaceAll(',', ''));
  const suffix = (match[2] || '').toLowerCase();
  const multiplier = ['m','mil','million'].includes(suffix) ? 1_000_000 : ['k','thousand'].includes(suffix) ? 1_000 : 1;
  const amount = Math.round(base * multiplier * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error("I couldn't understand that vessel value. Enter a positive amount such as 850,000, 850k, or 1.5 million.");
  return amount;
}

export function getWorkflowStatus(e) {
  const closed = ['canceled','cancelled','expired','closed','abandoned'].includes(String(e.enrollmentStatus || '').toLowerCase()) || ['declined','expired'].includes(e.agreementStatus) || e.paymentStatus === 'canceled_simulated';
  if (e.hycDecision === 'declined' || (e.refundStatus === 'manual_refund_pending' && e.paymentStatus === 'canceled_simulated')) {
    if (e.refundStatus === 'manual_refund_pending') return { label:'Refund action needed', detail:e.hycDecision === 'declined' ? 'HYC declined after payment; the manual refund is still outstanding.' : 'A manual refund is outstanding; verify the HYC decision before closing the record.' };
    if (['manual_refund_completed','completed'].includes(e.refundStatus)) return { label:'Closed', detail:'HYC declined and refund follow-up is marked complete; the enrollment is closed.' };
    return { label:'Closed', detail:'HYC declined this enrollment. Confirm refund follow-up before closing the record.' };
  }
  if (closed) return { label:'Closed', detail:'This enrollment is canceled, expired, abandoned, or otherwise closed; verify any payment follow-up.' };
  if (e.hycDecision === 'accepted') {
    if (e.serviceReadiness === 'scheduled' || e.firstVisit) return { label:'Scheduled', detail:'HYC accepted and countersigned; the initial service visit is scheduled.' };
    if (e.serviceReadiness === 'ready_to_schedule' || (e.boatBinder && e.operationalOnboarding)) return { label:'Ready to schedule', detail:'HYC accepted and required setup is complete; the initial visit is not yet scheduled.' };
    if (['boat_binder_pending','operational_onboarding_pending','not_started'].includes(e.serviceReadiness)) return { label:'Setup in progress', detail:'HYC accepted and countersigned; operational setup is not complete.' };
    return { label:'Setup in progress', detail:'HYC accepted; service-readiness state needs a manual check.' };
  }
  if (e.paymentStatus === 'succeeded') {
    if (e.hycDecision === 'review_pending') return { label:'Needs HYC review', detail:'Payment received; the agreement is awaiting HYC review and countersignature. Service is not ready.' };
    return { label:'Needs HYC review', detail:'Payment received; the HYC decision state needs manual review. Do not treat this enrollment as accepted or service-ready.' };
  }
  if (e.agreementStatus === 'customer_signed') {
    const detail = e.paymentStatus === 'failed' ? 'Customer signed; the last checkout attempt failed and can be retried.' : e.paymentStatus === 'abandoned' ? 'Customer signed; checkout was abandoned and can be resumed.' : 'Customer signed; initial payment has not completed.';
    return { label:'Payment pending', detail };
  }
  if (e.agreementStatus === 'awaiting_customer' && e.selection) return { label:'Awaiting customer signature', detail:'Plan and agreement are ready for the customer to review and sign.' };
  if (e.questionnaire || e.selection) return { label:'Enrollment in progress', detail:'Customer details are underway; plan or agreement review remains.' };
  if (e.hycDecision === 'not_reviewed' && e.paymentStatus === 'not_started') return { label:'Awaiting customer', detail:'Invitation created; waiting for customer details.' };
  return { label:'Enrollment in progress', detail:'Enrollment is underway; review details before advancing it.' };
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
    signers: { customer: 'pending', captainWill: 'not_requested' }, signingMode: 'mock', signWellDocumentId: null,
    signWellStatus: 'not_created', providerRecipientIds: null, signWellSigningUrls: null, signWellPdf: null, signWellPdfSha256: null,
    ...input,
  };
}

function assertTermsEditable(enrollment) {
  if (enrollment.signedAt || enrollment.signWellDocumentId || ['customer_signed','fully_executed_simulated'].includes(enrollment.agreementStatus) || enrollment.paymentStatus === 'succeeded' || ['accepted','declined'].includes(enrollment.hycDecision)) {
    throw new Error('Signed enrollment terms are locked. Material changes require a new agreement version and a new customer signature.');
  }
}

export function assertEnrollmentConsistency(e) {
  const customerSigned = e.signingMode === 'signwell-test' ? e.signers.customer === 'provider_confirmed' : e.signers.customer === 'signed_simulated';
  const captainSigned = e.signingMode === 'signwell-test' ? e.signers.captainWill === 'provider_confirmed' : e.signers.captainWill === 'signed_simulated';
  if (e.signedAt && (!e.questionnaire || !e.selection || !e.signedTermsSnapshot || e.signedAgreementVersion !== e.agreementVersion || !customerSigned)) throw new Error('Enrollment signature/version state is inconsistent.');
  if (e.signedAt && (JSON.stringify(e.signedTermsSnapshot.questionnaire) !== JSON.stringify(e.questionnaire) || JSON.stringify(e.signedTermsSnapshot.selection) !== JSON.stringify(e.selection))) throw new Error('Signed terms changed after customer signature.');
  if (e.paymentStatus === 'succeeded' && (!e.signedAt || !e.paidAt || !['review_pending','accepted'].includes(e.hycDecision))) throw new Error('Payment state is inconsistent with signature or HYC review.');
  if (e.hycDecision === 'accepted' && (e.paymentStatus !== 'succeeded' || !['fully_executed_simulated','fully_executed_test'].includes(e.agreementStatus) || !captainSigned)) throw new Error('HYC acceptance state is inconsistent.');
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
  if (enrollment.signingMode === 'signwell-test') throw new Error('SignWell signatures must be confirmed through the provider status endpoint.');
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
  if (enrollment.signingMode === 'signwell-test' && decision === 'accept') throw new Error('HYC can accept only after SignWell confirms Captain Will\'s signature.');
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
function publicEnrollment(e,{internal=false}={}){const {inviteToken,signWellDocumentId,providerRecipientIds,signWellSigningUrls,signWellPdf,signWellPdfSha256,eligibilityReview,internalReconciliationRequired,internalReconciliationReason,...safe}=e;return {...structuredClone(safe),...(internal?{eligibilityReview,internalReconciliationRequired:Boolean(internalReconciliationRequired),internalReconciliationReason:internalReconciliationReason||null}:{}),signWellDocumentReady:Boolean(signWellDocumentId),signWellPdfReady:Boolean(signWellPdf),signWellPdfSha256:signWellPdfSha256||null,workflowStatus:getWorkflowStatus(e),inviteUrl:inviteToken?`/customer.html?invite=${encodeURIComponent(inviteToken)}`:null};}

export function createInvitation(signingMode = 'mock'){
  const token=randomBytes(24).toString('base64url');
  const enrollment=createEnrollment({inviteToken:token,signingMode});
  invites.set(token,enrollment.id);enrollments.set(enrollment.id,enrollment);
  return {id:enrollment.id,inviteUrl:publicEnrollment(enrollment).inviteUrl,entryPath:enrollment.entryPath};
}

export function getInvitationEnrollment(token){const id=invites.get(token);return id?enrollments.get(id)||null:null;}
export function listEnrollments(){return [...enrollments.values()].map(e=>publicEnrollment(e,{internal:true}));}

async function ensureProviderDocument(e, provider) {
  if (e.signWellDocumentId) return e;
  if (e.signWellIssueUncertain) throw new Error('SignWell document creation may have succeeded but its response was incomplete. Do not retry; reconcile the test document in SignWell first.');
  if (e.signWellCreatePromise) return e.signWellCreatePromise;
  if (!e.questionnaire || !e.selection || e.agreementStatus !== 'awaiting_customer') throw new Error('Review Your Details, Plan & Price, and the agreement before issuing it.');
  e.signWellCreatePromise = (async () => {
    const template = await provider.getTemplate();
    let created;
    try { created = await provider.createDocument(e, template); }
    catch (error) { e.signWellIssueUncertain = true; throw new Error('SignWell document creation could not be confirmed. Do not retry until the Test Mode account is reconciled.'); }
    e.signWellDocumentId = created.id;
    e.signWellStatus = created.status;
    e.providerRecipientIds = created.recipientIds;
    e.signWellSigningUrls = { customer: created.result.recipients.find(r => String(r.id) === created.recipientIds.customer).embedded_signing_url, hyc: created.result.recipients.find(r => String(r.id) === created.recipientIds.hyc).embedded_signing_url };
    e.updatedAt = new Date().toISOString();
    return e;
  })();
  try { return await e.signWellCreatePromise; }
  finally { delete e.signWellCreatePromise; }
}

async function refreshProviderStatus(e, provider) {
  if (!e.signWellDocumentId) throw new Error('The SignWell test agreement has not been issued.');
  const doc = await provider.getDocument(e.signWellDocumentId);
  if (!doc?.metadata || doc.metadata.hyc_enrollment_id !== e.id || String(doc.metadata.agreement_version) !== String(e.agreementVersion)) throw new Error('SignWell document metadata did not match this enrollment and agreement version.');
  const result = signerCompletion(doc, e.signWellDocumentId, e.providerRecipientIds);
  // Stage provider evidence and derived transitions on a copy. A failed invariant
  // check must never leave the live enrollment partly advanced.
  const next = structuredClone(e);
  next.signWellStatus = result.documentStatus || 'unknown';
  const recipients = doc.recipients;
  const customerRecipient = recipients.find(r => String(r.id) === e.providerRecipientIds.customer);
  if (result.customerSigned) {
    next.signers.customer = 'provider_confirmed';
    next.agreementStatus = next.hycDecision === 'accepted' ? 'fully_executed_test' : 'customer_signed';
    next.signedAt ||= customerRecipient.signed_at || customerRecipient.completed_at || new Date().toISOString();
    next.signedAgreementVersion = next.agreementVersion;
    next.signedTermsSnapshot ||= structuredClone({ questionnaire: next.questionnaire, selection: next.selection });
    if (next.paymentStatus === 'not_started') next.paymentStatus = 'pending';
  }
  if (result.hycSigned) next.signers.captainWill = 'provider_confirmed';
  const aboveThreshold = Number(next.questionnaire?.value) > 1_500_000;
  const eligibilityApproved = !aboveThreshold || ['reviewed_eligible','exception_approved'].includes(next.eligibilityReview);
  if (result.hycSigned && result.customerSigned && next.paymentStatus === 'succeeded' && next.hycDecision === 'review_pending') {
    if (!eligibilityApproved) {
      next.internalReconciliationRequired = true;
      next.internalReconciliationReason = 'captain_signature_before_internal_eligibility_approval';
      next.agreementStatus = 'provider_completed_pending_hyc_approval';
    } else if (next.internalReconciliationRequired && next.internalReconciliationReason === 'captain_signature_before_internal_eligibility_approval') {
      // A later eligibility disposition does not retroactively authorize a
      // countersignature that was captured before approval. Keep HYC's manual
      // reconciliation hold until an explicit internal resolution is recorded.
      next.agreementStatus = 'provider_completed_pending_hyc_approval';
    } else {
      next.hycDecision = 'accepted';
      next.agreementStatus = 'fully_executed_test';
      next.enrollmentStatus = 'accepted_setup_pending';
      next.serviceReadiness = 'boat_binder_pending';
      next.internalReconciliationRequired = false;
      next.internalReconciliationReason = null;
    }
  }
  const providerClosed = ['declined','canceled','cancelled','expired'].includes(result.documentStatus);
  if (providerClosed && next.hycDecision !== 'declined') {
    const confirmedHycDecline = result.hyc === 'declined';
    const isExpired = result.documentStatus === 'expired';
    if (next.paymentStatus === 'succeeded' && !confirmedHycDecline) {
      next.internalReconciliationRequired = true;
      next.internalReconciliationReason = 'provider_decline_after_payment_ambiguous';
      next.customerOutcomeNotice = 'HYC is reviewing an agreement status update. Your simulated payment remains recorded; no refund status has been confirmed.';
    } else if (next.paymentStatus === 'succeeded' && confirmedHycDecline) {
      next.hycDecision = 'declined';
      next.signers.captainWill = 'declined';
      next.paymentStatus = 'canceled_simulated';
      next.refundStatus = 'manual_refund_pending';
      next.enrollmentStatus = 'declined_refund_pending';
      next.agreementStatus = 'customer_signed';
      next.customerOutcomeNotice = null;
      next.internalReconciliationRequired = false;
      next.internalReconciliationReason = null;
    } else {
      next.agreementStatus = isExpired ? 'expired' : 'declined';
      next.enrollmentStatus = isExpired ? 'expired' : 'declined';
      if (next.paymentStatus !== 'succeeded') next.paymentStatus = 'not_started';
      next.refundStatus = 'not_applicable';
      next.customerOutcomeNotice = isExpired ? 'The test agreement expired before payment. No payment was taken.' : result.documentStatus === 'declined' ? 'The test agreement was declined before payment. No payment was taken.' : 'The test agreement was canceled before payment. No payment was taken.';
      if (result.customer === 'declined') next.signers.customer = 'declined';
      if (result.hyc === 'declined') next.signers.captainWill = 'declined';
    }
  }
  next.updatedAt = new Date().toISOString();
  if (next.signedAt) assertEnrollmentConsistency(next);
  Object.assign(e,next);
  return { enrollment: e, result };
}

async function retrieveCompletedPdf(e, provider) {
  const { result } = await refreshProviderStatus(e, provider);
  if (!(result.customerSigned && result.hycSigned && result.documentStatus === 'completed')) throw new Error('SignWell has not confirmed both signatures; completed PDF is not available.');
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 400 * (2 ** (attempt - 1))));
    try {
      const bytes = await provider.completedPdf(e.signWellDocumentId);
      e.signWellPdf = bytes;
      e.signWellPdfSha256 = pdfSha256(bytes);
      return bytes;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('SignWell completed PDF is still being generated.');
}

export function createAppServer({ env = process.env, fetchImpl = fetch } = {}) {
  const signWellConfig = readSignWellConfig(env);
  const provider = signWellConfig.mode === 'signwell-test' ? createSignWellClient(signWellConfig, fetchImpl) : null;
  return createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/api/config') return send(res,200,{mode:signWellConfig.mode,providerReady:signWellConfig.ready,notice:'TEST DOCUMENT — NOT LEGALLY BINDING'});
      if (req.method === 'POST' && url.pathname === '/api/admin/invitations') {
        return send(res,201,createInvitation(signWellConfig.mode));
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/enrollments') return send(res,200,listEnrollments());
      const inviteMatch = url.pathname.match(/^\/api\/invites\/([\w-]+)$/);
      if (inviteMatch && req.method === 'GET') {
        const e=getInvitationEnrollment(inviteMatch[1]);
        if(!e)return send(res,404,{error:'Invitation not found. Ask HYC for a new local invite.'});
        return send(res,200,publicEnrollment(e));
      }
      const customerSigningMatch = url.pathname.match(/^\/api\/invites\/([\w-]+)\/(signing|signature-status)$/);
      if (customerSigningMatch && signWellConfig.mode === 'signwell-test') {
        const e=getInvitationEnrollment(customerSigningMatch[1]); if(!e)return send(res,404,{error:'Invitation not found.'});
        if(req.method==='POST'&&customerSigningMatch[2]==='signature-status'){
          try { await refreshProviderStatus(e,provider); return send(res,200,publicEnrollment(e)); }
          catch(error){return send(res,502,{error:error.message});}
        }
        if(req.method==='GET'&&customerSigningMatch[2]==='signing'){
          if(!e.signWellDocumentId)return send(res,409,{error:'Review the synthetic agreement and issue it before opening signing.'});
          try {
            const {result}=await refreshProviderStatus(e,provider);
            if(!['pending','sent','in_progress','viewed'].includes(result.documentStatus)||result.customerSigned||!['pending','sent','in_progress','viewed'].includes(result.customer))return send(res,409,{error:'The customer signing step is not currently available.'});
            const signingUrl=e.signWellSigningUrls?.customer;
            if(!validSigningUrl(signingUrl))return send(res,502,{error:'SignWell did not return an approved embedded signing link.'});
            return send(res,200,{signingUrl});
          } catch(error){return send(res,502,{error:error.message});}
        }
      }
      const issueMatch=url.pathname.match(/^\/api\/invites\/([\w-]+)\/sign$/);
      if(issueMatch&&req.method==='POST'&&signWellConfig.mode==='signwell-test'){
        const e=getInvitationEnrollment(issueMatch[1]);if(!e)return send(res,404,{error:'Invitation not found.'});
        try{await ensureProviderDocument(e,provider);return send(res,201,publicEnrollment(e));}
        catch(error){return send(res,409,{error:error.message});}
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
      const adminSignMatch=url.pathname.match(/^\/api\/admin\/enrollments\/([\w-]+)\/signwell\/(status|signing|decision|reconcile|pdf)$/);
      if(adminSignMatch&&signWellConfig.mode==='signwell-test'){
        const e=enrollments.get(adminSignMatch[1]);if(!e)return send(res,404,{error:'Enrollment not found.'});
        const action=adminSignMatch[2];
        if(req.method==='POST'&&action==='status'){
          try{await refreshProviderStatus(e,provider);return send(res,200,publicEnrollment(e,{internal:true}));}catch(error){return send(res,502,{error:error.message});}
        }
        if(req.method==='GET'&&action==='signing'){
          if(e.paymentStatus!=='succeeded'||e.hycDecision!=='review_pending'||e.signers.customer!=='provider_confirmed'||e.eligibilityReview==='review_required')return send(res,409,{error:'Customer signature, simulated payment, and any required eligibility review must be confirmed before HYC signing.'});
          try{const {result}=await refreshProviderStatus(e,provider);if(!['pending','sent','in_progress','viewed'].includes(result.documentStatus)||result.hycSigned)return send(res,409,{error:'Captain Will signing is not currently available.'});const signingUrl=e.signWellSigningUrls?.hyc;if(!validSigningUrl(signingUrl))return send(res,502,{error:'SignWell did not return an approved embedded signing link.'});return send(res,200,{signingUrl});}catch(error){return send(res,502,{error:error.message});}
        }
        if(req.method==='POST'&&action==='reconcile'){
          try{
            await refreshProviderStatus(e,provider);
            if(!e.internalReconciliationRequired||e.internalReconciliationReason!=='captain_signature_before_internal_eligibility_approval'||e.hycDecision!=='review_pending'||e.paymentStatus!=='succeeded'||e.signers.customer!=='provider_confirmed'||e.signers.captainWill!=='provider_confirmed'||(Number(e.questionnaire?.value)>1_500_000&&!['reviewed_eligible','exception_approved'].includes(e.eligibilityReview)))return send(res,409,{error:'Manual reconciliation requires confirmed customer and Captain Will signatures, successful simulated payment, and any required internal eligibility disposition.'});
            const next=structuredClone(e);next.internalReconciliationRequired=false;next.internalReconciliationReason=null;next.hycDecision='accepted';next.agreementStatus='fully_executed_test';next.enrollmentStatus='accepted_setup_pending';next.serviceReadiness='boat_binder_pending';next.updatedAt=new Date().toISOString();assertEnrollmentConsistency(next);Object.assign(e,next);return send(res,200,publicEnrollment(e,{internal:true}));
          }catch(error){return send(res,409,{error:error.message});}
        }
        if(req.method==='POST'&&action==='decision'){
          const body=await readBody(req);
          if(body.decision==='decline'){
            if(e.paymentStatus!=='succeeded'||e.hycDecision!=='review_pending')return send(res,409,{error:'Only an enrollment awaiting HYC review can be declined.'});
            try{await refreshProviderStatus(e,provider);if(e.agreementStatus==='fully_executed_test')return send(res,409,{error:'The agreement is already fully executed in Test Mode.'});if(e.signWellDocumentId)await provider.deleteDocument(e.signWellDocumentId);e.hycDecision='declined';e.signers.captainWill='declined';e.paymentStatus='canceled_simulated';e.refundStatus='manual_refund_pending';e.enrollmentStatus='declined_refund_pending';e.agreementStatus='customer_signed';e.customerOutcomeNotice=null;e.signWellStatus='canceled';e.internalReconciliationRequired=false;e.internalReconciliationReason=null;e.updatedAt=new Date().toISOString();assertEnrollmentConsistency(e);return send(res,200,publicEnrollment(e,{internal:true}));}
            catch(error){return send(res,502,{error:error.message});}
          }
          return send(res,409,{error:'HYC acceptance requires Captain Will to sign in the embedded SignWell session and provider status confirmation.'});
        }
        if(req.method==='GET'&&action==='pdf'){
          try{const bytes=await retrieveCompletedPdf(e,provider);res.writeHead(200,{'content-type':'application/pdf','content-disposition':`attachment; filename="hyc-test-${e.id}.pdf"`,'cache-control':'no-store','x-content-type-options':'nosniff','x-hyc-sha256':e.signWellPdfSha256});return res.end(bytes);}catch(error){return send(res,409,{error:error.message});}
        }
      }
      const adminMatch=url.pathname.match(/^\/api\/admin\/enrollments\/([\w-]+)(?:\/(decision|readiness|eligibility))?$/);
      if(adminMatch){const e=enrollments.get(adminMatch[1]);if(!e)return send(res,404,{error:'Enrollment not found.'});
        if(req.method==='GET'&&!adminMatch[2])return send(res,200,publicEnrollment(e,{internal:true}));
        if(req.method==='POST'&&adminMatch[2]==='decision'){const b=await readBody(req);try{decideEnrollment(e,b.decision);return send(res,200,publicEnrollment(e,{internal:true}));}catch(error){return send(res,409,{error:error.message});}}
        if(req.method==='POST'&&adminMatch[2]==='eligibility'){const b=await readBody(req);try{reviewEligibility(e,b.disposition);return send(res,200,publicEnrollment(e,{internal:true}));}catch(error){return send(res,409,{error:error.message});}}
        if(req.method==='POST'&&adminMatch[2]==='readiness'){const b=await readBody(req);try{updateReadiness(e,b.step,b.done);return send(res,200,publicEnrollment(e,{internal:true}));}catch(error){return send(res,409,{error:error.message});}}
      }
      if(req.method==='GET'){
        const requested=url.pathname==='/customer.html'?'index.html':url.pathname==='/'?'index.html':url.pathname.slice(1);
        const clean=normalize(requested).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, ''); const root=join(here,'public'); const path=join(root,clean);
        if(!path.startsWith(root))return send(res,403,{error:'Forbidden'});
        try{const data=await readFile(path);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self' https://static.signwell.com; style-src 'self'; connect-src 'self' https://www.signwell.com https://static.signwell.com; frame-src https://www.signwell.com; frame-ancestors 'none'"});return res.end(data);}catch{return send(res,404,{error:'Not found'});}
      }
      return send(res,405,{error:'Method not allowed'});
    }catch(error){return send(res,error instanceof SyntaxError?400:500,{error:error instanceof SyntaxError?'Invalid request.':error.message});}
  });
}

function validSigningUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.signwell.com'&&u.pathname.startsWith('/docs/');}catch{return false;}}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{const server=createAppServer();server.listen(PORT,'127.0.0.1',()=>console.log(`HYC invited enrollment prototype at http://127.0.0.1:${PORT} (${process.env.PROVIDER_MODE||'mock'} mode)`));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
