# HYC Phase 2 Enrollment Prototype Requirements

**Decision:** Customer signs and pays first; Captain Will reviews and countersigns after payment. The customer completes enrollment in one uninterrupted session. This updates the prior sequencing proposal. Phase 2 uses simulated payments only; live Stripe remains out of scope.

## One customer flow for both entry paths

Captain-invited and future self-service users enter through different entry points but use the same questionnaire, validation, agreement, payment simulation, state model, and review queue.

1. Complete the short onboarding questionnaire.
2. Confirm service plan, exact pricing, billing cadence, and renewal anniversary basis.
3. Review and electronically sign the personalized agreement and Exhibit A as the customer.
4. Proceed immediately to a simulated subscription checkout in the same session. Do not wait for Captain Will and do not require the customer to return later to pay.
5. On simulated payment success, show “Payment received — agreement pending HYC acceptance.” Notify Captain Will in a local/mock queue.
6. Captain Will reviews the customer information and signed packet; then either countersigns or declines.
7. On countersignature, mark the agreement fully executed and show confirmation/next steps to the customer. On decline, model simulated subscription cancellation and a manual-refund-pending task.
8. After HYC acceptance, model Boat Binder setup, secure operational onboarding, readiness checks, and first-visit scheduling as separate steps.

## Independent status dimensions

Store and display these independently; do not collapse them into one “enrolled/active” flag:

- **Enrollment:** invited or self-service started, in progress, abandoned, canceled, complete.
- **Customer agreement:** not generated, awaiting customer, customer signed, declined/expired, fully executed.
- **Payment simulation:** not started, pending, succeeded, failed, abandoned, canceled; plus manual refund pending/completed where appropriate.
- **HYC decision:** not yet reviewed, review pending, accepted/countersigned, declined.
- **Service readiness:** not started, Boat Binder pending, operational onboarding pending, ready to schedule, scheduled.

Payment success does not equal HYC acceptance, full agreement execution, or service readiness. Customer signature/payment alone must never unlock service activity.

## Payment and date behavior

- Simulate monthly or annual payment; do not call Stripe or create Stripe Customer, Price, Checkout Session, Subscription, invoice, or payment records.
- The first successful simulated payment timestamp anchors future monthly/annual anniversaries; do not align to the first of a calendar month.
- Prevent duplicate payment simulation on refresh, double-click, retry, or return navigation.
- Support failed, abandoned, resumed, and canceled checkout paths.
- If HYC declines after payment, model canceling the simulated subscription and create a separate manual-refund-pending state. Do not calculate or issue an automatic refund.
- Preserve Section 10.4 verbatim in the agreement artifact; legal counsel must resolve its application to annual prepayment and any decline/refund scenario.

## SignWell and security boundaries

- Preserve Phase 1 safeguards: provider mode must remain explicitly set to SignWell Test Mode; `test_mode: true` must be set on document creation and any separate send request; no production fallback, real customer document, real recipient, or external email.
- Use only synthetic identities and a reviewed synthetic template. Keep API keys server-side and out of logs, source, browser state, PR comments, and chat.
- Customer signs first and Captain Will second. The customer may continue to simulated payment after their signature while Will's signature remains pending.
- A redirect, browser event, or local mock action is not provider confirmation. Poll/verify SignWell document status before recording either signature as provider-confirmed.
- No unauthenticated public webhook receiver. Mock/local notifications may stand in for email and the HYC review queue.

## Phase 2 acceptance criteria

1. Captain-invited and self-service entry paths converge on the same validation and state machine; synthetic sample records stay separate.
2. Customer can complete questionnaire, plan/pricing review, agreement signing, and simulated checkout in one session without waiting for Will or returning later.
3. After the customer signs, checkout is immediately available while HYC countersignature remains pending.
4. Payment received, HYC review, HYC acceptance, full execution, and service readiness are visibly separate states.
5. Payment success alone does not mark the agreement fully executed or service ready.
6. Will receives a local/mock completed-enrollment notification and can review the agreement and questionnaire, then countersign second or decline.
7. Countersignature produces the fully executed state and customer confirmation/next steps; declining after payment models subscription cancellation plus manual-refund-pending, without automatic refund.
8. Monthly/annual anniversary dates derive from the initial successful simulated payment timestamp; no first-of-month alignment occurs.
9. Failed, abandoned, canceled, retry, and resume paths do not create duplicate simulated payments; user-visible statuses are clear.
10. Boat Binder setup, operational onboarding, service readiness, and first-visit scheduling occur after HYC acceptance and remain independent states.
11. Section 10.4 text is unchanged. The prototype flags the relationship among payment date, Effective Date, paid service commencement, and HYC acceptance for legal review.
12. Provider Test Mode safeguards remain enforced. Phase 2 makes no live Stripe, AWS, production SignWell, production enrollment, or external email calls.

## Legal review before customer use

Counsel must review the relationship among: (a) customer's electronic signature; (b) initial payment and billing anniversary; (c) Agreement Effective Date; (d) commencement of a paid service period; (e) HYC's later review and countersignature; (f) HYC's right and process to decline; and (g) subscription cancellation and any manual refund, including Section 10.4. Counsel should confirm the agreement status and customer disclosures during the paid-but-pending-acceptance interval. The prototype must label this state plainly and must not imply that customer payment equals Company acceptance.
