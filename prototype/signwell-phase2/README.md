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

The one customer session ends after payment. Captain Will's later review is a separate local step. Both entry-path labels are represented in the data model, but this phase exposes only captain-created invitations; there is no public self-service entry point.

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

The Phase 2 tests cover customer-sign-before-payment ordering, duplicate-payment prevention, monthly/annual date anchors (including month-end/leap-day handling), pricing validation, HYC accept/decline, manual refund state, and post-acceptance readiness gates. All records disappear when the server restarts.

## Boundaries

- Synthetic names/contact details only; never enter real customer data, credentials, card data, or access codes.
- Payment buttons update a local mock only. No Stripe SDK or endpoint is used.
- No production SignWell or external invitation delivery. Phase 1 Test Mode safeguards remain documented and unchanged; the Phase 2 journey deliberately uses local signing simulation.
- Section 10.4 remains unchanged in the separate legal review draft. Date relationship and HYC acceptance/refund terms require counsel review before customer use.
