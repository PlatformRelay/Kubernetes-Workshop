# ADR 0010: Require multi-layer tests for every executable story

- **Status:** proposed
- **Scope:** test strategy and traceability

## Context

This product crosses parsers, asynchronous state, external providers, browser rendering, and release
policy. Line coverage cannot show that a translator or facilitator outcome works, and end-to-end tests
alone are slow and diagnostically weak.

## Options considered

- Conventional unit/integration tests without story traceability.
- Mostly end-to-end tests: realistic but brittle and slow.
- Executable stories bound to a deliberately layered test architecture.

## Decision

Every user story has domain acceptance, adapter conformance for every production TMS, and public
interface end-to-end coverage, plus relevant property, visual, reliability, and security tests. CI
generates a traceability report. Critical policy modules require complete branch coverage and targeted
mutation testing.

## Consequences

Feature work includes meaningful test design up front. The suite is larger but failures localize
better, adapters remain substitutable, and release evidence maps directly to user outcomes.

