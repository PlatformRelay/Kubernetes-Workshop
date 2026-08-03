# AGENT.md

Guidance for any agent or contributor working in this repository.

This is an **open source, vendor-neutral, beginner-to-intermediate Kubernetes workshop**.
It ships as a Slidev slide deck plus a separate set of hands-on labs in Markdown. The
workshop is **50% presentation, 50% practice**.

Content is authored as a **superset** and boiled down per delivery: every section is a
self-contained, **toggleable** unit, and generated **root decks** compose Day 1, Day 2,
Day 3, and Optional / Appendix entries. `slides.md` and `slides-3day.md` remain
compatibility entries, not the default live-delivery path. See
[Deck architecture](#deck-architecture--compartmentalized-sections).

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
| `scripts/deck-manifest.mjs` | Source of truth for section metadata and generated deck membership. | yes |
| `slides-day-*.md`, `slides-optional.md` | Generated live-delivery entries; never edit by hand. | yes |
| `slides.md`, `slides-3day.md` | Generated compatibility entries for the superset and legacy combined cut. | yes |
| `pages/SNN-topic/` | One self-contained, toggleable **section** per folder (`index.md`). | yes |
| `theme/` | **Local Slidev theme** (`slidev-theme-k8s-workshop`): master styles, layouts, UI components. Root decks use `theme: ./theme`. | yes |
| `components/` | Deck-level Vue components (animated teaching diagrams). | yes |
| `labs/day-*/` | Standalone Markdown labs (not embedded in the deck). | yes |
| `agent-context/` | Planning, roadmap, user stories, outline, image prompts, source analysis. **Local working material.** | no (gitignored) |
| `references/` | Vendored reference theme/pattern gallery and CNCF artwork, for rehearsal. | no (gitignored) |
| `.claude/` | Local tooling/skills. | no (gitignored) |

> **Deck location note:** the deck lives at the repo root. `slides-day-1.md`,
> `slides-day-2.md`, `slides-day-3.md`, and `slides-optional.md` compose the
> `pages/SNN-topic/` section library for live delivery;
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
  → fix it → recap**.
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
- **Generated root decks over one section library:** `scripts/deck-manifest.mjs` assigns each
  section to its canonical day or the Optional / Appendix entry. Run `pnpm decks:generate`
  after changing the manifest and commit the generated roots. `pnpm decks:check` rejects
  missing sources, duplicate IDs, omitted authored sections, and generated drift.
- **Facilitator launcher:** `pnpm deck -- --day 1`, `--section S05`, or
  `--range S05-S09` starts a deterministic selection. `pnpm deck -- --list` discovers
  choices. With a TTY, `gum` adds a menu; without it, explicit flags work everywhere.
  A noninteractive invocation with no selector fails instead of opening the superset.
- **Compatibility only:** `slides.md` imports every section and `slides-3day.md` imports the
  combined canonical cut. Use `dev:superset`/`build:superset`/`export:superset` only when
  compatibility or whole-corpus inspection is intentional.
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
  reconciliation, probes → endpoints, scheduling, request routing). Reuse a shared
  animation component when the state transition is the **same** as one already built.
  When a transition is genuinely new (e.g. PVC binding ≠ StatefulSet identity ≠ admission
  gate), author a **new self-contained component** and carry a **one-line rationale** for it.
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
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
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

### Resource iconography (default for new sections)

The official Kubernetes resource glyphs are vendored under
`public/icons/resources/{labeled,unlabeled}/` (Apache-2.0). Render them with the
`<K8sIcon kind="…" />` component (slugs = kubectl short names: `pod`, `deploy`, `rs`,
`svc`, `ep`, `ing`, `cm`, `secret`, `ns`, `sts`, `pv`, `pvc`, `hpa`, `netpol`,
control-plane `api`/`c-m`/`sched`/`kubelet`/`k-proxy`, infra `node`/`etcd`, …).

- **Use a glyph wherever a slide, card, or diagram names a *specific* resource.**
  Do **not** convert conceptual/decorative icons (practices, verb groups, consumption
  modes, pain-points) — keep an emoji there. Over-conversion is a defect.
- **Variant convention:** `labeled` for standalone / legend / gallery use; `unlabeled`
  inside diagrams and cards. **Exception:** the control-plane/node component glyphs
  (`api`, `c-m`, `c-c-m`, `sched`, `kubelet`, `k-proxy`) ship **labeled-only** upstream —
  use `kindVariant="labeled"` for those even in cards.
- **Cards:** `KwCard` takes a `kind` (+ optional `kindVariant`) prop that renders the
  glyph in place of the emoji `icon` — e.g. `<KwCard heading="Deployment" kind="deploy">`.
- **Service *types*** (ClusterIP/NodePort/LoadBalancer/ExternalName) all use the `svc`
  glyph — they're all Services, so the shared glyph is correct; the heading names the
  type. (Maintainer preference: favour the Kubernetes glyph over a differentiating emoji
  here.)
- **No glyph exists** for Gateway API (`GatewayClass`/`Gateway`/`HTTPRoute`) — keep emoji
  there until the upstream icon set ships those kinds.
- Reference pattern + live gallery: the **Iconography** section of `slides-templates.md`.

## Lab authoring contract

Labs are standalone Markdown under `labs/day-N/NN-topic.md`, **not** embedded in the
deck. A contracted participant lab carries `<!-- lab-contract:v1 -->` and uses the ordered
headings **Prerequisites → Guided task → Observe → Challenge → Verify → Cleanup / reset**.
Answers belong in the sibling `NN-topic.solution.md`, linked from the participant lab at
`#guided-solutions` and `#challenge-solution`. The companion includes exact commands and
manifests, expected state/output, explanations, likely-failure recovery, and the challenge
answer. Cleanup is scoped to named/labelled resources or the assigned namespace and comes
after verification and the challenge.

Run `pnpm test:labs` to enforce the contract. Day 1 Labs 01–08, Day 2 Labs 09–16, and
Day 3 Labs 17–23, 25–26 are the enforced slices. **S24** (kubebuilder) stays **deferred**
outside the sibling-solution inventory until the Go/kubebuilder toolchain lab ships.
Full curriculum intent remains in `agent-context/presentation-outline.md#lab-authoring-contract`.

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

## Releases

Version tags (`v*`) trigger immutable GitHub Release publication: build validates
Day 1/2/3 + compatibility artifacts, then publish uploads them. Tags are never
moved; see [`docs/release.md`](./docs/release.md) for the cut procedure and
`scripts/release-tag-guard.sh` for the local/CI guard.

## Validation

- Run `slidev` dev/build/export once the deck exists; confirm exports (PDF/static)
  still render logos and animations.
- Validate manifests with `kubectl apply --dry-run=server` where a cluster is
  available.
- Verify every lab runs from a clean namespace **and** a clean kind cluster, and that
  cleanup returns the environment to a known state.
- Keep planning docs in `agent-context/` concise and current as decisions change.
