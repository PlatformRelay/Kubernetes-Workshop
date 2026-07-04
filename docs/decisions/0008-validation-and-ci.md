# ADR 0008: Validation and CI strategy

- **Status:** accepted
- **Scope:** what "validated" means for the deck, the labs, and the environment, and how those
  checks run automatically.

## Context

The workshop's quality bar is concrete: each root deck must build and export; every YAML example
must be valid and minimal; every lab must run from a clean namespace and a clean kind cluster and
reset to a known state. With a superset of ~28 sections, matching labs, deliberately-broken
manifests, and several delivery cuts, that surface is too large to check by hand before a
rehearsal. The paired authoring model ([0004](0004-parallel-slide-and-lab-authoring.md)) also
means a section's slides and its lab must be validated *together*, not in separate passes.

## Options considered

1. **Manual pre-rehearsal check.** Rejected: doesn't scale to the superset, and a broken manifest
   surfaces in front of a room instead of in a pull request.
2. **Validate the deck only** (it's the visible artifact). Rejected: the labs are half the
   workshop and the manifests are the thing learners actually run.
3. **Layered automated validation** — deck build/export + manifest dry-run + lab smoke — run in
   CI and reproducible locally. Chosen.

## Decision

Three layers, each runnable locally and wired into CI. The concrete CI runner is chosen at repo
setup and named nowhere in content (vendor-neutral); the pipeline just invokes the same commands
a contributor runs locally.

1. **Deck validation (every root deck).** For `slides.md`, `slides-3day.md`, and each
   `slides-<variant>.md`: `slidev build` and a PDF/static **export** must succeed, and exports
   must still render logos and the click-driven animations
   ([0001](0001-animation-technology.md)). A section toggled off must leave every deck building —
   this catches cross-section coupling forbidden by [0003](0003-deck-composition-superset-and-boil-down.md).
2. **Manifest validation (every lab).** Every file under a lab's `manifests/`, `broken/`, and
   `solutions/` ([0005](0005-lab-manifests-and-example-code-layout.md)) is checked with
   `kubectl apply --dry-run=server` against the pinned cluster where one is available
   (`--dry-run=client` as a fallback in cluster-less CI), plus a YAML lint. The **broken/**
   variants must parse (they fail at apply/admission, not at parse), and the **solutions/** must
   pass cleanly — so break→fix content is proven, not assumed.
3. **Environment + lab smoke (rehearsal gate).** A scripted pass brings up a clean `kind` cluster
   via `infra/` ([0006](0006-workshop-environment-and-iac.md)), installs the addons a lab needs,
   runs the lab's happy path to its expected observation, and then its cleanup, asserting the
   namespace/cluster returns to empty. This is the M7 rehearsal gate and confirms the canonical
   3-day cut lands near 50/50 and ~390 min/day.

Supporting rules:

- **Local parity.** Every check is a `make` target (`make deck`, `make manifests`, `make smoke`)
  so a contributor reproduces CI exactly before opening a PR.
- **PR-scoped where possible.** Deck build + manifest dry-run + lint run on every PR; the full
  kind smoke runs on a schedule and before a rehearsal (it needs a cluster and is slower).
- **Currency hook.** The `--dry-run=server` layer is also the deprecation early-warning from
  [0007](0007-kubernetes-currency-and-version-pinning.md): bump `infra/versions.env`, re-run
  `make manifests`, and any moved API surfaces immediately.
- **Guardrail lint (nice-to-have).** A cheap grep-based check for brand names and tooling/AI
  attribution in tracked content and commit messages, aligned with the repo guardrails.

## Consequences

- A broken manifest, a non-exporting deck, or a cross-section coupling fails a pull request, not a
  rehearsal.
- The paired unit is validated as a unit: the deck build and the lab's manifests both gate the
  same PR.
- Adding a section or a delivery cut automatically inherits all three layers — no bespoke test
  wiring per section.
- The kind smoke pass is the objective evidence behind the "runs from a clean environment" and
  "50/50 timing" claims in the definition of done.
