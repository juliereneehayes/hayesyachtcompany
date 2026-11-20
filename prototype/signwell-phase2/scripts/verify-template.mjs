import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectSignWellTemplate, REQUIRED_TEMPLATE_FIELDS } from '../signwell.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../.env.local');
const apiRoot = 'https://www.signwell.com/api/v1';

export function parseLocalEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7) : line;
    const split = normalized.indexOf('=');
    if (split < 1) continue;
    const key = normalized.slice(0, split).trim();
    let value = normalized.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

export async function verifyConfiguredTemplate({ fetchImpl = fetch, envPathOverride = envPath } = {}) {
  const localEnv = parseLocalEnv(await readFile(envPathOverride, 'utf8'));
  const apiKey = localEnv.SIGNWELL_API_KEY;
  const templateId = localEnv.SIGNWELL_TEMPLATE_ID;
  let mapping;
  try { mapping = JSON.parse(localEnv.SIGNWELL_TEMPLATE_MAPPING || ''); }
  catch { throw new Error('SIGNWELL_TEMPLATE_MAPPING in the ignored local .env.local is missing or invalid.'); }
  if (!apiKey || !templateId) throw new Error('The ignored local .env.local must define SIGNWELL_API_KEY and SIGNWELL_TEMPLATE_ID.');
  if (!mapping?.customer || !mapping?.hyc || !mapping?.fields) throw new Error('SIGNWELL_TEMPLATE_MAPPING must define Customer, Hyc Representative, and the expected field map.');

  const url = `${apiRoot}/document_templates/${encodeURIComponent(templateId)}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Read-only SignWell Get Template request failed before a response was received; network details are suppressed.');
  }
  if (!response.ok) throw new Error(`Read-only SignWell Get Template request failed (HTTP ${response.status}); response details are suppressed.`);
  let template;
  try { template = await response.json(); }
  catch { throw new Error('SignWell Get Template returned a non-JSON response; response details are suppressed.'); }

  const report = inspectSignWellTemplate(template, mapping);
  if (String(template?.id || '') !== String(templateId)) report.mismatched.push({ kind: 'template_id', expected: templateId, actual: template?.id || null });
  report.ok = report.missing.length === 0 && report.duplicates.length === 0 && report.mismatched.length === 0;
  report.responseShape = {
    placeholderCollection: Array.isArray(template?.placeholders) ? 'array' : typeof template?.placeholders,
    fieldCollection: Array.isArray(template?.fields) ? (template.fields.some(Array.isArray) ? 'array of per-file field arrays' : 'flat field array') : typeof template?.fields,
    fieldsReturned: report.fields.length,
  };
  report.expectedTextFieldKeys = REQUIRED_TEMPLATE_FIELDS;
  return report;
}

function safe(value) {
  return String(value ?? '—')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
    .replace(/\b(api[_ -]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[credential redacted]')
    .replace(/[\r\n\t]/g, ' ');
}

export function formatTemplateReport(report) {
  const lines = [
    'SignWell Get Template verification (read-only)',
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Response fields: ${safe(report.responseShape?.fieldCollection)}; ${report.responseShape?.fieldsReturned ?? report.fields.length} field records`,
    `Mapped text fields: ${report.checks.matchedTextFields}/${report.checks.mappedTextFields}`,
    `Mapped text fields marked required by template: ${report.checks.templateRequiredTextFields}/${report.checks.mappedTextFields}` ,
    `Required signatures: ${report.checks.actualRequiredSignatures}/${report.checks.requiredSignatures}`,
    'Template placeholders:',
    ...report.placeholders.map(p => `  - ${safe(p.name)}: ID ${safe(p.id)}`),
    'Fields:',
    ...report.fields.map(f => `  - label=${safe(f.label)} | API ID=${safe(f.apiId)} | recipient=${safe(f.recipient)} | required=${f.required === null ? 'not reported' : f.required ? 'yes' : 'no'} | type=${safe(f.type)}`),
  ];
  for (const kind of ['missing', 'duplicates', 'mismatched']) {
    lines.push(`${kind[0].toUpperCase()}${kind.slice(1)}: ${report[kind].length ? '' : 'none'}`);
    for (const item of report[kind]) lines.push(`  - ${safe(JSON.stringify(item))}`);
  }
  return lines.join('\n');
}

async function main() {
  try {
    const report = await verifyConfiguredTemplate();
    process.stdout.write(`${formatTemplateReport(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
