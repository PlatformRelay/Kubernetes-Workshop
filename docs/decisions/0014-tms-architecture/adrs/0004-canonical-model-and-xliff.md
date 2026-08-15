# ADR 0004: Use an internal canonical model and versioned XLIFF portability profiles

- **Status:** proposed
- **Scope:** localization data representation

## Context

The domain needs stable identities, source/context revisions, protected inline codes, review states,
and portable provider integrations. A provider-native schema would leak throughout the product;
invented YAML would discard decades of localization interoperability.

## Options considered

- Provider-native records: lowest first-adapter effort and strongest lock-in.
- XLIFF as database schema: portable but awkward for domain queries and transitions.
- Small canonical domain model with versioned XLIFF profiles for portable archive/import/export.

## Decision

Store a canonical localization model optimized for domain invariants. Define a lossless archival
profile targeting XLIFF 2.1 for import/export, migrations, and recovery snapshots. Provider adapters
may use native APIs or a separately declared supported XLIFF profile and must retain unsupported
metadata in the hub. Validate each profile against published schemas plus project-specific
Schematron/semantic rules.

## Consequences

Mappings and any profile downgrade must be tested. Portability, inline-code safety, metadata,
workflow state, and future provider support improve. Archival XLIFF round-trip conformance becomes a
release gate; provider feature claims remain adapter-conformance concerns.
