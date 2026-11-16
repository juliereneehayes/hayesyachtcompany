import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';
import { assertSyntheticEnrollment, readSignWellConfig, signerCompletion, validateReviewedTemplate } from '../signwell.mjs';

const fieldKeys=['owner_name','contracting_business','signer_name','owner_email','vessel_name','vessel_model','vessel_length','vessel_value','hin_or_registration','plan','visit_frequency','billing_cadence','price','included_activity','emergency_spending_authority','agreement_version','agreement_notice'];
const mapping={customer:{id:'1',placeholderId:'placeholder-customer',name:'Customer'},hyc:{id:'2',placeholderId:'placeholder-hyc',name:'HYC Representative'},fields:Object.fromEntries(fieldKeys.map(k=>[k,{apiId:`api_${k}`,label:`Label ${k}`}]))};
const env={PROVIDER_MODE:'signwell-test',SIGNWELL_TEST_MODE:'true',SIGNWELL_API_KEY:'mock-only-key',SIGNWELL_TEMPLATE_ID:'123e4567-e89b-42d3-a456-426614174000',SIGNWELL_TEMPLATE_MAPPING:JSON.stringify(mapping)};
const template={id:env.SIGNWELL_TEMPLATE_ID,placeholders:[{id:'placeholder-customer',name:'Customer'},{id:'placeholder-hyc',name:'HYC Representative'}],fields:[[...fieldKeys.map(k=>({api_id:`api_${k}`,label:`Label ${k}`,type:'text',placeholder_name:'Customer'})),{api_id:'customer_signature',type:'signature',placeholder_name:'Customer',required:true,value:null},{api_id:'hyc_signature',type:'signature',placeholder_name:'HYC Representative',required:true,value:null},{api_id:'customer_initials',type:'initials',placeholder_name:'Customer',required:false,value:null}]]};

function mockFetch({delayedPdf=false,badCreate=false,missingRecipient=false,badMetadata=false}={}){
  const calls=[];let docs=0;let customer='pending',hyc='pending',docStatus='pending',pdfCalls=0,mockEnrollmentId='';
  const fetchImpl=async(url,options={})=>{
    const parsed=new URL(url);const payload=options.body?JSON.parse(options.body):null;calls.push({path:parsed.pathname+parsed.search,method:options.method||'GET',payload});
    if(parsed.pathname.endsWith(`/document_templates/${env.SIGNWELL_TEMPLATE_ID}`))return Response.json(template);
    if(parsed.pathname.endsWith('/document_templates/documents')&&options.method==='POST'){
      docs++;mockEnrollmentId=payload.metadata.hyc_enrollment_id;const recipients=[{id:'1',embedded_signing_url:'https://www.signwell.com/docs/customer-test/'},{id:'2',embedded_signing_url:'https://www.signwell.com/docs/captain-test/'}];
      return Response.json(badCreate?{status:'pending'}:{id:`doc-${docs}`,test_mode:true,status:'pending',recipients}, {status:201});
    }
    if(parsed.pathname==='/api/mock-control')return Response.json({});
    if(parsed.pathname==='/api/v1/documents/doc-1'&&options.method==='GET')return Response.json({id:'doc-1',status:docStatus,metadata:{hyc_enrollment_id:badMetadata?'wrong-enrollment':mockEnrollmentId,agreement_version:'2'},recipients:missingRecipient?[{id:'1',status:customer}]:[{id:'1',status:customer,signed_at:customer==='completed'?'2026-11-15T12:00:00Z':null},{id:'2',status:hyc,signed_at:hyc==='completed'?'2026-11-15T12:10:00Z':null}]});
    if(parsed.pathname==='/api/v1/documents/doc-1/completed_pdf'){
      pdfCalls++;if(delayedPdf&&pdfCalls<3)return new Response(JSON.stringify({error:'not ready'}),{status:404});
      return new Response(Buffer.from('%PDF-1.4\n% mock audit page\n%%EOF'),{status:200,headers:{'content-type':'application/pdf'}});
    }
    if(parsed.pathname==='/api/v1/documents/doc-1'&&options.method==='DELETE'){docStatus='canceled';return new Response(null,{status:204});}
    return Response.json({error:'not mocked'}, {status:404});
  };
  return {fetchImpl,calls,get docs(){return docs},set customer(v){customer=v},set hyc(v){hyc=v},set docStatus(v){docStatus=v},get pdfCalls(){return pdfCalls}};
}

async function withApp(mock,run,configuration=env){const server=createAppServer({env:configuration,fetchImpl:mock.fetchImpl});return run(server);}
async function json(server,path,method='GET',body){let status=0,headers={},chunks=[];let finish;const ended=new Promise(resolve=>finish=resolve);const req={url:path,method,async *[Symbol.asyncIterator](){if(body)yield Buffer.from(JSON.stringify(body));}};const res={writeHead(code,h={}){status=code;headers=h;return this;},end(chunk){if(chunk)chunks.push(Buffer.from(chunk));finish();}};const listener=server.listeners('request')[0];await listener(req,res);await ended;const raw=Buffer.concat(chunks);let data=raw; if(String(headers['content-type']||'').includes('application/json'))data=JSON.parse(raw.toString());return {status,data,headers};}
async function setup(base,value='250000'){
  const invitation=await json(base,'/api/admin/invitations','POST',{});const token=new URL(invitation.data.inviteUrl,'http://local').searchParams.get('invite');
  const q={ownerName:'Morgan Example',businessName:'Example Marine LLC',signerName:'Morgan Example',signerTitle:'Owner Example',confirmAuthority:'on',insuranceConfirmed:'on',ownerEmail:'morgan@example.com',ownerPhone:'555-0101',vesselName:'S/V Sample Current',vesselModel:'2018 Example 32',loa:'36',value,hin:'EXAMPLE-HIN',marina:'Test Marina',slip:'Test A-10',insurer:'Example Marine',policyExpiry:'2027-10-01',emergencyName:'Casey Example',emergencyPhone:'555-0102',hazards:'None in test fixture'};
  await json(base,`/api/invites/${token}/questionnaire`,'POST',q);
  await json(base,`/api/invites/${token}/plan`,'POST',{plan:'Dock Watch',visitFrequency:'Monthly',billingCadence:'Monthly'});
  return {token,id:invitation.data.id};
}
async function issued(base){const e=await setup(base);const issued=await json(base,`/api/invites/${e.token}/sign`,'POST',{});return {...e,issued};}
async function issuedValue(base,value){const e=await setup(base,value);const issued=await json(base,`/api/invites/${e.token}/sign`,'POST',{});return {...e,issued};}

test('provider config fails closed when credentials, explicit test flag, or mapping are missing',()=>{
  for(const bad of [{...env,SIGNWELL_API_KEY:''},{...env,SIGNWELL_TEST_MODE:'false'},{...env,SIGNWELL_TEMPLATE_MAPPING:'{}'}])assert.throws(()=>readSignWellConfig(bad));
  assert.throws(()=>readSignWellConfig({...env,PROVIDER_MODE:'production'}));
});

test('Test Mode creation payload uses reviewed placeholder IDs, fields, and customer-first ordered recipients',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {issued:issueResponse}=await issued(base);assert.equal(issueResponse.status,201);const create=mock.calls.find(c=>c.path.endsWith('/document_templates/documents'));assert.equal(create.payload.test_mode,true);assert.equal(create.payload.apply_signing_order,true);assert.equal(create.payload.embedded_signing,true);assert.equal(create.payload.reminders,false);assert.deepEqual(create.payload.recipients.map(r=>[r.id,r.placeholder_name]),[['1','Customer'],['2','HYC Representative']]);assert.equal(create.payload.recipients[0].email,'morgan@example.com');assert.equal(create.payload.template_fields.length,fieldKeys.length);assert.equal(create.payload.draft,false);});
});

test('SignWell template review checks role assignments, unsigned signature fields, and field API IDs',()=>{
  assert.equal(validateReviewedTemplate(template,mapping),true);
  assert.throws(()=>validateReviewedTemplate({...template,placeholders:[]},mapping),/placeholders/);
  assert.throws(()=>validateReviewedTemplate({...template,fields:template.fields.map(group=>group.map(f=>f.api_id==='customer_signature'?{...f,value:'presigned'}:f))},mapping),/Pre-signed/);
  assert.throws(()=>validateReviewedTemplate({...template,fields:template.fields.map(group=>group.map(f=>f.api_id==='api_owner_name'?{...f,label:'Wrong term'}:f))},mapping),/API ID or label/);
});

test('provider signatures cannot be simulated locally and payment stays locked until Get Document confirms customer signer',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token}=await issued(base);assert.equal((await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'})).status,409);mock.customer='completed';const status=await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.equal(status.data.signers.customer,'provider_confirmed');assert.equal((await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'})).status,200);assert.doesNotMatch(JSON.stringify(status.data),/mock-only-key|signwell\.com\/docs|doc-1/);assert.equal((await json(base,'/api/config')).data.apiKey,undefined);});
});

test('customer payment is available before Captain Will has signed and customer cannot obtain HYC session',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issued(base);mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.equal((await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'})).status,200);assert.equal((await json(base,`/api/invites/${token}/signwell/signing`)).status,404);assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/signing`)).status,200);});
});

test('HYC cannot mark agreement executed without provider confirmation of second signer',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issued(base);mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/decision`,'POST',{decision:'accept'})).status,409);assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/status`,'POST',{})).data.hycDecision,'review_pending');});
});

test('above-threshold customer completes details, plan, signing, and payment without eligibility exposure',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issuedValue(base,'1.8 million');
    const before=await json(base,`/api/invites/${token}`);assert.equal(before.status,200);assert.equal(before.data.questionnaire.value,1800000);assert.equal('eligibilityReview' in before.data,false);
    assert.equal((await json(base,`/api/invites/${token}/signing`)).status,200);
    mock.customer='completed';const signed=await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.equal(signed.status,200);assert.equal('eligibilityReview' in signed.data,false);assert.equal(signed.data.paymentStatus,'pending');
    const paid=await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});assert.equal(paid.status,200);assert.equal(paid.data.hycDecision,'review_pending');assert.equal(paid.data.paymentStatus,'succeeded');assert.equal('eligibilityReview' in paid.data,false);
    const detail=await json(base,`/api/admin/enrollments/${id}`);assert.equal(detail.data.eligibilityReview,'review_required');
    const customerUi=(await import('node:fs/promises')).readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.doesNotMatch(await customerUi,/Eligibility review required:/);
  });
});

test('Captain Review shows the internal gate and blocks countersigning until disposition',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issuedValue(base,'$1,600,000');mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});
    const internal=await json(base,`/api/admin/enrollments/${id}`);assert.equal(internal.data.eligibilityReview,'review_required');
    assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/signing`)).status,409);
    const source=await (await import('node:fs/promises')).readFile(new URL('../public/app.js',import.meta.url),'utf8');assert.match(source,/Internal eligibility review required/);assert.match(source,/>Reviewed eligible</);assert.match(source,/>Exception approved</);
    const reviewed=await json(base,`/api/admin/enrollments/${id}/eligibility`,'POST',{disposition:'reviewed_eligible'});assert.equal(reviewed.data.eligibilityReview,'reviewed_eligible');
    assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/signing`)).status,200);
  });
});

test('provider Captain signature cannot bypass eligibility and is retained for manual reconciliation',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issuedValue(base,'2 million');mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});mock.hyc='completed';mock.docStatus='completed';
    const customer=await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.equal(customer.status,200);assert.equal(customer.data.hycDecision,'review_pending');assert.equal(customer.data.serviceReadiness,'not_started');assert.equal('eligibilityReview' in customer.data,false);assert.equal('internalReconciliationRequired' in customer.data,false);
    const internal=await json(base,`/api/admin/enrollments/${id}`);assert.equal(internal.data.signers.captainWill,'provider_confirmed');assert.equal(internal.data.internalReconciliationRequired,true);assert.equal(internal.data.internalReconciliationReason,'captain_signature_before_internal_eligibility_approval');assert.notEqual(internal.data.hycDecision,'accepted');assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/reconcile`,'POST',{decision:'accept'})).status,409);
    await json(base,`/api/admin/enrollments/${id}/eligibility`,'POST',{disposition:'reviewed_eligible'});await json(base,`/api/admin/enrollments/${id}/signwell/status`,'POST',{});const held=(await json(base,`/api/admin/enrollments/${id}`)).data;assert.equal(held.hycDecision,'review_pending');assert.equal(held.serviceReadiness,'not_started');assert.equal(held.internalReconciliationRequired,true);assert.equal(held.agreementStatus,'provider_completed_pending_hyc_approval');
    const reconciled=await json(base,`/api/admin/enrollments/${id}/signwell/reconcile`,'POST',{decision:'accept'});assert.equal(reconciled.status,200);assert.equal(reconciled.data.hycDecision,'accepted');assert.equal(reconciled.data.serviceReadiness,'boat_binder_pending');assert.equal(reconciled.data.internalReconciliationRequired,false);
  });
});

test('invalid provider status response leaves enrollment unchanged instead of partially accepting',async()=>{
  const mock=mockFetch({badMetadata:true});await withApp(mock,async base=>{const {token,id}=await issuedValue(base,'1.7 million');mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});mock.hyc='completed';mock.docStatus='completed';
    const before=(await json(base,`/api/admin/enrollments/${id}`)).data;assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/status`,'POST',{})).status,502);const after=(await json(base,`/api/admin/enrollments/${id}`)).data;
    for(const key of ['signWellStatus','signers','hycDecision','agreementStatus','enrollmentStatus','serviceReadiness','internalReconciliationRequired'])assert.deepEqual(after[key],before[key]);
  });
});

test('duplicate sign requests reuse one provider document',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token}=await setup(base);await Promise.all([json(base,`/api/invites/${token}/sign`,'POST',{}),json(base,`/api/invites/${token}/sign`,'POST',{})]);assert.equal(mock.docs,1);});
});

test('issued agreement terms are immutable until a new enrollment/version is created',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token}=await issued(base);assert.equal((await json(base,`/api/invites/${token}/plan`,'POST',{plan:'Dock Watch',visitFrequency:'Weekly',billingCadence:'Monthly'})).status,409);assert.equal(mock.docs,1);});
});

test('missing recipient status response fails closed without accepting signature',async()=>{
  const mock=mockFetch({missingRecipient:true});await withApp(mock,async base=>{const {token}=await issued(base);assert.equal((await json(base,`/api/invites/${token}/signature-status`,'POST',{})).status,502);assert.equal((await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'})).status,409);});
});

test('malformed creation response is not retried to avoid accidental duplicate documents',async()=>{
  const mock=mockFetch({badCreate:true});await withApp(mock,async base=>{const {token}=await setup(base);assert.equal((await json(base,`/api/invites/${token}/sign`,'POST',{})).status,409);assert.equal((await json(base,`/api/invites/${token}/sign`,'POST',{})).status,409);assert.equal(mock.docs,1);});
});

test('Test Mode decline cancels the pending provider document and keeps payment refund follow-up simulated',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issued(base);mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});const decline=await json(base,`/api/admin/enrollments/${id}/signwell/decision`,'POST',{decision:'decline'});assert.equal(decline.status,200);assert.equal(decline.data.paymentStatus,'canceled_simulated');assert.equal(decline.data.refundStatus,'manual_refund_pending');assert.equal(decline.data.agreementStatus,'customer_signed');assert.ok(mock.calls.some(c=>c.method==='DELETE'));});
});

test('provider signer decline or expiration closes the signature path without allowing payment',async()=>{
  for(const [docStatus,customerStatus] of [['declined','declined'],['expired','pending']]){
    const mock=mockFetch();await withApp(mock,async server=>{const {token}=await issued(server);mock.docStatus=docStatus;mock.customer=customerStatus;const status=await json(server,`/api/invites/${token}/signature-status`,'POST',{});assert.equal(status.status,200);assert.ok(['declined','expired'].includes(status.data.agreementStatus));assert.equal((await json(server,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'})).status,409);});
  }
});

test('prepayment provider decline closes agreement without payment or refund states',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token}=await issued(base);mock.docStatus='declined';mock.customer='declined';const outcome=await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.equal(outcome.status,200);assert.equal(outcome.data.agreementStatus,'declined');assert.equal(outcome.data.paymentStatus,'not_started');assert.equal(outcome.data.refundStatus,'not_applicable');assert.equal(outcome.data.customerOutcomeNotice,'The test agreement was declined before payment. No payment was taken.');assert.equal((await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'})).status,409);});
});

test('confirmed postpayment HYC decline preserves payment history and marks simulated cancellation/refund pending',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issued(base);mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});const paidAt=(await json(base,`/api/admin/enrollments/${id}`)).data.paidAt;mock.docStatus='declined';mock.hyc='declined';const result=await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.equal(result.status,200);assert.equal(result.data.hycDecision,'declined');assert.equal(result.data.paymentStatus,'canceled_simulated');assert.equal(result.data.paidAt,paidAt);assert.equal(result.data.refundStatus,'manual_refund_pending');assert.equal(result.data.customerOutcomeNotice,null);assert.equal('internalReconciliationRequired' in result.data,false);
  });
});

test('ambiguous postpayment provider decline preserves payment and requires internal reconciliation',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token,id}=await issued(base);mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});const paidAt=(await json(base,`/api/admin/enrollments/${id}`)).data.paidAt;mock.docStatus='declined';mock.customer='declined';const result=await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.equal(result.status,200);assert.equal(result.data.hycDecision,'review_pending');assert.equal(result.data.paymentStatus,'succeeded');assert.equal(result.data.paidAt,paidAt);assert.equal(result.data.refundStatus,'not_applicable');assert.match(result.data.customerOutcomeNotice,/payment remains recorded; no refund status has been confirmed/);assert.equal('internalReconciliationRequired' in result.data,false);const internal=(await json(base,`/api/admin/enrollments/${id}`)).data;assert.equal(internal.internalReconciliationRequired,true);assert.equal(internal.internalReconciliationReason,'provider_decline_after_payment_ambiguous');
  });
});

test('completed PDF waits for both provider signers and retrieves the audit page with bounded retry',async()=>{
  const mock=mockFetch({delayedPdf:true});await withApp(mock,async base=>{const {token,id}=await issued(base);mock.customer='completed';await json(base,`/api/invites/${token}/signature-status`,'POST',{});await json(base,`/api/invites/${token}/payment`,'POST',{outcome:'succeeded'});assert.equal((await json(base,`/api/admin/enrollments/${id}/signwell/pdf`)).status,409);mock.hyc='completed';mock.docStatus='completed';await json(base,`/api/admin/enrollments/${id}/signwell/status`,'POST',{});const pdf=await json(base,`/api/admin/enrollments/${id}/signwell/pdf`);assert.equal(pdf.status,200,JSON.stringify(pdf.data));assert.match(pdf.headers['x-hyc-sha256'],/^[a-f0-9]{64}$/);assert.equal(mock.pdfCalls,3);assert.ok(mock.calls.some(c=>c.path.includes('audit_page=true')));});
});

test('provider events do not create payment or operational readiness and mock mode remains credential free',async()=>{
  const mock=mockFetch();await withApp(mock,async base=>{const {token}=await issued(base);mock.customer='completed';mock.hyc='completed';mock.docStatus='completed';const e=await json(base,`/api/invites/${token}/signature-status`,'POST',{});assert.notEqual(e.data.paymentStatus,'succeeded');assert.equal(e.data.serviceReadiness,'not_started');});
  const mockApp=mockFetch();await withApp(mockApp,async base=>{assert.deepEqual((await json(base,'/api/config')).data,{mode:'mock',providerReady:false,notice:'TEST DOCUMENT — NOT LEGALLY BINDING'});const invite=await json(base,'/api/admin/invitations','POST',{});assert.equal(invite.status,201);},{PROVIDER_MODE:'mock'});
});

test('synthetic-only gate rejects plausible real names and contact values',()=>{
  assertSyntheticEnrollment({ownerName:'Morgan Example',signerName:'Morgan Example',ownerEmail:'morgan@example.com',ownerPhone:'555-0101',vesselName:'Sample Current',vesselModel:'Example 32',hin:'EXAMPLE-HIN',marina:'Test Marina',slip:'Test A-10',insurer:'Example Marine',emergencyName:'Casey Example',emergencyPhone:'555-0102'});
  assert.throws(()=>assertSyntheticEnrollment({ownerName:'Morgan Hayes',signerName:'Morgan Hayes',ownerEmail:'morgan@hayes.com',ownerPhone:'2065550123',vesselName:'Sea Breeze',vesselModel:'2021 Hinckley',hin:'ABC123',marina:'Example Marina',slip:'A-10',insurer:'Example Marine',emergencyName:'Casey Example',emergencyPhone:'555-0102'}),/only fictional values/);
});

test('recipient completion is bound to exact document and configured recipient IDs',()=>{
  assert.throws(()=>signerCompletion({id:'other',recipients:[]},'expected',{}),/mismatched/);
});
