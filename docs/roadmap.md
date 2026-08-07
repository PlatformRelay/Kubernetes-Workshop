# Roadmap

Where the workshop is heading — a **public summary** for facilitators and
contributors. Statuses use honest vocabulary only: **in progress**, **planned**,
or **exploring**. Nothing here is a commitment, a schedule, or a promise that
work lands by a date. Items listed as shipped live on `main`; everything else is
direction, not delivery.

Internal planning notes (if any) stay out of the published site. This page
summarizes; it does not lead over private trackers.

> **GitOps tool choice is on `main`, not direction.** The GitOps section (S21)
> ships with **Argo CD as the default** and **Flux as a selectable variant**, so
> facilitators can match the tool their room actually uses without forking the
> curriculum. Choose one per delivery with `--gitops argocd|flux`; see
> [running the slides](./run-slides.md).
> [Discuss GitOps tool choice →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/22)

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **in progress** | Active work toward something that is not yet on `main`. |
| **planned** | Intended next work; architecture or sequencing may still be open. |
| **exploring** | Under consideration only — explicitly **not** committed. |

## Direction

### Live quizzes — planned

Per-section retrieval questions plus a self-hosted live-quiz add-on for the room.
A portable question-bank prototype already exists in
[`quiz/`](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz).
The architecture spike evaluated three FOSS live-host candidates and **adopted
none of them (0/3)** — so the live host and full question bank remain **planned**,
with architecture still open.

[Discuss live quizzes →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/21)

### OpenTelemetry — exploring

Optional depth beyond the Prometheus operator path (S23): traces, OTLP, and a
collector as a candidate add-on section. This is **exploring only** — not
committed to the syllabus.

[Discuss OpenTelemetry →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/23)

## Standing debts (referenced, not restated)

These are already documented on dedicated pages; the roadmap only points at them:

- **Windows / WSL2 live validation** — route is contract-tested; live-smoke still
  pending. See [Windows / WSL2](./windows-wsl2.md).
- **Human rehearsal / beta-exit evidence** — paper and CI coverage ahead of a
  full kind-path walk-through. See [Known limitations](./beta-limitations.md),
  the [rehearsal checklist](./rehearsal-checklist.md), and the
  [validation matrix](./validation-matrix.md).

[Discuss standing debts →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/24)

## Feedback

Each item above links to a GitHub Discussion. Use those threads for interest,
trade-offs, and evidence — not as a support queue or a delivery tracker.
