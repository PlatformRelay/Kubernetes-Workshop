---
layout: section-cover
day: Day 1
section: '07'
tier: core
track: Core
---

# Service

Red line 3/5 · Give Pods a stable address; debug selector → endpoint routing.

**core** · suggested Day 1 · Core track

<!--
Stub (M2). Author full content per the outline section S07;
timing target: 30 min slides + 30 min lab.
CKx tie-in: CKAD & CKA Services & Networking.
-->

---
layout: lab
lab: labs/day-1/07-service.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 07 — Expose & debug routing

- Expose the Deployment and curl it via DNS from a temp Pod
- Break the selector, watch endpoints empty, fix it
