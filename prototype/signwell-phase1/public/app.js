const $ = id => document.getElementById(id);
let config;
let doc = null;
let step = 0;

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

function say(message, error = false) { $('message').textContent = message; $('message').classList.toggle('error', error); }
function setStatus(label, confirmed = false) {
  $('status-pill').textContent = label;
  $('status-pill').classList.toggle('confirmed', confirmed);
}
function updateView() {
  if (!doc) return;
  const signerNodes = [...$('signers').children];
  doc.signers.forEach((signer, i) => {
    signerNodes[i].querySelector('.state').textContent = signer.state.replaceAll('_', ' ');
    signerNodes[i].classList.toggle('done', signer.state.startsWith('signed') || signer.state === 'completed');
  });
  $('poll').disabled = doc.mode !== 'signwell-test';
  $('audit').disabled = false;
  $('pdf').classList.toggle('disabled', !(doc.status === 'completed_simulated' || doc.status === 'completed' || doc.status === 'completed_with_changes'));
  $('pdf').setAttribute('aria-disabled', String($('pdf').classList.contains('disabled')));
  $('pdf').href = `/api/documents/${encodeURIComponent(doc.id)}/pdf`;
  $('mock-controls').hidden = doc.mode !== 'mock' || step > 1 || doc.status.includes('declined') || doc.status.includes('expired') || doc.status.includes('canceled');
  $('sign-current').hidden = doc.mode === 'mock' || step > 1 || doc.status === 'completed' || doc.status === 'completed_with_changes';
  $('sign-current').disabled = doc.mode === 'mock' || step > 1;
}

async function start() {
  config = await request('/api/config');
  const banner = $('mode-banner');
  if (config.mode === 'mock') {
    banner.textContent = 'MOCK SIMULATION — no SignWell API request will be made';
    banner.classList.add('mock');
  } else {
    banner.textContent = 'SIGNWELL TEST MODE — provider calls are enabled; only synthetic test recipients are configured';
    banner.classList.add('provider');
  }
}

$('create').addEventListener('click', async () => {
  $('create').disabled = true;
  $('embed-wrap').hidden = true;
  $('audit-output').hidden = true;
  try {
    doc = await request('/api/documents', { method: 'POST', body: '{}' });
    step = 0;
    setStatus(doc.mode === 'mock' ? 'Awaiting owner · simulated' : doc.status, false);
    updateView();
    say(doc.mode === 'mock' ? 'Synthetic mock document created in this browser session.' : 'Test document created; verify each signature with provider status polling.');
  } catch (error) { say(error.message, true); }
  finally { $('create').disabled = false; }
});

$('mock-sign').addEventListener('click', async () => {
  try {
    doc = await request(`/api/documents/${encodeURIComponent(doc.id)}/sign`, { method: 'POST', body: JSON.stringify({ signer: step }) });
    step += 1;
    setStatus(doc.status, false);
    updateView();
    say(step < 2 ? 'Owner signature simulated; HYC representative is now unlocked.' : 'Both signatures simulated locally. This is not provider-confirmed completion.');
  } catch (error) { say(error.message, true); }
});

$('apply-outcome').addEventListener('click', async () => {
  try {
    doc = await request(`/api/documents/${encodeURIComponent(doc.id)}/outcome`, { method: 'POST', body: JSON.stringify({ status: $('mock-outcome').value }) });
    setStatus(doc.status, false); updateView(); say('Alternative outcome simulated locally; this is not provider evidence.');
  } catch (error) { say(error.message, true); }
});

$('sign-current').addEventListener('click', async () => {
  try {
    const { signingUrl, signer } = await request(`/api/documents/${encodeURIComponent(doc.id)}/signing`);
    $('embed-wrap').hidden = false;
    $('signwell-frame').src = signingUrl;
    say(`Embedded SignWell Test Mode session opened for ${signer}. Refresh status after signing.`);
  } catch (error) { say(error.message, true); }
});

$('poll').addEventListener('click', async () => {
  try {
    const status = await request(`/api/documents/${encodeURIComponent(doc.id)}/status`, { method: 'POST', body: '{}' });
    doc = status;
    step = status.step;
    setStatus(`${status.providerStatus}${status.providerConfirmed ? ' · provider confirmed' : ''}`, status.providerConfirmed);
    updateView();
    say(`Provider status checked at ${status.updatedAt}.`);
  } catch (error) { say(error.message, true); }
});

$('audit').addEventListener('click', async () => {
  try {
    $('audit-output').textContent = JSON.stringify(await request(`/api/documents/${encodeURIComponent(doc.id)}/audit`), null, 2);
    $('audit-output').hidden = false;
  } catch (error) { say(error.message, true); }
});

$('reset').addEventListener('click', () => {
  doc = null; step = 0; $('embed-wrap').hidden = true; $('signwell-frame').src = 'about:blank'; $('audit-output').hidden = true;
  setStatus('Not started'); $('poll').disabled = true; $('audit').disabled = true; $('pdf').classList.add('disabled'); $('pdf').removeAttribute('href');
  $('mock-controls').hidden = true; $('sign-current').hidden = false; $('sign-current').disabled = true;
  $('signers').children[0].querySelector('.state').textContent = 'Waiting'; $('signers').children[1].querySelector('.state').textContent = 'Locked';
  [...$('signers').children].forEach(x => x.classList.remove('done'));
  say('Local view reset. Provider test documents already created remain in the SignWell test account.');
});

start().catch(error => { $('mode-banner').textContent = `Configuration error: ${error.message}`; $('mode-banner').classList.add('error'); $('create').disabled = true; });
