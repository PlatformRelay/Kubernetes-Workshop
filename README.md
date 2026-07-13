# Kubernetes Practitioner Workshop

An open source, vendor-neutral, 3-day, beginner-to-intermediate Kubernetes workshop:
a [Slidev](https://sli.dev) slide deck plus standalone hands-on labs in Markdown,
roughly **50% presentation and 50% practice**. It takes a learner from "what is a
container" through "what is a cluster" to confidently authoring, running, and operating
core Kubernetes workloads.

**Preview it now:** the decks are live on GitHub Pages and PDFs ship with each release.

- **Live deck (full superset):** <https://platformrelay.github.io/Kubernetes-Workshop/>
- **Live deck (canonical 3-day cut):** <https://platformrelay.github.io/Kubernetes-Workshop/3day/>
- **Template gallery:** <https://platformrelay.github.io/Kubernetes-Workshop/templates/>
- **PDF exports:** [latest release](https://github.com/PlatformRelay/Kubernetes-Workshop/releases)
  — [full deck PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.1.0/kubernetes-workshop-full-v0.1.0.pdf)
  · [3-day cut PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.1.0/kubernetes-workshop-3day-v0.1.0.pdf)

![A content slide from the workshop deck](docs/images/deck-preview.png)

> [!WARNING]
> **Controlled beta.** This workshop has **not yet completed a full 3-day
> clean-environment rehearsal**. Specifically:
>
> - **Timings are unrehearsed planning estimates, not measured facts.** The per-section
>   slide/lab minutes and the ~390 min/day day totals are targets to pace against, not
>   observations from a delivered run.
> - **The add-on-heavy labs have not all been smoke-tested end-to-end on a clean `kind`
>   cluster** (S08, S09, S16, S18, S21, S22, S23). Their manifests are dry-run validated
>   and the commands are correct, but exact install timings and a few verbatim
>   `describe`/error strings may differ.
> - **S24 (Operator dev / kubebuilder) is a deferred stub** — it needs a Go + kubebuilder
>   toolchain and is scheduled for a later milestone. Do not schedule it as a full
>   hands-on lab until it is authored.
>
> These limitations are stated plainly rather than hidden. Confirming the cut and the
> add-on installs against a live environment is explicit, still-open pre-delivery work.

## Audience & prerequisites

**Level: beginner-to-intermediate** — not pure beginner. The arc runs from container
foundations up through operators, GitOps, and pod-escape hardening. Assumed prerequisites,
stated up front and reinforced in the labs:

- A shell you are comfortable in, and basic **Git**.
- Basic **YAML**, basic **HTTP**, and basic **container** vocabulary.
- One of two lab environments: an **assigned namespace** on a shared cluster, **or** a
  local **kind** cluster. See [`labs/README.md`](./labs/README.md) for the exact tools.

The two container sections (S01/S02) run entirely locally with no cluster and are offered
as an **on-ramp** for anyone new to containers.

**By the end, a learner can:** build and secure a container image; explain the control
plane and reconciliation; author and operate the core workload resources (Pod →
Deployment → Service → Ingress → Gateway API); inject config and storage; set resource
limits and health probes; harden Pods and isolate them with NetworkPolicy and RBAC;
deliver apps with Helm and GitOps; and read the operator pattern in the wild — mapped to
CKA/CKAD domains as a design check (certification prep is not the organizing principle).

## Curriculum overview

The workshop is authored as a **content superset of 28 sections** (`S00`–`S27`) and
**boiled down per delivery** into a **canonical 3-day cut** by toggling sections on or off.
The spine is a **red line of core resources** — one app grown step by step:

> **Pod → Deployment → Service → Ingress → Gateway API** (`S05`–`S09`)

Every later topic (config, storage, health, security, delivery, observability) hangs off
that same running app. Roughly by day:

| Day | Theme | Sections |
| --- | --- | --- |
| **Day 1** | Foundations, containers, and the core red line | `S00`–`S08` |
| **Day 2** | Modern routing and running workloads well | `S09`–`S16` |
| **Day 3** | Security, delivery, operators, best practices | `S17`–`S27` |

The full section map — tiers (`core` / `recommended` / `optional`), per-section timings,
the exact 3-day cut, and CKA/CKAD alignment — lives in the syllabus. It is the single
source of truth for the schedule; this overview only summarizes it.

**→ [Full syllabus & section map](docs/syllabus.md)**

> [!NOTE]
> **Superset vs. 3-day cut.** The **superset** deck contains more material than fits in
> three days, on purpose — so a delivery can be composed from authored sections rather
> than cut live. The **3-day cut** is the default a facilitator delivers. Preview whichever
> matches your need: the [full deck](https://platformrelay.github.io/Kubernetes-Workshop/)
> or the [3-day cut](https://platformrelay.github.io/Kubernetes-Workshop/3day/).

## Status

**26 of 28 sections are fully authored** — complete concept slides paired with a
standalone, copy-pasteable lab (`S00`–`S23`, `S25`, `S26`). Two sections differ, both by
design and both flagged consistently in the syllabus and facilitator guide:

- **`S27` (Wrap-up & next steps)** is **slides-only** — it is an open Q&A / next-steps
  block with no hands-on lab.
- **`S24` (Operator dev / kubebuilder)** is a **deferred stub** — outlined but not yet
  fully authored; it needs a Go + kubebuilder toolchain and lands in a later milestone.

The deck's design system — a local Slidev theme with layouts, components, and
code-annotation patterns — lives in `theme/` and is showcased slide by slide in the
[template gallery](https://platformrelay.github.io/Kubernetes-Workshop/templates/).

See the [controlled-beta note](#kubernetes-practitioner-workshop) above for what has and
has not been rehearsed.

## Choose your path

Four ways in, depending on why you are here:

- **Preview** — read the decks without setting anything up: the
  [full deck](https://platformrelay.github.io/Kubernetes-Workshop/) · the
  [3-day cut](https://platformrelay.github.io/Kubernetes-Workshop/3day/) · the
  [PDF releases](https://github.com/PlatformRelay/Kubernetes-Workshop/releases).
- **Participate** — do the hands-on labs: start at the
  [participant guide](./labs/README.md), then run
  [`labs/day-1/00-setup.md`](./labs/day-1/00-setup.md) end to end. On a local
  cluster, [`docs/setup.md`](./docs/setup.md) gets you from a fresh laptop to a
  lab-ready kind cluster with one command (`./workshop up`).
- **Facilitate** — run the workshop for a room: the
  [facilitator guide](./docs/facilitator-guide.md) covers environment setup, pacing, and
  the per-lab add-on checklist.
- **Contribute** — author or extend content: the guardrails and authoring rules are in
  [`AGENT.md`](./AGENT.md).

> [!TIP]
> Doing the labs? **Start with [`labs/day-1/00-setup.md`](./labs/day-1/00-setup.md).** It
> verifies your tooling, context, and namespace before any real content — and teaches the
> panic reset you reuse everywhere.

## Develop

```bash
pnpm install
pnpm dev                # superset deck (slides.md) at http://localhost:3030
pnpm dev:3day           # canonical 3-day cut (slides-3day.md)
pnpm dev:templates      # template gallery & animation spike
pnpm build              # static build (build:3day / build:templates likewise)
pnpm export             # PDF export (needs playwright-chromium)
pnpm render             # export per-slide PNGs to dist-render/ (needs playwright-chromium)
pnpm lint               # markdownlint the labs (lint:fix to auto-correct)
pnpm link-check         # verify internal doc links & anchors (no <pages-url> placeholders)
```

## Layout

| Path | Purpose |
| --- | --- |
| `slides.md` | **Superset root deck** — imports every section `S00`–`S27` |
| `slides-3day.md` | **Canonical 3-day cut** — same sections, some `hide: true` |
| `slides-templates.md` | Template gallery & animation-technology spike |
| `pages/SNN-topic/` | One self-contained, toggleable section per folder (`index.md`) |
| `labs/day-*/` | Standalone Markdown labs, one per authored section |
| `theme/` | **Local Slidev theme** — master styles, layouts, and UI components |
| `components/` | Deck-level Vue components (animated teaching diagrams) |
| `global-bottom.vue` | Global chrome: footer, page number, progress bar |
| `public/icons/` | Curated official Kubernetes/CNCF artwork (see its README) |
| `docs/decisions/` | Decision records |

Toggling: every section is imported by the root decks with a single `src:` block —
set `hide: true` on that block to drop the whole section from that cut. New cut =
one new `slides-<variant>.md`, never copied sections.

## Continuous integration & publishing

Three GitHub Actions workflows (`.github/workflows/`):

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | PR + push to `main` | Lint the labs, build all three root decks, and link-check the front-door docs — a broken deck, malformed lab, or dead internal link fails the check. |
| `pages.yml` | push to `main` (+ manual) | Build the decks as a static site and deploy to GitHub Pages under the `/Kubernetes-Workshop/` base path. |
| `release.yml` | tag `v*` | Export the superset and 3-day decks to PDF and attach them (plus the built site) to a GitHub Release. |

**Cut a release** (PDFs only ever come from a version tag):

```bash
git tag v1.0.0
git push origin v1.0.0   # → Release "v1.0.0" with both PDFs attached
```

**Live site** — every push to `main` publishes:

- <https://platformrelay.github.io/Kubernetes-Workshop/> — full superset deck
- <https://platformrelay.github.io/Kubernetes-Workshop/3day/> — canonical 3-day cut
- <https://platformrelay.github.io/Kubernetes-Workshop/templates/> — template gallery

The Pages base path carries the exact repo-name case (`Kubernetes-Workshop`); a lowercased
base path is a defect (see [`.github/workflows/pages.yml`](./.github/workflows/pages.yml)).

> **One-time repository setup** (two manual steps no workflow can perform):
>
> 1. **Settings → Pages → Build and deployment → Source = "GitHub Actions".**
> 2. The workflows integrate on **`main`** (CI, Pages, and the release tag are
>    all cut from it). Make `main` the repository default branch (Settings →
>    Branches) so PR checks target it and the `github-pages` environment is
>    allowed to deploy — its branch protection defaults to the default branch
>    only. (Alternatively, add `main` to that environment's allowed branches.)

Markdown linting (`pnpm lint`, `markdownlint-cli2`) covers the standalone
`labs/` only. The Slidev deck sources are excluded: markdownlint parses just the
first frontmatter block, so it mis-reads every per-slide `---` separator — there
is no rule toggle that fixes it. See `.markdownlint-cli2.jsonc`.

The link check (`pnpm link-check`) is a small zero-dependency Node script
([`scripts/link-check.mjs`](./scripts/link-check.mjs)) that validates the four front-door
docs (this README, the syllabus, the facilitator guide, and the labs README) offline: it
fails on any missing internal target file, broken relative anchor, or unresolved live-site
URL placeholder. External URLs are reported informationally and never gate CI.

Contributor guardrails and authoring rules: [`AGENT.md`](./AGENT.md).
