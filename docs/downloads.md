# Live decks & PDF downloads

## Interactive Slidev decks

These are the always-current GitHub Pages builds (hash-routed under `/deck/` so slide
navigation and hard refreshes work on project Pages).

| Deck | URL |
| --- | --- |
| **Documentation home** (this site) | <https://platformrelay.github.io/Kubernetes-Workshop/> |
| Full content **superset** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/> |
| Canonical **3-day cut** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/3day/> |
| **Day 1** entry | <https://platformrelay.github.io/Kubernetes-Workshop/deck/day-1/> |
| **Day 2** entry | <https://platformrelay.github.io/Kubernetes-Workshop/deck/day-2/> |
| **Day 3** entry | <https://platformrelay.github.io/Kubernetes-Workshop/deck/day-3/> |
| **Template gallery** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/templates/> |
| **Self-check quiz** | <https://platformrelay.github.io/Kubernetes-Workshop/quiz/> |

Deep-link to a slide with a hash fragment, for example
`…/deck/day-1/#/5` for slide 5 of Day 1.

Compatibility redirects: legacy `/3day/` and `/templates/` paths forward to the `/deck/…`
locations above.

## PDF downloads

Every `v*` GitHub Release publishes PDF exports (and an offline site zip). Prefer the
**latest release** page so links stay current across tags:

- **All release assets:** [GitHub Releases](https://github.com/PlatformRelay/Kubernetes-Workshop/releases)
- **Latest (may be a pre-release):** [Releases · latest](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/latest)

Typical artifact names (tag substituted for `<tag>`):

| Artifact | Contents |
| --- | --- |
| `kubernetes-workshop-day-1-<tag>.pdf` | Day 1 live entry |
| `kubernetes-workshop-day-2-<tag>.pdf` | Day 2 live entry |
| `kubernetes-workshop-day-3-<tag>.pdf` | Day 3 live entry |
| `kubernetes-workshop-full-<tag>.pdf` | Compatibility superset |
| `kubernetes-workshop-3day-<tag>.pdf` | Compatibility three-day cut |
| `kubernetes-workshop-site-<tag>.zip` | Offline HTML bundle |

Example pins from **`v0.6.0`**:

- [Day 1 PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.6.0/kubernetes-workshop-day-1-v0.6.0.pdf)
- [Day 2 PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.6.0/kubernetes-workshop-day-2-v0.6.0.pdf)
- [Day 3 PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.6.0/kubernetes-workshop-day-3-v0.6.0.pdf)
- [Full / 3-day PDFs and site zip](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/tag/v0.6.0)

Pre-release tags still prepend [known limitations](./beta-limitations.md) to the release
notes body. How tags are cut: [release.md](./release.md).

## Labs & quizzes

| Resource | Link |
| --- | --- |
| Participant labs | [labs/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/labs#readme) |
| Lab 00 (start here) | [labs/day-1/00-setup.md](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/labs/day-1/00-setup.md) |
| Self-check quiz (in the browser) | <https://platformrelay.github.io/Kubernetes-Workshop/quiz/> |
| Question bank | [quiz/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz#readme) |

### Self-check quiz

Pick an answer and see straight away whether it holds, with the explanation and — when you miss —
why that distractor was tempting. Deep-link to one section with a hash fragment, for example
`…/quiz/#S05`.

It runs entirely in your browser: **no account, no backend, nothing stored, nothing uploaded**, and
the score is gone on reload. It is a **self-check, not an exam** — the answers ship inside the static
files, so anyone can read them, and no obfuscation will be added to pretend otherwise
([ADR 0015](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/docs/decisions/0015-static-self-check-quiz-player.md)).

For a room with no internet, or for a show of hands, the printable participant/facilitator Markdown
export from the same question bank remains the fallback.
