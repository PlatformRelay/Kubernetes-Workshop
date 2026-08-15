# ADR 0008: Permit governed, revision-bound slide overrides

- **Status:** proposed
- **Scope:** locale-specific structure

## Context

Translated text can overflow or require different pedagogical structure. Pure substitution cannot
split a slide. Full locale trees solve layout by creating pervasive forks.

## Options considered

- Never permit structural differences: forces clipping or degraded prose.
- Fork the entire locale deck: flexible and drift-prone.
- Permit explicit replacement of one stable source slide with one or more locale slides.

## Decision

Overrides are first-class versioned objects bound to a source slide ID and source revision/hash. They
require locale ownership, rationale, protected-content validation, linguistic review, visual review,
and automatic invalidation on source change. The system reports override rates and repeated layout
patterns.

## Consequences

Locales can remain readable without forking the library. Overrides are still small forks and impose
review cost. High override concentration is treated as evidence to improve shared layouts.

