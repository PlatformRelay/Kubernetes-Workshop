---
layout: section-cover
day: Day 2
section: '16'
tier: optional
track: Workloads
---

# Autoscaling (HPA)

Scale a workload on demand.

**optional** · suggested Day 2 · Workloads track

<!--
Stub (M2). Author full content per the outline section S16;
timing target: 20 min slides + 20 min lab.
CKx tie-in: CKA autoscaling.
-->

---
layout: lab
lab: labs/day-2/16-hpa.md
duration: 20 min
env: kind ✓ (metrics-server) / namespace: read-only
---

## Lab 16 — Scale under load

- Apply an HPA targeting the Deployment's CPU
- Generate load; watch replicas grow, then settle
