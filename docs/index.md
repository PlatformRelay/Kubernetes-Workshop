---
hide:
  - navigation
  - toc
  - title
---

# Kubernetes Practitioner Workshop

**A free, open-source, vendor-neutral Kubernetes workshop** — Slidev presentations,
ready-to-run labs, and a portable question bank. Use it to learn yourself, to teach
colleagues, or to run a full multi-day delivery. Adapt it, restyle it, redistribute it
under the [0BSD License](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/LICENSE)
(no attribution required).

<p markdown="1">

[![CI](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/ci.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/ci.yml)
[![Pages](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/pages.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/pages.yml)
[![CodeQL](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/codeql.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/PlatformRelay/Kubernetes-Workshop)](https://github.com/PlatformRelay/Kubernetes-Workshop/releases)
[![License: 0BSD](https://img.shields.io/github/license/PlatformRelay/Kubernetes-Workshop)](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/LICENSE)

</p>

**Live decks:** [Day 1](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-1/) ·
[Day 2](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-2/) ·
[Day 3](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-3/) ·
[3-day cut](https://platformrelay.github.io/Kubernetes-Workshop/deck/3day/) ·
[Superset](https://platformrelay.github.io/Kubernetes-Workshop/deck/)

[Interactive decks :octicons-arrow-right-24:](downloads.md#interactive-slidev-decks){ .md-button .md-button--primary }
[PDF downloads :octicons-download-24:](downloads.md#pdf-downloads){ .md-button }
[Self-check quiz :octicons-checklist-24:](https://platformrelay.github.io/Kubernetes-Workshop/quiz/){ .md-button }
[Run locally :octicons-terminal-24:](run-slides.md){ .md-button }

## Why this workshop

| | |
| --- | --- |
| **Free** | No paywall, no account, no telemetry. Clone it and go. |
| **Teach-ready** | Decks + labs + facilitator notes so you can explain Kubernetes to colleagues. |
| **Hands-on** | Standalone Markdown labs (about half the time) with copy-pasteable commands. |
| **Flexible delivery** | Solo learning, a single afternoon, or a canonical three-day cut. |
| **Many formats** | Live Slidev in the browser, local Node.js preview, and downloadable PDFs. |
| **Yours to adapt** | Restyle the theme, reorder sections, fork or sell freely under 0BSD. |

## Start here

| Goal | Go to |
| --- | --- |
| Preview the slides in the browser | [Live decks](downloads.md#interactive-slidev-decks) |
| Download PDF handouts | [PDF downloads](downloads.md#pdf-downloads) / [GitHub Releases](https://github.com/PlatformRelay/Kubernetes-Workshop/releases) |
| Run Slidev on your laptop | [Run the slides locally](run-slides.md) |
| Do the labs | [Labs guide](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/labs#readme) · [Lab 00 setup](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/labs/day-1/00-setup.md) |
| Stand up a local kind cluster | [Local kind setup](setup.md) |
| Check yourself on a section | [Self-check quiz](https://platformrelay.github.io/Kubernetes-Workshop/quiz/) (in the browser; nothing stored) |
| Read or reuse the question bank | [Quiz README](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz#readme) |
| See the full section map | [Syllabus](syllabus.md) |
| Facilitate a room | [Facilitator guide](facilitator-guide.md) |

## Curriculum spine

The red line grows one app step by step:

**Pod → Deployment → Service → Ingress → Gateway API**

Later topics (config, storage, probes, security, Helm, GitOps, operators) hang off that
same workload. Full map: [syllabus](syllabus.md).
