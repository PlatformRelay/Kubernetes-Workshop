---
layout: section-cover
day: Day 2
section: '09'
tier: recommended
track: Core
---

# Gateway API

Red line 5/5 · Route with the Gateway API and explain why it succeeds Ingress.

**recommended** · suggested Day 2 · Core track

<!--
Stub (M2). Author full content per the outline section S09;
timing target: 30 min slides + 25 min lab.
CKx tie-in: CKA includes Gateway API; CKAD networking.
-->

---
layout: lab
lab: labs/day-2/09-gateway-api.md
duration: 25 min
env: kind ✓ / namespace: if CRDs provided
---

## Lab 09 — Gateway & HTTPRoute

- Install the Gateway API CRDs and a controller (kind)
- Create a `Gateway` and an `HTTPRoute`; match by path and header
