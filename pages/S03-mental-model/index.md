---
layout: section-cover
day: Day 1
section: '03'
tier: core
track: Foundations
---

# Kubernetes mental model

Describe the control plane, nodes, and the reconciliation loop.

**core** · suggested Day 1 · Foundations track

<!--
Stub (M2). Author full content per the outline section S03;
timing target: 30 min slides + 20 min lab.
CKx tie-in: CKA Cluster Architecture; CKAD foundations.
-->

---
layout: lab
lab: labs/day-1/03-cluster-tour.md
duration: 20 min
env: namespace ✓ / kind ✓
---

## Lab 03 — Cluster tour

- `kubectl get nodes`, `api-resources`, `explain pod.spec`
- Find the control-plane pods (kind) or describe your namespace (shared)
