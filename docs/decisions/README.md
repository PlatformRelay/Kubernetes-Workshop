# Architecture Decision Records

This directory holds the workshop's Architecture Decision Records (ADRs): the big,
hard-to-reverse choices about how the deck, the labs, the example code, and the workshop
environment are structured. An ADR captures the **context**, the **options considered**, the
**decision**, and its **consequences**, so a later contributor understands *why* the repo is
shaped the way it is — not just *what* it looks like.

## Conventions

- One file per decision: `NNNN-kebab-title.md`, numbered sequentially.
- Each ADR carries a **Status**: `proposed` · `accepted` · `superseded by NNNN` · `deprecated`.
- Keep them short and specific. An ADR records a decision; it is not documentation. When a
  decision changes, add a new ADR that supersedes the old one rather than rewriting history.
- ADRs are **tracked** (unlike the local planning material in `agent-context/`). They are the
  durable, public record of the workshop's structure.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-animation-technology.md) | Animation technology for state-transition diagrams | accepted |
| [0002](0002-repository-and-content-structure.md) | Repository and content structure | accepted |
| [0003](0003-deck-composition-superset-and-boil-down.md) | Deck composition: superset + boil-down over one section library | accepted |
| [0004](0004-parallel-slide-and-lab-authoring.md) | Slides and exercises are authored in parallel as a paired unit | accepted |
| [0005](0005-lab-manifests-and-example-code-layout.md) | Lab manifests and example-code layout | accepted |
| [0006](0006-workshop-environment-and-iac.md) | Workshop environment provisioning and IaC | accepted |
| [0007](0007-kubernetes-currency-and-version-pinning.md) | Kubernetes currency and version-pinning policy | accepted |
| [0008](0008-validation-and-ci.md) | Validation and CI strategy | accepted |

## Template

```md
# ADR NNNN: <title>

- **Status:** proposed | accepted | superseded by NNNN
- **Scope:** <what this decision governs>

## Context
<the forces at play; why a decision is needed now>

## Options considered
<the alternatives, with tradeoffs>

## Decision
<what we chose and the concrete rules that follow>

## Consequences
<what becomes easier, what becomes harder, what must stay in sync>
```
