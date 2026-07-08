---
layout: section-cover
day: Day 1
section: '06'
tier: core
track: Core
---

# Deployment

Red line 2/5 · Run and update a Deployment; understand ReplicaSets and rollouts.

**core** · suggested Day 1 · Core track

<!--
Stub (M2). Author full content per the outline section S06;
timing target: 35 min slides + 30 min lab.
CKx tie-in: CKAD Application Deployment; CKA workloads.
-->

---
layout: lab
lab: labs/day-1/06-deployment.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 06 — Rollouts & rollbacks

- Scale, `set image`, then `rollout status/history/undo`
- Watch ReplicaSet churn; break with a bad image and recover
