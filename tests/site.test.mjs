import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("all public pages retain GA4 and shared navigation", async () => {
  for (const page of ["index.html", "services/index.html", "about/index.html", "free-visit/index.html"]) {
    const html = await read(page);
    assert.match(html, /G-SPS95WR4FC/);
    assert.match(html, /href="\/services\/"/);
    assert.match(html, /href="\/about\/"/);
    assert.match(html, /href="\/free-visit\/"/);
    assert.match(html, /class="skip-link"/);
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

test("complimentary offer is consistently described as one visit", async () => {
  for (const page of ["index.html", "services/index.html", "free-visit/index.html"]) {
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
});
