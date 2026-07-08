# Kubernetes Practitioner Workshop

An open source, vendor-neutral, 3-day, beginner-friendly Kubernetes workshop:
a [Slidev](https://sli.dev) slide deck plus standalone hands-on labs in Markdown,
roughly 50% presentation and 50% practice.

## Status

Early scaffolding. The deck currently contains the **template gallery and
animation-technology spike** — the reusable layouts, components, and design
decisions that all curriculum content will build on. Curriculum sections and
labs land next.

## Develop

```bash
pnpm install
pnpm dev      # live deck at http://localhost:3030
pnpm build    # static build to dist/
pnpm export   # PDF export (needs playwright-chromium)
```

## Layout

| Path | Purpose |
| --- | --- |
| `slides.md` | Deck entry; later imports `pages/day-*/` modules |
| `layouts/` | Reusable slide layouts (section cover, code walkthrough, lab, …) |
| `components/` | Shared Vue components, incl. animated teaching diagrams |
| `public/icons/` | Curated official Kubernetes/CNCF artwork (see its README) |
| `docs/decisions/` | Decision records |
| `labs/` | Standalone Markdown labs *(coming with milestone M2)* |

Contributor guardrails and authoring rules: [`AGENT.md`](./AGENT.md).
