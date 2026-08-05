# Contributing

Thanks for considering a contribution to the **Kubernetes Practitioner Workshop**. This
is a free, vendor-neutral, community-facing project — fixes, feedback, and new content
are all welcome.

## Before you start

- **Read [`AGENT.md`](./AGENT.md) first.** It is the authoring contract: deck
  architecture, section structure, guardrails (vendor-neutral, no tooling/AI
  attribution, commit conventions), and the lab-authoring rules. Every PR is expected to
  follow it.
- **Know the map.** [`README.md`](./README.md) is the project front door,
  [`docs/syllabus.md`](./docs/syllabus.md) is the public schedule, and
  [`docs/facilitator-guide.md`](./docs/facilitator-guide.md) covers running the room.

## Ways to contribute

- **Report a bug or content issue** — [open an issue](https://github.com/PlatformRelay/Kubernetes-Workshop/issues/new/choose).
  Use the beta-feedback template if you ran a section/lab and something didn't match
  what's on the page.
- **Ask a question or propose an idea** — use
  [GitHub Discussions](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions)
  rather than an issue if there's nothing concrete to fix yet.
- **Fix something small** — typos, broken links, a wrong command, a slide overflow —
  open a PR directly.
- **Propose a new section or lab** — open a Discussion or issue first describing the
  scope; sections must be self-contained and toggleable per `AGENT.md`, so it's worth
  agreeing on shape before investing in a full draft.
- **Report a security issue** — see [`SECURITY.md`](./SECURITY.md), not a public issue.

## Local setup

```bash
git clone https://github.com/PlatformRelay/Kubernetes-Workshop.git
cd Kubernetes-Workshop
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm dev:day1          # http://localhost:3030/
```

More detail: [`docs/run-slides.md`](./docs/run-slides.md).

## Before opening a PR

Run what's relevant to your change — CI runs all of it on every PR:

```bash
pnpm lint              # labs/docs markdown lint
pnpm decks:check        # deck-manifest / front-door consistency
pnpm link-check         # doc links resolve
pnpm test:pages         # Pages routing contract
pnpm build              # deck builds cleanly
```

If you touched a lab that needs a cluster, dry-run it (`kubectl apply --dry-run=server`)
and note in the PR description whether you ran it against a live `kind` cluster.

**Guardrails checklist** (from `AGENT.md`, non-negotiable):

- No employer, customer, or corporate brand names anywhere.
- No tooling/AI attribution in content or commit messages (no `Co-Authored-By`
  trailers).
- Any AI-generated image carries a visible "AI generated" footer.
- Commit messages follow `<gitmoji> <type>(<scope>): <subject>` (see `AGENT.md` for the
  full convention and examples).

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating,
you're expected to uphold it.

## License

Contributions are accepted under the project's [0BSD License](./LICENSE) — the same
terms as the rest of the repository.
