# Proposed ADRs for the standalone repository

These ADRs belong in the future `workshop-localization-hub` repository if the architecture is
accepted. They are kept here during exploration so the choices can be reviewed together. Their
numbering is local to that proposed repository and does not extend the workshop's ADR sequence.

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-standalone-repository.md) | Build a shared standalone localization hub | proposed |
| [0002](0002-build-vs-buy-boundary.md) | Integrate mature TMS products; do not build translator tooling | proposed |
| [0003](0003-modular-monolith-and-workers.md) | Start with a modular monolith and isolated workers | proposed |
| [0004](0004-canonical-model-and-xliff.md) | Use a canonical model and versioned XLIFF portability profiles | proposed |
| [0005](0005-explicit-content-identities.md) | Require explicit immutable content identities | proposed |
| [0006](0006-provider-adapter-contract.md) | Support multiple TMS products through a conformance-tested port | proposed |
| [0007](0007-generated-artifacts.md) | Keep English authoritative and publish generated locale artifacts | proposed |
| [0008](0008-governed-slide-overrides.md) | Permit governed, revision-bound slide overrides | proposed |
| [0009](0009-dual-human-approval.md) | Separate linguistic and visual approval and fail releases closed | proposed |
| [0010](0010-story-driven-test-architecture.md) | Require multi-layer tests for every executable story | proposed |
| [0011](0011-idempotent-event-processing.md) | Use inbox/outbox processing and authoritative reconciliation | proposed |
| [0012](0012-sandbox-untrusted-rendering.md) | Treat parsing and rendering as untrusted execution | proposed |
