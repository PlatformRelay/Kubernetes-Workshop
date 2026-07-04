---
layout: section-cover
day: Day 2
section: '11'
tier: core
track: Workloads
---

# Storage (PV/PVC/StorageClass)

Attach durable storage and reason about the storage stack.

**core** · suggested Day 2 · Workloads track

<!--
Stub (M2). Author full content per the outline section S11;
timing target: 30 min slides + 30 min lab.
CKx tie-in: CKA Storage; CKAD storage.
-->

---
layout: lab
lab: labs/day-2/11-storage.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 11 — Data that survives

- Create a PVC and mount it into a Deployment
- Write data, delete the Pod, confirm the data survives
