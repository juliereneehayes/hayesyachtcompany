import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMockOutcome, applyMockSignature, createMockDocument, localPdf, mockAudit, providerMode } from '../server.mjs';

test('provider mode fails closed without explicit Test Mode settings', () => {
  assert.equal(providerMode({ PROVIDER_MODE: 'mock' }).mode, 'mock');
  assert.throws(() => providerMode({ PROVIDER_MODE: 'signwell-test', SIGNWELL_API_KEY: 'test-key' }), /SIGNWELL_TEST_MODE=true/);
  assert.throws(() => providerMode({ PROVIDER_MODE: 'signwell-test', SIGNWELL_TEST_MODE: 'true', SIGNWELL_TEMPLATE_ID: 'tpl' }), /SIGNWELL_API_KEY/);
  assert.equal(providerMode({ PROVIDER_MODE: 'signwell-test', SIGNWELL_API_KEY: 'test-key', SIGNWELL_TEST_MODE: 'true', SIGNWELL_TEMPLATE_ID: 'tpl' }).providerReady, true);
  assert.throws(() => providerMode({ PROVIDER_MODE: 'production' }), /Unsupported PROVIDER_MODE/);
});

test('mock flow enforces owner then HYC order and labels completion simulated', () => {
  const doc = createMockDocument();
  assert.match(doc.id, /^mock_/);
  assert.equal(doc.signers[0].email, 'morgan@example.com');
  assert.equal(doc.signers[1].state, 'locked');
  assert.throws(() => applyMockSignature(doc, 1), /owner first/);
  applyMockSignature(doc, 0);
  assert.equal(doc.status, 'partially_signed_simulated');
  assert.equal(doc.signers[1].state, 'awaiting');
  applyMockSignature(doc, 1);
  assert.equal(doc.status, 'completed_simulated');
  const audit = mockAudit(doc);
  assert.equal(audit.providerConfirmed, false);
  assert.match(audit.evidence, /LOCAL SIMULATION ONLY/);
  const pdf = localPdf(doc).toString('latin1');
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /TEST DOCUMENT - NOT LEGALLY BINDING/);
});

test('mock alternative outcomes stay simulated and do not pass completion gate', () => {
  const doc = createMockDocument();
  applyMockOutcome(doc, 'declined_simulated');
  assert.equal(doc.status, 'declined_simulated');
  assert.equal(mockAudit(doc).providerConfirmed, false);
  assert.throws(() => applyMockSignature(doc, 0), /no longer awaiting/);
});

test('mock PDF generator cannot be mistaken for provider evidence', () => {
  const doc = createMockDocument();
  const pdf = localPdf(doc).toString('latin1');
  assert.match(pdf, /Local simulation status: awaiting_owner/);
  assert.match(pdf, /No payment or operational authorization is granted/);
});
