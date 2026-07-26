## Beta limitations

**Controlled beta.** This workshop has **not yet completed a full 3-day
clean-environment rehearsal**. Specifically:

- **Timings are unrehearsed planning estimates, not measured facts.** The per-section
  slide/lab minutes and the ~390 min/day day totals are targets to pace against, not
  observations from a delivered run.
- **The add-on-heavy labs have not all been smoke-tested end-to-end on a clean `kind`
  cluster** (S08, S09, S16, S18, S21, S22, S23). Their manifests are dry-run validated
  and the commands are correct, but exact install timings and a few verbatim
  `describe`/error strings may differ.
- **S24 (Operator dev / kubebuilder) is a deferred stub** — it needs a Go + kubebuilder
  toolchain and is scheduled for a later milestone. Do not schedule it as a full
  hands-on lab until it is authored.

These limitations are stated plainly rather than hidden. Confirming the cut and the
add-on installs against a live environment is explicit, still-open pre-delivery work.

> **Source of truth.** This file is the single tracked copy of the controlled-beta
> honesty statement. The README banner and facilitator-guide exit criteria point here;
> `release.yml` prepends it to auto-generated notes on every pre-release tag
> (semver with a `-`, e.g. `v0.2.0-beta.1`). Edit here — do not fork the wording.
