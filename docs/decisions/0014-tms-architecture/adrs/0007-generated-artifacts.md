# ADR 0007: Keep English authoritative and publish generated locale artifacts

- **Status:** proposed
- **Scope:** source of truth and locale distribution

## Context

Facilitators need complete locale decks, labs, quizzes, and PDFs. Hand-maintained locale trees drift;
runtime substitution is insufficient for deterministic export and slide splitting.

## Options considered

- Commit and hand-edit locale trees: familiar but unsafe.
- Apply translations only at runtime: poor export and override behavior.
- Generate immutable locale bundles from English, reviewed targets, and overrides.

## Decision

English workshop content remains authoritative. The hub composes locale source and delivery formats
as content-addressed artifacts. Releases reference immutable source, target, override, toolchain, and
review evidence. Generated files are never edited by hand.

## Consequences

Facilitators receive reproducible complete bundles. Artifact storage and retention become operational
requirements. A later integration decision may expose generated-source pull requests for inspection,
but those files remain derived output.

