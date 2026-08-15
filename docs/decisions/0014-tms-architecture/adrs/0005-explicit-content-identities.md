# ADR 0005: Require explicit immutable content identities

- **Status:** proposed
- **Scope:** slides and translation units

## Context

Paths, line numbers, text hashes, and slide ordinals change during ordinary authoring. Using them as
identity loses translation memory, misapplies stale targets, or invalidates unrelated approvals.

## Options considered

- Source text as identity: convenient until the source changes.
- Derived path/index identity: no author annotation, unstable on moves and insertions.
- Explicit semantic IDs with source and structural hashes as revisions.

## Decision

Every localized slide and unit has an explicit immutable ID. Location is metadata. Source and
structural-context hashes detect revisions. Renames require an alias migration checked for collisions
and one-to-one history.

## Consequences

English authors add small identity annotations and CI rejects missing/duplicate IDs. Translation
continuity survives file moves and insertions. Identity migrations are deliberate reviewable events.

