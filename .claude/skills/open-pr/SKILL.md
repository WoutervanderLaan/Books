---
name: open-pr
description: Prepare and open a pull request for this repo — run the CI checks, write the Summary and Changes-per-file block, and flag security-sensitive changes. Use when asked to open, create or prepare a PR.
---

1. Run the checks from `AGENTS.md` and fix failures: `npm run format`, `npm run lint`, `npm run typecheck`,
   `npm test`, `npm run build`.
2. Run `node --no-warnings scripts/ci/security-scope.ts origin/main HEAD`. If it reports findings, review the
   change against the threat model in `.github/prompts/security-review.md` before opening the PR, and
   mention the security-relevant parts in the Summary.
3. Write the PR body from `.github/pull_request_template.md`, filling the block between the `ai-summary`
   markers in the format of `.github/prompts/pr-summary.md` (every changed file gets a row in
   **Changes per file**). Tick the checks you actually ran.
4. Push the branch and open the PR. The `PR Summary` and `Security Review` workflows refresh the summary
   and run the extra review on GitHub.
