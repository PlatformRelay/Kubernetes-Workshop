---
layout: section-cover
day: Day 2
section: '14'
tier: core
track: Workloads
---

# Health probes

Configure liveness, readiness, and startup probes correctly.

**core** · suggested Day 2 · Workloads track

<!--
Stub (M2). Author full content per the outline section S14;
timing target: 30 min slides + 30 min lab.
CKx tie-in: CKAD Observability (probes); CKA workloads.
-->

---
layout: lab
lab: labs/day-2/14-probes.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 14 — Break the probes

- Break readiness — the Pod leaves the endpoints, zero downtime
- Break liveness — watch the container restart
