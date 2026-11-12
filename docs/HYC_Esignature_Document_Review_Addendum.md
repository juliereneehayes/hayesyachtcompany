# HYC E-Signature Document Review Addendum

**Reviewed:** November 12, 2026
**Source documents:** Vessel-Watch & Service Agreement (Oct. 12, 2026 draft); Client Onboarding Questionnaire (Oct. 3, 2026); Free First Visit Authorization (Oct. 3, 2026 draft); SOP-001 Rev. 2 (Oct. 3, 2026).
**Status:** Read-only review of the actual local PDFs. These are draft/internal documents, not legal-approved final forms. The source PDFs were not modified or added to the repository.

## Verified document findings

- **Agreement:** It is a 12-page draft with Sections 1–18, Exhibit A service plan, and optional Exhibit B Vessel Delivery Authorization. Section 1.1 makes the completed Questionnaire part of the Agreement; §2.3 refers to checks selected in Exhibit A and authorized in the Questionnaire; §6.1 allows controls authorized in Exhibit A **or** the Questionnaire. That mismatch can let an unsigned form expand authority. §§5.3 and 6.5 rely on questionnaire/baseline information. §9.1 currently uses monthly advance billing/invoices due in 15 days, and §9.3 contains a 1% per month late charge (or maximum lawful rate) plus service suspension after written notice. §9.4 has 30-day rate-change notice and a rate-lock exception. §10.1 uses month-to-month language and cancellation before the next billing date. §10.4 states: “If Client prepaid recurring fees for a period after the termination date, Company will refund the prepaid amount less the standard monthly rate, without any prepayment discount, for each month of service begun before termination. The one-time onboarding fee is not refundable once the baseline visit has been performed.” Section 18 contains owner/company signatures and §§13–14 initials; Exhibit A E repeats signature blocks. §17.8 permits counterparts/e-signatures. §§13–14 contain express counsel warning.
- **Questionnaire:** The nine-page form includes contract, billing, vessel, access, insurance, plan/reporting, activity checkboxes, detailed system baselines and start/shutdown instructions, emergency authority, customer signature, and internal setup content. Most equipment settings, baselines, and photos can be delayed until operational onboarding, but must be completed before the applicable inspection/action. Do not collect access codes or passwords in ordinary enrollment.
- **Free First Visit:** This is an optional one-visit authorization, with its own restrictions and signatures; it is not a subscription enrollment requirement. Keep it out of the initial subscription workflow.
- **SOP-001:** It is an internal procedure, not a customer agreement. It supports safety and readiness gates: defer unsafe/dark/high-wind/lightning/icing access; review do-not-operate restrictions; only perform authorized checks; secure access credentials; preserve baseline/reset; manual pump override is limited to three seconds when dry; engine runs require vessel-specific fuel, ventilation, neutral, moored, cooling-water/seacock, idle/run-time and stop checks. It does not independently confer customer authority.

## Required agreement changes

The review draft is [HYC_Vessel_Watch_Agreement_Proposed_Rev1.md](drafts/HYC_Vessel_Watch_Agreement_Proposed_Rev1.md). It preserves the source structure and risk allocations and marks counsel questions.

- Make the **signed Exhibit A the sole standing source of service permissions**. Questionnaire and operational records supply facts, instructions, and additional restrictions only. Any increased scope requires a mutually accepted written amendment/service authorization.
- Update §§1.1–1.2, 2.3, 5.1/5.3, and 6.1/6.5 to align document hierarchy, access authorization, operational prerequisites, and the rule that missing/ambiguous safety instructions mean defer the affected action.
- Rewrite §9 for exact saved-payment authorization, first payment at enrollment completion, monthly or annual prepayment, 10% annual discount, billing anniversaries from initial payment (not calendar month), failed-payment notice/recovery, notice before suspension, explicitly authorized additional charges, and retained 30-day rate-change notice/rate lock. The draft does not direct Stripe to collect the existing §9.3 late charge automatically; counsel must decide if/how that existing term remains.
- Clarify §10 monthly/annual renewal, cancellation of future renewals, paid-period service, and termination rights. Preserve §10.4 verbatim and do not automate refunds.
- Execute one envelope/record containing Agreement plus completed Exhibit A. Client signs first; Captain Will countersigns second. Keep explicit liability/indemnity initials or acknowledgments. Use §18 signatures to execute Exhibit A as well, removing duplicate Exhibit A E signature lines without removing the authorizations. Obtain and retain electronic-record consent/evidence.
- Preserve the emergency spending cap (blank means $0), engine/generator identity/limits, and no movement/tow/delivery without separate signed authority. Exhibit B remains separate and outside this phase's workflow.

## Short V1 questionnaire

The proposed wizard and field inventory are [HYC_Client_Onboarding_Questionnaire_V1.md](drafts/HYC_Client_Onboarding_Questionnaire_V1.md). Before signature it collects only owner/entity and signer authority, contact/billing details, vessel identity/eligibility, marina/slip and access/hazards, insurer/expiry, requested plan/frequency/price/cadence/reporting, emergency contacts and spending cap, requested activities/restrictions, and separate payment collection readiness. The executed Exhibit A contains exact commercial terms and permissions. The Questionnaire has no redundant signature and grants no authority.

After signature, secure operational onboarding gathers actual access provisioning, baseline photos and settings, battery/bilge/climate/plumbing details, do-not-operate list, and unit-specific engine/generator procedures. No affected inspection or equipment operation occurs until prerequisites are complete. Do not enter codes or passwords in the wizard.

## Integration implications

- Generate a frozen agreement plus customer-specific Exhibit A only. Do not include SOP-001 or Free First Visit. Do not include Exhibit B in initial enrollment.
- Keep agreement signature state separate from payment state. Treat signing as complete only after provider status confirms both ordered signatures; retain final PDF and audit evidence before marking the agreement executed. Payment and production enrollment are outside the Phase 1 prototype.
- Treat Exhibit A price/cadence/discount as an immutable, server-validated snapshot. No browser-submitted amount or Questionnaire response may silently alter a Stripe price or charge. Preserve completed agreement version and signature evidence beyond operational-access lifetimes per counsel-approved retention rules.
- Keep sensitive access credentials and detailed vessel operation notes in a restricted, secure operational system; never place them in email, query strings, or routine logs.

## Outstanding legal review

1. §§13–14 liability cap, consequential-damage exclusion, indemnity, marine inspection/safety wording and interaction of federal maritime and Washington law.
2. Automatic recurring-payment mandate, payment processor disclosures, renewal/cancellation notice and means, card changes, amount/tax, billing date, failed-payment recovery, suspension, and the existing §9.3 late-charge clause.
3. §10.4 interaction with annual prepayment, begun service months, termination date and billing anniversaries; preserve the current text until counsel decides otherwise.
4. E-sign and electronic-record consent, disclosures/withdrawal/paper copies where required, signatory/owner authority, sequence, authentication/attribution, durable copy access, and initials for §§13–14.
5. Insurance evidence timing/eligibility exceptions, emergency spending and actions, report/photo/access privacy, retention after Boat Binder access ends, and separate Exhibit B delivery terms.

No source PDF was edited. This addendum and proposed drafts are business/technical review materials, not legal advice or customer-ready contracts.
