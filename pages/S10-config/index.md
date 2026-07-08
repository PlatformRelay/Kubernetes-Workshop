---
layout: section-cover
day: Day 2
section: '10'
tier: core
track: Core
---

# ConfigMap & Secret

Inject configuration and secrets; know the caveats.

**core** · suggested Day 2 · Core track

<!--
Stub (M2). Author full content per the outline section S10;
timing target: 25 min slides + 25 min lab.
CKx tie-in: CKAD App Environment & Config; CKA config.
-->

---
layout: lab
lab: labs/day-2/10-config.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 10 — Config in, secrets rotated

- Inject config as env vars and as mounted files
- Create a Secret, rotate a value, trigger a rollout
