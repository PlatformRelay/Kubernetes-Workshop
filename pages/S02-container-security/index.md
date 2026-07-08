---
layout: section-cover
day: Day 1
section: '02'
tier: recommended
track: Foundations
---

# Container security & supply chain

Build images that are small, non-root, and scanned — the build-time half of security.

**recommended** · suggested Day 1 · Foundations track

<!--
Stub (M2). Author full content per the outline section S02;
timing target: 30 min slides + 25 min lab.
CKx tie-in: CKAD/CKA security foundations (image hygiene).
-->

---
layout: lab
lab: labs/day-1/02-container-security.md
duration: 25 min
env: local — no cluster needed
---

## Lab 02 — Scan & harden an image

- Scan a known-vulnerable image with Trivy and read the report
- Rebuild it minimal + non-root, re-scan, generate an SBOM
