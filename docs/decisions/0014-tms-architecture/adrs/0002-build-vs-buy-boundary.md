# ADR 0002: Integrate mature TMS products; do not build translator tooling

- **Status:** proposed
- **Scope:** product boundary

## Context

Translation editors, terminology, translation memory, reviewer assignment, machine-translation
suggestions, and contributor management are mature TMS capabilities. Rebuilding them would delay the
workshop-specific value and produce a less usable translator experience.

## Options considered

- Build a complete TMS: maximum control and unjustified product scope.
- Use one TMS directly with repository scripts: quick, but provider-locked and weak on rendered
  workshop review.
- Build a control plane around external TMS products: focused custom behavior with mature editing.

## Decision

The hub will not implement a general translation editor, translation memory, glossary engine, or
machine translation. It will integrate established TMS products and own content extraction,
identity, provider-neutral workflow mapping, composition, rendered review, policy, and release.

## Consequences

Provider availability and API changes are dependencies. A conformance-tested adapter boundary and
portable exports mitigate that risk. Translators retain mature interfaces while maintainers control
workshop correctness.

