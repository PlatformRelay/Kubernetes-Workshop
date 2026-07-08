---
layout: section-cover
day: Day 3
section: '19'
tier: optional
track: Security
---

# RBAC

Grant least-privilege access.

**optional** · suggested Day 3 · Security track

<!--
Stub (M2). Author full content per the outline section S19;
timing target: 25 min slides + 25 min lab.
CKx tie-in: CKA & CKAD security (RBAC, ServiceAccounts).
-->

---
layout: lab
lab: labs/day-3/19-rbac.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 19 — Read-only identity

- Create a read-only ServiceAccount with Role + RoleBinding
- Verify with `kubectl auth can-i` and `--as`
