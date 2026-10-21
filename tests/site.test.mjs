import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const serviceDetailPages = [
  "services/dock-check/index.html",
  "services/dock-watch/index.html",
  "services/dock-watch-plus/index.html",
];
const publicPages = [
  "index.html",
  "services/index.html",
  ...serviceDetailPages,
  "about/index.html",
  "free-visit/index.html",
  "referrals/index.html",
];

test("all public pages retain GA4 and shared navigation", async () => {
  for (const page of publicPages) {
    const html = await read(page);
    assert.match(html, /G-SPS95WR4FC/);
    assert.match(html, /href="\/services\/"/);
    assert.match(html, /href="\/about\/"/);
    assert.match(html, /href="\/free-visit\/"/);
    assert.match(html, /href="\/referrals\/"/);
    assert.match(html, /class="skip-link"/);
    assert.match(html, /href="https:\/\/www\.instagram\.com\/hayesyachtcompany\/"/);
    assert.match(html, /target="_blank" rel="noopener noreferrer" aria-label="Instagram — Hayes Yacht Company"/);
    assert.match(html, /class="instagram-link"[\s\S]*?<svg[^>]+aria-hidden="true"/);
  }
});

test("service comparison links to every service detail page", async () => {
  const html = await read("services/index.html");
  assert.match(html, /href="\/services\/dock-check\/">Dock Check/);
  assert.match(html, /href="\/services\/dock-watch\/">Dock Watch/);
  assert.match(html, /href="\/services\/dock-watch-plus\/">Dock Watch Plus/);
});

test("service detail pages use only confirmed scope, pricing, and reporting", async () => {
  const [dockCheck, dockWatch, dockWatchPlus] = await Promise.all(serviceDetailPages.map(read));

  assert.match(dockCheck, /dockside visual check/i);
  assert.match(dockCheck, /\$99<span>\/mo/);
  assert.match(dockCheck, /\$159<span>\/mo/);
  assert.match(dockCheck, /same for every boat length/i);
  assert.match(dockCheck, /does not include going aboard, operating equipment, or checking aboard systems/i);

  for (const price of ["$129", "$149", "$169", "$179", "$209", "$239", "$279", "$319"]) {
    assert.ok(dockWatch.includes(price), `Dock Watch missing ${price}`);
  }
  assert.match(dockWatch, /full aboard check/i);
  assert.match(dockWatch, /Monthly/);
  assert.match(dockWatch, /Every other week/);
  assert.match(dockWatch, /Weekly/);

  for (const price of ["$399/mo", "$449/mo", "$499/mo"]) {
    assert.ok(dockWatchPlus.includes(price), `Dock Watch Plus missing ${price}`);
  }
  assert.match(dockWatchPlus, /weekly aboard checks plus one monthly engine run/i);

  for (const html of [dockCheck, dockWatch, dockWatchPlus]) {
    assert.match(html, /Boat Binder/);
    assert.match(html, /href="\/free-visit\/">Request Your Free First Visit/);
    assert.match(html, /href="\/services\/"/);
    assert.doesNotMatch(html, /\b(?:minutes?|hours?)\b|battery|bilge|shore power|fluid levels?|guarantee/i);
  }
});

test("pricing and conditions match issue 11", async () => {
  const html = await read("services/index.html");
  for (const price of ["$99/mo", "$159/mo", "$129", "$149", "$169", "$179", "$209", "$239", "$279", "$319", "$399/mo", "$449/mo", "$499/mo", "$195", "$350", "$550/day", "$250/day", "$150/job", "$450", "$75", "$95", "$85 / $95 / $110"]) {
    assert.ok(html.includes(price), `missing ${price}`);
  }
  assert.match(html, /first 15 boats/i);
  assert.match(html, /24 months/i);
  assert.match(html, /10%/);
  assert.match(html, /month-to-month/i);
  assert.match(html, /Owners pay fuel, moorage, and yard charges/i);
});

test("free-visit form preserves safeguards, attribution, and distinct analytics", async () => {
  const html = await read("free-visit/index.html");
  const script = await read("async-form.js");
  for (const field of ["name", "email", "phone", "boat_length", "marina_moorage", "vessel_make_model", "message"]) assert.match(html, new RegExp(`name="${field}"`));
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) assert.match(html, new RegExp(`name="${field}"`));
  assert.match(html, /name="_gotcha"/);
  assert.match(html, /data-ga-method="free_first_visit_form"/);
  assert.match(html, /not booked or confirmed yet/i);
  assert.equal((script.match(/gtag\("event", "generate_lead"/g) || []).length, 1);
  assert.doesNotMatch(script, /email:|phone:|name:/);
});

test("referral page reuses the protected lead flow with distinct attribution", async () => {
  const html = await read("referrals/index.html");
  const script = await read("async-form.js");

  assert.match(html, /<title>Referrals \| Hayes Yacht Company<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/hayesyachtcompany\.com\/referrals\/"/);
  assert.match(html, /action="https:\/\/formspree\.io\/f\/xoeqowzz"/);
  assert.equal((html.match(/href="\/referrals\/"/g) || []).length, 1);
  assert.doesNotMatch(html.match(/<header[\s\S]*?<\/header>/)?.[0] || "", /href="\/referrals\/"/);

  for (const field of ["name", "email", "phone", "boat_length", "marina_moorage", "vessel_make_model", "referred_by", "message"]) {
    assert.match(html, new RegExp(`name="${field}"`));
  }
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    assert.match(html, new RegExp(`name="${field}"`));
  }

  assert.match(html, /name="inquiry_type" value="referral"/);
  assert.match(html, /name="utm_campaign" value="referral_program"/);
  assert.match(html, /name="referred_by"[^>]+placeholder="Person, business, or marina name \(optional\)"/);
  assert.match(html, /name="_gotcha"/);
  assert.match(html, /data-ga-method="referral_form"/);
  assert.match(html, /data-ga-event="referral_submit"/);
  assert.match(html, /data-ga-lead-type="referral"/);
  assert.match(script, /window\.gtag\("event", "generate_lead", eventParameters\)/);
  assert.match(script, /window\.gtag\("event", form\.dataset\.gaEvent, eventParameters\)/);
  assert.doesNotMatch(script, /email:|phone:|name:/);
});

test("complimentary offer is consistently described as one visit", async () => {
  for (const page of ["index.html", "services/index.html", ...serviceDetailPages, "free-visit/index.html"]) {
    const html = await read(page);
    assert.match(html, /One complimentary visit per (?:eligible )?(?:30–60 ft )?boat/i);
    assert.doesNotMatch(html, /not two separate|two names for the same|first\/baseline/i);
  }
});

test("founder language is accurate and formal introductions use William Hayes", async () => {
  const pages = await Promise.all(["index.html", "about/index.html"].map(read));
  const copy = pages.join("\n");
  assert.doesNotMatch(copy, /liveaboard/i);
  assert.match(copy, /William Hayes/);
  assert.match(copy, /USCG-licensed captain/);
  assert.match(copy, /apartment beside Lake Union/);
});

test("QR documentation records the exact stable attributed URL", async () => {
  const docs = await read("assets/qr/README.md");
  assert.match(docs, /https:\/\/hayesyachtcompany\.com\/free-visit\?utm_source=print&utm_medium=qr&utm_campaign=free_first_visit/);
  assert.match(docs, /https:\/\/hayesyachtcompany\.com\/referrals\/\?utm_source=print&utm_medium=qr&utm_campaign=referral_program/);
});
