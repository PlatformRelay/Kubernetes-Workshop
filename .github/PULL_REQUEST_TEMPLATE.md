## What & why

<!-- One or two sentences: what changed, and why. Link an issue/Discussion if there is one. -->

## Type of change

- [ ] Content (slide/section text, diagram, lab)
- [ ] New section or lab
- [ ] Docs (README, facilitator guide, syllabus, ADR)
- [ ] Tooling / CI / build script
- [ ] Fix (broken command, wrong output, overflow, link)

## Checklist

- [ ] Read [`AGENT.md`](../AGENT.md) and followed the relevant contract (deck
      architecture / lab-authoring contract, as applicable).
- [ ] No employer, customer, or corporate brand names.
- [ ] No tooling/AI attribution in content or commit messages (no `Co-Authored-By`).
- [ ] Any AI-generated image carries a visible "AI generated" footer.
- [ ] Commit messages follow `<gitmoji> <type>(<scope>): <subject>`.
- [ ] Ran the checks relevant to this change:
      `pnpm lint` · `pnpm decks:check` · `pnpm link-check` · `pnpm test:pages` ·
      `pnpm build`
- [ ] If a lab manifest changed: dry-ran it (`kubectl apply --dry-run=server`) and, if
      possible, against a live `kind` cluster.

## Notes for reviewers

<!-- Anything a reviewer should know: known limitations, follow-up work, what wasn't
tested and why. -->
