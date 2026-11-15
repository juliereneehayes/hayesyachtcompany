import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnniversary, applyQuestionnaire, assertEnrollmentConsistency, choosePlan, createEnrollment, decideEnrollment, getPrice, signAsCustomer, simulatePayment, updateReadiness } from '../server.mjs';

const questionnaire = {
  ownerName:'Riley Example',signerAuthority:'Owner',confirmAuthority:'on',insuranceConfirmed:'on',ownerEmail:'riley@example.com',ownerPhone:'555-0101',reportEmail:'riley@example.com',
  vesselName:'S/V Test Current',vesselModel:'2018 Example 32',loa:'36',value:'250000',hin:'EXAMPLE-HIN',marina:'Test Marina',slip:'A-10',insurer:'Example Marine',policyExpiry:'2027-10-01',
  emergencyName:'Casey Example',emergencyPhone:'555-0102',emergencyCap:'0',hazards:'none',requestedChecks:['Exterior / dock lines'],
};

function prepared(cadence='Monthly') {
  const e=createEnrollment(); applyQuestionnaire(e,questionnaire); choosePlan(e,'Dock Watch','Monthly',cadence); signAsCustomer(e); return e;
}

test('invited customer can sign then pay before HYC acceptance',()=>{
  const e=prepared();
  assert.equal(e.entryPath,'captain_invited');
  assert.equal(e.agreementStatus,'customer_signed');
  assert.equal(e.hycDecision,'not_reviewed');
  assert.equal(e.signers.captainWill,'not_requested');
  simulatePayment(e,'succeeded',new Date('2026-11-12T20:00:00Z'));
  assert.equal(e.paymentStatus,'succeeded');
  assert.equal(e.hycDecision,'review_pending');
  assert.equal(e.enrollmentStatus,'payment_received_pending_hyc');
  assert.equal(e.nextBillingAt,'2026-12-12T20:00:00.000Z');
  assert.throws(()=>simulatePayment(e,'succeeded'),/already recorded/);
});

test('annual billing uses first payment anniversary with 10 percent discount',()=>{
  const e=prepared('Annual');
  assert.equal(e.selection.monthlyEquivalent,129);
  assert.equal(e.selection.amount,1393.2);
  simulatePayment(e,'succeeded',new Date('2026-11-12T20:00:00Z'));
  assert.equal(e.nextBillingAt,'2027-11-12T20:00:00.000Z');
});

test('month end and leap anniversaries clamp safely without calendar-month alignment',()=>{
  assert.equal(addAnniversary(new Date('2026-01-31T09:15:00Z'),1).toISOString(),'2026-02-28T09:15:00.000Z');
  assert.equal(addAnniversary(new Date('2024-02-29T09:15:00Z'),12).toISOString(),'2025-02-28T09:15:00.000Z');
});

test('HYC acceptance countersigns; decline models cancellation and manual refund separately',()=>{
  const accepted=prepared();simulatePayment(accepted,'succeeded');decideEnrollment(accepted,'accept');
  assert.equal(accepted.agreementStatus,'fully_executed_simulated');
  assert.equal(accepted.signers.captainWill,'signed_simulated');
  assert.equal(accepted.serviceReadiness,'boat_binder_pending');
  assert.throws(()=>updateReadiness(accepted,'firstVisit',true),/Complete Boat Binder/);
  updateReadiness(accepted,'boatBinder',true);updateReadiness(accepted,'operationalOnboarding',true);
  assert.equal(accepted.serviceReadiness,'ready_to_schedule');
  updateReadiness(accepted,'firstVisit',true);assert.equal(accepted.serviceReadiness,'scheduled');
  const declined=prepared();simulatePayment(declined,'succeeded');decideEnrollment(declined,'decline');
  assert.equal(declined.paymentStatus,'canceled_simulated');
  assert.equal(declined.refundStatus,'manual_refund_pending');
  assert.equal(declined.agreementStatus,'customer_signed');
});

test('cannot choose unsupported pricing or submit credentials in questionnaire',()=>{
  assert.deepEqual(getPrice('Dock Watch','Monthly',36),{monthly:129,annual:1393.2});
  const e=createEnrollment();
  assert.throws(()=>applyQuestionnaire(e,{...questionnaire,alarmPin:'1234'}),/Do not submit access codes/);
  assert.throws(()=>getPrice('Dock Watch Plus','Monthly',36),/not available/);
});

test('payment cannot precede customer signature and HYC cannot review unpaid records',()=>{
  const e=createEnrollment();
  assert.throws(()=>simulatePayment(e,'succeeded'),/Customer signature/);
  assert.throws(()=>decideEnrollment(e,'accept'),/Only a paid/);
});

test('late questionnaire and plan updates after signature require a new agreement version and signature',()=>{
  const e=prepared();
  const signedVersion=e.signedAgreementVersion;
  const snapshot=structuredClone(e.signedTermsSnapshot);
  assert.throws(()=>applyQuestionnaire(e,{...questionnaire,vesselName:'Changed after signature'}),/new agreement version and a new customer signature/);
  assert.throws(()=>choosePlan(e,'Dock Watch','Weekly','Monthly'),/new agreement version and a new customer signature/);
  assert.equal(e.questionnaire.vesselName,'S/V Test Current');
  assert.equal(e.signedAgreementVersion,signedVersion);
  assert.deepEqual(e.signedTermsSnapshot,snapshot);
  assert.equal(assertEnrollmentConsistency(e),true);
});

test('successful payment locks signed terms and repeated checkout',()=>{
  const e=prepared();simulatePayment(e,'succeeded',new Date('2026-11-14T20:00:00Z'));
  assert.throws(()=>applyQuestionnaire(e,{...questionnaire,vesselName:'Late edit'}),/new agreement version/);
  assert.throws(()=>choosePlan(e,'Dock Watch','Weekly','Monthly'),/new agreement version/);
  assert.throws(()=>simulatePayment(e,'succeeded'),/already recorded/);
  assert.equal(e.hycDecision,'review_pending');
  assert.equal(assertEnrollmentConsistency(e),true);
});

test('HYC final decision blocks customer changes, another payment, and reopening the decision',()=>{
  const e=prepared();simulatePayment(e,'succeeded');decideEnrollment(e,'decline');
  assert.throws(()=>applyQuestionnaire(e,{...questionnaire,vesselName:'Reopened'}),/new agreement version/);
  assert.throws(()=>choosePlan(e,'Dock Watch','Weekly','Monthly'),/new agreement version/);
  assert.throws(()=>simulatePayment(e,'succeeded'),/already recorded/);
  assert.throws(()=>decideEnrollment(e,'accept'),/Only a paid customer-signed enrollment can be reviewed/);
  assert.equal(e.hycDecision,'declined');
  assert.equal(e.paymentStatus,'canceled_simulated');
  assert.equal(e.refundStatus,'manual_refund_pending');
  assert.equal(assertEnrollmentConsistency(e),true);
});

test('state invariant catches changed data behind a customer signature',()=>{
  const e=prepared();e.selection.amount+=1;
  assert.throws(()=>assertEnrollmentConsistency(e),/Signed terms changed/);
});
