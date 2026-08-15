# ADR 0011: Use inbox/outbox processing and authoritative reconciliation

- **Status:** proposed
- **Scope:** asynchronous integration reliability

## Context

Git and TMS events can be duplicated, delayed, lost, or delivered out of order. Workers can fail
between an external side effect and acknowledgement. Assuming exactly-once delivery creates silent
divergence.

## Options considered

- Process webhooks immediately in delivery order: simple and incorrect under normal failures.
- Poll every provider fully: reliable but slow and wasteful.
- Durable inbox/outbox, idempotent commands, webhook-triggered cursor reconciliation.

## Decision

Persist and verify incoming envelopes before processing. Deduplicate by provider/event identity and
payload digest. Use a transactional outbox for external commands and stable idempotency keys. Treat
webhooks as hints; fetch authoritative changes through resumable provider cursors. Reconcile fully on
demand and periodically.

## Consequences

The database and queue schema are more involved. Retries and replay become safe, ordering assumptions
disappear, and operators can inspect a complete event timeline.

