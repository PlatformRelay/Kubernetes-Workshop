# ADR 0001: Animation technology for state-transition teaching diagrams

- **Status:** accepted
- **Scope:** all animated teaching diagrams in the deck (rolling update,
  reconciliation, probes → endpoints, scheduling, request routing)

## Context

The workshop deck is code-heavy and leans on animated state transitions to teach
Kubernetes behaviour. Before authoring curriculum we needed to pick one animation
approach, or every section would reinvent its own. As the spike, one canonical
scene — *change a Deployment's image tag → the old Pod terminates, a new Pod on
the new image starts* — was implemented in four technologies, side by side, in
`slides.md` ("The spike" section):

| Variant | Technology | Where |
| --- | --- | --- |
| A | Pure Vue + CSS transitions (`TransitionGroup`) | `components/PodReplaceCss.vue` |
| B | `@vueuse/motion` (spring-physics `v-motion` variants) | `components/PodReplaceMotion.vue` |
| C | `shiki-magic-move` manifest diff + click-driven state component | `components/PodStateDiagram.vue` |
| D | Mermaid state diagram (static baseline) | inline in `slides.md` |

All variants share one timeline (`components/usePodReplace.ts`) and one visual
vocabulary (`components/PodCard.vue`) so the comparison isolates the animation
technology itself.

## Comparison

| Criterion | A · Vue + CSS | B · @vueuse/motion | C · magic-move + component | D · Mermaid |
| --- | --- | --- | --- | --- |
| Readability while presenting | high — enter/leave/move all animate | high — nicest easing | high — code and state move together | low — sequence must be inferred |
| Authoring effort | low–medium: one component + ~30 lines of CSS | medium: leave/list animations need extra wiring beyond `v-motion` | low: fenced code blocks plus a small component | very low |
| Reusability | high: components with a `step`/state prop compose anywhere | medium: directives attach per element; harder to package as a reusable diagram | high: pattern works for any manifest-driven transition | medium: copy-paste diagrams |
| PDF / static export | good: renders a clean static state per page | poor: `:initial` states can be captured mid-animation; springs never render | good: every click step exports as its own page | perfect: inherently static |
| Performance / dependencies | zero dependencies, compositor-friendly CSS | extra runtime dependency (~popmotion) | built into Slidev | built in |
| Sync with slide clicks | yes — bind `:step="$clicks"` | awkward — motion variants are not click-indexed | native — magic-move consumes clicks | n/a |

## Decision

**Standardize on C + A:**

1. When a **manifest change causes the transition** (the common teaching case),
   use `shiki-magic-move` for the YAML diff and pair it with a **pure Vue + CSS**
   state component bound to the slide's clicks
   (`<PodStateDiagram :step="$clicks" />` is the reference implementation).
   Code and cluster state then advance in lockstep with the presenter's clicks,
   and every step survives PDF/static export as its own page.
2. For **self-contained scenes** with no manifest on the slide, use a pure
   Vue + CSS component (`TransitionGroup` + transition classes), optionally with
   a replay button (`PodReplaceCss.vue` is the reference implementation).
3. **Mermaid** remains for *static* structure only, per the authoring rules.
4. **`@vueuse/motion` is not adopted.** The spring easing is pleasant but does
   not outweigh an extra runtime dependency, weak click integration, and poor
   export fidelity. The dependency stays in `package.json` only while the spike
   slide exists and is removed when the spike is retired.

### Component contract (feeds US-X1/US-X2/US-X3)

Reusable animated diagrams must:

- expose a numeric `step` prop so slides can bind `$clicks` (no internal timers
  required for classroom use; replay timers are optional sugar),
- render a meaningful static state for any fixed `step` (export fidelity),
- reuse the shared visual vocabulary (`PodCard`, `kw-*` CSS variables) instead of
  redefining colors and shapes.

## Consequences

- The rolling-update (US-X2), reconciliation (US-X1), and service-routing
  (US-X3) components will be written as click-driven Vue + CSS components.
- No animation library enters the toolchain; upgrades stay Slidev-only.
- Printed/exported decks degrade gracefully: magic-move steps become sequential
  pages, components render their per-step static state.
