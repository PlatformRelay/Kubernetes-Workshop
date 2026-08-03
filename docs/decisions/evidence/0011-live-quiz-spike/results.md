# US-QUIZ-1 spike results

Evidence was collected on 2026-08-03. Source inspection used immutable commits, and image identities are
manifest-list digests resolved on that date. Tags are shown only to explain upstream configuration; they
are never treated as immutable evidence. The machine-readable inventory is
[`candidates.json`](candidates.json), and CycloneDX source SBOMs are under [`sbom/`](sbom/).

## Outcome

**No candidate passes the complete-runtime FOSS gate, so none is selected or deployed.** Claper is the
first candidate worth re-evaluating because its product model is closest to anonymous formative polling,
but this is not adoption. QuizDock is rejected in its released topology because its mutable Redis tag now
resolves to a source-available/SSPL release. ClassQuiz remains a useful comparison but has the largest
required service set and the weakest immutable release boundary.

The offline prototype was rehearsed by validating the three-question bank and generating independent
participant, facilitator, and adapter-preview outputs. The
[timestamped command transcript](rehearsal/transcript.md) records inputs, SHA-256 output hashes, reveal,
deterministic reset/replay, and failure-fallback observations. It proves content portability and answer
hiding; it does not prove any live candidate UX.

## Hard license and provenance gate

| Candidate | Application source and license | Evaluated application image | Required services | Gate |
| --- | --- | --- | --- | --- |
| Claper 2.5.1 | [`3e80ce2`](https://github.com/ClaperCo/Claper/tree/3e80ce2ea25286d1b591ea327acdbfeb31fa33e3), [AGPL-3.0](https://github.com/ClaperCo/Claper/blob/3e80ce2ea25286d1b591ea327acdbfeb31fa33e3/LICENSE.txt) | `ghcr.io/claperco/claper@sha256:4f733dc50b0c77517db402541f88c5489d4c9eedb32ac6c5eef7cadd8a594196`; OCI label points to `3e80ce2` | PostgreSQL 15 | **FAIL:** source SBOM has 115/123 and image SBOM has 81/527 components without license assertions; no signed image or complete upstream attestation. |
| ClassQuiz snapshot | [`4d1f1d3`](https://github.com/mawoka-myblock/ClassQuiz/tree/4d1f1d31653752718cd41b13ca7820621f5626a7), [MPL-2.0](https://github.com/mawoka-myblock/ClassQuiz/blob/4d1f1d31653752718cd41b13ca7820621f5626a7/LICENSE) | backend `sha256:ae13b6…` labels different source `b454f37`; caddy `sha256:d36aaf…` labels `4d1f1d3` | PostgreSQL, Valkey, Meilisearch, caddy, locally built frontend | **FAIL:** moving master topology and source/image mismatch; source SBOM has 97/97 and backend-image SBOM 28/260 components without license assertions. |
| QuizDock 0.3.2 | [`5d5e031`](https://github.com/quizdock/quiz-dock/tree/5d5e0319bed814b7e3ee36b06f42538d5efea5d9), [MIT](https://github.com/quizdock/quiz-dock/blob/5d5e0319bed814b7e3ee36b06f42538d5efea5d9/LICENSE) | `docker.io/fchaussin/quizdock@sha256:d3af1033fff017beb060fb52c94caa372e35646cff5b35fb9590313240de67fb`; OCI label points to `5d5e031` | PostgreSQL 16, `redis:7-alpine` | **REJECT:** Redis resolves to disallowed 7.4.10; source SBOM has 396/396 and image SBOM 8/266 components without license assertions. |

The Redis licensing result comes from the [upstream Redis 7.4.10 license](https://github.com/redis/redis/blob/7.4.10/LICENSE.txt),
not a third-party catalog. The current `redis:7-alpine` manifest digest is
`sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2` and its OCI metadata identifies
version 7.4.10. Because the tag is mutable, the released QuizDock Compose file cannot guarantee even this
identity across installations.

`trivy 0.72.0` generated the committed source and exact-digest application-image SBOMs with the `fs` and
`image` subcommands, `--scanners license`, and CycloneDX output. The machine-readable inventory links
each candidate to those files. The license gate decompresses and inspects every reference. Every candidate
must provide readable, identity-bound source and application-image evidence whose recorded total and
missing-license counts match the SBOM contents. A passing candidate additionally requires evidence for
every declared runtime component and every discovered component must have an allowlisted FOSS license. Missing license
assertions are treated as unknown and therefore fail closed; a clean
"no forbidden license found" scan is not equivalent to complete proof. `cosign verify` found no signature
for any evaluated application-image digest. These observations are evidence gaps, not allegations that
the unnamed dependencies are non-free.

## Informational scorecard

Scores are 1 (poor/unproved) to 5 (strong source evidence). They are deliberately not totaled into a
winner because the hard gate precedes functional scoring.

| Criterion | Weight | Claper | ClassQuiz | QuizDock | Basis / caveat |
| --- | ---: | ---: | ---: | ---: | --- |
| Formative-mode fit | 20 | 4 | 2 | 2 | Claper models anonymous attendee identifiers and aggregate interactions; the others center nicknames and leaderboards. No live UX replay. |
| QR/PIN browser join | 10 | 4 | 4 | 4 | All have source paths for QR/PIN or join codes. Phone reachability was not tested. |
| Reveal/results controls | 10 | 4 | 4 | 4 | Source contains quiz result/reveal behavior; explanation rendering against the portable schema is unproved. |
| Adapter feasibility | 15 | 2 | 3 | 4 | Claper lacks a documented bulk import; ClassQuiz has an authenticated native archive; QuizDock exposes authenticated quiz/question REST endpoints in [OpenAPI](https://github.com/quizdock/quiz-dock/blob/5d5e0319bed814b7e3ee36b06f42538d5efea5d9/apps/backend/openapi/openapi.json). |
| Kubernetes/operations fit | 15 | 2 | 1 | 3 | Claper's [chart](https://github.com/ClaperCo/Claper/tree/3e80ce2ea25286d1b591ea327acdbfeb31fa33e3/charts/claper) is unsafe as-is; ClassQuiz has five moving services; QuizDock has three hardened Compose services but no supported chart. |
| Maintenance/bus factor | 10 | 3 | 3 | 1 | GitHub contributor data shows one dominant maintainer for each; QuizDock was created in June 2026 and had one contributor at observation time. |
| Privacy/retention fit | 10 | 3 | 1 | 1 | Nicknames, scores, and archived session data need explicit suppression/purge. Policy behavior was not live-tested. |
| Supply-chain evidence | 10 | 1 | 1 | 1 | No candidate passed complete license provenance or image-signature checks. |

### Measurement ledger

| Story criterion | Evidence produced | Honest result |
| --- | --- | --- |
| Setup time and facilitator clicks/context switches | No candidate was eligible to deploy; no UI session was run. | **Not measured.** Must be timed from empty namespace through first reveal. |
| Mobile accessibility and venue reachability | No participant devices or venue network were available to this isolated lane. | **Not measured.** Desktop source inspection is not an accessibility test. |
| 100 participants | ClassQuiz contains an upstream load script, but it was not run against a qualifying Kubernetes runtime. | **Not measured.** No throughput, latency, error, or reconnect claim. |
| Presenter activation, response count, hide/reveal, explanation, reset | Relevant source paths exist, but no end-to-end browser rehearsal was possible after the gate failed. | **Source-reviewed only.** Every behavior remains an acceptance task. |
| Privacy and retention | Source shows attendee identifiers or nicknames, scores, Redis TTLs, and optional archives/exports. | **Partial inventory only.** Aggregate-only display and complete purge remain unproved. |
| Export and offline fallback | Candidate source contains result exports; the repo-owned prototype generated separate participant/facilitator files. | **Offline prototype passed; candidate exports not replayed.** |
| Operations and resource use | Upstream Compose/chart topology was inspected; no pods ran. | **Complexity estimated, resources not measured.** |
| Theming | QuizDock documents runtime branding; no candidate UI was themed. | **Not measured and not selection-relevant before the gate.** |
| Maintenance and bus factor | GitHub API snapshot: Claper 773 stars/145 forks/one dominant maintainer; ClassQuiz 707/168/one dominant maintainer; QuizDock 1/1/one contributor and created 2026-06-09. | **Measured repository snapshot, not a sustainability guarantee.** |
| Dependency/supply-chain risk | Exact source/image identity, CycloneDX gaps, mutable tags, chart issues, and signature absence were recorded. | **Measured enough to fail all candidates; not a vulnerability acceptance scan.** |

## Adapter and offline rehearsal

The portable schema has one representative question for Pod lifecycle (S05), Service endpoint diagnosis
(S07), and GatewayClass ownership (S09). AJV 8.17.1 enforces `questions.schema.json` as the structural
source of truth while the validator adds cross-field and canonical-section rules.
`node --test scripts/quiz/quiz.test.mjs` proves:

- stable and unique section/question IDs and a single valid answer;
- non-empty banks/references and correctly formed option IDs;
- three to five options with distractor rationale;
- participant export excludes answers while facilitator export includes answer and reasoning;
- all adapter previews preserve stable IDs and explicitly report `productionReady: false`; and
- the license gate cannot mark a forbidden or unknown runtime as passing.

Import feasibility is based on exact source: ClassQuiz's
[authenticated import endpoint](https://github.com/mawoka-myblock/ClassQuiz/blob/4d1f1d31653752718cd41b13ca7820621f5626a7/classquiz/routers/eximport.py)
expects its native archive; QuizDock provides authenticated REST creation; Claper exposes internal context
functions but no stable documented bulk-import contract. The spike therefore generates mapping metadata,
not payloads falsely presented as tested imports.

## Kubernetes attempt and measured limits

No candidate survived the license gate, so deploying one would invert the required gate order. The local
Docker socket was unavailable (`/var/run/docker.sock` absent), and no isolated local kind cluster was
running. The Ubuntu lab host was intentionally not touched because its lab lane owned and then destroyed
that cluster. Existing corporate kubeconfig contexts were not used.

Consequently, the following are **not measured**: Kubernetes setup time, resource use, Gateway/Ingress,
TLS, WebSockets, persistence, upgrades, pod restart, teardown, diagnostics, 100 clients, mobile
accessibility, facilitator click count, or venue-network reachability. Source files and upstream claims do
not substitute for those acceptance runs.

## Recommended future topology

If and only if a candidate clears the gate, run it in a dedicated namespace on a facilitator-owned remote
cluster, behind Envoy Gateway with TLS and a stable room URL. Keep application, database, and optional
cache private; expose only the HTTP/WebSocket service. Store credentials in Secrets, apply restricted pod
security, NetworkPolicies, resource limits, probes, and a cohort-scoped retention job. The facilitator is
the operations and data owner. Never put the canonical service in the learner kind cluster.

Participant devices should need only a browser and an ephemeral room code. Prefer no nickname at all; if
the selected application requires one, generate a random session alias, do not display a leaderboard, and
purge aliases, responses, room codes, and exports after the cohort unless retention is explicitly enabled.

## Threat and failure notes

- A short room code can be guessed; rate-limit joins and allow the facilitator to close admission.
- Question text and imported media are untrusted content; prevent stored XSS and outbound fetch abuse.
- WebSocket joins and presenter controls need origin, authorization, and session-separation tests.
- One hundred clients can exhaust connection, database, or cache limits; load and reconnect tests are owed.
- A database/cache outage must fail visibly without losing facilitator control or exposing stale answers.
- Backups conflict with automatic purge; default to no backup of ephemeral cohorts and document any opt-in.
- The static participant/facilitator export is the offline fallback. The facilitator can show or read each
  question, collect hands/cards, then use the facilitator copy for reveal and discussion.

## Residual acceptance tasks

1. Produce complete dependency and base-image license evidence for a reproducible candidate build; pin
   every image by digest, generate image SBOMs, and sign/verify provenance.
2. Rebuild and deploy Claper in an isolated local cluster with a workshop-owned chart; do not reuse its
   upstream chart unchanged. If this cannot close the license gap, reject it.
3. Verify anonymous/no-account mode, aggregate-only display, hidden answer, explanation reveal, reset, and
   full cohort purge with the three prototype questions.
4. Exercise Envoy Gateway, TLS, WebSocket reconnect, pod restart, dependency outage, upgrade/rollback,
   idempotent install, diagnostics, and scoped teardown.
5. Run 100 synthetic clients and record latency/error/reconnect distributions; separately rehearse with
   real phones on the venue network and record accessibility findings and facilitator clicks/time.
6. Review data inventory, retention, logs, exports, telemetry, backups, and incident ownership before the
   operator accepts a successor ADR and US-QUIZ-3 begins.
