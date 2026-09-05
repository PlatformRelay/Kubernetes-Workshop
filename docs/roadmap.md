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
>
> [Discuss GitOps tool choice →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/22)

> **OpenTelemetry scope is decided, not direction.** OpenTelemetry is covered as
> **concepts inside the Prometheus operator section (S23)**: OTLP as the wire
> protocol and the collector as a pipeline shape, with traces named but not
> exercised. No dedicated section, lab, or environment add-on is planned; the
> decision and the conditions that would reopen it are recorded in
> [ADR 0013](./decisions/0013-opentelemetry-scope.md).
>
> [Discuss OpenTelemetry →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/23)

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **in progress** | Active work toward something that is not yet on `main`. |
| **planned** | Intended next work; architecture or sequencing may still be open. |
| **exploring** | Under consideration only — explicitly **not** committed. |

## Direction

### Live quizzes — planned (host only; the learner self-check is on `main`)

Per-section retrieval questions ship as a portable bank in
[`quiz/`](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz),
and learners answer them today in the
[static self-check quiz](https://platformrelay.github.io/Kubernetes-Workshop/quiz/)
published beside the decks — no host, no account, no backend, nothing stored.
That player is a **self-check, not an exam**: the answers ship inside the static
files, and the workshop does not claim otherwise
([ADR 0015](./decisions/0015-static-self-check-quiz-player.md)). The printable
facilitator/participant Markdown export stays the offline and show-of-hands path.

What remains direction is the **live room** picture — one facilitator seeing how
the room answered. The architecture spike evaluated three FOSS live-host
candidates and **adopted none of them (0/3)**, so the self-hosted live quiz
add-on remains **planned**, with host architecture still open.

[Discuss live quizzes →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/21)

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
