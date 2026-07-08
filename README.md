# Kubernetes Practitioner Workshop

An open source, vendor-neutral, 3-day, beginner-friendly Kubernetes workshop:
a [Slidev](https://sli.dev) slide deck plus standalone hands-on labs in Markdown,
roughly 50% presentation and 50% practice.

## Status

Curriculum skeleton. All sections (`S00`–`S27`) exist as toggleable stubs with
matching lab stubs; the reusable layouts, components, and the animation-technology
decision live in the template gallery (`slides-templates.md`). Section content is
authored milestone by milestone (Day 1 first).

## Develop

```bash
pnpm install
pnpm dev                # superset deck (slides.md) at http://localhost:3030
pnpm dev:3day           # canonical 3-day cut (slides-3day.md)
pnpm dev:templates      # template gallery & animation spike
pnpm build              # static build (build:3day / build:templates likewise)
pnpm export             # PDF export (needs playwright-chromium)
```

## Layout

| Path | Purpose |
| --- | --- |
| `slides.md` | **Superset root deck** — imports every section `S00`–`S27` |
| `slides-3day.md` | **Canonical 3-day cut** — same sections, some `hide: true` |
| `slides-templates.md` | Template gallery & animation-technology spike |
| `pages/SNN-topic/` | One self-contained, toggleable section per folder (`index.md`) |
| `labs/day-*/` | Standalone Markdown labs, one per section |
| `layouts/` | Reusable slide layouts (section cover, code walkthrough, lab, …) |
| `components/` | Shared Vue components, incl. animated teaching diagrams |
| `public/icons/` | Curated official Kubernetes/CNCF artwork (see its README) |
| `docs/decisions/` | Decision records |

Toggling: every section is imported by the root decks with a single `src:` block —
set `hide: true` on that block to drop the whole section from that cut. New cut =
one new `slides-<variant>.md`, never copied sections.

Contributor guardrails and authoring rules: [`AGENT.md`](./AGENT.md).
