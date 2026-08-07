# ADR 0013: Scope OpenTelemetry as a concept coda on S23, not a new section

- **Status:** proposed
- **Scope:** whether and how OpenTelemetry enters the curriculum — section numbering, day placement,
  lab surface, environment add-ons, and `infra/versions.env` pins. This ADR **proposes**; it does not
  enact. It deliberately does **not** change the OpenTelemetry wording in
  [`docs/roadmap.md`](../roadmap.md) — that edit is the operator's call and belongs to the roadmap
  lane.

## Context

The public roadmap lists **OpenTelemetry — exploring** and advertises "traces, OTLP, and a collector
as a candidate add-on section", with an open GitHub Discussion behind it. Nothing backs that entry:
there is no story in the backlog, no section stub, no lab, no pin, and no recorded decision. An
`exploring` status with a feedback link implies motion; there is none.

Meanwhile the section library is finished. `S00`–`S27` are authored except **S24** (kubebuilder),
which is a reviewed deferred stub. The next curriculum lane cannot be sequenced while a publicly
advertised topic has no verdict, so this is the blocking question rather than a nice-to-have.

Four forces constrain the answer:

1. **The days are full.** The canonical cut plans Day 1 at 365 min and Day 2 at 345 min against a
   ~390 min target, but **Day 3 already plans 420 min** — over target before anything is added. The
   syllabus already tells a facilitator running to time to drop an add-back or trim the S26 capstone.
   Any new Day-3 minute is spent against that deficit, not against headroom.
2. **Tracing needs an instrumented application.** Metrics can be scraped from an app that knows
   nothing about the scraper; traces cannot. A hands-on tracing exercise therefore depends on what
   the workshop's demo app actually emits — verify that at authoring time rather than assuming it —
   and instrumenting it is a separate concern from teaching workload operations.
3. **Every component costs a pin.** [ADR 0007](0007-kubernetes-currency-and-version-pinning.md) puts
   every reproducibility-critical version in `infra/versions.env` with a per-delivery review cadence,
   and [ADR 0006](0006-workshop-environment-and-iac.md) puts installers in `infra/`. A collector plus
   a trace backend is not one pin; it is a standing maintenance obligation on every delivery.
4. **S23 already covers the neighbouring ground.** The Prometheus Operator section teaches
   `ServiceMonitor`, operator-generated scrape config, the golden signals, and PromQL. It is the
   natural anchor for "there are other signals and other pipelines", and the roadmap itself frames
   OpenTelemetry as depth *beyond* S23.

## Options considered

Criteria and weights. Weights reflect what actually gates this workshop: delivery time and
maintenance load are scarcer than authoring enthusiasm.

| # | Criterion | Weight |
| --- | --- | --- |
| C1 | Learner value at the stated beginner→intermediate level | 5 |
| C2 | Fit with the 3-day time budget (Day 3 is already over target) | 5 |
| C3 | Authoring + maintenance cost (higher score = cheaper) | 4 |
| C4 | Environment cost — kind footprint and namespace-mode viability | 3 |
| C5 | Supply-chain / pin surface added to `infra/versions.env` | 3 |
| C6 | Roadmap honesty — does it deliver what is publicly advertised | 3 |
| C7 | Reversibility if the decision is wrong | 2 |

Scores are 1–5, where **5 is best for the workshop** (so a cheap option scores high on C3–C5).

| Option | C1 ×5 | C2 ×5 | C3 ×4 | C4 ×3 | C5 ×3 | C6 ×3 | C7 ×2 | **Total /125** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A** — new optional section + lab | 5 (25) | 3 (15) | 1 (4) | 1 (3) | 1 (3) | 5 (15) | 2 (4) | **69** |
| **B** — concept coda on S23 | 3 (15) | 4 (20) | 4 (16) | 5 (15) | 5 (15) | 3 (9) | 5 (10) | **100** |
| **C** — stay `exploring` / drop | 1 (5) | 5 (25) | 5 (20) | 5 (15) | 5 (15) | 2 (6) | 5 (10) | **96** |

**B and C are 4 points apart out of 125 — that gap is not decisive on its own.** The tie-breaker is
in the Decision below, and the conditions that flip the result are written down rather than left to
taste.

### Option A — a new optional section with its own lab

A hands-on `S28 OpenTelemetry` (optional tier, Optional / Appendix deck): the collector as a
DaemonSet or Deployment, OTLP ingest, a trace backend, and an instrumented app producing spans a
learner can read. This is the only option that delivers what the roadmap currently advertises, and it
scores top marks on learner value (C1).

It is also by far the most expensive, and the cost is not one file. A follow-up lane would have to
touch: `scripts/deck-manifest.mjs` (new section entry plus timings), `docs/syllabus.md` (section-map
row and Day-3 tables — the manifest validates that table, so the two cannot drift), the `S00`–`S27`
numbering asserted in `AGENT.md` and the syllabus, a new Mœbius section cover that breaks the
continuous-story image sequence, `pages/S28-*/index.md`, `labs/day-3/28-*.md` plus its
`.solution.md` sibling, the enforced slice in `scripts/lab-contract.mjs`, and `infra/versions.env`
for a collector, a trace backend, and an instrumented app image.

C2 scores 3 rather than 1 only because an `optional`-tier section sits outside the canonical cut and
so costs no delivery minutes by default — which is also the trap: it is a large, high-maintenance
asset that the default delivery never shows. C4 and C5 score 1: a collector plus a trace backend is a
real kind footprint, is read-only at best in shared-namespace mode, and adds three pins to the
per-delivery review cadence.

### Option B — a concept coda inside S23

Close the existing Prometheus Operator section with a short trailer: metrics are one signal; OTLP is
the wire protocol the ecosystem converged on; a collector is a pipeline shape (receive → process →
export) that decouples what an app emits from where it lands; traces answer the question metrics
cannot ("*which* request was slow, and where"). Concepts only — nothing installed, nothing scraped,
no new resource kind demanded of the learner.

It scores mid on C1 (naming a pipeline is genuinely less valuable than running one) and mid on C6:
it delivers *OTLP and the collector as concepts*, and it does **not** deliver hands-on tracing. It
scores well everywhere else because it adds no component, no pin, no lab, no section id, and no
cover art, and because it can be deleted in a single commit.

Its one real cost is minutes, and the Decision below fixes that cost at zero by requiring the coda to
fit inside S23's existing slide budget rather than extend it.

### Option C — stay `exploring`, or drop it from the roadmap

Do no curriculum work. The variant matters: **dropping** the item honestly (and naming distributed
tracing in the S27 "what we skipped" map, where service mesh, multi-cluster, and cluster operations
already live) is defensible and costs nothing. **Staying `exploring` indefinitely** is not — it
advertises a door nobody is walking through, which is exactly the state this ADR exists to end. C6
scores 2 for that reason: the honest-drop variant is truthful but leaves the learner-facing question
("we use OTel at work — how does that relate to what you just taught?") unanswered in the room.

## Decision

**Recommendation: Option B.** Scope OpenTelemetry into the workshop as a concept coda on S23, not as
a new section, and not as a hands-on tracing exercise.

The reasoning is that B is the only option that answers the learner's actual question at the point
they ask it — during the observability section — without spending a minute the schedule does not
have or adding a component someone must re-pin before every delivery. A is the right shape for a
different workshop (or a fourth day); C is the right answer only if B cannot be delivered inside its
budget, which is why that fallback is written into rule 3 rather than left implicit.

If accepted, these rules apply:

1. **Scope:** OTLP as the wire protocol, and the collector as a pipeline shape, taught as concepts.
   Traces are **named and motivated** as a signal type, with no instrumentation exercise and no span
   walkthrough. Logs are out of scope entirely.
2. **Placement:** inside `pages/S23-prometheus-operator/index.md`, as a closing coda of **at most six
   slides**. **No new section id** — `S00`–`S27` numbering is unchanged, no new Mœbius cover is
   commissioned, and `scripts/deck-manifest.mjs` gains no entry. Tier and day are inherited from S23:
   `recommended`, **Day 3**, in the canonical cut.
3. **Budget: zero net minutes.** The coda must fit inside S23's existing 30-minute slide allocation
   by tightening existing depth. It must **not** change S23's timings in `scripts/deck-manifest.mjs`
   or any Day-3 total in `docs/syllabus.md`. **If a follow-up lane cannot fit it in 30 minutes, the
   coda does not ship and Option C (honest drop) applies instead** — Day 3 does not grow past 420.
4. **No lab.** No `labs/day-3/` file, no `.solution.md` sibling, and no change to the enforced slice
   in `scripts/lab-contract.mjs`.
5. **No add-on and no pin.** `infra/versions.env` gains nothing — specifically no collector version,
   no trace backend, and no instrumented app image. No `infra/` installer is written.
6. **Relationship to S23:** the coda **extends, never replaces**. The Prometheus Operator stays the
   hands-on spine of the section; OpenTelemetry is framed as another pipeline that can feed the same
   kind of store, which is why it belongs here rather than in its own section. If the pinned
   kube-prometheus-stack chart's Prometheus supports OTLP ingestion — **verify at authoring time; do
   not hard-pin a version in the slides** — that receiver is the natural future hands-on hook, but it
   still needs a producer, so it stays outside this scope.
7. **The roadmap is not changed by this ADR.** If accepted, `docs/roadmap.md` must stop advertising
   traces and a collector as candidate hands-on material, because B does not deliver them. That
   rewording is the operator's decision and the roadmap lane's edit, not this one's.

### What would flip this

Because B beats C by only four points, the trigger conditions are stated rather than re-litigated
later:

- **Flip to C** if the coda cannot be authored inside S23's existing 30 minutes, or if the operator
  decides Day 3 must be trimmed toward the ~390 target before anything new is considered.
- **Flip to A** if any one of these becomes true: the demo app ships OTLP instrumentation for an
  independent reason; the workshop grows a fourth day or a dedicated observability track; or two or
  more delivered cohorts ask for hands-on tracing in feedback. Any of those changes the C1/C2
  arithmetic enough to justify the section, and would need a new ADR superseding this one.

## Consequences

- Day 3 stays at its planned 420 minutes; the syllabus tables, `scripts/deck-manifest.mjs`, and the
  lab-contract slices are untouched, so no cross-lane synchronisation is created.
- The workshop gains an honest one-paragraph answer to "how does OpenTelemetry relate to this?"
  without pretending to teach tracing.
- **The roadmap stays inaccurate until the operator's lane edits it.** That is the immediate
  follow-up this ADR unblocks, and it is deliberately outside this lane.
- S27's "what we skipped" map is the natural home for a fourth card on distributed tracing, so the
  omission is named to the room. That is a deck-lane follow-up, not part of this ADR.
- No component, no installer, and no `infra/versions.env` entry means the per-delivery review cadence
  from [ADR 0007](0007-kubernetes-currency-and-version-pinning.md) does not grow.
- Deferring the hands-on pipeline means the workshop teaches a pipeline it never runs. That is a real
  gap, accepted knowingly, and it is why the flip-to-A triggers are written down.
- **Revert path:** delete this ADR and its index row; nothing else in the repo depends on it while it
  is `proposed`. If it has been accepted and the coda has shipped, revert the S23 slide range as
  well — no manifest, syllabus, lab, pin, or environment change has to be undone, because none was
  made.
- This proposed ADR becomes accepted only when the operator validates the recommendation. Choosing A
  or C instead supersedes it with a new ADR rather than editing this one.
