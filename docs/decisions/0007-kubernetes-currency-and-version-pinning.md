# ADR 0007: Kubernetes currency and version-pinning policy

- **Status:** accepted
- **Scope:** how the workshop stays current with Kubernetes while remaining reproducible — what
  gets pinned, what deliberately does not, and when versions are reviewed.

## Context

Two forces pull in opposite directions. **Currency:** the guardrails require tracking current
Kubernetes behaviour, API versions, and CNCF conventions, and explicitly forbid hard-pinning a
Kubernetes version *in the prose* — a slide that says "as of v1.29" rots in a release.
**Reproducibility:** a lab that a room runs together must produce the same result on every
machine, which is impossible if `kind`, a chart, or a CRD channel floats to "latest" mid-session.

We need a policy that keeps the *teaching* version-agnostic while making the *running*
environment deterministic.

## Options considered

1. **Pin a Kubernetes version everywhere, including slides.** Rejected: violates the guardrail and
   guarantees stale-looking content within a release cycle.
2. **Pin nothing; always use latest.** Rejected: labs become non-reproducible and break silently
   when an upstream chart or API graduates/deprecates.
3. **Version-agnostic prose + a single pinned environment manifest, reviewed each delivery.**
   Chosen.

## Decision

- **Prose is version-agnostic.** Slides and lab text describe *behaviour and stable API
  semantics*, not "as of vX.Y." Where a version genuinely matters (a feature's GA/deprecation),
  state it as a *relative* fact ("stable since it graduated," "check your server version with
  `kubectl version`") and have the learner read their live version rather than trusting a printed
  one. The CKAD/CKA alignment is described by domain, never by a pinned curriculum version.
- **The environment is pinned in exactly one place.** `infra/versions.env`
  ([0006](0006-workshop-environment-and-iac.md)) holds every reproducibility-critical version: the
  `kind` node image (which fixes the Kubernetes version for the local path), addon chart versions,
  the Gateway API release/channel, controller image tags. Nothing else hard-codes a version.
- **Pin by digest where trust matters.** Images the labs pull for security-sensitive
  demonstrations (S02, S17, S25) are pinned by digest, consistent with the digest-pinning lesson
  those sections teach.
- **API versions follow the live server.** Manifests use current stable `apiVersion`s and are
  validated against the running cluster with `kubectl apply --dry-run=server`
  ([0008](0008-validation-and-ci.md)), which surfaces a deprecation the moment the pinned cluster
  moves.
- **Scheduled currency review.** Before each delivery (and at minimum once per Kubernetes minor
  release cycle), a maintainer: bumps `infra/versions.env` to current stable, re-runs the full
  validation + lab smoke pass, and scans slides/labs for any behaviour that changed
  (deprecations, defaults, graduations). The review is a checklist item in the rehearsal
  milestone, not an ad-hoc fix.

## Consequences

- Slides age gracefully: they teach semantics, so a Kubernetes bump rarely touches them.
- Any given delivery is fully reproducible because one file fixes the whole environment.
- A single upstream bump (node image, chart, CRD channel) is a one-line edit plus a validation
  run, keeping "stay current" cheap enough to actually do every cycle.
- `--dry-run=server` against the pinned cluster is the early-warning system for API deprecations,
  so drift is caught by tooling rather than in the room.
