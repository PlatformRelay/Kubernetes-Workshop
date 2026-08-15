# ADR 0012: Treat parsing and rendering as untrusted execution

- **Status:** proposed
- **Scope:** security boundary for workshop content

## Context

The hub accepts repository archives and invokes repository-defined build tooling. Markdown/Vue
parsing, package scripts, image decoders, browsers, and PDF exporters have large attack surfaces.
Translation review does not establish code safety.

## Options considered

- Render inside application workers: operationally easy and unsafe.
- Trust allow-listed repositories completely: compromised dependencies or pull requests still run.
- Use disposable least-privilege sandboxes for parsing and rendering.

## Decision

Run parsers and renderers in ephemeral sandboxes with pinned images, non-root identity, read-only
inputs/root filesystem, bounded temporary storage, resource/time/process limits, dropped privileges,
no host socket, and denied network by default. Provide only short-lived artifact-upload capability.

## Consequences

Rendering infrastructure is more complex and some workshop builds need adaptation for offline use.
The primary remote-code-execution boundary is explicit, testable, observable, and replaceable.

