## Known limitations

Honest leftovers for facilitators — not a release blocker, and **not** a pacing
contract. Room tempo depends on the presenter, the audience, and which optional
sections you keep.

- **S24 (Operator dev / kubebuilder) is a deferred stub** — it needs a Go +
  kubebuilder toolchain and is not scheduled as a full hands-on lab until authored.
- **Some add-on-heavy labs** (notably Contour, Envoy Gateway, metrics-server,
  cert-manager, Argo CD, kube-prometheus paths) have stronger paper/CI coverage than
  end-to-end clean-`kind` smoke on every combination. Dry-runs and authored commands
  are in tree; expect occasional install-order or `describe` string drift on a fresh
  cluster and budget a dry-run of the add-ons *your* cut needs.
- **Syllabus minute marks** are planning aids for facilitators, not measured delivery
  facts. Adjust on the day.

> **Source of truth.** This file is the single tracked copy of the known-limitations
> statement. Pre-release tags (semver with a `-`, e.g. `v0.5.0-beta.1`) still prepend
> this file to auto-generated GitHub Release notes via `release.yml`. Edit here —
> do not fork the wording.
