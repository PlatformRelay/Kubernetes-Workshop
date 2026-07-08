---
layout: section-cover
day: Day 3
section: '18'
tier: recommended
track: Security
---

# NetworkPolicy

Isolate workloads: default-deny, then explicit allows.

**recommended** · suggested Day 3 · Security track

<!--
Stub (M2). Author full content per the outline section S18;
timing target: 25 min slides + 25 min lab.
CKx tie-in: CKA & CKAD Services & Networking (NetworkPolicy).
-->

---
layout: lab
lab: labs/day-3/18-networkpolicy.md
duration: 25 min
env: kind ✓ (policy CNI) / namespace: read-only
---

## Lab 18 — Fence the traffic

- Curl between two apps; apply default-deny and watch it fail
- Add an allow rule; watch it work again
