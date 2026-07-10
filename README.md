# Kubernetes Practitioner Workshop

An open source, vendor-neutral, 3-day, beginner-friendly Kubernetes workshop:
a [Slidev](https://sli.dev) slide deck plus standalone hands-on labs in Markdown,
roughly 50% presentation and 50% practice.

## Status

Curriculum skeleton with a finished master theme. All sections (`S00`–`S27`)
exist as toggleable stubs with matching lab stubs. The deck's design system —
a local Slidev theme with layouts, components, and code-annotation patterns —
lives in `theme/` and is showcased slide by slide in the template gallery
(`slides-templates.md`). Section content is authored milestone by milestone
(Day 1 first).

## Develop

```bash
pnpm install
pnpm dev                # superset deck (slides.md) at http://localhost:3030
pnpm dev:3day           # canonical 3-day cut (slides-3day.md)
pnpm dev:templates      # template gallery & animation spike
pnpm build              # static build (build:3day / build:templates likewise)
pnpm export             # PDF export (needs playwright-chromium)
pnpm lint               # markdownlint the labs (lint:fix to auto-correct)
```

## Layout

| Path | Purpose |
| --- | --- |
| `slides.md` | **Superset root deck** — imports every section `S00`–`S27` |
| `slides-3day.md` | **Canonical 3-day cut** — same sections, some `hide: true` |
| `slides-templates.md` | Template gallery & animation-technology spike |
| `pages/SNN-topic/` | One self-contained, toggleable section per folder (`index.md`) |
| `labs/day-*/` | Standalone Markdown labs, one per section |
| `theme/` | **Local Slidev theme** — master styles, layouts, and UI components |
| `components/` | Deck-level Vue components (animated teaching diagrams) |
| `global-bottom.vue` | Global chrome: footer, page number, progress bar |
| `public/icons/` | Curated official Kubernetes/CNCF artwork (see its README) |
| `docs/decisions/` | Decision records |

Toggling: every section is imported by the root decks with a single `src:` block —
set `hide: true` on that block to drop the whole section from that cut. New cut =
one new `slides-<variant>.md`, never copied sections.

## Continuous integration & publishing

Three GitHub Actions workflows (`.github/workflows/`):

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | PR + push to `main` | Lint the labs and build all three root decks — a broken deck or malformed lab fails the check. |
| `pages.yml` | push to `main` (+ manual) | Build the decks as a static site and deploy to GitHub Pages. |
| `release.yml` | tag `v*` | Export the superset and 3-day decks to PDF and attach them to a GitHub Release. |

**Cut a release** (PDFs only ever come from a version tag):

```bash
git tag v1.0.0
git push origin v1.0.0   # → Release "v1.0.0" with both PDFs attached
```

**Live site** — every push to `main` publishes:

- `<pages-url>/` — full superset deck
- `<pages-url>/3day/` — canonical 3-day cut
- `<pages-url>/templates/` — template gallery

> **One-time repository setup** (two manual steps no workflow can perform):
>
> 1. **Settings → Pages → Build and deployment → Source = "GitHub Actions".**
> 2. The workflows integrate on **`main`** (CI, Pages, and the release tag are
>    all cut from it). Make `main` the repository default branch (Settings →
>    Branches) so PR checks target it and the `github-pages` environment is
>    allowed to deploy — its branch protection defaults to the default branch
>    only. (Alternatively, add `main` to that environment's allowed branches.)

Markdown linting (`pnpm lint`, `markdownlint-cli2`) covers the standalone
`labs/` only. The Slidev deck sources are excluded: markdownlint parses just the
first frontmatter block, so it mis-reads every per-slide `---` separator — there
is no rule toggle that fixes it. See `.markdownlint-cli2.jsonc`.

Contributor guardrails and authoring rules: [`AGENT.md`](./AGENT.md).
