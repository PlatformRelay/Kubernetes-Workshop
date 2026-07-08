# ADR 0004: Slides and exercises are authored in parallel as a paired unit

- **Status:** accepted
- **Scope:** the authoring workflow and Definition of Done for every content section.

## Context

The workshop is a 50/50 split of explanation and practice, and its whole pedagogy is
"explain a manifest → run it → observe → break it → fix it." That only works if the manifest on
the slide and the manifest in the lab are *the same manifest*. When slides are written first and
labs "added later," three failures recur: the lab drifts from what the slide showed; the lab is
rushed and loses its spoilers; and a section ships looking done (slides exist) while it is only
half-teachable (no runnable practice). We want to make that failure mode structurally
impossible.

## Options considered

1. **Slides-first, labs as a later pass.** Rejected — this is the drift-and-rush failure above,
   and it is the default we are explicitly correcting.
2. **Labs-first, slides derived from labs.** Better for correctness, but slides carry the mental
   model and narrative the lab assumes; writing them last starves the explanation.
3. **Paired authoring: a section's slides and its lab are one unit of work, built together, and
   neither is "done" without the other.** Chosen.

## Decision

- **A section is a slide+lab pair.** Every content section is authored as two linked stories —
  `US-<SID>-S` (slides) and `US-<SID>-L` (lab/exercise) — worked and reviewed **together in one
  PR**. The backlog is structured this way so the pairing is visible, not implicit.
- **The manifest is the single source of truth.** The YAML a slide teaches lives in the lab
  folder ([0005](0005-lab-manifests-and-example-code-layout.md)) and is the exact file the lab
  applies. Slides show that manifest (built up via `magic-move`); they do not maintain a second,
  drifting copy. Where a slide shows a subset/step, it is a *view* of the real file.
- **Author in the teaching order.** Within the pair, write the minimal runnable manifest and its
  lab steps first, prove it runs, then build the slide walkthrough up to that same artifact and
  its break/fix. Explanation and practice converge on one artifact.
- **Section Definition of Done (both halves required).** A section is done only when it has:
  concept slides at the right density; at least one `magic-move` walkthrough of the section's
  manifest; an animation where a state transition needs one; a referenced standalone lab with
  idiot-proof steps and a **spoiler for every task and question**; stated expected observations;
  a break→fix; reset-safe cleanup; a tier + suggested day; and a one-line CKx tie-in where
  relevant. It must import cleanly into `slides.md` and (if in the cut) `slides-3day.md`, and its
  lab must run from a clean namespace and a clean kind cluster.
- **Red-line continuity is a pairing constraint.** Because each core resource *extends the
  previous manifest*, the pair for `S06` starts from `S05`'s real manifest, and so on down the
  spine — enforced by both the slides and the lab referencing the same evolving files.

## Consequences

- Slides and labs cannot drift, because they share the artifact and ship in the same PR.
- A section never reaches "done" in a half-teachable state; reviewers check both halves against
  one checklist.
- The user-story backlog roughly doubles in item count (a `-S` and a `-L` per section) but each
  item is small and independently verifiable, which is the point.
- Validation runs on the pair as a whole: the deck builds/exports *and* the lab's manifests pass
  `kubectl apply --dry-run=server` ([0008](0008-validation-and-ci.md)).
