# ADR 0001: Build a shared standalone localization hub

- **Status:** proposed
- **Scope:** ownership and repository boundary

## Context

Two workshops need the same extraction, synchronization, review, preview, and release behavior.
Embedding the implementation in either workshop would couple its release cycle and content quirks to
the other. Copying the tooling would immediately create two implementations of the drift problem.

## Options considered

- Build separately in each workshop: locally convenient, globally duplicated.
- Put the implementation in one workshop and consume it from the other: creates accidental ownership
  and biased fixtures.
- Create one standalone product repository with workshop manifests and adapters: a deliberate shared
  platform boundary.

## Decision

Create a standalone `workshop-localization-hub` repository. Workshop repositories contain English
content, stable IDs, terminology, and a render manifest. The hub repository contains product code,
contracts, fixtures, deployment definitions, and its own ADRs.

## Consequences

The hub can version independently and serve additional workshops. Cross-repository compatibility and
release coordination become explicit responsibilities. The current workshop remains the place for
ADR 0014 and integration acceptance, not for the platform implementation.

