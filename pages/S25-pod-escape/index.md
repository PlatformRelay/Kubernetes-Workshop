---
layout: section-cover
day: Day 3
section: '25'
tier: recommended
track: Security
---

# Security & pod escape

How weak Pod settings enable escape — and how to prevent it.

**recommended** · suggested Day 3 · Security track

<!--
Stub (M2). Author full content per the outline section S25;
timing target: 35 min slides + 30 min lab.
CKx tie-in: CKA security & hardening.
-->

---
layout: lab
lab: labs/day-3/25-pod-escape.md
duration: 30 min
env: kind-only · strictly defensive
---

## Lab 25 — Escape, then block it

- In a throwaway kind cluster: a controlled escape via a privileged + `hostPath` Pod
- Enable `restricted` PSA; show the same path blocked
