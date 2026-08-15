# ADR 0009: Separate linguistic and visual approval and fail releases closed

- **Status:** proposed
- **Scope:** review and release policy

## Context

A correct translation can clip, overlap, lose animation meaning, or render with missing glyphs. A
visually fitting slide can still contain incorrect language. Neither review substitutes for the
other.

## Options considered

- TMS review alone: ignores rendered reality.
- Automated layout checks alone: cannot judge language or pedagogy.
- Separate linguistic and visual approvals bound to immutable inputs.

## Decision

Required units need authorized linguistic review; every release composition needs visual approval
after structural and automated render gates. Approval binds to source, target, override, and render
hashes. Release fails closed with stale, missing, fallback, or unapproved required content.

## Consequences

Shipping takes two explicit human judgments and provides defensible quality. Preview builds may use
clearly watermarked fallback; released builds may not. Small teams may assign both roles to one
person, but the audit record preserves both decisions.

