---
layout: section-cover
day: Day 3
section: '17'
tier: core
track: Security
---

# Pod security

Harden a Pod; understand Pod Security Standards.

**core** · suggested Day 3 · Security track

<!--
Stub (M2). Author full content per the outline section S17;
timing target: 30 min slides + 25 min lab.
CKx tie-in: CKA security (PSS, securityContext).
-->

---
layout: lab
lab: labs/day-3/17-pod-security.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 17 — Pass `restricted`

- Label a namespace `restricted`; watch a privileged Pod get rejected
- Fix the manifest step by step until it is admitted
