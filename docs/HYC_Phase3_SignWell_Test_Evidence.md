# HYC Phase 3 SignWell Test Evidence

**Repository:** `juliereneehayes/hayesyachtcompany`  
**Date:** November 16, 2026  
**Scope:** Local Phase 2 enrollment wizard, mocked SignWell Test Mode responses, and one read-only SignWell template check

## Automated checks executed

The new Phase 3 suite uses an injected fake SignWell HTTP transport. It does not access the network or create provider artifacts. It verifies:

- Missing API credentials, missing explicit `SIGNWELL_TEST_MODE=true`, invalid mode, invalid reviewed-template mapping, and a valid default mock mode.
- `test_mode: true`, direct non-draft template creation, `apply_signing_order: true`, embedded signing, reminders disabled, the two configured placeholder identities in customer-first array order, and all reviewed dynamic agreement fields.
- Rejection of pre-signed signature fields and malformed template schemas.
- No simulated checkout before Get Document confirms the customer signer; checkout succeeds before Captain Will's signature.
- The invitation session cannot retrieve Captain Will's embedded signing URL; the Captain review path can retrieve it only after customer signature and payment.
- HYC acceptance requires confirmed provider signatures; a Captain signature received before internal eligibility approval remains held until explicit internal reconciliation.
- Duplicate issue requests reuse a document; ambiguous creation responses are not retried automatically.
- Missing recipient status, provider customer decline, document expiration, HYC cancellation, delayed PDF availability, completed PDF validation, audit-page request, and SHA-256 recording.
- Above-threshold customers can complete the normal details, plan, signing, and simulated payment flow. Customer API responses omit internal eligibility and reconciliation state.
- Captain Review requires the internal “Reviewed eligible” or “Exception approved” disposition before countersigning. A provider-confirmed early Captain signature preserves its evidence but stays on internal reconciliation hold until HYC explicitly resolves it.
- Provider decline before payment leaves payment and refund states untouched. A confirmed HYC decline after payment preserves the paid timestamp and records simulated cancellation plus manual-refund-pending; ambiguous postpayment disposition remains open for internal reconciliation without claiming a refund.
- Provider signature state does not set simulated payment success or service readiness. Existing mock enrollment behavior remains credential-free.
- Finalized synthetic agreement fixture omits the four removed mapped fields and initials, retains static $0 emergency spending, and preserves the separate Exhibit A, vessel movement/delivery, and equipment-operation restrictions.

The Phase 3 provider suite has 27 tests; Phase 2 workflow suite has 21. Run both with `cd prototype/signwell-phase2 && npm test`.

## Existing test suites requested

Executed November 16, 2026:

- Phase 1: `cd prototype/signwell-phase1 && npm test` — 4 passed, 0 failed.
- Phase 2 + Phase 3 mocked provider: `cd prototype/signwell-phase2 && npm test` — 48 passed, 0 failed (27 SignWell tests + 21 Phase 2 workflow tests).
- Root site: `node --test tests/site.test.mjs` — 8 passed, 0 failed.

## SignWell read-only template verification

The verifier made one successful Get Template request on November 16, 2026. The response contained two placeholders: `Customer` (ID `1`) and `Hyc Representative` (ID `2`). Its `fields` property was an array of per-file field arrays and flattened to 17 field records: the 13 expected text fields, two required signatures, and two required date fields. It contained no initials field. The text fields were all assigned to Customer with matching labels; `Owner email` had `required: true` while the other 12 text prefills had `required: false`. Both signature fields had `required: true` and matched the expected role.

The live API IDs confirmed by that response are `owner_name → owner`, `contracting_business → contracting_business`, `signer_name → person_signing`, `owner_email → owner_email`, `vessel_name → vessel_name`, `vessel_model → vessel_model`, `vessel_length → vessel_length`, `vessel_value → approximate_vessel_value`, `hin_or_registration → hin_or_registration`, `plan → plan`, `visit_frequency → visit_frequency`, `billing_cadence → billing_cadence`, and `price → simulated_price`. The example mapping and ignored local `.env.local` were updated to those values.

Two later read-only verification attempts returned HTTP 401 after the mapping update; the sanitized verifier did not display response bodies or credentials. Rerun `cd prototype/signwell-phase2 && npm run verify-template` with a currently authorized test-account key to reconfirm the final local mapping. No document was created or sent, and no saved SignWell template was modified.

## Evidence limits and production retention plan

The successful read established the template response shape and mapping IDs but did not validate Get Document status responses, iframe behavior, sequential signing, account delivery settings, generated PDFs, audit pages, or email notifications.

For a later production phase, retain the final PDF, audit evidence, metadata manifest, provider and enrollment IDs, agreement version, retrieval timestamps, content type, byte length, and SHA-256 in private encrypted storage with access logging, least-privilege reads, versioning, backups, and a counsel-approved retention/deletion policy. This local prototype keeps only an in-memory PDF and hash and has no production storage.
