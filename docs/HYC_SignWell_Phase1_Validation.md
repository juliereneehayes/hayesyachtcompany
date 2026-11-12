# HYC SignWell Phase 1 — Validation and Final Report

**Date:** November 12, 2026
**Status:** Local mock prototype and review drafts prepared; provider account behavior not exercised.

## Completed

- Read-only review of all four supplied HYC PDFs; no source PDF was edited or added to Git.
- Complete proposed agreement draft with updated Exhibit A, change log and legal-review notes. Section 10.4 is preserved verbatim.
- Short V1 questionnaire, required/optional field inventory, deferred operational-onboarding list, and field mapping/contract reference changes.
- Existing feasibility memo updated with the verified document findings and Phase 1 status.
- Built-in Node local app with a synthetic agreement, sequential owner/HYC signer simulation, simulated declined/expired/canceled outcomes, local status, mock audit output and generated sample PDF.
- Provider adapter code fails closed unless all explicit Test Mode environment gates and a test template ID are present. It has no production mode, Stripe/AWS integration, or public webhook receiver.
- Basic automated tests cover fail-closed configuration, signer order, simulated status/audit distinction, PDF boundary, and an alternate outcome.

## SignWell capabilities: what is known

Official SignWell API documentation describes template-based document creation, `test_mode`, embedded signing, sequential signing, document retrieval/status, and completed PDF retrieval with an audit page. The separate send endpoint has its own `test_mode` parameter; the prototype therefore sends it both when creating the draft and when sending it. The API documentation also provides template creation/retrieval endpoints. An embedded signing flow may disable the provider's email authentication; a future HYC magic-link must authenticate the owner independently before requesting an embedded URL.

The available docs support a technical hypothesis that a synthetic two-signer embedded flow can be implemented. They do not establish the entitlements of HYC's particular Free Developer account, whether its API-created template documents count against free quotas, or account-specific behavior.

## Not verified in the account

No SignWell key or test template ID was available, so none of the following was called or demonstrated: create/retrieve template, template recipient roles/placeholders, field positioning or initials mapping, template-based document generation, embedded signing URL, owner-first lock/unlock, `send_email: false` suppression, provider status transitions (viewed/partial/declined/expired/canceled/completed), completed PDF/audit page, account quota/usage, or free-tier access to each endpoint. No test email was sent, and no provider test document exists as a result of this work.

Provider mode must be attempted only after HYC has a safe synthetic template and explicitly test-only account credentials. Use synthetic recipients only. Confirm no email is sent before completing any provider workflow; if SignWell sends externally despite `send_email: false`, stop and do not use the embedded test path until a safe email-suppression mechanism is established. The current code's response field shapes and template payload need to be validated against a real test response before relying on them.

## Free Developer tier assessment

**Unresolved.** The documentation describes Test Mode and the prior memo notes the Free Developer plan's three-document monthly allowance, but this review could not verify whether that tier enables the exact template, embedded two-signer, status, completed-PDF/audit, and no-email endpoints needed by HYC. No usage or paid feature was activated. Do not add a card or upgrade to test the prototype as part of this Phase 1 work. First ask SignWell to confirm current account entitlements and test-document counting in writing.

## Renee and Captain Will: local mock test

From the repository root, open a terminal and run:

```sh
cd prototype/signwell-phase1
npm start
```

Open <http://127.0.0.1:4179>. Create the synthetic document, simulate Morgan Example signing, then simulate Captain Will (Test) countersigning. Refresh the status, view the clearly labeled local audit record, and download the sample PDF. The alternative dropdown can simulate declined, expired or canceled states. “Reset local test” clears the current browser display; restart the server to clear in-memory state. Mock completion is not provider-confirmed.

Run tests with `npm test` in the same directory. For a future provider test, use the safe environment steps and separately reviewed template instructions in the prototype README. Never put a key in a document, source file, PR comment, or chat.

## Recommended before Phase 2

1. Obtain Washington maritime counsel review of the proposed agreement and questionnaire; resolve the outstanding items in the draft before any customer use.
2. Have SignWell confirm Free Developer entitlements, usage/quota accounting, template and embed endpoint access, suppression of outbound mail, audit/PDF availability and retention.
3. Manually create one synthetic Test Mode template with owner and HYC roles, ordered signature fields, optional initials, and a saved version. Verify fields and data mapping before generating any draft.
4. Run one provider test with synthetic `@example.com` recipients only after a safe no-email behavior is confirmed; inspect embedded identity controls, event/status transitions, PDF/audit evidence, and template version behavior.
5. Keep payment integration, Stripe subscription creation, AWS, public webhook handling, account authentication, and production enrollment as separate design/review work. No Phase 1 result authorizes production rollout.

## Official SignWell references

- [Create Document from Template](https://developers.signwell.com/reference/createdocumentfromtemplate)
- [Update and Send Document](https://developers.signwell.com/reference/senddocument)
- [Create Template](https://developers.signwell.com/reference/createtemplate) and [Get Template](https://developers.signwell.com/reference/gettemplate)
- [Embedded iframe](https://developers.signwell.com/reference/embedded-iframe)
- [Completed PDF](https://developers.signwell.com/reference/getcompletedpdf)
- [Events](https://developers.signwell.com/reference/events)
- [API rate limits](https://developers.signwell.com/reference/getting-started-with-your-api-1)
