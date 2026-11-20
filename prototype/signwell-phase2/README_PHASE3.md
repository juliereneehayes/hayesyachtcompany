# Phase 3 — SignWell Test Mode in the invited enrollment wizard

This adds an optional real SignWell **Test Mode** path to the Phase 2 customer invitation flow. The default remains the existing mock workflow. Both paths use fictional data and simulated payment; there is no Stripe integration, production signing entry point, public webhook, database, or document storage service.

## Local setup

Requirements: Node.js 20 or later. From this directory, run mock mode as before:

```sh
npm start
```

The server binds only to `127.0.0.1:4180`. Mock mode requires no SignWell account. Run `npm test` for the Phase 2 workflow and mocked provider suites.

Provider mode requires an account with API access, a **reviewed synthetic Test Mode template**, the actual placeholder IDs/names, the 13 text-field API IDs, and a server-side API key. The finalized roles are named exactly `Customer` and `Hyc Representative`; the template has one required unsigned signature for each and no initials field.

1. In SignWell, maintain the finalized synthetic agreement represented by [fixtures/signwell-test-agreement.html](fixtures/signwell-test-agreement.html). The `{{...}}` markers are the 13 API-prefilled text fields listed in [fixtures/signwell-template-mapping.example.json](fixtures/signwell-template-mapping.example.json). Do not add `included_activity`, `emergency_spending_authority`, `agreement_version`, `agreement_notice`, or initials fields. Preserve the static $0 emergency-spending default and service-authorization restrictions in the agreement text.
2. Keep the template signer placeholders named exactly `Customer` and `Hyc Representative`. Assign one required, unsigned signature field to each role.
3. Store the SignWell **test-account** key, synthetic template ID, and actual placeholder/field mapping in the ignored `.env.local`. Keep the file untracked. Verify the template with the read-only command before any document-creation or signing workflow:

   ```sh
   cd prototype/signwell-phase2
   npm run verify-template
   ```

   The verifier reads `.env.local` from this directory and makes exactly one `GET /api/v1/document_templates/{template_id}` request. It never calls a create, send, update, or signing endpoint, and does not print the API key or signing URLs. It reports each field's label, API ID, recipient, and required status; both placeholder IDs; missing, duplicate, and mismatched fields; and a pass/fail result for the 13 text fields and two required signatures. It exits nonzero on a mismatch. `PROVIDER_MODE=mock` remains the default when the variable is absent.

To start the local server using that same ignored configuration, run this from this directory:

```sh
PROVIDER_MODE=signwell-test node --env-file=.env.local server.mjs
```

`npm start` does not load `.env.local`; it starts the server in mock mode unless the environment is configured separately.

Provider mode rejects names, contact values, vessel identifiers, locations, and insurers that are not clearly synthetic; customer email must use the reserved `@example.com` domain and phones must use the fictional `555-01xx` range. Use fictional details only. SignWell may send signing notifications according to account/template delivery settings; the app uses only reserved fictional addresses and does not expose a public invitation or accept a real customer email.

## Provider behavior

- After Agreement review, the server reads the configured template, verifies both exact placeholder roles, confirms all 13 mapped text fields, two required unsigned signature fields, and the two expected required signature-date fields. The date fields are expected template fields, but are not API-prefilled text fields; there is no initials field. It rejects unexpected extra fields and sends values for only the 13 mapped text fields. Agreement version remains in internal enrollment state and provider metadata; $0 emergency spending and service restrictions remain static agreement terms. Document creation is separately gated behind the Test Mode flow.
- Template placeholder IDs and placeholder names are stored separately from the unique document recipient IDs. Each recipient uses the documented `id`, `placeholder_name`, `name`, and fictional `email` properties. Signing order comes from the recipient array and documented `apply_signing_order` option; the prototype does not send `signing_order`, `send_email`, or `send_sms` recipient properties.
- The customer signing URL is returned by a token-scoped server endpoint and held only in local server memory. It is never returned on the Captain Will endpoints. The HYC URL is available only after customer status confirmation and simulated payment.
- SignWell's embedded JavaScript events and redirects are treated only as prompts to check status. Get Document must match the provider document ID, enrollment ID, agreement version, and signer recipient IDs. Only its recipient status confirms a signature. Checkout stays locked until customer confirmation.
- After payment, the captain card says **Needs HYC review**. Captain Will must open the embedded signer; HYC acceptance and full execution are recorded only after Get Document confirms both signatures. HYC decline deletes/cancels an in-progress provider document and preserves simulated cancellation plus manual-refund-pending state.
- After both confirmed signatures, the captain can retrieve Completed PDF with `audit_page=true`. The endpoint verifies that the response is a PDF, does bounded retries for delayed generation, and records its SHA-256 in local memory and the response header; it does not validate audit-page inclusion. TC10 retrieved a one-page PDF without an audit page, both through HYC and directly from SignWell. Audit-page behavior remains unresolved. There is no customer-facing PDF endpoint or production storage.
- A creation request with an ambiguous/malformed response is not retried automatically; reconcile the SignWell Test Mode account first to avoid duplicate documents.

## Current official API review

Reviewed November 16, 2026:

- [Create Document from Template](https://developers.signwell.com/reference/createdocumentfromtemplate) supports `template_id`, `test_mode`, `draft`, `recipients`, `apply_signing_order`, `embedded_signing`, `embedded_signing_notifications`, `reminders`, `metadata`, and `template_fields`. It assigns recipients to template placeholders, copies any pre-signed template marks as document content (not a signature event), and documents template field prefills by API ID. The current [OpenAPI schema](https://developers.signwell.com/openapi/resources-and-endpoints.json) returns template fields grouped per file; the implementation flattens those groups, validates API IDs and exact labels, and separates template placeholder IDs from unique recipient IDs. The prototype refuses pre-signed signature fields.
- [Create a Document / embedded signing example](https://developers.signwell.com/reference/create-a-document) shows placeholder assignment using recipient `id`, `placeholder_name`, `name`, and `email`; `embedded_signing_url` is returned on the recipient. The current official [iframe guide](https://developers.signwell.com/reference/embedded-iframe) uses `https://static.signwell.com/assets/embedded.js`, `SignWellEmbed`, and `completed`, `declined`, `closed`, `error`, and load callbacks.
- [Update and Send Document](https://developers.signwell.com/reference/senddocument) explicitly says Test Mode does not carry over from draft creation. This implementation uses a single non-draft create request; any future separate send request must set `test_mode: true` again.
- [Get Document](https://developers.signwell.com/reference/getdocument) is the status source. [Completed PDF](https://developers.signwell.com/reference/getcompletedpdf) returns binary PDF by default, with `audit_page=true` (already the documented default) and a PDF or ZIP format option.
- [Authentication and Test Mode](https://developers.signwell.com/reference/getting-started-with-your-api-1) require `X-Api-Key`; API documentation describes `test_mode: true` on supported resources. All requests here remain server-side.

Phase 1's adapter was an unexercised draft. Its hardcoded `signing_order`, recipient `send_email`/`send_sms`, and positional status assumptions were not carried into this path; the official docs specify placeholder assignment and ordering through the ordered recipient list plus `apply_signing_order`. Get Document status was exercised during TC07–TC13: the document reported `Pending`, the customer recipient reported `in progress`, and the HYC recipient reported `waiting`. HYC normalized the customer status and kept the HYC signer gated until the prior steps were complete.

## Template mapping status and outstanding prerequisites

The mapping manifest contains the IDs observed in the HYC template's initial read-only Get Template response. That response returned two placeholders (`Customer`, ID `1`; `Hyc Representative`, ID `2`) and 17 fields grouped by file: 13 text fields, two required signatures, and two required signature-date fields (one for each signer). Those date fields are expected and are distinct from the 13 API-prefilled text fields. The response contained no initials field. Twelve mapped text fields report `required: false`; `Owner email` reports `required: true`. The 13 API-prefill fields remain required in the application mapping, and the verifier reports each template required flag without requiring all prefills to be signer-editable mandatory fields.

Four field API IDs differ from straightforward key-name guesses: `owner_name` uses `owner`, `signer_name` uses `person_signing`, `vessel_value` uses `approximate_vessel_value`, and `price` uses `simulated_price`. The other nine API IDs match their mapping keys. All 13 returned text labels and recipients matched the finalized mapping. The corrected mapping subsequently received a fresh authenticated Get Template PASS before the TC07–TC13 Test Mode workflow. The 13 API-prefilled text fields, two required signatures, two expected required signature-date fields, and actual Customer / Hyc Representative placeholders matched. The successful verification supersedes the two earlier HTTP 401 attempts. The read-only verifier makes one Get Template request and does not create or modify SignWell documents or templates.

The template map only authorizes the required fields. A changed owner, vessel, plan, cadence, price, or agreement version requires a new document and fresh signatures. Issued terms are locked in the app.

Before production, HYC needs authenticated, expiring customer invitations and signer identity verification because embedded signing disables SignWell's normal email authentication. Completed PDFs, audit trails, and signing metadata should ultimately be retained in private encrypted storage with access controls, versioning, hashes, retention/deletion policy, and a durable manifest. This phase intentionally has no S3, webhook endpoint, or persistent store.

## Manual Test Mode QA results

TC07–TC13 were exercised using the existing synthetic SignWell Test Mode enrollment and fictional data:

| Test | Result | Notes |
|---|---|---|
| TC07 — Customer embedded signing | PASS | Agreement renders and Next Field works after the committed iframe sizing correction. The Close confirmation remains malformed and does not clean up promptly. |
| TC08 — Simulated customer payment | PASS | Customer payment follows provider-confirmed customer signature; no Stripe request is involved. |
| TC09 — Captain Will countersignature and acceptance | PASS | HYC signs after customer signature and simulated payment. |
| TC10 — Completed signed PDF | PASS with limitation | Both signatures and dates are present. The downloaded PDF has one page and no audit page, including when downloaded directly from SignWell. |
| TC11 — Above-$1.5M internal eligibility workflow | PASS | Review remains internal and is required before HYC countersigning. |
| TC12 — Post-payment HYC decline | PASS | Simulated cancellation and manual-refund-pending are recorded; no refund is claimed as issued. |
| TC13 — Failed simulated payment and retry | PASS with transient issue | Failed payment was retried successfully. The first signing-open attempt returned HTTP 409; retry succeeded without changing the document. The raw provider statuses from the failed attempt were not captured, so its cause is unknown. |


## Remaining manual QA and provider questions

- [ ] Observe whether a signer can modify API-prefilled agreement terms. Record the behavior before considering any locking implementation.
- [ ] Recheck Close confirmation presentation and cleanup for both customer and Captain Will after the approved copy changes. Do not change SDK styling, lifecycle, or CSP without evidence and approval.
- [ ] If the transient 409 recurs, capture sanitized document and recipient statuses before retrying. Do not broaden the status allowlist or add automatic signing retries based on the current evidence.
- [ ] Ask SignWell whether Test Mode or account PDF preferences explain the missing audit page despite `audit_page=true`; do not represent the downloaded agreement as containing the audit page.
- [ ] Retest the updated mode labels/notices and payment/PDF copy in mock and SignWell Test Mode. These copy changes have not had a browser retest yet.

## Verification evidence

Automated tests use mocked SignWell responses only, including checks that the verifier issues one GET and sanitizes its report. They cover explicit Test Mode configuration, the exact 13-field payload, mapping and order, status gates, simulated payment ordering, role URL separation, duplicate prevention, malformed/delayed responses, decline/cancellation, completed-PDF retrieval with an audit-page request parameter, and mock mode. The mocked PDF test does not validate real audit-page contents. On November 20, 2026, `cd prototype/signwell-phase2 && npm test` completed with 56 passed and 0 failed. This is the current combined Phase 2 and mocked SignWell suite count; the November 16 historical evidence report retains the test counts from that earlier run.

Manual Test Mode outcomes and remaining browser/provider questions are recorded above. They are separate from automated tests; the copy changes in this update have not yet received a browser retest.
