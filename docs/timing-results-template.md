# Timing-Results Template — per-section MEASURED timings

A blank template for recording **measured** timings during a rehearsal or beta run. Copy
this file (e.g. to `timing-results-2026-08-15.md`), fill the **MEASURED** columns as you
run, and keep it as the record for that run.

> **Measured ≠ planned.** The `PLANNED` columns are copied from the
> [syllabus](./syllabus.md#per-section-outcomes-timings-and-labs) — they are **unrehearsed
> planning estimates**, not facts. The `MEASURED` columns start **empty** and hold **only
> observed stopwatch numbers**. **Never** copy a planned value into a measured column: an
> empty measured cell means "not yet measured", and that is the honest state until someone
> actually times it. The whole point of this template is to replace estimates with
> measurements — do not blur the two.

## Run metadata

Fill this in per run:

- **Run date:** _(YYYY-MM-DD)_
- **Facilitator / timer:** _(who kept the clock)_
- **Environment:** _(Local kind / Shared namespace / mixed)_
- **Cut delivered:** _(canonical 3-day cut / custom — list sections actually run)_
- **Cluster / network notes:** _(kind version, laptop specs, network for image pulls)_

## How to fill this in

1. Time **slides** and **lab** separately with a stopwatch; record whole minutes in the
   `MEASURED slides` and `MEASURED lab` columns.
2. `Δ slides` / `Δ lab` = **measured − planned** (leave blank until you have a measured
   value). A positive number means it ran **over** the estimate.
3. Put anything that cost time — a slow add-on install, a broken command, a room-wide
   stumble — in **Blockers / notes**. These are what a fix targets.
4. Leave a cell **empty** if you did not run or did not time that section. Do **not**
   backfill it with the planned number.

## Legend

- **PLANNED** — from the syllabus; an unrehearsed estimate. Do not edit these.
- **MEASURED** — observed stopwatch minutes for this run. Empty = not measured.
- **Δ** — measured minus planned, in minutes; blank until measured. `+` = over estimate.
- **`—`** — not applicable (S27 has no lab; S24 is a deferred stub).

## Day 1

| ID | Section | PLANNED slides | PLANNED lab | MEASURED slides | MEASURED lab | Δ slides | Δ lab | Blockers / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S00 | Welcome & setup | 20 | 15 | | | | | |
| S01 | Containers | 30 | 25 | | | | | |
| S02 | Container security & supply chain | 30 | 25 | | | | | |
| S03 | Kubernetes mental model | 30 | 20 | | | | | |
| S04 | kubectl | 25 | 25 | | | | | |
| S05 | Pod | 30 | 25 | | | | | |
| S06 | Deployment | 35 | 30 | | | | | |
| S07 | Service | 30 | 30 | | | | | |
| S08 | Ingress | 25 | 25 | | | | | |

## Day 2

| ID | Section | PLANNED slides | PLANNED lab | MEASURED slides | MEASURED lab | Δ slides | Δ lab | Blockers / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S09 | Gateway API | 30 | 25 | | | | | |
| S10 | ConfigMap & Secret | 25 | 25 | | | | | |
| S11 | Storage (PV/PVC/StorageClass) | 30 | 30 | | | | | |
| S12 | StatefulSet | 30 | 30 | | | | | |
| S13 | Resources & limits | 30 | 30 | | | | | |
| S14 | Health probes | 30 | 30 | | | | | |
| S15 | Jobs & CronJobs | 20 | 20 | | | | | |
| S16 | Autoscaling (HPA) | 20 | 20 | | | | | |

## Day 3

| ID | Section | PLANNED slides | PLANNED lab | MEASURED slides | MEASURED lab | Δ slides | Δ lab | Blockers / notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S17 | Pod security (securityContext + PSS) | 30 | 25 | | | | | |
| S18 | NetworkPolicy | 25 | 25 | | | | | |
| S19 | RBAC | 25 | 25 | | | | | |
| S20 | Helm | 30 | 30 | | | | | |
| S21 | GitOps with Argo CD | 30 | 25 | | | | | |
| S22 | The operator pattern | 25 | 15 | | | | | |
| S23 | Prometheus Operator | 30 | 25 | | | | | |
| S24 † | Operator dev 101 (kubebuilder) | 40 | 40 | | | | | Deferred stub — planned slot only, not runnable content. |
| S25 | Security & pod escape | 35 | 30 | | | | | |
| S26 | Best practices (capstone) | 30 | 40 | | | | | |
| S27 | Wrap-up & next steps | 20 | — | | — | | — | Slides only — no lab. |

† **S24 planned = 40/40 is a placeholder slot, not delivered content.** The lab is a
deferred stub; do not record a measurement against it as if it were a runnable lab.

## Day totals (measured vs planned)

The syllabus's **planned** day totals (from the canonical 3-day cut) are the targets to
check against. Fill the measured totals only after timing the sections you actually ran —
sum **your MEASURED cells**, not the planned ones, and note which sections your cut
included (the planned totals below assume the canonical cut, which omits some sections).

| Day | PLANNED total (canonical cut) | MEASURED total (this run) | Δ | Sections run this run |
| --- | --- | --- | --- | --- |
| Day 1 | 365 | | | |
| Day 2 | 345 | | | |
| Day 3 | 420 | | | |

> **Reading the deltas.** The open pre-delivery question is whether the cut lands near
> **~390 min/day at ~50/50 slides:lab**. That can only be answered from the MEASURED
> column. Until these cells are filled from a real run, the ~390 target remains an
> **estimate**, not a measured fact — do not report it as confirmed.

## Blockers summary

List the cross-cutting or high-impact blockers observed this run (add-on installs that
were slow, commands that failed, sections that consistently overran). File each as a
[beta-feedback issue](../.github/ISSUE_TEMPLATE/beta-feedback.yml) and link it here.

- _(none recorded yet — fill during the run)_
