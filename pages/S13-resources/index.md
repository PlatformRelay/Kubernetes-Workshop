---
layout: section-cover
day: Day 2
section: '13'
tier: core
track: Workloads
---

# Resources & limits

Set requests and limits; reason about scheduling and QoS.

**core** · suggested Day 2 · Workloads track

<!--
Stub (M2). Author full content per the outline section S13;
timing target: 30 min slides + 30 min lab.
CKx tie-in: CKAD & CKA resource management / scheduling.
-->

---
layout: lab
lab: labs/day-2/13-resources.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 13 — Pressure test

- Trigger an OOMKill and read the events
- Inspect QoS classes; hit a `ResourceQuota`
