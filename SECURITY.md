# Security Policy

## Scope

This repository ships a **Slidev slide deck, standalone Markdown labs, and the build
tooling** that renders and publishes them (Node/pnpm scripts, GitHub Actions workflows,
the `workshop-web` demo container). "Security" here means the security of *that
project*, not a guarantee about the Kubernetes clusters you run the labs against.

**Not a vulnerability report:** several labs teach insecure configurations
*on purpose* — for example S02 (container/supply-chain security), S17 (Pod Security
Standards), and S25 (pod escape) deliberately start from a broken or over-privileged
state so learners can fix it. That's the lab working as designed; please don't file a
security report for intentionally-vulnerable teaching material. If you think a lab
mislabels which state is "safe" vs. "vulnerable," that's a content bug — open a normal
issue instead.

## Reporting a vulnerability

If you find an actual vulnerability in the build tooling, CI workflows, the
`workshop-web` container image, or the published site (e.g. a supply-chain issue, a
path-traversal or injection bug in a script, an exposed secret) — **do not open a public
issue**. Instead use GitHub's private reporting:

**[Report a vulnerability](https://github.com/PlatformRelay/Kubernetes-Workshop/security/advisories/new)**
(Security tab → "Report a vulnerability").

Include what you found, the affected file(s)/workflow(s), and how to reproduce it.

## Response

This is a volunteer-maintained open-source project. There's no SLA, but reports are
triaged as they come in and fixes for confirmed issues are prioritized over other work.
You'll get an acknowledgement in the advisory thread.

## Supported versions

Only the latest `main` / most recent release tag receives fixes — there is no
back-porting to older tags. See [`docs/release.md`](./docs/release.md) for the release
model.
