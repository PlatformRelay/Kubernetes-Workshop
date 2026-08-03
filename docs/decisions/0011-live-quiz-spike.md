# ADR 0011: Defer live-quiz adoption until a complete FOSS runtime passes

- **Status:** proposed
- **Scope:** live section-quiz delivery, portable question ownership, and the deployment topology that
  US-QUIZ-2 and US-QUIZ-3 may build on.

## Context

The workshop needs anonymous formative checks for up to 100 participants, with live aggregate results
and answer discussion. The runtime must be entirely free and open source: Business Source License,
SSPL, Commons Clause, source-available, unknown/unlicensed, and proprietary required services are hard
failures. The canonical service would run in a facilitator-owned Kubernetes namespace so learner
cluster resets cannot remove it; local kind is only a development option.

The spike inspected Claper 2.5.1, a ClassQuiz master snapshot, and QuizDock 0.3.2. Exact source, image,
license, SBOM, scoring, and rehearsal evidence is recorded in
[the spike results](evidence/0011-live-quiz-spike/results.md). A portable three-section prototype lives
under [`quiz/`](../../quiz/README.md).

## Options considered

### Adopt Claper

Claper is the closest functional and operational fit: it supports QR participation, attendee identifiers,
quiz responses, aggregate reporting, and a PostgreSQL-backed container. Its AGPL-3.0 application license
is acceptable. However, the release does not provide a complete dependency-license attestation, the
published image is unsigned, and the upstream Kubernetes chart uses `latest`, hard-coded production
values, and a removed HPA API. The hard license gate therefore remains unproven.

### Adopt ClassQuiz

ClassQuiz is MPL-2.0 and has active development, a documented self-hosted stack, a native quiz archive,
live results, and a load-test script. Its canonical UX is nickname/leaderboard competition rather than
anonymous aggregate formative feedback. The stack also mixes a locally built frontend with mutable
`master` and third-party image tags; the evaluated backend image was built from a different source
commit than the repository snapshot. Complete runtime license provenance is absent.

### Adopt QuizDock

QuizDock has the cleanest REST adapter surface and a small MIT-licensed application image, but it is a
very young, single-maintainer project. More decisively, its production stack references mutable
`redis:7-alpine`; on the observation date that resolved to Redis 7.4.10 under RSALv2/SSPL, which the
workshop policy explicitly rejects. Substituting Valkey may work but is an unverified fork of the runtime
topology, not evidence about the released candidate.

### Keep the repository schema and offline delivery while the gate is unresolved

This avoids proprietary lock-in and permits section-question authoring and review to proceed. It does not
provide live room feedback until a runtime passes the gate and operational acceptance tests.

## Decision

Do not adopt or deploy any evaluated candidate yet. All three fail the complete-runtime FOSS gate, so
functional scores cannot override the result and no `quiz-live` add-on is created by this spike.

1. Keep quiz content outside Slidev in the versioned JSON schema under `quiz/`.
2. Maintain separate participant and facilitator offline exports as the graceful fallback.
3. Re-evaluate Claper first after producing a complete dependency-license report from an immutable,
   reproducible image build. This is a review order, not a product selection.
4. Reject QuizDock's released topology while it requires Redis 7.4+ under RSALv2/SSPL. A Valkey-based
   fork must pass compatibility, load, license, and upgrade tests as a distinct candidate.
5. US-QUIZ-3 remains blocked. A future acceptance run must deploy the surviving candidate in an isolated
   facilitator-owned namespace through Gateway API/TLS, then prove WebSockets, anonymous/no-account join,
   hidden-until-reveal aggregate results, explanation reveal, cohort purge, failure recovery, and 100
   simulated clients. Mobile and venue-network checks require real participant devices and are not
   replaceable by synthetic load.

## Consequences

- Question authoring can proceed without binding the curriculum to a service, although the three spike
  questions are examples rather than US-QUIZ-2 section coverage.
- There is no unsupported Kubernetes manifest or false claim that a source-available dependency is FOSS.
- The facilitator must use the generated static/show-of-hands path until a later ADR accepts a runtime.
- Self-hosting still transfers TLS, persistence, upgrade, backup/purge, monitoring, incident response,
  and privacy ownership to the facilitator.
- This proposed ADR becomes accepted only when the operator validates the no-adoption result; a later
  technology selection must supersede it with fresh immutable evidence.
