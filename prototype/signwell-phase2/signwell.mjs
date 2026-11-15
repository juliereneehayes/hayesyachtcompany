import { createHash } from 'node:crypto';

const API = 'https://www.signwell.com/api/v1';
const RESERVED = 'example.com';
export const SIGNWELL_ROLES = Object.freeze({ customer: 'customer', captainWill: 'hyc_representative' });

export function readSignWellConfig(env = process.env) {
  const mode = env.PROVIDER_MODE || 'mock';
  if (mode === 'mock') return { mode, ready: false };
  if (mode !== 'signwell-test') throw new Error('Unsupported PROVIDER_MODE. Choose mock or signwell-test.');
  if (env.SIGNWELL_TEST_MODE !== 'true') throw new Error('SignWell provider mode requires SIGNWELL_TEST_MODE=true.');
  if (!env.SIGNWELL_API_KEY || !env.SIGNWELL_TEMPLATE_ID) throw new Error('SignWell provider mode requires a server-side API key and reviewed synthetic template ID.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(env.SIGNWELL_TEMPLATE_ID)) throw new Error('SIGNWELL_TEMPLATE_ID must be the UUID of the reviewed synthetic template.');
  let mapping;
  try { mapping = JSON.parse(env.SIGNWELL_TEMPLATE_MAPPING || ''); }
  catch { throw new Error('SignWell provider mode requires a valid local SIGNWELL_TEMPLATE_MAPPING JSON value.'); }
  if (!mapping?.customer?.id || !mapping?.customer?.placeholderId || !mapping?.customer?.name || !mapping?.hyc?.id || !mapping?.hyc?.placeholderId || !mapping?.hyc?.name || !mapping?.fields || typeof mapping.fields !== 'object') {
    throw new Error('The local reviewed template mapping must define unique recipient IDs, template placeholder IDs/names, and field API IDs/labels.');
  }
  const mappedFields = Object.values(mapping.fields);
  const mappingValues = [mapping.customer.id,mapping.customer.placeholderId,mapping.customer.name,mapping.hyc.id,mapping.hyc.placeholderId,mapping.hyc.name,...mappedFields.flatMap(field => [field?.apiId,field?.label])];
  if (mappingValues.some(value => typeof value !== 'string' || !value.trim() || /replace|<|>/i.test(value))) throw new Error('Replace every template mapping placeholder with a reviewed SignWell ID, field API ID, or exact field label.');
  return { mode, ready: true, apiKey: env.SIGNWELL_API_KEY, templateId: env.SIGNWELL_TEMPLATE_ID, mapping };
}

function safeProviderError(status) {
  return new Error(`SignWell request failed (HTTP ${status}). Provider response details are suppressed.`);
}

export function createSignWellClient(config, fetchImpl = fetch) {
  if (!config?.ready) throw new Error('SignWell Test Mode is not configured.');
  async function request(path, method = 'GET', payload, { binary = false } = {}) {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { 'X-Api-Key': config.apiKey, Accept: binary ? 'application/pdf, application/zip' : 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 204) return null;
    if (!response.ok) throw safeProviderError(response.status);
    if (binary) {
      const type = response.headers.get('content-type') || '';
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!type.toLowerCase().includes('application/pdf') || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('SignWell completed PDF response was not a valid PDF.');
      return bytes;
    }
    return response.json();
  }
  return {
    getTemplate: () => request(`/document_templates/${encodeURIComponent(config.templateId)}`),
    getDocument: id => request(`/documents/${encodeURIComponent(id)}`),
    deleteDocument: id => request(`/documents/${encodeURIComponent(id)}`, 'DELETE'),
    completedPdf: id => request(`/documents/${encodeURIComponent(id)}/completed_pdf?audit_page=true&file_format=pdf`, 'GET', undefined, { binary: true }),
    createDocument,
  };

  async function createDocument(enrollment, existingTemplate) {
    const template = existingTemplate || await request(`/document_templates/${encodeURIComponent(config.templateId)}`);
    if (String(template?.id) !== String(config.templateId)) throw new Error('SignWell returned a different template than the reviewed configuration.');
    validateReviewedTemplate(template, config.mapping);
    const q = enrollment.questionnaire;
    const s = enrollment.selection;
    assertSyntheticEnrollment(q);
    const customer = { id: String(config.mapping.customer.id), placeholder_name: config.mapping.customer.name, name: q.signerName, email: q.ownerEmail };
    const hyc = { id: String(config.mapping.hyc.id), placeholder_name: config.mapping.hyc.name, name: 'Captain Will (Test)', email: RESERVED_HYC_EMAIL };
    const templateFields = makeTemplateFields(config.mapping.fields, {
      owner_name: q.ownerName, contracting_business: q.businessName || 'Individual owner', signer_name: q.signerName,
      owner_email: q.ownerEmail, vessel_name: q.vesselName, vessel_model: q.vesselModel, vessel_length: `${q.loa} ft`,
      vessel_value: usd(q.value), hin_or_registration: q.hin, plan: s.plan, visit_frequency: s.visitFrequency,
      billing_cadence: s.cadence, price: usd(s.amount), agreement_version: String(enrollment.agreementVersion),
      included_activity: planScope(s.plan), emergency_spending_authority: '$0', agreement_notice: 'TEST DOCUMENT — NOT LEGALLY BINDING',
    });
    const payload = {
      test_mode: true,
      template_id: config.templateId,
      name: `HYC Test Enrollment ${enrollment.id} — NOT LEGALLY BINDING`,
      recipients: [customer, hyc],
      template_fields: templateFields,
      draft: false,
      apply_signing_order: true,
      embedded_signing: true,
      embedded_signing_notifications: false,
      reminders: false,
      allow_decline: true,
      allow_reassign: false,
      metadata: { hyc_enrollment_id: enrollment.id, agreement_version: String(enrollment.agreementVersion), environment: 'local-test' },
    };
    const result = await request('/document_templates/documents', 'POST', payload);
    if (!result?.id || result.test_mode !== true || !Array.isArray(result.recipients) || result.recipients.length !== 2) throw new Error('SignWell document response failed Test Mode and recipient validation.');
    const returnedCustomer = result.recipients.find(r => recipientMatches(r, config.mapping.customer));
    const returnedHyc = result.recipients.find(r => recipientMatches(r, config.mapping.hyc));
    if (!returnedCustomer?.embedded_signing_url || !returnedHyc?.embedded_signing_url) throw new Error('SignWell did not return embedded signing URLs for both configured placeholder roles.');
    return { id: result.id, status: result.status || 'pending', result, recipientIds: { customer: String(returnedCustomer.id), hyc: String(returnedHyc.id) } };
  }
}

const RESERVED_CUSTOMER_EMAIL = 'morgan@example.com';
const RESERVED_HYC_EMAIL = 'captain.will@example.com';

function usd(amount) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount)); }
function recipientMatches(r, role) { return String(r.id) === String(role.id) || r.placeholder_name === role.name; }
function makeTemplateFields(fieldMap, values) {
  const fields = [];
  for (const [key, field] of Object.entries(fieldMap)) {
    if (!(key in values) || typeof field?.apiId !== 'string' || !field.apiId.trim() || typeof field?.label !== 'string' || !field.label.trim()) throw new Error(`Reviewed SignWell field mapping is missing a valid API ID and label for ${key}.`);
    fields.push({ api_id: field.apiId, value: String(values[key]) });
  }
  const required = ['owner_name','contracting_business','signer_name','owner_email','vessel_name','vessel_model','vessel_length','vessel_value','hin_or_registration','plan','visit_frequency','billing_cadence','price','included_activity','emergency_spending_authority','agreement_version','agreement_notice'];
  if (required.some(k => !(k in fieldMap))) throw new Error('Reviewed SignWell template field map must cover every visible agreement term.');
  return fields;
}

export function validateReviewedTemplate(template, mapping) {
  if (!template?.id || !Array.isArray(template.placeholders) || !Array.isArray(template.fields) || !template.fields.every(group => Array.isArray(group))) throw new Error('SignWell template response lacks verifiable placeholder or field data.');
  if (template.placeholders.length !== 2) throw new Error('The reviewed synthetic template must have exactly two signer placeholders.');
  for (const role of [mapping.customer, mapping.hyc]) {
    const placeholder = template.placeholders.find(p => String(p.id) === String(role.placeholderId) && p.name === role.name);
    if (!placeholder) throw new Error('SignWell template placeholders do not match the reviewed local mapping.');
    const signatureFields = flattenTemplateFields(template.fields).filter(f => (f.placeholder_name === role.name || String(f.placeholder_id) === String(role.placeholderId)) && String(f.type || '').toLowerCase() === 'signature');
    if (!signatureFields.length || signatureFields.every(f => f.required === false)) throw new Error('Both reviewed SignWell signer placeholders must have a required signature field.');
    if (signatureFields.some(f => f.signed_at || f.completed_at || f.value)) throw new Error('Pre-signed template signatures are prohibited; use unsigned signer fields.');
  }
  const templateFields = flattenTemplateFields(template.fields);
  for (const mapped of Object.values(mapping.fields)) {
    const actual = templateFields.find(f => f.api_id === mapped.apiId);
    if (!actual || actual.label !== mapped.label || !['text','date'].includes(String(actual.type || '').toLowerCase())) throw new Error('A reviewed SignWell field API ID or label does not match the configured template.');
  }
  const initials = templateFields.filter(f => String(f.type || '').toLowerCase() === 'initials' && (f.placeholder_name === mapping.customer.name || String(f.placeholder_id) === String(mapping.customer.placeholderId)));
  if (initials.some(f => f.signed_at || f.completed_at || f.value || f.required === true)) throw new Error('Optional customer initials must be unsigned and not required.');
  return true;
}

function flattenTemplateFields(groups) { return groups.flatMap(group => group); }

export function assertSyntheticEnrollment(q) {
  const marked = value => !value || /\b(example|test|sample)\b/i.test(String(value));
  if (!q || !String(q.ownerEmail).toLowerCase().endsWith(`@${RESERVED}`) || !marked(q.ownerName) || !marked(q.businessName) || !marked(q.signerName) || !marked(q.signerTitle) || !marked(q.vesselName) || !marked(q.vesselModel) || !marked(q.hin) || !marked(q.marina) || !marked(q.slip) || !marked(q.insurer) || !marked(q.emergencyName) || !/^555-01\d{2}$/.test(q.ownerPhone) || !/^555-01\d{2}$/.test(q.emergencyPhone) || (q.hazards && !marked(q.hazards))) {
    throw new Error('SignWell Test Mode accepts only fictional values marked Example/Test/Sample and a reserved @example.com email.');
  }
}

function planScope(plan) {
  return ({'Dock Check':'Dockside visual check only; no boarding or equipment operation.','Dock Watch':'Scheduled visual vessel and system checks. Equipment actions require separate explicit authorization.','Dock Watch Plus':'Dock Watch checks plus engine visual checks; engine starts only when the specific equipment and limits are expressly authorized.'})[plan] || 'No service authorization.';
}

export function signerCompletion(document, expectedDocumentId, recipientIds) {
  if (!document?.id || document.id !== expectedDocumentId || !Array.isArray(document.recipients)) throw new Error('SignWell document status response was incomplete or mismatched.');
  const lookup = role => document.recipients.find(r => String(r.id) === String(recipientIds[role]));
  const customer = lookup('customer');
  const hyc = lookup('hyc');
  if (!customer || !hyc) throw new Error('SignWell document response did not include both expected signer roles.');
  const status = r => String(r.status || '').toLowerCase();
  return { customer: status(customer), hyc: status(hyc), documentStatus: String(document.status || '').toLowerCase(), customerSigned: ['completed','signed'].includes(status(customer)), hycSigned: ['completed','signed'].includes(status(hyc)) };
}

export function pdfSha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
