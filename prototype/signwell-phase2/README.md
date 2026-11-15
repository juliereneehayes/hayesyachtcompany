# HYC Enrollment Wizard — Phase 2 Prototype

Captain-invited enrollment prototype. It runs locally, uses in-memory synthetic records, and keeps the Phase 1 SignWell app and the public HYC site unchanged. It has **no SignWell provider call, Stripe integration, email, AWS, or deployment**. Customer and Captain Will signatures and payments are explicitly simulated. The agreement preview is marked `TEST DOCUMENT — NOT LEGALLY BINDING` and is not derived from or a substitute for the reviewed legal draft.

## Run locally

Requirements: Node.js 20+; no install step or third-party packages.

```sh
cd prototype/signwell-phase2
npm start
```

Open <http://127.0.0.1:4180>. The app binds to loopback only. It shows the local captain console, not a public self-service enrollment page.

## Review the customer journey

1. In the captain console choose **Create customer invitation**. No email is sent.
2. Open the generated local invitation link, or copy it into another tab.
3. Use fictional details only. Select a plan, visit frequency, and monthly/annual simulated billing.
4. Review the conspicuously nonbinding sample agreement and simulate the customer signature.
5. Proceed immediately to simulated checkout. Try success, failure, or abandonment; failed/abandoned payment can be retried in the same visit.
6. After success, the customer sees **Payment received — agreement pending HYC acceptance**. Return to the captain console and refresh/open the enrollment.
7. Review the synthetic record. Countersign to accept, or decline to model cancellation plus manual-refund-pending. Refresh the customer tab to see the result.
8. After acceptance, separately mark Boat Binder and operational onboarding complete, then schedule the first visit. The prototype blocks first-visit scheduling until setup steps are complete.

The captain review card retains the original invitation's **Copy Invitation Link** and **Open Customer View** actions after a browser refresh. Reopening the URL loads the same in-memory enrollment and progress; it does not create a second record. The synthetic invitation token is held in memory and disappears when the local server restarts. A production invitation system will need token expiration, revocation, and a secure reissue path; it must not expose permanently recoverable plaintext tokens.

Customers can use Back controls before signing. Saved questionnaire and plan choices are prefilled. Material questionnaire changes clear the unsigned plan so its eligibility and price can be recalculated. After signing, the customer can review the agreement read-only; changing signed terms requires a new version and signature. Server-side checks also lock customer edits and payment actions after payment or a final HYC decision.

The vessel-value field accepts numeric dollars, comma-grouped values, an optional `$`, and `k` / `m` shorthand (for example `850k`, `1m`, or `1.5m`). The server validates and stores a positive numeric USD amount; review displays format it as currency. There is no enrollment-form value ceiling. Values above $1,500,000 continue to require HYC's internal eligibility review under the unchanged proposed §11.2.

### Short questionnaire field mapping

| Collected field | Prototype mapping |
|---|---|
| Owner Name; optional Business Name; signer name/title | `questionnaire.ownerName`, `businessName`, `signerName`, `signerTitle` |
| Owner email and phone | `ownerEmail`, `ownerPhone`; `reportEmail` defaults to `ownerEmail` internally |
| Vessel name/model, length, value, HIN or registration | `vesselName`, `vesselModel`, `loa`, normalized numeric USD `value`, `hin`; HIN/registration is required |
| Marina, slip, insurer, policy expiry | `marina`, `slip`, `insurer`, `policyExpiry` |
| Emergency contact and access limitations / hazards | `emergencyName`, `emergencyPhone`, `hazards`; synthetic emergency spending authority remains $0 |
| Ownership / authority and insurance confirmations | Required attestations `confirmAuthority` and `insuranceConfirmed` |

Freeform requested visual checks, a separate report email, and customer-entered emergency spending caps are not collected. Plan scope is a read-only summary; signed Exhibit A remains the controlling authorization, and plan choice alone does not authorize equipment operation. Detailed vessel-system data belongs in operational onboarding after HYC acceptance.

The one customer session ends after payment. Captain Will's later review is a separate local step. Both entry-path labels are represented in the data model, but this phase exposes only captain-created invitations; there is no public self-service entry point.

The customer may enter any valid positive vessel value. Values above $1,500,000 are flagged in Captain Will's review because the separate proposed agreement §11.2 has a $1.5M eligibility threshold; they are not blocked from continuing the customer flow. Before HYC acceptance, Will must mark the vessel reviewed eligible or record an approved exception. The prototype does not change §11.2.

## Checks

Run the retained static-site harness from the repository root:

```sh
node --test tests/site.test.mjs
```

Run Phase 2 workflow tests:

```sh
cd prototype/signwell-phase2
npm test
```

The Phase 2 tests cover invitation recovery and duplicate prevention, saved progress on reopen, questionnaire field mappings and defaults, back/edit UI behavior, material plan invalidation, signed and paid state locks, customer-sign-before-payment ordering, duplicate-payment prevention, monthly/annual date anchors (including month-end/leap-day handling), pricing validation, HYC accept/decline, manual refund state, and post-acceptance readiness gates. All records disappear when the server restarts.

## Boundaries

- Synthetic names/contact details only; never enter real customer data, credentials, card data, or access codes.
- Payment buttons update a local mock only. No Stripe SDK or endpoint is used.
- No production SignWell or external invitation delivery. Phase 1 Test Mode safeguards remain documented and unchanged; the Phase 2 journey deliberately uses local signing simulation.
- Section 10.4 remains unchanged in the separate legal review draft. Date relationship and HYC acceptance/refund terms require counsel review before customer use.
