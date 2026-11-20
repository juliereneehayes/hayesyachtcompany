# HYC SignWell Phase 1 Prototype

This isolated prototype keeps the original owner-first / HYC-second mock workflow for a fictional sample document. It has no Stripe integration and does not modify the public site. Mock mode is the default and works without provider credentials.

## Run the mock

Requirements: Node.js 20 or later. From this directory:

```sh
npm start
```

Open <http://127.0.0.1:4179>. The server binds to loopback only. Use `npm test` to run its tests. Mock signatures, status, synthetic audit events, and sample PDF are explicitly marked as simulations.

## Provider path status

The Phase 1 SignWell adapter is an unverified draft and is disabled. Review found unsupported recipient `send_email` / `send_sms` and `signing_order` assumptions, plus positional recipient-status matching. No SignWell request was made through this adapter. The corrected Test Mode integration is in [Phase 3](../signwell-phase2/README_PHASE3.md), and requires a reviewed synthetic account template and local test credentials.

The existing fixtures are technical references only; they are not approved HYC agreement terms or verified SignWell field placements. Embedded signing disables SignWell's normal email authentication, so production use will require authenticated, expiring customer invitations and signer identity verification.

## Privacy

Use fictional data only. Restarting the server clears its in-memory state. The Phase 1 mock creates no SignWell documents, emails, payments, or operational authorizations.
