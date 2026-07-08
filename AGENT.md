# AGENT.md

Guidance for any agent or contributor working in this repository.

This is an **open source, vendor-neutral, beginner-to-intermediate Kubernetes workshop**.
It ships as a Slidev slide deck plus a separate set of hands-on labs in Markdown. The
workshop is **50% presentation, 50% practice**.

Content is authored as a **superset** and boiled down per delivery: every section is a
self-contained, **toggleable** unit, and one or more **root decks** compose them (a full
`slides.md` and a boiled-down `slides-3day.md`). See
[Deck architecture](#deck-architecture--compartmentalized-sections).

## Operator board — multi-agent coordination

This repo is currently built by **several agents in parallel git worktrees** that converge
to `main` through stacked feature branches. Before starting a lane, **claim it here** and
scan the board for anyone already holding the files you intend to touch. The board is the
one place that tells you what is in flight and what is safe to author in parallel.

**Protocol**

- **Claim before authoring.** Add a row with your lane, branch, the paths you own, and
  status `🔨 in progress`. Keep the paths **coarse and append-only** so the board itself
  rarely conflicts at merge; resolve any board conflict by taking the **union** of rows.
- **Own paths, not the tree.** Two lanes must not edit the same file. Labs
  (`labs/day-*`) are decoupled from deck theme (`layouts/`, `components/`, `style.css`,
  root decks) and from section content (`pages/SNN-*`); parallelize along those seams.
- **Base on the furthest-along foundation.** Content lanes stack on
  `feat/us-g1-g2-section-skeleton` (the section + lab-stub library) until it merges, not on
  bare `main` (which has none of it yet).
- **Board of record.** The authoritative copy is whichever board reaches `main` first;
  until then, keep your branch's copy current and merge by union.
- **Release on done.** Flip your row to `✅ done` with the date + branch when the lane's
  Definition of Done is met and it is committed.

**Live lanes** *(as of 2026-07-04)*

| Lane | Branch | Owns (paths) | Status |
| --- | --- | --- | --- |
| Deck theme master | `feat/deck-theme-master` | `layouts/`, `components/`, `style.css`, root decks | 🔨 in progress |
| US-0 templates + animation spike | `feat/us-0-templates-animation-spike` | `layouts/`, `components/`, `slides-templates.md`, ADR 0001 | ✅ done — awaiting merge |
| Section skeleton (G1/G2) | `feat/us-g1-g2-section-skeleton` | `pages/SNN-*` stubs, `slides.md`, `slides-3day.md`, `labs/**` stubs | ✅ done — awaiting merge |
| Day-1 cluster labs | `feat/day1-labs` | `labs/day-1/{00,05,06,07,08}.md` | 🔨 labs authored + committed — **live-cluster verify pending** (no cluster in authoring env); section **slides** (`pages/S00,S05–S08`) not started (await deck-theme master) |

> **Backlog sync owed** (do not let this branch edit `agent-context/` — a planning agent owns
> it): flip `US-B00`, `US-C1`–`US-C4` to *lab authored, slides pending*; note `US-B0`/`US-B0b`
> (container labs `01`/`02`) still `todo` — deferred, need a container engine.

> Section **slides** (`pages/SNN-*`) for Day 1 are intentionally **not** claimed yet — they
> depend on the deck-theme master settling. Container labs `01`/`02` need a container engine
> (docker/podman) and are deferred until an authoring env has one.

## Non-negotiable guardrails

These apply to **everything** — slides, labs, components, assets, planning docs,
filenames, and **commit messages**.

1. **No brand references.** Do not name or imply any specific employer, customer, or
   corporate brand anywhere. This workshop is vendor-neutral.
2. **No tooling or AI attribution.** Do not mention the editors, generators, or AI
   assistants used to produce any material — not in content and **not in commit
   messages**. Do **not** add `Co-Authored-By` or similar trailers.
3. **Label AI-generated imagery.** Any AI-generated image (e.g. the Mœbius-style
   section covers) must carry a visible `AI generated` footer on the slide.
4. **Commit messages: Conventional Commits + gitmoji.** See
   [Commit conventions](#commit-conventions).
5. **Stay current.** Track current Kubernetes behaviour, API versions, and CNCF
   ecosystem conventions. Legacy source material is inspiration only — update anything
   outdated.
6. **Alignment, not exam prep.** Coverage is aligned with CKAD/CKA domains as a design
   check, but certification prep is not the organizing principle. **Verify the current
   Kubernetes / CKx curriculum version at authoring time — do not hard-pin a version in the
   docs.**

## Where things live

| Path | Purpose | Tracked? |
| --- | --- | --- |
| `AGENT.md` | This file — contributor guidance. | yes |
| *(root decks)* | `slides.md` (superset) + `slides-3day.md` (boil-down): headmatter + `src:` includes. | yes |
| `pages/SNN-topic/` | One self-contained, toggleable **section** per folder (`index.md`). | yes |
| `labs/day-*/` | Standalone Markdown labs (not embedded in the deck). | yes |
| `agent-context/` | Planning, roadmap, user stories, outline, image prompts, source analysis. **Local working material.** | no (gitignored) |
| `references/` | Vendored reference theme/pattern gallery and CNCF artwork, for rehearsal. | no (gitignored) |
| `.claude/` | Local tooling/skills. | no (gitignored) |

> **Deck location note:** the deck lives at the repo root. `slides.md` (superset) and
> `slides-3day.md` (canonical 3-day cut) compose the `pages/SNN-topic/` section library;
> `slides-templates.md` is the design-system gallery (reusable layouts + the
> animation-technology spike) — reference material, not workshop content. All sections
> `S00`–`S27` exist as stubs; author content into them milestone by milestone (Day 1 first).

## Source of truth for scope

The plan lives in `agent-context/` (gitignored, local). Read it before authoring:

- `agent-context/roadmap.md` — milestones, delivery model, guardrails.
- `agent-context/user-stories.md` — the backlog. **US-0 comes first**: build reusable
  slide templates (using the Kubernetes/CNCF icons) and a pod-replacement animation
  spike before curriculum content.
- `agent-context/presentation-outline.md` — the full section-by-section outline as a
  **compartmentalized superset** (`S00`–`S27`), each section tagged with a **Tier**
  (`core`/`recommended`/`optional`) and **Suggested day**. The spine is the **red line**:
  `Pod → Deployment → Service → Ingress → Gateway API` (S05–S09). Also holds the **deck
  architecture**, the **lab authoring contract**, the CKAD/CKA alignment appendix, and the
  **canonical 3-day cut** (Appendix C).
- `agent-context/section-image-prompts.md` — Mœbius continuous-story covers (`S00`–`S27`).

## Teaching model

- Each day is ~50% slides / ~50% hands-on. Every concept block names the lab that
  follows it.
- Module rhythm: **problem → mental model → minimal YAML → run it → observe → break it
  → fix it → debrief**.
- **Environments:** every lab must run in an assigned **namespace** on a shared
  cluster *or* a local **kind** cluster. Never require cluster-admin unless the topic
  needs it; then mark the lab **kind-only** and provide a namespace-safe read-only
  alternative.

## Deck architecture — compartmentalized sections

The deck is a **superset** of toggleable sections composed by one or more **root decks**.

- **One folder per section:** `pages/SNN-topic/index.md` (e.g. `pages/S01-containers/index.md`).
  Each `index.md` is self-contained — its own section-divider slide + content — and **must not**
  depend on another section's slide numbers.
- **Root decks are mostly includes:** headmatter (theme/config) followed by one import block
  per section:

  ```md
  ---
  src: ./pages/S01-containers/index.md
  hide: false      # flip to true to drop the whole Containers section
  ---
  ```

  Slidev merges the import block's frontmatter into **every** imported slide, so `hide: true`
  (or `disabled: true`) on the block drops the entire section at parse time. Page-range imports
  work too: `src: ./pages/S07-service/index.md#1,4-6`.
- **Multiple root decks over one section library:** `slides.md` imports every section (the
  superset); `slides-3day.md` imports only the [canonical 3-day cut](agent-context/presentation-outline.md#appendix-c--canonical-3-day-cut).
  Each builds independently with `slidev <file>.md`. Add a new cut by adding one
  `slides-<variant>.md`, never by copying sections.
- **Tiers:** every section is `core`, `recommended`, or `optional`. Keep the outline's Section
  map, the Tier tags, and the image-prompt numbering (`S00`–`S27`) in sync when adding or
  moving sections.

## Slidev authoring rules

- Prefer Markdown, frontmatter, layouts, and Vue components over inline HTML and
  per-slide `style` attributes.
- Split long decks with page imports:

  ```md
  ---
  src: ./pages/S05-pod/index.md
  hideInToc: true
  ---
  ```

- Use `v-click` / `v-clicks` and `shiki-magic-move` for stepwise teaching. The deck is
  deliberately **code-heavy** — prefer a growing manifest built up in `magic-move`
  steps over bullet lists.
- Use Shiki line highlighting (`yaml {1-3|5-8|all}`) for YAML and shell walkthroughs.
- Use Mermaid for simple static flow/sequence diagrams only.
- Use custom Vue + CSS components for **animated state transitions** (rolling update,
  reconciliation, probes → endpoints, scheduling, request routing). Reuse the shared
  animation components rather than re-implementing per slide.
- Keep on-slide text concise; put facilitator detail in speaker notes.

### YAML teaching pattern

For each core resource, build the manifest up field by field with `magic-move`, then
point at the matching lab:

```md
---
layout: two-cols
title: Pod anatomy
---

````md magic-move
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
```
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
```
````

::right::

Lab: `labs/day-1/05-pod.md`
```

Each later resource in the red line **extends the previous manifest** so learners see
the through-line.

## Diagram & animation guidance

Use diagrams to explain behaviour, not to decorate. Good animated candidates:

- Reconciliation loop (desired vs observed → action). Reused for operators and GitOps.
- Rolling update: old ReplicaSet scales down while new scales up.
- Service routing: selector → EndpointSlices → Pods.
- Probes: readiness removes a Pod from endpoints; liveness restarts the container.
- Scheduling, PVC binding, admission/policy.

Preference: Mermaid for static; **Vue + CSS transitions** for reusable animated
teaching diagrams; SVG only for precise custom geometry. Avoid screenshots unless a
real UI can't be represented better. See US-0 for the animation-tech spike that
selects the standard approach.

## Icons & assets

Use the Kubernetes/CNCF logos under `references/artwork/`. Prefer SVG; prefer white
variants on the dark master and colour variants for product-identity slides. Do not
modify CNCF artwork; preserve its license/attribution requirements. Copy only a small
curated set into the deck's `public/` when needed.

## Lab authoring contract

Labs are standalone Markdown under `labs/day-N/NN-topic.md`, **not** embedded in the
deck. Every lab must be **idiot-proof**: explicit, copy-pasteable steps, and a
collapsible **spoiler** (`<details>`) with the solution/expected output for every task
and question. Full contract:
`agent-context/presentation-outline.md#lab-authoring-contract`.

## Commit conventions

Conventional Commits **plus** gitmoji:

```
<emoji> <type>(<scope>): <subject>
```

- `type`: `feat` `fix` `docs` `chore` `refactor` `style` `test` `build` `ci` `perf`.
- `scope`: optional, lowercase (`deck`, `labs`, `theme`, `repo`, ...).
- `subject`: imperative, lowercase, no trailing period.
- Common gitmoji: ✨ feat · 🐛 fix · 📝 docs · ♻️ refactor · 🎨 style · ✅ test ·
  🔧 config · 🙈 gitignore · 🎉 initial commit · ⚡️ perf · 👷 ci.
- **No AI/tooling attribution and no `Co-Authored-By` trailers.** No brand names.

Examples:

- `🙈 chore: ignore local working material, deps, and build artifacts`
- `✨ feat(deck): add reusable section-cover and code-walkthrough layouts`
- `📝 docs(labs): add pod lifecycle lab with spoilers`

One logical change per commit. Stage explicit paths (`git add <paths>`); never blanket
`git add -A` when working material is present.

## Validation

- Run `slidev` dev/build/export once the deck exists; confirm exports (PDF/static)
  still render logos and animations.
- Validate manifests with `kubectl apply --dry-run=server` where a cluster is
  available.
- Verify every lab runs from a clean namespace **and** a clean kind cluster, and that
  cleanup returns the environment to a known state.
- Keep planning docs in `agent-context/` concise and current as decisions change.
