---
layout: section-cover
day: Day 1
section: '08'
tier: core
track: Core
---

# Ingress

Red line 4/5 · Expose HTTP north-south through an ingress controller.

**core** · suggested Day 1 · Core track

<!--
Stub (M2). Author full content per the outline section S08;
timing target: 25 min slides + 25 min lab.
CKx tie-in: CKAD & CKA Services & Networking (Ingress).
-->

---
layout: lab
lab: labs/day-1/08-ingress.md
duration: 25 min
env: namespace ✓ / kind ✓ (controller required)
---

## Lab 08 — Route a hostname

- Route a hostname and path to your Service through the controller
- Verify with curl; add a TLS block
