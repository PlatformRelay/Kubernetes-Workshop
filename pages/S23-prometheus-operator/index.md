---
layout: section-cover
day: Day 3
section: '23'
tier: recommended
track: Operators
---

# Prometheus Operator

See an operator manage a real system; learn observability basics.

**recommended** · suggested Day 3 · Operators track

<!--
Stub (M2). Author full content per the outline section S23;
timing target: 30 min slides + 25 min lab.
CKx tie-in: CKA/CKAD observability (metrics, monitoring).
-->

---
layout: lab
lab: labs/day-3/23-prometheus.md
duration: 25 min
env: kind-only / namespace: read-only
---

## Lab 23 — Scrape your app

- Add a `ServiceMonitor` selecting your app's Service
- See the target scraped; run one PromQL query
