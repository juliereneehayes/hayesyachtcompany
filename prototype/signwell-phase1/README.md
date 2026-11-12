# HYC SignWell Phase 1 Prototype

This isolated, local prototype models the owner-first / HYC-second signing sequence for a fictional sample document. It has no Stripe integration and does not modify the public site. The mock is the default and works without API credentials.

## Requirements and run

- Node.js 20 or later (uses built-in `fetch`, no packages to install)
- From this directory:

```sh
npm start
```

Open <http://127.0.0.1:4179>. The server binds to loopback only. To run the automated tests, use `npm test`.

Mock mode simulates owner then representative signatures, status, declined/expired/canceled outcomes, synthetic audit events, and a sample PDF. Every result is marked as simulated; it is not a SignWell signature or provider audit record.

## Optional SignWell Test Mode

Provider mode is intentionally unavailable without a separate test template created/reviewed in SignWell. Copy `.env.example` to a local file for reference, but export the values into the shell; the app does not load `.env` automatically. Never commit a real key or template identifier.

```sh
export PROVIDER_MODE=signwell-test
export SIGNWELL_API_KEY='your-test-account-key'
export SIGNWELL_TEST_MODE=true
export SIGNWELL_TEMPLATE_ID='your-reviewed-synthetic-test-template-id'
npm start
```

If any gate is missing, the server exits with an error; it never falls back to live/production mode. The prototype sends `test_mode: true` on template-based draft creation and sends `test_mode: true` again on the separate send request. It sets the two signers to synthetic `@example.com` addresses, sequential signing, embedded signing, reminders off, and `send_email: false` / `send_sms: false`. API calls and keys remain server-side; the API key and signing URLs are not logged. The app fetches provider status before displaying it as provider-confirmed. It refuses to change provider status locally and allows PDF retrieval only after the API reports completion.

**Provider-mode limitation:** an API key and a safe synthetic SignWell test template are not available in this repository/session. Therefore no SignWell request, embedded session, template operation, signer status, PDF, or audit export has been exercised here. The application code path is ready for a controlled test, but provider-mode behavior and the `send_email: false` account behavior must be verified before use. Do not use real recipient addresses. If SignWell rejects a field or workflow, stop and review its response/schema without weakening the test-mode gate.

## Document/template setup

The fixture at `fixtures/test-agreement.html` and role/field map at `fixtures/test-template-fields.json` are synthetic template references, not an uploaded production agreement. The manifest specifies the customer signature, HYC representative signature, and optional initials field; actual SignWell field placement and role binding must be verified in Test Mode. Recommended feasibility sequence:

1. In SignWell Test Mode, create one manual synthetic template from the fixture; set owner and HYC signer roles in order, position a signature field per signer, and add an optional initials field.
2. Retrieve/inspect that test template, then set only its ID in `SIGNWELL_TEMPLATE_ID`.
3. Use the prototype once to create a test draft/send, confirm the exact embedded URLs, sequential lock/unlock behavior, status API response, and completed PDF including audit page.
4. Delete/void the test artifact if the account permits; keep a note of template version and API schema used.

Manual template setup is the simpler Phase 1 approach: it avoids creating an unnecessary template through an untested API, permits visual field placement, and lets HYC inspect recipient roles. A programmatic template can later improve repeatability once fields/roles have been validated and the provider account is available. Store a template ID and version out of source control; version templates rather than silently changing one used for issued envelopes. The agreement/document text and field positioning need explicit testing for dynamic values and initials before a later phase.

## Identity and delivery safeguards

Embedded signing may disable SignWell's normal email authentication. A future HYC magic link must authenticate the intended owner and verify the signer's identity before the backend requests an embedded signing session. The prototype's test iframe does not verify identity. No unauthenticated public webhook receiver is present; Phase 1 uses explicit status polling. The provider code assumes `embedded_signing_url` is returned for the current recipient; that response shape is unverified until a test account run.

## Reset and privacy

“Reset local test” clears the current browser view. Restart the server to clear its in-memory document state. It does not delete documents already created in SignWell Test Mode. The provider mode stores provider IDs only in server memory; the client sees the current ID/status, never the API key. Do not expose this prototype beyond loopback or enter personal/customer information.
