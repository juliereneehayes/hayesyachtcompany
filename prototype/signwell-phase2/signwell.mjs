import { createHash } from 'node:crypto';

const API = 'https://www.signwell.com/api/v1';
const RESERVED = 'example.com';
export const REQUIRED_TEMPLATE_FIELDS = Object.freeze(['owner_name','contracting_business','signer_name','owner_email','vessel_name','vessel_model','vessel_length','vessel_value','hin_or_registration','plan','visit_frequency','billing_cadence','price']);

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
      billing_cadence: s.cadence, price: usd(s.amount),
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

const RESERVED_HYC_EMAIL = 'captain.will@example.com';

function usd(amount) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount)); }
function recipientMatches(r, role) { return String(r.id) === String(role.id) || r.placeholder_name === role.name; }
function makeTemplateFields(fieldMap, values) {
  const fields = [];
  for (const [key, field] of Object.entries(fieldMap)) {
    if (!(key in values) || typeof field?.apiId !== 'string' || !field.apiId.trim() || typeof field?.label !== 'string' || !field.label.trim()) throw new Error(`Reviewed SignWell field mapping is missing a valid API ID and label for ${key}.`);
    fields.push({ api_id: field.apiId, value: String(values[key]) });
  }
  if (Object.keys(fieldMap).length !== REQUIRED_TEMPLATE_FIELDS.length || REQUIRED_TEMPLATE_FIELDS.some(k => !(k in fieldMap))) throw new Error('Reviewed SignWell template field map must contain exactly the 13 required API-prefilled text fields.');
  return fields;
}

export function validateReviewedTemplate(template, mapping) {
  const report = inspectSignWellTemplate(template, mapping);
  if (!report.ok) throw new Error('SignWell template verification failed. Review missing, duplicate, and mismatched fields in the read-only template report.');
  return true;
}

export function inspectSignWellTemplate(template, mapping) {
  const missing = [], duplicates = [], mismatched = [];
  const placeholders = Array.isArray(template?.placeholders) ? template.placeholders : [];
  const fields = flattenTemplateFields(template?.fields);
  const mappingKeys = Object.keys(mapping?.fields || {});
  for (const key of mappingKeys) if (!REQUIRED_TEMPLATE_FIELDS.includes(key)) mismatched.push({ kind:'unexpected_mapping_field', key });
  const roleByPlaceholderId = new Map(placeholders.map(p => [String(p.id), String(p.name || '')]));
  const expectedRoles = [
    { key: 'customer', role: mapping?.customer, name: 'Customer' },
    { key: 'hyc', role: mapping?.hyc, name: 'Hyc Representative' },
  ];
  if (placeholders.length !== 2) mismatched.push({ kind:'placeholder_count', expected:2, actual:placeholders.length });
  for (const { key, role, name } of expectedRoles) {
    if (!role || role.name !== name) mismatched.push({ kind:'placeholder_name', role:key, expected:name, actual:role?.name || null });
    const matching = placeholders.filter(p => p.name === name);
    if (!matching.length) missing.push({ kind:'placeholder', name });
    if (matching.length > 1) duplicates.push({ kind:'placeholder', name, count:matching.length });
    if (role?.placeholderId && matching.some(p => String(p.id) !== String(role.placeholderId))) mismatched.push({ kind:'placeholder_id', name, expected:role.placeholderId, actual:matching.map(p => p.id) });
  }
  const signatureFields = fields.filter(f => String(f.type || '').toLowerCase() === 'signature');
  if (signatureFields.length > expectedRoles.length) mismatched.push({ kind:'unexpected_signature_count', expected:expectedRoles.length, actual:signatureFields.length });
  for (const key of REQUIRED_TEMPLATE_FIELDS) {
    const mapped = mapping?.fields?.[key];
    if (!mapped?.apiId || !mapped?.label) { missing.push({ kind:'mapping', key }); continue; }
    const matches = fields.filter(f => String(f.api_id || '') === String(mapped.apiId));
    if (!matches.length) { missing.push({ kind:'text_field', key, apiId:mapped.apiId, label:mapped.label }); continue; }
    if (matches.length > 1) duplicates.push({ kind:'api_id', key, apiId:mapped.apiId, count:matches.length });
    for (const field of matches) {
      const recipient = templateFieldRecipient(field, roleByPlaceholderId);
      if (field.label !== mapped.label || String(field.type || '').toLowerCase() !== 'text' || recipient !== 'Customer') {
        mismatched.push({ kind:'text_field', key, apiId:mapped.apiId, expectedLabel:mapped.label, actualLabel:field.label || null, expectedType:'text', actualType:field.type || null, expectedRecipient:'Customer', actualRecipient:recipient });
      }
    }
  }
  const expectedIds = new Set(REQUIRED_TEMPLATE_FIELDS.map(key => String(mapping?.fields?.[key]?.apiId || '')));
  const seenIds = new Map();
  for (const field of fields) {
    const apiId = String(field.api_id || '');
    if (apiId) seenIds.set(apiId, (seenIds.get(apiId) || 0) + 1);
    const type = String(field.type || '').toLowerCase();
    if (type === 'initials') mismatched.push({ kind:'unexpected_field', apiId:apiId || null, label:field.label || null, actualType:type, reason:'Initials fields are not part of the finalized template.' });
    else if (type === 'text' && apiId && !expectedIds.has(apiId)) mismatched.push({ kind:'unexpected_field', apiId, label:field.label || null, actualType:type });
  }
  for (const [apiId, count] of seenIds) if (count > 1 && !duplicates.some(item => item.apiId === apiId)) duplicates.push({ kind:'api_id', apiId, count });
  const seenLabels = new Map();
  for (const field of fields) if (field.label) seenLabels.set(String(field.label), [...(seenLabels.get(String(field.label)) || []), String(field.api_id || '')]);
  for (const [label, apiIds] of seenLabels) if (apiIds.length > 1) duplicates.push({ kind:'label', label, apiIds });
  for (const { key, role, name } of expectedRoles) {
    const roleFields = fields.filter(f => String(f.type || '').toLowerCase() === 'signature' && templateFieldRecipient(f, roleByPlaceholderId) === name);
    if (!roleFields.length) missing.push({ kind:'signature', recipient:name });
    if (roleFields.length > 1) duplicates.push({ kind:'signature', recipient:name, count:roleFields.length });
    for (const field of roleFields) if (field.required !== true || field.signed_at || field.completed_at || field.value) mismatched.push({ kind:'signature', recipient:name, required:field.required ?? null, preSigned:Boolean(field.signed_at || field.completed_at || field.value) });
  }
  const fieldsReport = fields.map(field => ({ label:field.label || null, apiId:field.api_id || null, recipient:templateFieldRecipient(field, roleByPlaceholderId), required:typeof field.required === 'boolean' ? field.required : null, type:field.type || null }));
  return {
    ok: missing.length === 0 && duplicates.length === 0 && mismatched.length === 0,
    templateId: template?.id || null,
    placeholders: placeholders.map(p => ({ name:p.name || null, id:p.id ?? null })),
    fields: fieldsReport,
    checks:{ mappedTextFields:REQUIRED_TEMPLATE_FIELDS.length, matchedTextFields:REQUIRED_TEMPLATE_FIELDS.filter(key => fields.some(f => String(f.api_id || '') === String(mapping?.fields?.[key]?.apiId) && String(f.type || '').toLowerCase() === 'text' && f.label === mapping?.fields?.[key]?.label && templateFieldRecipient(f, roleByPlaceholderId) === 'Customer')).length, templateRequiredTextFields:REQUIRED_TEMPLATE_FIELDS.filter(key => fields.some(f => String(f.api_id || '') === String(mapping?.fields?.[key]?.apiId) && String(f.type || '').toLowerCase() === 'text' && f.required === true)).length, requiredSignatures:expectedRoles.length, actualRequiredSignatures:expectedRoles.filter(({name}) => fields.some(f => String(f.type || '').toLowerCase() === 'signature' && templateFieldRecipient(f, roleByPlaceholderId) === name && f.required === true)).length },
    missing, duplicates, mismatched,
  };
}

function flattenTemplateFields(groups) { return Array.isArray(groups) ? groups.flatMap(group => Array.isArray(group) ? group : group && typeof group === 'object' ? [group] : []) : []; }
function templateFieldRecipient(field, roleByPlaceholderId) {
  if (field.placeholder_name) return String(field.placeholder_name);
  if (field.placeholder_id != null) return roleByPlaceholderId.get(String(field.placeholder_id)) || `Unknown placeholder (${field.placeholder_id})`;
  if (field.recipient_name) return String(field.recipient_name);
  if (field.recipient_id != null) return String(field.recipient_id);
  return 'Unknown recipient';
}

export function assertSyntheticEnrollment(q) {
  const marked = value => !value || /\b(example|test|sample)\b/i.test(String(value));
  if (!q || !String(q.ownerEmail).toLowerCase().endsWith(`@${RESERVED}`) || !marked(q.ownerName) || !marked(q.businessName) || !marked(q.signerName) || !marked(q.signerTitle) || !marked(q.vesselName) || !marked(q.vesselModel) || !marked(q.hin) || !marked(q.marina) || !marked(q.slip) || !marked(q.insurer) || !marked(q.emergencyName) || !/^555-01\d{2}$/.test(q.ownerPhone) || !/^555-01\d{2}$/.test(q.emergencyPhone) || (q.hazards && !marked(q.hazards))) {
    throw new Error('SignWell Test Mode accepts only fictional values marked Example/Test/Sample and a reserved @example.com email.');
  }
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
