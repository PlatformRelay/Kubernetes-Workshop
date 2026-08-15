# ADR 0006: Support multiple TMS products through a conformance-tested port

- **Status:** proposed
- **Scope:** external translation backends

## Context

The workshops want mature usability and scalability without permanent dependence on one provider.
Provider APIs differ in workflow, IDs, screenshots, webhooks, exports, and rate limits.

## Options considered

- Select one provider and expose its model: simplest implementation, expensive exit.
- Lowest-common-denominator abstraction: portable but discards useful capability.
- Capability-negotiated port with mandatory conformance scenarios.

## Decision

Define a provider-neutral capability contract. Ship a deterministic simulator and at least two
independent production adapters. Each adapter runs the same story-derived conformance suite locally
and against a disposable live project. One provider is authoritative per workshop/locale.

## Consequences

Adapter work is higher, but lock-in and silent API drift decrease. Provider-specific enhancements are
available only through declared capabilities, never through leaked domain types.

