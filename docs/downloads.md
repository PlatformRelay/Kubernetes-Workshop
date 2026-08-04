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

Example pins from **`v0.3.0-beta.1`** (controlled beta):

- [Day 1 PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.3.0-beta.1/kubernetes-workshop-day-1-v0.3.0-beta.1.pdf)
- [Day 2 PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.3.0-beta.1/kubernetes-workshop-day-2-v0.3.0-beta.1.pdf)
- [Day 3 PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.3.0-beta.1/kubernetes-workshop-day-3-v0.3.0-beta.1.pdf)
- [Full / 3-day PDFs and site zip](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/tag/v0.3.0-beta.1)

Pre-release notes always prepend [beta limitations](./beta-limitations.md). How tags are
cut: [release.md](./release.md).

## Labs & quizzes

| Resource | Link |
| --- | --- |
| Participant labs | [labs/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/labs#readme) |
| Lab 00 (start here) | [labs/day-1/00-setup.md](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/labs/day-1/00-setup.md) |
| Quiz prototype | [quiz/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz#readme) |
