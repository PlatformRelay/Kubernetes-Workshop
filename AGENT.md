# AGENT.md

Guidance for any agent or contributor working in this repository.

This is an **open source, vendor-neutral, 3-day beginner Kubernetes workshop**. It
ships as a Slidev slide deck plus a separate set of hands-on labs in Markdown. The
workshop is **50% presentation, 50% practice**.

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
   check, but certification prep is not the organizing principle.

## Where things live

| Path | Purpose | Tracked? |
| --- | --- | --- |
| `AGENT.md` | This file — contributor guidance. | yes |
| *(deck)* | The Slidev deck: `slides.md` + `pages/day-*/` (see note). | yes |
| `labs/day-*/` | Standalone Markdown labs (not embedded in the deck). | yes |
| `agent-context/` | Planning, roadmap, user stories, outline, image prompts, source analysis. **Local working material.** | no (gitignored) |
| `references/` | Vendored reference theme/pattern gallery and CNCF artwork, for rehearsal. | no (gitignored) |
| `.claude/` | Local tooling/skills. | no (gitignored) |

> **Deck location note:** the deck currently sits in the initial Slidev starter
> folder and is still the stock template. Restructuring it to root-level `slides.md` +
> `pages/day-*/` (per the outline) is milestone M1/M2 — do this before authoring
> curriculum. Do not treat the starter's demo slides as workshop content.

## Source of truth for scope

The plan lives in `agent-context/` (gitignored, local). Read it before authoring:

- `agent-context/roadmap.md` — milestones, delivery model, guardrails.
- `agent-context/user-stories.md` — the backlog. **US-0 comes first**: build reusable
  slide templates (using the Kubernetes/CNCF icons) and a pod-replacement animation
  spike before curriculum content.
- `agent-context/presentation-outline.md` — the full 3-day section-by-section outline.
  The spine is the **red line**: `Pod → Deployment → Service → Ingress → Gateway API`.
  Also holds the **lab authoring contract** and the CKAD/CKA alignment appendix.
- `agent-context/section-image-prompts.md` — Mœbius continuous-story covers.

## Teaching model

- Each day is ~50% slides / ~50% hands-on. Every concept block names the lab that
  follows it.
- Module rhythm: **problem → mental model → minimal YAML → run it → observe → break it
  → fix it → debrief**.
- **Environments:** every lab must run in an assigned **namespace** on a shared
  cluster *or* a local **kind** cluster. Never require cluster-admin unless the topic
  needs it; then mark the lab **kind-only** and provide a namespace-safe read-only
  alternative.

## Slidev authoring rules

- Prefer Markdown, frontmatter, layouts, and Vue components over inline HTML and
  per-slide `style` attributes.
- Split long decks with page imports:

  ```md
  ---
  src: ./pages/day-1/03-pod.md
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

Lab: `labs/day-1/03-pod.md`
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
