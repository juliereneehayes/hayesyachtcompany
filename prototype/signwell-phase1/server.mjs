import { createServer as httpCreateServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4179);
const MAX_BODY = 32_000;
const states = new Map();
const sample = Object.freeze({
  ownerName: 'Morgan Example', ownerEmail: 'morgan@example.com',
  vesselName: 'S/V Sample Current', vessel: '2018 Example 32',
  plan: 'Dock Watch', cadence: 'Monthly', price: '$0.00 (placeholder)',
});

export function providerMode(env = process.env) {
  const mode = env.PROVIDER_MODE || 'mock';
  if (mode === 'mock') return { mode, providerReady: false };
  if (mode !== 'signwell-test') throw new Error('Unsupported PROVIDER_MODE. Use mock or signwell-test.');
  if (!env.SIGNWELL_API_KEY || env.SIGNWELL_TEST_MODE !== 'true' || !env.SIGNWELL_TEMPLATE_ID) {
    throw new Error('SignWell provider mode requires SIGNWELL_API_KEY, SIGNWELL_TEST_MODE=true, and SIGNWELL_TEMPLATE_ID. No provider request was made.');
  }
  return { mode, providerReady: true };
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}

async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error('Request body too large.');
  }
  return body ? JSON.parse(body) : {};
}

function safeState(state) {
  const { id, mode, status, step, signers, createdAt, updatedAt } = state;
  return { id, mode, status, step, signers, createdAt, updatedAt, sample };
}

export function createMockDocument() {
  const now = new Date().toISOString();
  return { id: `mock_${randomUUID()}`, mode: 'mock', status: 'awaiting_owner', step: 0, createdAt: now, updatedAt: now, signers: [{ name: sample.ownerName, email: sample.ownerEmail, state: 'awaiting' }, { name: 'Captain Will (Test)', email: 'captain.will@example.com', state: 'locked' }] };
}

export function applyMockSignature(state, signerIndex) {
  if (state.mode !== 'mock') throw new Error('Provider signatures cannot be changed locally.');
  if (!['awaiting_owner', 'partially_signed_simulated'].includes(state.status)) throw new Error('This document is no longer awaiting a simulated signature.');
  if (signerIndex !== state.step || state.step > 1) throw new Error('Signers must complete in order: owner first, then HYC representative.');
  state.signers[state.step].state = 'signed_simulated';
  state.step += 1;
  state.status = state.step === 1 ? 'partially_signed_simulated' : 'completed_simulated';
  if (state.step === 1) state.signers[1].state = 'awaiting';
  state.updatedAt = new Date().toISOString();
  return state;
}

export function applyMockOutcome(state, outcome) {
  if (state.mode !== 'mock') throw new Error('Provider outcomes cannot be set locally.');
  if (!new Set(['declined_simulated', 'expired_simulated', 'canceled_simulated']).has(outcome) || state.status === 'completed_simulated') throw new Error('This mock outcome is unavailable.');
  state.status = outcome;
  state.updatedAt = new Date().toISOString();
  return state;
}

export function mockAudit(state) {
  return { providerConfirmed: false, status: state.status, evidence: 'LOCAL SIMULATION ONLY — generated synthetic event record; not provider audit evidence.', events: [{ event: 'document_created_mock', at: state.createdAt }, ...state.signers.filter(x => x.state === 'signed_simulated').map(x => ({ event: 'signer_completed_mock', signer: x.name, at: state.updatedAt }))] };
}

export function localPdf(state) {
  const rows = [
    'TEST DOCUMENT - NOT LEGALLY BINDING',
    'Hayes Yacht Company SignWell Phase 1 Prototype',
    `Fictional owner: ${sample.ownerName}`,
    `Fictional vessel: ${sample.vesselName} / ${sample.vessel}`,
    `Sample plan: ${sample.plan} / ${sample.cadence}`,
    'Placeholder price: $0.00',
    `Local simulation status: ${state.status}`,
    'No payment or operational authorization is granted.',
  ];
  const esc = s => s.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = `BT /F1 12 Tf 50 760 Td 16 TL ${rows.map((s, i) => `${i ? 'T* ' : ''}(${esc(s)}) Tj`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objs.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function signwell(path, method, payload) {
  const resp = await fetch(`https://www.signwell.com/api/v1${path}`, {
    method,
    headers: { 'X-Api-Key': process.env.SIGNWELL_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const type = resp.headers.get('content-type') || '';
  if (!resp.ok) throw new Error(`SignWell request failed with HTTP ${resp.status}. Response body is suppressed.`);
  if (type.includes('application/pdf')) return Buffer.from(await resp.arrayBuffer());
  return resp.json();
}

async function createProviderDoc() {
  const draft = await signwell('/document_templates/documents', 'POST', {
    template_id: process.env.SIGNWELL_TEMPLATE_ID,
    test_mode: true,
    draft: true,
    document_name: 'HYC Phase 1 Synthetic Test — NOT LEGALLY BINDING',
    apply_signing_order: true,
    embedded_signing: true,
    reminders: false,
    recipients: [
      { name: sample.ownerName, email: sample.ownerEmail, signing_order: 1, send_email: false },
      { name: 'Captain Will (Test)', email: 'captain.will@example.com', signing_order: 2, send_email: false },
    ],
  });
  if (!draft?.id) throw new Error('SignWell draft response lacked a document ID.');
  // Test Mode is explicit again on the send request; it does not carry forward from draft creation.
  const sent = await signwell(`/documents/${encodeURIComponent(draft.id)}/send`, 'POST', {
    test_mode: true, apply_signing_order: true, embedded_signing: true,
    send_email: false, send_sms: false, reminders: false,
  });
  if (!sent?.id) throw new Error('SignWell send response lacked a document ID.');
  return { id: sent.id, providerStatus: sent.status || 'sent', provider: sent };
}

export function createAppServer() {
  const configured = providerMode();
  return httpCreateServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/api/config') {
        return json(res, 200, { mode: configured.mode, providerReady: configured.providerReady, sample, notice: 'TEST DOCUMENT — NOT LEGALLY BINDING' });
      }
      if (req.method === 'POST' && url.pathname === '/api/documents') {
        let state;
        if (configured.mode === 'mock') {
          state = createMockDocument();
        } else {
          await bodyJson(req); // Do not accept client-supplied recipients or agreement content.
          const result = await createProviderDoc();
          const now = new Date().toISOString();
          state = { id: result.id, mode: 'signwell-test', status: result.providerStatus, step: 0, createdAt: now, updatedAt: now, providerRecipients: result.provider.recipients || [], signers: [{ name: sample.ownerName, email: sample.ownerEmail, state: 'awaiting' }, { name: 'Captain Will (Test)', email: 'captain.will@example.com', state: 'locked' }] };
        }
        states.set(state.id, state);
        return json(res, 201, safeState(state));
      }
      const match = url.pathname.match(/^\/api\/documents\/([A-Za-z0-9_-]+)(?:\/(sign|status|audit|pdf|signing|outcome))?$/);
      if (match) {
        const [, id, action] = match;
        const state = states.get(id);
        if (!state) return json(res, 404, { error: 'Document not found in this local session. Reset to start a new synthetic document.' });
        if (req.method === 'POST' && action === 'sign') {
          if (state.mode !== 'mock') return json(res, 409, { error: 'Provider signatures must be completed in the embedded SignWell Test Mode session; local status cannot be changed.' });
          const input = await bodyJson(req);
          try { applyMockSignature(state, input.signer); }
          catch (error) { return json(res, 409, { error: error.message }); }
          return json(res, 200, safeState(state));
        }
        if (req.method === 'POST' && action === 'outcome') {
          if (state.mode !== 'mock') return json(res, 409, { error: 'Provider outcomes are read from SignWell; they cannot be set locally.' });
          const input = await bodyJson(req);
          try { applyMockOutcome(state, input.status); }
          catch (error) { return json(res, 409, { error: error.message }); }
          return json(res, 200, safeState(state));
        }
        if (req.method === 'POST' && action === 'status') {
          if (state.mode === 'signwell-test') {
            const provider = await signwell(`/documents/${encodeURIComponent(state.id)}`, 'GET');
            if (!provider?.id || provider.id !== state.id || !provider.status) return json(res, 502, { error: 'Provider status response was incomplete.' });
            state.status = provider.status;
            const recipients = provider.recipients || [];
            state.step = Math.min(2, recipients.filter(x => ['completed', 'signed'].includes(String(x.status || '').toLowerCase())).length);
            state.signers = state.signers.map((signer, i) => ({ ...signer, state: String(recipients[i]?.status || (i < state.step ? 'completed' : i === state.step ? 'awaiting' : 'locked')).toLowerCase() }));
            state.updatedAt = new Date().toISOString();
            return json(res, 200, { ...safeState(state), providerConfirmed: true, providerStatus: provider.status });
          }
          return json(res, 200, { ...safeState(state), providerConfirmed: false, providerStatus: null });
        }
        if (req.method === 'GET' && action === 'signing') {
          if (state.mode !== 'signwell-test') return json(res, 409, { error: 'The mock interface simulates signatures locally; it does not provide a provider signing URL.' });
          if (state.step > 1) return json(res, 409, { error: 'All provider signers are complete.' });
          const current = (state.providerRecipients || [])[state.step];
          const signingUrl = current?.embedded_signing_url;
          if (!signingUrl || !/^https:\/\/(www\.)?signwell\.com\//.test(signingUrl)) return json(res, 502, { error: 'SignWell did not return a verified embedded signing URL for the current signer. No URL was exposed.' });
          // The URL is returned only to this loopback app's active browser session and is never logged.
          return json(res, 200, { signer: state.signers[state.step].name, signingUrl });
        }
        if (req.method === 'GET' && action === 'audit') {
          if (state.mode === 'signwell-test') {
            const provider = await signwell(`/documents/${encodeURIComponent(state.id)}`, 'GET');
            return json(res, 200, { providerConfirmed: Boolean(provider?.id === state.id), providerStatus: provider?.status || 'unverified', signers: provider?.recipients || [], evidence: 'SignWell document status/recipient response; completed PDF can include its audit page.' });
          }
          return json(res, 200, mockAudit(state));
        }
        if (req.method === 'GET' && action === 'pdf') {
          if (state.mode === 'signwell-test') {
            if (!['completed', 'completed_with_changes'].includes(state.status)) return json(res, 409, { error: 'Provider has not confirmed all signatures.' });
            const pdf = await signwell(`/documents/${encodeURIComponent(state.id)}/completed_pdf?audit_page=true`, 'GET');
            res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="hyc-signwell-test-completed.pdf"', 'cache-control': 'no-store' });
            return res.end(pdf);
          }
          if (state.status !== 'completed_simulated') return json(res, 409, { error: 'Complete both simulated signatures first.' });
          const pdf = localPdf(state);
          res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="hyc-mock-test-not-legally-binding.pdf"', 'cache-control': 'no-store' });
          return res.end(pdf);
        }
      }
      if (req.method === 'GET') {
        const clean = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
        const filepath = join(here, 'public', clean || 'index.html');
        if (!filepath.startsWith(join(here, 'public'))) return json(res, 403, { error: 'Forbidden' });
        const data = await readFile(filepath);
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
        res.writeHead(200, { 'content-type': types[extname(filepath)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; frame-src https://www.signwell.com https://app.signwell.com; style-src 'self'; script-src 'self'; connect-src 'self'" });
        return res.end(data);
      }
      return json(res, 405, { error: 'Method not allowed.' });
    } catch (err) {
      const isMalformed = err instanceof SyntaxError;
      json(res, isMalformed ? 400 : 500, { error: isMalformed ? 'Invalid JSON.' : (err?.message || 'Request failed.') });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const server = createAppServer();
    server.listen(PORT, '127.0.0.1', () => console.log(`HYC SignWell Phase 1 prototype listening at http://127.0.0.1:${PORT} (${providerMode().mode})`));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
