# Free-first-visit autoresponse setup

The `/free-visit` form posts to the existing Formspree form ID `xoeqowzz`. It keeps the field name
`email`, which Formspree uses for both the internal notification Reply-To header and the
Autoresponse plugin recipient. The hidden `subject` and `inquiry_type=free_first_visit` fields make
these leads easy to distinguish from general care-plan inquiries.

No email secret or new mail service is included in the site. Customer email acknowledgment is an
account-side Formspree workflow and cannot be safely activated or verified from this repository.

## Required dashboard configuration

1. Open form `xoeqowzz` in Formspree and confirm the existing HYC submission email remains enabled.
2. Enable the **Autoresponse** workflow/plugin if it is available on the current account plan.
3. Use this subject: `We received your Hayes Yacht Company visit request`.
4. Use this body:

   > Thanks for requesting a complimentary first visit from Hayes Yacht Company. We received your
   > inquiry. You’ll hear personally from Captain Will to confirm eligibility, availability, and next
   > steps. Your visit is not scheduled or confirmed yet. Please do not email access codes,
   > passwords, alarm credentials, or other sensitive access details.

5. Restrict the workflow to submissions where `inquiry_type` equals `free_first_visit`, if the
   dashboard supports workflow conditions. This prevents general inquiries from receiving the
   free-visit message.
6. Submit a test using an HYC-controlled external email address. Verify exactly one customer
   acknowledgment and one internal HYC notification are delivered, and that replying to the
   internal notification addresses the submitter.

If the existing Formspree plan does not include Autoresponse, leave internal notifications and the
on-page success acknowledgment in place. The smallest viable alternative is Captain Will's personal reply;
do not add exposed credentials, client-side email sending, or a paid service solely for this email.

Formal privacy/terms publication remains tracked under GitHub issue #10.
