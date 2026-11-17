# Agent guidance

This file applies to the whole repository. Follow these expectations when changing code, tests, or documentation.

## Development

- Read the relevant implementation, tests, and requirements before editing. Prefer the smallest coherent change and established project patterns.
- Avoid speculative features, needless abstractions, and duplicate implementations. Identify scope expansion before changing unrelated areas.
- Check for duplicate or dead code, redundant tests, and stale documentation. Favor clear code and meaningful dependencies.
- Keep changes focused and reviewable. Before requesting merge, review the cumulative diff against the base branch.

## Commits and pull requests

- Commit at logical, cohesive checkpoints. There is no required minimum or maximum; avoid unnecessary churn and repeated fix/revert cycles.
- Review staged changes before each commit and use a clear, descriptive message. Do not rewrite published history without explicit authorization.
- Explain what changed and why, actual verification results, and remaining limitations or assumptions in the pull request.
- Never merge, deploy, force-push, or modify production services without explicit authorization.

## Verification

- Run relevant checks and report their actual results. Distinguish mocked tests from real provider validation.
- Do not describe an external integration as tested unless requests to that provider actually occurred. Report unresolved risks and assumptions.

## Hayes Yacht Company safeguards

- Preserve the static public website and keep local enrollment prototypes isolated from it.
- Keep signature, payment, HYC acceptance, and service-readiness states distinct; do not infer one from another.
- Keep vessel-value eligibility reviews internal.
- Emergency spending defaults to $0. Any increase requires separate written customer authorization.
- Keep API credentials and `.env.local` files out of Git.
- During synthetic Test Mode work, never use real customer data, create live charges, or perform production signing.
