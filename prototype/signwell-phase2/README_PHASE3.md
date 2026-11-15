# Phase 3 — SignWell Test Mode in the invited enrollment wizard

This adds an optional real SignWell **Test Mode** path to the Phase 2 customer invitation flow. The default remains the existing mock workflow. Both paths use fictional data and simulated payment; there is no Stripe integration, production signing entry point, public webhook, database, or document storage service.

## Local setup

Requirements: Node.js 20 or later. From this directory, run mock mode as before:

```sh
npm start
```

The server binds only to `127.0.0.1:4180`. Mock mode requires no SignWell account. Run `npm test` for the Phase 2 workflow and mocked provider suites.

Provider mode requires an account with API access, a **reviewed synthetic Test Mode template**, the actual placeholder IDs/names, every field API ID, and a server-side API key. None of these account artifacts or credentials were available in this implementation session, so provider mode has not been enabled or exercised against SignWell.

1. Create and review a synthetic document from [fixtures/signwell-test-agreement.html](fixtures/signwell-test-agreement.html) in SignWell. Treat the `{{...}}` items as setup markers and replace each with a labeled editable field in the template editor. Add exactly two unsigned signer roles named `Customer` and `HYC Representative`; add one required signature field to each role, and an optional customer initials field if desired.
2. Add editable text fields for every value in [fixtures/signwell-template-mapping.example.json](fixtures/signwell-template-mapping.example.json). Record the actual placeholder IDs and field API IDs; do not use the example IDs.
3. Verify the template contents match the review screen terms, including the selected owner/signer, vessel, plan, visit frequency, cadence, exact price, activity scope, $0 emergency spending authority, agreement version, and nonbinding notice. Confirm neither signature field is pre-signed.
4. Copy `.env.example` to `.env.local`, fill in only the SignWell **test-account** key, reviewed synthetic template ID, and exact local mapping. Keep `.env.local` untracked. Start with:

   ```sh
   node --env-file=.env.local server.mjs
   ```

   The provider path fails at startup unless `SIGNWELL_TEST_MODE=true`, the key and template ID exist, and the reviewed mapping parses. `PROVIDER_MODE=mock` remains the default when the variable is absent.

Provider mode rejects names, contact values, vessel identifiers, locations, and insurers that are not clearly synthetic; customer email must use the reserved `@example.com` domain and phones must use the fictional `555-01xx` range. Use fictional details only. SignWell may send signing notifications according to account/template delivery settings; the app uses only reserved fictional addresses and does not expose a public invitation or accept a real customer email.

## Provider behavior

- After Agreement review, the server reads the configured template, verifies both placeholder roles, confirms the mapped field IDs exist, and rejects pre-signed required signature fields. It sends a single `Create Document from Template` request with `test_mode: true`, `draft: false`, `apply_signing_order: true`, `embedded_signing: true`, reminders off, and nonbinding metadata. Since creation sends the document directly, there is no separate send call. If one is added later it must also explicitly set Test Mode.
- Template placeholder IDs and placeholder names are stored separately from the unique document recipient IDs. Each recipient uses the documented `id`, `placeholder_name`, `name`, and fictional `email` properties. Signing order comes from the recipient array and documented `apply_signing_order` option; the prototype does not send `signing_order`, `send_email`, or `send_sms` recipient properties.
- The customer signing URL is returned by a token-scoped server endpoint and held only in local server memory. It is never returned on the Captain Will endpoints. The HYC URL is available only after customer status confirmation and simulated payment.
- SignWell's embedded JavaScript events and redirects are treated only as prompts to check status. Get Document must match the provider document ID, enrollment ID, agreement version, and signer recipient IDs. Only its recipient status confirms a signature. Checkout stays locked until customer confirmation.
- After payment, the captain card says **Needs HYC review**. Captain Will must open the embedded signer; HYC acceptance and full execution are recorded only after Get Document confirms both signatures. HYC decline deletes/cancels an in-progress provider document and preserves simulated cancellation plus manual-refund-pending state.
- After both confirmed signatures, the captain can retrieve Completed PDF with `audit_page=true`. The endpoint verifies the PDF response, does bounded retries for delayed generation, and records its SHA-256 in local memory and the response header. There is no customer-facing PDF endpoint or production storage.
- A creation request with an ambiguous/malformed response is not retried automatically; reconcile the SignWell Test Mode account first to avoid duplicate documents.

## Current official API review

Reviewed November 15, 2026:

- [Create Document from Template](https://developers.signwell.com/reference/createdocumentfromtemplate) supports `template_id`, `test_mode`, `draft`, `recipients`, `apply_signing_order`, `embedded_signing`, `embedded_signing_notifications`, `reminders`, `metadata`, and `template_fields`. It assigns recipients to template placeholders, copies any pre-signed template marks as document content (not a signature event), and documents template field prefills by API ID. The current [OpenAPI schema](https://developers.signwell.com/openapi/resources-and-endpoints.json) returns template fields grouped per file; the implementation flattens those groups, validates API IDs and exact labels, and separates template placeholder IDs from unique recipient IDs. The prototype refuses pre-signed signature fields.
- [Create a Document / embedded signing example](https://developers.signwell.com/reference/create-a-document) shows placeholder assignment using recipient `id`, `placeholder_name`, `name`, and `email`; `embedded_signing_url` is returned on the recipient. The current official [iframe guide](https://developers.signwell.com/reference/embedded-iframe) uses `https://static.signwell.com/assets/embedded.js`, `SignWellEmbed`, and `completed`, `declined`, `closed`, `error`, and load callbacks.
- [Update and Send Document](https://developers.signwell.com/reference/senddocument) explicitly says Test Mode does not carry over from draft creation. This implementation uses a single non-draft create request; any future separate send request must set `test_mode: true` again.
- [Get Document](https://developers.signwell.com/reference/getdocument) is the status source. [Completed PDF](https://developers.signwell.com/reference/getcompletedpdf) returns binary PDF by default, with `audit_page=true` (already the documented default) and a PDF or ZIP format option.
- [Authentication and Test Mode](https://developers.signwell.com/reference/getting-started-with-your-api-1) require `X-Api-Key`; API documentation describes `test_mode: true` on supported resources. All requests here remain server-side.

Phase 1's adapter was an unexercised draft. Its hardcoded `signing_order`, recipient `send_email`/`send_sms`, and positional status assumptions were not carried into this path; the official docs specify placeholder assignment and ordering through the ordered recipient list plus `apply_signing_order`. The reviewed account's Get Template/Get Document response shapes still need controlled verification.

## Template mapping status and outstanding prerequisites

The repository manifest is a **setup specification**, not a verified live SignWell mapping. Placeholder IDs, field API IDs, signature field assignment and optional initials support must be replaced/confirmed from the HYC test account before turning on provider mode. No credential, template, document, embedded session, or API request was available here; this is an explicit provider validation blocker.

The template map only authorizes the required fields. A changed owner, vessel, plan, cadence, price, or agreement version requires a new document and fresh signatures. Issued terms are locked in the app.

Before production, HYC needs authenticated, expiring customer invitations and signer identity verification because embedded signing disables SignWell's normal email authentication. Completed PDFs, audit trails, and signing metadata should ultimately be retained in private encrypted storage with access controls, versioning, hashes, retention/deletion policy, and a durable manifest. This phase intentionally has no S3, webhook endpoint, or persistent store.

## Manual Test Mode QA checklist (not run)

- [ ] Use only the reviewed synthetic template and reserved test identities.
- [ ] Confirm document creation reports Test Mode and exactly two mapped recipient roles.
- [ ] Confirm only Customer can sign first; HYC has no usable session before payment.
- [ ] Sign as Customer; close the iframe before/after signature and verify no checkout unlock until Get Document confirms the correct customer recipient.
- [ ] Retry a pending status check; verify it remains waiting, and test SignWell decline and expiration states.
- [ ] Confirm simulated payment succeeds before HYC signature; customer view never receives Captain Will's URL.
- [ ] Review the agreement as Captain Will, countersign in the embedded Test Mode session, and confirm full execution only after provider status refresh.
- [ ] Decline a separate paid enrollment; confirm provider document cancellation, simulated subscription cancellation, and manual refund pending.
- [ ] Retrieve the completed PDF and audit page; verify it belongs to the correct test document and agreement version.
- [ ] Confirm mock mode still works without SignWell variables.

## Verification evidence

Automated tests use mocked SignWell responses only. They cover explicit Test Mode configuration, request fields, mapping and order, status gates, simulated payment ordering, role URL separation, duplicate prevention, malformed/delayed responses, decline/cancellation, PDF plus audit-page retrieval, and mock mode. Actual SignWell behavior, account email delivery settings, provider response schemas, test PDF contents, and optional initials remain unverified until the prerequisites above are available.
