import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addAnniversary, applyQuestionnaire, assertEnrollmentConsistency, choosePlan, createEnrollment, createInvitation, decideEnrollment, getInvitationEnrollment, getPrice, listEnrollments, parseVesselValue, reviewEligibility, signAsCustomer, simulatePayment, updateReadiness } from '../server.mjs';

const questionnaire = {
  ownerName:'Riley Example',signerName:'Riley Example',signerTitle:'',businessName:'',confirmAuthority:'on',insuranceConfirmed:'on',ownerEmail:'riley@example.com',ownerPhone:'555-0101',
  vesselName:'S/V Test Current',vesselModel:'2018 Example 32',loa:'36',value:'250000',hin:'EXAMPLE-HIN',marina:'Test Marina',slip:'A-10',insurer:'Example Marine',policyExpiry:'2027-10-01',
  emergencyName:'Casey Example',emergencyPhone:'555-0102',hazards:'none',requestedChecks:['This legacy freeform value is ignored'],
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

test('above-threshold vessel value completes customer enrollment and requires HYC eligibility review',()=>{
  const e=createEnrollment();
  applyQuestionnaire(e,{...questionnaire,value:'1750000'});
  assert.equal(e.questionnaire.value,1_750_000);
  assert.equal(e.eligibilityReview,'review_required');
  choosePlan(e,'Dock Watch','Monthly','Monthly');
  signAsCustomer(e);
  simulatePayment(e,'succeeded',new Date('2026-11-14T20:00:00Z'));
  assert.equal(e.paymentStatus,'succeeded');
  assert.equal(e.hycDecision,'review_pending');
  assert.throws(()=>decideEnrollment(e,'accept'),/Review the vessel eligibility threshold/);
  reviewEligibility(e,'reviewed_eligible');
  decideEnrollment(e,'accept');
  assert.equal(e.hycDecision,'accepted');
  assert.equal(e.agreementStatus,'fully_executed_simulated');
  assert.equal(assertEnrollmentConsistency(e),true);
});

test('vessel value still must be finite and positive',()=>{
  const e=createEnrollment();
  for (const value of ['0','-1','$-1','not-a-number','1,00,000','1.5,000','1e6','1..5m','1.000']) {
    assert.throws(()=>applyQuestionnaire(e,{...questionnaire,value}),/valid positive vessel value/);
  }
});

test('currency shorthand normalizes to positive USD numbers and drives HYC eligibility review',()=>{
  const values=[['1000000',1_000_000],['1,000,000',1_000_000],['$1,000,000',1_000_000],['850k',850_000],['1m',1_000_000],['1.5m',1_500_000],['1.5M',1_500_000]];
  for (const [input,expected] of values) {
    const e=createEnrollment();applyQuestionnaire(e,{...questionnaire,value:input});
    assert.equal(Number(e.questionnaire.value),expected);
    assert.equal(e.eligibilityReview,expected>1_500_000?'review_required':'not_required');
  }
  assert.equal(parseVesselValue('1.75m'),1_750_000);
  const above=createEnrollment();applyQuestionnaire(above,{...questionnaire,value:'1.75m'});
  assert.equal(above.questionnaire.value,1_750_000);
  assert.equal(above.eligibilityReview,'review_required');
});

test('individual owner can differ from the explicitly identified agreement signer',()=>{
  const e=createEnrollment();
  applyQuestionnaire(e,{...questionnaire,ownerName:'Harbor Holdings LLC',businessName:'Harbor Holdings LLC',signerName:'Jordan Example'});
  assert.equal(e.questionnaire.ownerName,'Harbor Holdings LLC');
  assert.equal(e.questionnaire.businessName,'Harbor Holdings LLC');
  assert.equal(e.questionnaire.signerName,'Jordan Example');
});

test('invitation link is recoverable after reload and reopens the same enrollment',()=>{
  const invitation=createInvitation();
  const token=new URL(invitation.inviteUrl,'http://local').searchParams.get('invite');
  const before=listEnrollments();
  const reopened=getInvitationEnrollment(token);
  assert.equal(reopened.id,invitation.id);
  reopened.questionnaire={ownerName:'Saved Example'};
  assert.equal(getInvitationEnrollment(token).questionnaire.ownerName,'Saved Example');
  assert.equal(listEnrollments().length,before.length);
  const recovered=listEnrollments().find(e=>e.id===invitation.id);
  assert.equal(recovered.inviteUrl,invitation.inviteUrl);
});

test('material unsigned questionnaire edits invalidate plan and require plan recalculation',()=>{
  const e=createEnrollment();applyQuestionnaire(e,questionnaire);choosePlan(e,'Dock Watch','Monthly','Monthly');
  assert.equal(e.selection.monthlyEquivalent,129);
  applyQuestionnaire(e,{...questionnaire,loa:'45',value:'1.75m'});
  assert.equal(e.selection,null);
  assert.equal(e.questionnaire.ownerName,'Riley Example');
  assert.equal(e.questionnaire.value,1_750_000);
  assert.equal(e.eligibilityReview,'review_required');
  choosePlan(e,'Dock Watch','Monthly','Monthly');
  assert.equal(e.selection.monthlyEquivalent,149);
});

test('unchanged questionnaire preserves selected plan while material contact changes invalidate it',()=>{
  const e=createEnrollment();applyQuestionnaire(e,questionnaire);choosePlan(e,'Dock Watch','Monthly','Monthly');
  const current=structuredClone(e.selection);
  applyQuestionnaire(e,questionnaire);
  assert.deepEqual(e.selection,current);
  applyQuestionnaire(e,{...questionnaire,ownerEmail:'new-owner@example.com'});
  assert.equal(e.selection,null);
});

test('questionnaire mappings require HIN and default report email and emergency cap safely',()=>{
  const e=createEnrollment();
  assert.throws(()=>applyQuestionnaire(e,{...questionnaire,hin:''}),/Please complete hin/);
  applyQuestionnaire(e,{...questionnaire,emergencyCap:'9000',requestedChecks:['Engine operation']});
  assert.equal(e.questionnaire.reportEmail,'riley@example.com');
  assert.equal(e.questionnaire.emergencyCap,0);
  assert.equal('requestedChecks' in e.questionnaire,false);
  assert.equal(e.questionnaire.businessName,'');
});

test('customer screen keeps back navigation, saved field values, and removes obsolete fields',async()=>{
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/value="\$\{v\}"/);
  assert.match(app,/viewStep=0;renderCustomer\(\)/);
  assert.match(app,/viewStep=1;renderCustomer\(\)/);
  assert.match(app,/Edit Plan & Price/);
  assert.doesNotMatch(app,/Report email|reportEmail','|Emergency spending cap \(\$0 if blank\)|requestedChecks/);
  assert.match(app,/HIN \/ Registration Number/);
  assert.match(app,/I confirm I own the vessel or am authorized to enter into this agreement on the owner's behalf\./);
  assert.match(app,/\$\{field\('hazards'[\s\S]*?Do not enter access codes, alarm PINs, passwords, payment card data, or real customer information\.<\/div>[\s\S]*?name="confirmAuthority"/);
  assert.match(app,/Open Customer View/);
  assert.match(app,/Copy Invitation Link/);
  assert.match(app,/\/api\/invites\/\$\{encodeURIComponent\(inviteToken\)\}/);
  assert.match(app,/type="text" inputmode="decimal"/);
  assert.match(app,/class="currency-input"><span aria-hidden="true">\$<\/span>/);
  assert.match(app,/Number\(current\)\.toLocaleString\('en-US'/);
  assert.match(app,/formatUsd\(q\.value\)/);
  assert.match(app,/<h3>Owner &amp; Contact<\/h3>/);
  assert.match(app,/<h3>Vessel &amp; Location<\/h3>/);
  assert.match(app,/<h3>Insurance<\/h3>/);
  assert.match(app,/<h3>Emergency Contact<\/h3>/);
  assert.match(app,/Access limitations, hazards, and do-not-operate notes[\s\S]*?real customer information\.[\s\S]*?name="confirmAuthority"/);
  assert.match(app,/owner\.addEventListener\('input',[\s\S]*?signer\.value=owner\.value/);
  assert.doesNotMatch(app,/id="value"[^>]*max=/);
});
