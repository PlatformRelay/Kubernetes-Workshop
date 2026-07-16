---
theme: ./theme
title: Kubernetes Practitioner Workshop
info: |
  Showcase root deck — NOT a delivery cut. A tiny page-range composition over
  the real section library, used only to render the README's animated
  deck-showcase GIF (`pnpm showcase:gif` → scripts/make-showcase-gif.mjs).
  Page ranges reference slide numbers inside each section's index.md; if a
  section is restructured, update the range here (the GIF pipeline fails on a
  dead range, and CI re-renders the GIF on every run).
src: ./pages/S00-welcome/index.md#1
---

---
# S03 · Mental model — reconciliation loop animation
src: ./pages/S03-mental-model/index.md#5
---

---
# S07 · Service — selector → EndpointSlice → Pods animation
src: ./pages/S07-service/index.md#6
---

---
# S16 · HPA — load gauge drives the replica count animation
src: ./pages/S16-hpa/index.md#6
---

---
# S18 · NetworkPolicy — allow-rule manifest magic-move
src: ./pages/S18-networkpolicy/index.md#5
---

---
# S18 · NetworkPolicy — fence animation
src: ./pages/S18-networkpolicy/index.md#8
---
