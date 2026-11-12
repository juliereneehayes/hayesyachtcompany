# HYC E-Signature Provider Feasibility Memo

**Research date:** November 12, 2026
**Scope:** Technical/commercial feasibility review plus Phase 1 local mock prototype. No account was changed, no provider API request or external signature was created, and no production changes were made.
**Repository reviewed:** local checkout of `juliereneehayes/hayesyachtcompany`.

## A. Executive recommendation

- **Best overall:** **SignWell API**, subject to written confirmation that a US production account can use embedded signing with no fixed subscription and that the advertised 25 free monthly API documents apply. It has the best fit for seamless signing, webhooks, multiple signers, completed PDF/audit retrieval, and usage cost. Model: $0 at 3 and 10/month (conditional on the 25-document card-on-file allowance), $4.25 at 30/month at the published $0.85 initial overage price.
- **Best low-cost managed alternative:** **Zoho Sign API-only** if SignWell cannot confirm zero-fixed-fee production embedding. The documented rate is $0.50 per API signature request, purchased in $50/500-credit increments; credits do not expire. Confirm US production activation, embedded signing and webhook eligibility on API-only before relying on it.
- **Best self-hosted option:** **Documenso Community Edition**, with an important limitation: self-hosted core signing, API, templates, webhooks, multiple recipients, audit logs and cryptographic PDF sealing are documented, but embedded signing is described as hosted Teams+ or Early Adopter eligibility. Treat self-hosted Community as a hosted-link/redirect experience unless Documenso confirms Community embedding. It also makes HYC responsible for a live application stack and security operations.
- **Best manual fallback:** **BoldSign Essential**, $0 for manual dashboard signing, up to 25 envelopes/month with a business email, audit trails, reminders and signer authentication. It is not the embedded/API architecture.
- **Do not choose DocuSeal Community Edition for the full production flow:** its free self-hosted edition does not include the production API and embedding features needed here. DocuSeal Pro on-prem is $240/user/year plus $0.20/completion.
- **PandaDoc is a credible alternative, but not the default:** its new Free API offer advertises 60 sends/year, five templates, API and embedded signing. The detailed current API feature matrix says Free has no audit trail and no webhooks; the API Developer tier has webhooks but only “limited” audit trail. Other PandaDoc help pages conflict about webhook eligibility and the 5/month versus 60/year allowance. Confirm with the vendor before treating Free as production-ready.

Keep the existing static site as the frontend and add a small AWS serverless backend. Sign first, then use Stripe Checkout. Activate only after the provider confirms completion, HYC has durably stored the completed PDF and evidence, and Stripe confirms the initial invoice is paid.

## Repository findings

The local site is static HTML/CSS/JavaScript with no traditional backend or package dependencies (`README.md`). Current service prices in `services/index.html` and detail pages are:

| Service | Published monthly prices |
|---|---|
| Dock Check | Every other week $99; weekly $159, any size |
| Dock Watch | Monthly $129/$149/$169; every other week $179/$209/$239; weekly $239/$279/$319 for 30–39/40–49/50–60 ft |
| Dock Watch Plus | Weekly checks plus monthly engine run: $399/$449/$499 for 30–39/40–49/50–60 ft |

The site advertises 10% annual prepayment savings and founding-client pricing protection for the first 15 boats for 24 months. Maintain a server-side mapping from plan/frequency/length/billing interval to Stripe Price IDs; never trust an amount submitted by browser code. Annual prices should be agreed monthly amount × 12 × 0.90. Preserve founding rates in Stripe and the executed Exhibit A manually.

The four referenced PDFs were reviewed on November 12, 2026. The agreement and questionnaire are drafts, not legal-approved final forms. Section 10.4's annual prepayment refund text and the questionnaire/SOP authorization details are now verified; see the [Document Review Addendum](HYC_Esignature_Document_Review_Addendum.md). Preserve Section 10.4 verbatim; legal counsel should resolve its interaction with billing anniversaries and termination.

## Phase 1 document and prototype update

The earlier document findings that were marked unverified are now based on review of the actual local PDFs; the source forms were not modified or committed. See the [updated Document Review Addendum](HYC_Esignature_Document_Review_Addendum.md), [proposed agreement and Exhibit A](drafts/HYC_Vessel_Watch_Agreement_Proposed_Rev1.md), and [short V1 Questionnaire](drafts/HYC_Client_Onboarding_Questionnaire_V1.md). The revised draft preserves Section 10.4 verbatim, makes Exhibit A the only source of standing permissions, and assigns Questionnaire answers an informational/restrictive role.

A dependency-free, loopback-only prototype is in `prototype/signwell-phase1/`. Mock mode is default and visibly labels simulated signatures, statuses, audit output, and PDF. The provider adapter is gated by `PROVIDER_MODE=signwell-test`, an environment-only key, `SIGNWELL_TEST_MODE=true`, and a separately reviewed synthetic template ID. It sets Test Mode on both the draft creation and separate send request. No key was available for this review and no SignWell request was made. API capabilities are documented but actual account entitlements, field schema, embedded session, email suppression, status response, PDF, audit page, and free-tier access remain unverified. See [Phase 1 validation](HYC_SignWell_Phase1_Validation.md).

## B. Provider comparison

| Provider | Production and workflow capabilities | Evidence and limitations | Cost and assessment |
|---|---|---|---|
| **SignWell** | REST API, embedded signing/requesting, test mode, templates, multiple signers and steps, document completion events. Rate limits: 30 create-document/template calls/minute; most endpoints 100/minute; test 20/minute. | Completed PDF endpoint can include audit page by default. Vendor describes tamper-evident records. Export by API is supported. Confirm free production entitlement, retention/export on account closure and webhook retry/authentication details. | Free developer tier 3/month. API pricing advertises first 25 monthly API docs free with card on file, then starts at $0.85/doc and scales down. Best probable zero-fixed-fee path; public pages do not unambiguously confirm account qualification. |
| **PandaDoc** | Free API access for eligible new accounts created after June 5, 2026; production and sandbox keys; document/template generation, embedded signing, status checks and completed PDF retrieval. | Free cap 60 sends/year, 5 templates, 2 recipients/document per dedicated API offer/help page; generic Free comparison also shows 5/month. Detailed API matrix says Free has no audit trail and no webhooks; Developer plan webhooks yes, audit limited. Separate help article says webhook availability Business/Enterprise. No account test performed. | Free under 60/year if eligible, but no dependable automatic completion/evidence workflow until confirmed. API Developer listed at $40/month after trial for 40 docs/month. Beyond allowance pricing/credits unclear publicly. |
| **Zoho Sign API-only** | No monthly/annual subscription commitment; API plan includes templates, embedded sending/signing, audit and completion certificate in pricing overview. OAuth 2.0; multi-recipient and ordered signatures. | Webhook feature page says Enterprise-only, while API plan overview presents API/webhooks. Embedded token is one-use, valid for two minutes; embedded recipients don't receive provider invitations/reminders automatically. Confirm exact API-only entitlements and expiry. | 5 credits per request; $0.10/credit; 500-credit minimum ($50) and credits do not expire = $0.50/request. Good managed fallback if SignWell terms fail. |
| **DocuSeal CE / Pro** | Free self-hosted core; production API, embedded signing and webhooks require Pro. Pro supports API template/submission creation, multi-party signing/order, webhook events and completed document/audit downloads. | Free Test Mode has API/embedding but is non-production; free self-hosted Test Mode excludes advanced API/embed. Repository is AGPL-3.0. | Pro Cloud $20/user/month plus $0.20/completion; Pro on-prem $240/user/year plus $0.20/completion. The free CE cannot support the complete required production flow. |
| **Documenso Community** | Self-hosted Community includes API and core signing under AGPL-3.0; templates, multiple recipients/sequential signing, webhooks, audit log and PDF certificate sealing. | Embedded signing documented as hosted Teams+ or Early Adopter eligibility; Community entitlement needs confirmation. Self-hosted requires PostgreSQL, SMTP, configured signing certificate, storage, HTTPS, updates, backup and egress security. Self-signed certificate proves integrity but may not be trusted by default in PDF readers. | $0 software license, but meaningful operating effort. Hosted Teams listed $40/month with embedding; Platform $250/month. Best OSS base if HYC accepts link-based signing or Community embedding is confirmed. |
| **DocuSign** | Mature API and audit capabilities; free developer environment is for demo/testing, production API needs paid developer plan. | Strong benchmark, not a cost fit for this scale. | Public Starter production API plan $50/month for 40 envelopes; Intermediate $300/month for 100. |
| **BoldSign** | Essential free plan is manual web/mobile sending, with audit trail/certificate, reminders, signer email authentication, templates and signing order. | One sender/two templates on Essential. 25 envelopes/month with business email, 5 with personal email. Not an in-site production API flow. | $0 manual fallback. Vendor's current pricing article says API from $30/month for 40 API envelopes, then $0.75 each. |

### PandaDoc ambiguity

The 5/month versus 60/year difference appears to be separate plan/account cohorts. The dedicated API pricing page and July 2026 Free plan guide say 60 sends/year for new API-eligible accounts, while the generic Free eSign plan comparison says 5/month and mentions 60/year on older annual accounts. I use 60/year for API cost modeling, conditional on new-account eligibility.

For audit/webhook conflict, the granular API feature matrix dated September 30, 2026 is more specific than the marketing announcement: it marks audit trail unavailable on Free, limited on API Developer, and webhooks unavailable on Free but available on API Developer. A PandaDoc help article still says webhooks are Business/Enterprise. Therefore the Free marketing claims about an audit-included PDF, embedding and API should not be treated as confirmation of a full auditable webhook workflow.

## C. Cost model

Provider fees for production at each monthly completion rate. Taxes, optional SMS/ID checks and account-specific discounts excluded.

| Provider | 3/month | 10/month | 30/month | Limit behavior |
|---|---:|---:|---:|---|
| **SignWell API** | $0 | $0* | $4.25* | 3/month free developer tier; API pricing advertises 25 free/month with card, then $0.85 starting marginal price. |
| **PandaDoc API** | $0 (36/year) | $40/month API Developer (120/year) | $40/month API Developer (30 under listed 40/month) | Free stops at 60 sends/year; paid listed $40/month after trial for 40/month. Overage and feature entitlement beyond 40 need quote. |
| **Zoho API-only** | $1.50 usage equivalent; $50 purchase | $5 usage equivalent | $15 usage equivalent | $50 minimum purchase is 500 credits/100 requests; credits never expire. |
| **DocuSeal Pro on-prem** | $20.60 | $22 | $26 | $240/year one user + $0.20/document. Excludes AWS operations. |
| **Documenso CE self-hosted** | $0 license + infra | same | same | No per-document fee; embedded signing entitlement unresolved. |
| **BoldSign manual Essential** | $0 | $0 | $0 | Under 25/month with business email; dashboard workflow, not API. |
| **DocuSign Starter API** | $50/month | $50/month | $50/month | 40-envelope tier; fixed commitment. |

\* SignWell's estimate assumes the 25-document card-on-file allowance is available to a new business production API account without subscription. Written confirmation is a go/no-go. Free developer is limited to 3 documents/month.

### Infrastructure and maintenance

For Lambda + API Gateway HTTP API + DynamoDB + S3 + email + low-volume monitoring, budget **$5–$20/month after introductory credits** for all three volumes. This is a planning estimate rather than a quote, assuming sub-GB retained PDFs, low execution/request volume, no VPC/NAT, RDS, paid support, WAF or high-volume SMS. Actual region, logging, backup retention and existing AWS account charges matter. Basic compute and storage at HYC volumes should be small; backups, observability and transactional email are the practical small fixed costs.

For self-hosting Documenso or DocuSeal, plan roughly **$25–$70/month** for an always-on app host, DB/backups, S3, email, monitoring and egress at small scale. Multi-AZ managed databases or high availability can materially exceed this. Estimated maintenance after launch: managed API 0.5–1.5 developer hours/month; self-hosted signing service 2–6+ hours/month plus upgrade and incident work. These are workload estimates, not vendor prices.

At 3/month, SignWell and PandaDoc can both have $0 vendor fee if current eligibility/features are confirmed. At 10/month, SignWell remains within the advertised 25-document allowance; PandaDoc's annual free cap is exceeded and its current API Developer tier is $40/month. At 30/month, modeled SignWell is $4.25 and Zoho is $15; PandaDoc is $40. Self-hosting does not appear cheaper once infrastructure and maintenance are included.

## D. Recommended architecture

```text
Existing static HYC site
  /enroll/{opaque-link} → multi-step onboarding UI
       │ HTTPS, short session cookie; no trusted prices/secrets in browser
       ▼
API Gateway HTTP API → Lambda → DynamoDB (enrollment + webhook idempotency/outbox)
                         ├─ SignWell API (template/document, embed, status, PDF)
                         ├─ Stripe Checkout (subscription mode, server-selected Price)
                         ├─ SES or existing transactional email (invite/resume/confirmation)
                         └─ S3 private bucket (final agreement, audit evidence, hash)

SignWell webhook ─┐
Stripe webhook ───┴→ verified/idempotent handlers → reconcile status → notify
```

Keep static HTML/CSS/JS and add an enrollment page/API, not a full app framework. Keep all vendor credentials, amount selection, session creation, token checks and status transitions server-side. DynamoDB is sufficient and avoids RDS. Use one HYC-generated enrollment ID as workflow key; Stripe/provider IDs are attributes. Prefer isolated HYC AWS account or at minimum separate IAM roles, bucket, table, secrets and budgets from Boat Binder.

Create Stripe Checkout Sessions server-side in subscription mode for the existing Stripe Customer and allowlisted Price ID. Do not create a subscription before Checkout. A new subscription's default billing anchor is the enrollment/payment start, which gives monthly/annual anniversary billing without aligning to calendar month. No first-of-month proration. For annual billing, create a matching annual Price at 90% of 12 monthly payments. The browser return URL is informational only; never activate from it.

**S3:** private bucket, Block Public Access, TLS-only bucket policy, default encryption, versioning, least-privilege read/write roles, lifecycle/backup, and hash each final agreement and evidence file. Store signed PDF and audit evidence separately with a manifest (provider doc ID, timestamps, content type, size, version ID, SHA-256). Captain Will retrieves via restricted admin access or short-lived presigned URL. Decide legal retention/deletion first. Object Lock is optional; it requires versioning and compliance mode cannot be shortened or deleted early, so defer until counsel approves retention and legal-hold policy.

**Avoid initially:** RDS/Aurora, ECS/Kubernetes, public document directories, and a separate workflow engine. Use DynamoDB conditional writes, an idempotent outbox/retry process, webhooks and a periodic reconciliation task.

## E. State machine and recovery

```text
Draft → Invited → In progress → Agreement pending → Agreement signed
                                                   → Payment pending → Active
Payment pending → Payment failed → Payment pending (retry)
Payment pending → checkout expired/abandoned → Payment pending (resume)
Draft/Invited/In progress → Canceled or expired
Active → Canceled (Stripe subscription canceled; retain signed records)
Agreement pending → declined/expired → In progress (reissue only by explicit decision)
```

Persist enrollment, agreement and payment as separate dimensions so retries do not erase completed work. Backend alone applies transitions. “Agreement signed” means both the owner and HYC authorized representative (Captain Will) have completed the agreement signature sequence. For activation require: provider API/status confirms all signatures; final PDF and audit evidence are in S3 with hashes; Stripe webhook/session/subscription confirms initial invoice paid. For delayed payment methods, await verified asynchronous success; for simpler immediate V1 activation, disable delayed methods. Failed or expired Checkout creates a new session only after confirming no successful session exists. Reuse the signed agreement if terms are unchanged. Price/term changes require a new immutable agreement version and explicit re-sign.

Verify Stripe webhook signatures over the raw body; persist event IDs for deduplication. Verify provider webhook mechanism, then retrieve current document status from provider before completion. Persist event durably before acknowledging; retry transient failures; periodically reconcile stuck pending/failed enrollments. A webhook replay or late/out-of-order event must not regress Active or create a duplicate subscription.

## F. Data model, questionnaire and agreement

Minimum enrollment data:

- Workflow: HYC enrollment UUID, status/state version, created/updated/expiry; magic token hash, expiry/revocation and verified-email time.
- Owner: signer name, legal entity/authority where applicable, email, phone, billing contact.
- Vessel: name, year/make/model, HIN/registration if needed, length band, marina/dock/slip, access restrictions, insurance carrier/expiration and proof only if necessary.
- Emergency/service: contact, access/safety notes, selected allowed checks and operations, engine run authorization for Plus, emergency scope and spending cap, communication preference.
- Commercial terms: plan/frequency/length band, monthly/annual cadence, exact amount/currency, 10% discount, price/template/agreement version, founding flag and protection-through date.
- Evidence/integrations: provider document ID/status/signers/completion time; PDF/evidence S3 keys, version IDs and hashes; Stripe Customer/Price/Checkout Session/Subscription/initial Invoice IDs and verified status; event IDs/timestamps; notification status and manual Boat Binder follow-up.

Store only necessary questionnaire fields in DynamoDB; upload proof and final documents to private S3. Never put HIN, full questionnaire or magic token in Stripe metadata/logs. Generate a high-entropy magic-link token, store only its hash, rate-limit and expire/revoke it; exchange once for short-lived Secure/HttpOnly/SameSite cookie and remove token from URL. Email links can be forwarded, so use email possession as baseline and add a one-time code or verified contact factor for sensitive changes/access details.

V1 questionnaire before signature/service: owner/legal signer and contact; vessel identity/size; marina/slip/access; insurance carrier and expiry; emergency contact; reporting contact preference; basic safety/access restrictions; selected inspection scope and equipment authorizations; emergency spending cap. Detailed machinery settings and baseline photos can be collected at Captain Will's setup, before relevant work. Do not operate equipment or spend money without explicit authorization.

Generate a frozen PDF from the current service agreement plus dynamic Exhibit A with owner/vessel, plan and frequency, scope, approved inspection/equipment operations, emergency authority/spend limit, exact price, monthly or annual renewal, initial due date, cancellation/refund, annual prepayment, and founding price protection/end date. Counsel should review automatic recurring charge authorization, anniversary renewal, failure/cure/suspension, cancellation, annual refund interaction with Section 10.4, e-record consent/withdrawal/paper-copy option, maritime liability/exclusions, emergency authority and electronic signature attribution. Preserve Section 10.4 verbatim; counsel should confirm its interaction with annual billing, cancellation timing and termination. Keep Free First Visit Authorization out of V1 subscription flow. Keep SOP-001 internal; do not attach or incorporate it into customer terms. See the Document Review Addendum for specific proposed cross-reference and questionnaire changes.

## G. Security and legal

- HTTPS end-to-end; secrets in Secrets Manager or equivalent encrypted store; distinct staging/production credentials/resources; least privilege and rotation.
- Server-side ownership checks on every enrollment read/write, strict state/field validation, allowlisted server Price mapping, no public document URLs, no provider IDs/secrets in browser.
- Magic-link tokens are random, hashed, short-lived, revocable, rate-limited, exchanged for secure session cookie, and redacted from logs/referrers.
- Webhooks are signature-verified when supported, de-duplicated and reconciled via provider/Stripe API. Secure providers without webhook signatures using high-entropy endpoint secret plus provider status fetch; IP allowlisting is supplemental.
- Retain signer identity, intent/consent, timestamps/events, final bytes and hashes. A hash or audit log alone does not prove enforceability.
- Set retention/deletion schedule with counsel. Delete abandoned enrollment PII on a defined short period absent dispute; retain signed agreement, evidence and billing records for applicable requirements; preserve legal holds.

ESIGN (15 U.S.C. §7001) generally prevents denying legal effect solely because a record/signature is electronic. Consumer disclosures legally required in writing require affirmative consent and specified disclosures. Washington UETA (RCW 1.80) recognizes electronic records/signatures, applies when both parties agree to electronic transactions, attributes a signature based on the act/security procedures and circumstances, and requires retained records to accurately reflect final form and remain accessible. Counsel must review consent and maritime/service terms. Provider marketing and a technical audit trail do not establish enforceability.

## H. Prototype and acceptance plan

Use the existing click-through prototype as visual shell in a separate staging hostname/environment with synthetic data, provider test mode, Stripe test mode, isolated AWS resources and email sink. Do not use real customer data, live invitations/keys, real cards or production systems.

1. **Terms/test access:** get SignWell pricing/embed confirmation; provide missing PDFs; finalize server plan/Price mapping and legal-reviewed consent/template.
2. **Backend:** staging API, DynamoDB enrollment, token hash/expiry/revocation, test invite, resumable questionnaire. Wrong, expired, revoked and cross-enrollment links must be denied.
3. **Agreement:** generate a frozen test PDF/Exhibit A with validated data and version/hash.
4. **Signing:** test embedded signing and multiple signers in provider sandbox; process event; download PDF/evidence into private S3 and record hash.
5. **Stripe:** test Checkout subscription using seeded Customer/Price and Stripe test card; test success, failure, abandoned/expired Checkout, async behavior if enabled, duplicate webhook and retry.
6. **Completion:** Active only after signed+stored evidence+paid initial invoice; owner and Captain confirmations go only to email sink, at most once; admin retrieves with short-lived URL.

Acceptance cases: incomplete/declined/expired signing cannot activate; invalid/duplicate/out-of-order webhooks cannot regress/activate prematurely; lost events reconcile; completion PDF hash matches stored object; no public document URL; authorized admin access only; tampered Price/fields denied; owner cannot enumerate other enrollments; success page alone cannot activate; repeated Checkout/resume cannot duplicate subscription; failed payment resumes against same signed agreement; term changes reissue rather than overwrite; Stripe cancellation updates HYC but preserves records; annual refund remains manual and Section 10.4 governs.

## I. Open decisions / vendor questions

1. **SignWell:** Can a new US business account have production API + embedded signing with no fixed fee, with card on file only? Does the 25 free include API-created embedded documents for this tier? How are canceled/void/failed envelopes counted? Confirm webhook signing/retry, API limits, completed PDF/audit export and retention after service ends.
2. **Zoho fallback:** Does API-only production include embedded signing, multi-signer order, completion certificate and webhook setup in US without a seat/setup/domain/support minimum beyond 500 credits?
3. **PandaDoc:** Which cap applies to a new account (5/month or 60/year)? Confirm production embedding and protected PDF on Free, webhook availability, meaning of “limited” audit on Developer, audit evidence download, and charges beyond 40/month.
4. **Documenso:** Confirm self-hosted Community embed entitlement and webhooks; if unavailable, decide if redirect-based signing is acceptable.
5. Counsel confirms Section 10.4 interaction with annual billing/termination, e-sign consent, recurring-charge language, and maritime risk terms; decide retention/deletion before Object Lock. The reviewed draft PDFs and document-specific recommendations are in the Document Review Addendum.
6. Confirm static hosting, HYC AWS account/region, email provider/sender domain, Stripe test account, and admin retrieval preference.

## J. Official sources

Accessed **November 12, 2026**; product pages and prices can change.

**SignWell:** [API pricing/free limits](https://www.signwell.com/api-pricing/); [API/rate limits](https://developers.signwell.com/reference/getting-started-with-your-api-1); [webhook events](https://developers.signwell.com/reference/events); [completed PDF/audit page](https://developers.signwell.com/reference/getcompletedpdf); [API usage help](https://help.signwell.com/article/251-api-and-zapier-requests); [feature/pricing comparison](https://www.signwell.com/pricing/).

**PandaDoc:** [API pricing](https://www.pandadoc.com/developer-api/pricing/); [Free plan/API guide](https://support.pandadoc.com/en/articles/9715030-pandadoc-free-plan-guide); [API feature matrix](https://support.pandadoc.com/en/articles/17236207-compare-api-feature-access-by-plan); [free API announcement](https://www.pandadoc.com/blog/pandadoc-free-plan-api/); [webhook availability](https://support.pandadoc.com/en/articles/9714966-webhooks); [download protected PDF](https://developers.pandadoc.com/docs/how-to-download-completed-document); [audit endpoint](https://developers.pandadoc.com/reference/list-document-audit-trail); [API usage credits](https://support.pandadoc.com/en/articles/9714958-pandadoc-api).

**Zoho Sign:** [pricing/API-only](https://www.zoho.com/sign/pricing.html?autoCC=US); [credit cost and expiry](https://www.zoho.com/sign/zoho-sign-credits.html); [embedded signing API](https://www.zoho.com/sign/api/embedded-signing.html); [webhooks](https://www.zoho.com/sign/features-and-benefits/webhooks.html).

**DocuSeal / Documenso:** [DocuSeal developer pricing](https://www.docuseal.com/developers); [Pro details](https://www.docuseal.com/resources/get-started-with-pro); [on-prem pricing](https://www.docuseal.com/on-premises); [API/webhooks](https://www.docuseal.com/docs/api); [download signed documents](https://www.docuseal.com/guides/download-signed-documents); [DocuSeal AGPL-3.0](https://github.com/docusealco/docuseal/blob/master/LICENSE). [Documenso pricing](https://documenso.com/pricing); [Community Edition](https://docs.documenso.com/docs/policies/community-edition); [license](https://github.com/documenso/documenso/blob/main/apps/docs/content/docs/policies/licenses.mdx); [API/rate limits](https://docs.documenso.com/docs/developers/api/rate-limits); [embedding](https://docs.documenso.com/docs/developers/embedding); [webhooks](https://docs.documenso.com/docs/developers/webhooks/setup); [multi-party workflow](https://docs.documenso.com/docs/concepts/signing-workflow); [certificates](https://docs.documenso.com/docs/concepts/signing-certificates); [self-host guide](https://docs.documenso.com/docs/self-hosting); [Docker requirements](https://docs.documenso.com/docs/self-hosting/deployment/docker).

**Others:** [DocuSign developer pricing](https://ecom.docusign.com/en-US/plans-and-pricing/developer); [BoldSign pricing](https://boldsign.com/electronic-signature-pricing/); [BoldSign free plan](https://support.boldsign.com/kb/article/19248/differences-between-the-free-essentials-and-the-growth-plans).

**AWS/Stripe/law:** [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/); [Lambda pricing](https://aws.amazon.com/lambda/pricing/); [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/); [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html); [Stripe Checkout for existing Customers](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted); [Stripe event types](https://docs.stripe.com/api/events); [Stripe proration behavior](https://docs.stripe.com/api/subscriptions/update); [ESIGN, 15 U.S.C. §7001](https://uscode.house.gov/us/usc/119-124/t15/s7001/); [Washington UETA, RCW 1.80](https://app.leg.wa.gov/RCW/default.aspx?cite=1.80&full=true).
