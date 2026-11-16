# HYC Phase 3 SignWell Test Evidence

**Repository:** `juliereneehayes/hayesyachtcompany`  
**Date:** November 15, 2026  
**Scope:** Local Phase 2 enrollment wizard with mocked SignWell Test Mode responses

## Automated checks executed

The new Phase 3 suite uses an injected fake SignWell HTTP transport. It does not access the network or create provider artifacts. It verifies:

- Missing API credentials, missing explicit `SIGNWELL_TEST_MODE=true`, invalid mode, invalid reviewed-template mapping, and a valid default mock mode.
- `test_mode: true`, direct non-draft template creation, `apply_signing_order: true`, embedded signing, reminders disabled, the two configured placeholder identities in customer-first array order, and all reviewed dynamic agreement fields.
- Rejection of pre-signed signature fields and malformed template schemas.
- No simulated checkout before Get Document confirms the customer signer; checkout succeeds before Captain Will's signature.
- The invitation session cannot retrieve Captain Will's embedded signing URL; the Captain review path can retrieve it only after customer signature and payment.
- HYC cannot accept via an administrative button; acceptance occurs only from confirmed provider status.
- Duplicate issue requests reuse a document; ambiguous creation responses are not retried automatically.
- Missing recipient status, provider customer decline, document expiration, HYC cancellation, delayed PDF availability, completed PDF validation, audit-page request, and SHA-256 recording.
- Above-threshold customers can complete the normal details, plan, signing, and simulated payment flow. Customer API responses omit internal eligibility and reconciliation state.
- Captain Review requires the internal “Reviewed eligible” or “Exception approved” disposition before countersigning. A provider-confirmed early Captain signature preserves its evidence but stays on internal reconciliation hold until HYC explicitly resolves it.
- Provider decline before payment leaves payment and refund states untouched. A confirmed HYC decline after payment preserves the paid timestamp and records simulated cancellation plus manual-refund-pending; ambiguous postpayment disposition remains open for internal reconciliation without claiming a refund.
- Provider signature state does not set simulated payment success or service readiness. Existing mock enrollment behavior remains credential-free.

The Phase 3 provider suite has 23 tests; Phase 2 workflow suite has 21. Run both with `cd prototype/signwell-phase2 && npm test`.

## Existing test suites requested

Executed November 15, 2026:

- Phase 1: `cd prototype/signwell-phase1 && npm test` — 4 passed, 0 failed.
- Phase 2 + Phase 3 mocked provider: `cd prototype/signwell-phase2 && npm test` — 44 passed, 0 failed (23 SignWell tests + 21 Phase 2 workflow tests).
- Root site: `node --test tests/site.test.mjs` — 8 passed, 0 failed.

## SignWell Test Mode manual evidence

**Not performed.** No valid test-account API key, reviewed synthetic SignWell template ID, placeholder IDs, field API IDs, or account email-delivery settings were available. There were zero requests to SignWell and no document, signature, PDF, or audit record was created. Manual validation is blocked until the mapping in `prototype/signwell-phase2/fixtures/signwell-template-mapping.example.json` is reviewed against the account template and local credentials are supplied.

## Evidence limits and production retention plan

Mocked responses establish application state gating and supported request construction, not SignWell's tenant-specific response shape or real iframe behavior. Actual field placement, recipient role assignment, sequential signer behavior, Test Mode account settings, generated PDF content, audit page, and email notifications remain unverified.

For a later production phase, retain the final PDF, audit evidence, metadata manifest, provider and enrollment IDs, agreement version, retrieval timestamps, content type, byte length, and SHA-256 in private encrypted storage with access logging, least-privilege reads, versioning, backups, and a counsel-approved retention/deletion policy. This local prototype keeps only an in-memory PDF and hash and has no production storage.
