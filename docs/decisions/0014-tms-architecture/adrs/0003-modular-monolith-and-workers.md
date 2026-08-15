# ADR 0003: Start with a modular monolith and isolated workers

- **Status:** proposed
- **Scope:** runtime decomposition

## Context

The system coordinates a strongly consistent workflow while also running expensive, failure-prone
parsers and workshop builds. Premature microservices would multiply distributed-state and local-test
cost without proven independent scaling needs.

## Options considered

- CI-only scripts: excellent first delivery mechanism, insufficient collaboration visibility.
- Microservices per capability: flexible scaling, excessive operational and consistency burden.
- Modular monolith plus asynchronous workers: cohesive domain transactions with isolated heavy jobs.

## Decision

Use one modular application/API backed by PostgreSQL and a durable queue. Run parsing, composition,
rendering, and inspection in separately scalable workers, with rendering in hardened disposable
sandboxes. Enforce module boundaries in code and architecture tests.

## Consequences

Local development and migrations remain approachable. The application is a deployment unit and must
be designed for rolling upgrades. Modules may be extracted only after profiling demonstrates a need.

