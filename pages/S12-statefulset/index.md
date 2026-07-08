---
layout: section-cover
day: Day 2
section: '12'
tier: recommended
track: Workloads
---

# StatefulSet

Run a stateful workload with stable identity and per-Pod storage.

**recommended** · suggested Day 2 · Workloads track

<!--
Stub (M2). Author full content per the outline section S12;
timing target: 30 min slides + 30 min lab.
CKx tie-in: CKA storage & workloads; CKAD storage.
-->

---
layout: lab
lab: labs/day-2/12-statefulset.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 12 — Stable identity

- Deploy a 3-replica StatefulSet with `volumeClaimTemplates`
- Delete a Pod; confirm data and identity survive; observe ordered names
