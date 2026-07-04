# ADR 0003: Deck composition — superset + boil-down over one section library

- **Status:** accepted
- **Scope:** how slides are composed into deliverable decks; how sections are toggled per
  delivery; how multiple delivery variants coexist.

## Context

The workshop teaches more than fits in any single delivery. A 3-day room, a 2-day room, and a
security-focused day all want *different subsets* of the same material. The naive answers —
maintain a separate deck per delivery, or hand-cut slides live before each session — either
duplicate content (and then drift) or make every delivery a fragile manual edit.

We want to author each topic **once**, richly, and compose a schedule from those parts.

## Options considered

1. **One monolithic deck, comment out slides per delivery.** Rejected: no clean unit boundary,
   merge-hostile, and "what's in the 2-day cut" is invisible.
2. **A deck per delivery, copied and pruned.** Rejected: N copies of the Pod section drift the
   moment one is fixed.
3. **A tagging/build-flag system inside one deck** (show/hide slides by tag). Rejected as the
   primary mechanism: tags scatter across slides and don't give a section a self-contained home;
   kept only as a *within-section* tool for optional slides.
4. **One section library + multiple thin root decks that import and toggle sections.** Chosen.

## Decision

- **Section library.** Every topic is a self-contained section at `pages/SNN-topic/index.md`
  (its own divider + content), carrying a **Tier** (`core` / `recommended` / `optional`) and a
  **Suggested day** in frontmatter. A section never references another section's slide numbers.
- **Root decks are mostly includes.** A root deck is headmatter (theme/config) followed by one
  `src:` import block per section:

  ```md
  ---
  src: ./pages/S02-container-security/index.md
  hide: false      # flip to true to drop the whole section at parse time
  ---
  ```

  Slidev merges the import block's frontmatter into every imported slide, so `hide: true` (or
  `disabled: true`) drops the entire section at parse time. Page-range imports
  (`src: ./pages/S07-service/index.md#1,4-6`) are available for partial pulls.
- **Multiple root decks, one library.** `slides.md` imports **every** section (the superset);
  `slides-3day.md` imports only the canonical 3-day cut; `slides-templates.md` is the component
  gallery. A new delivery is **one new `slides-<variant>.md`**, never a copied section.
- **Tiers drive the cut.** The 3-day cut = all `core` + selected `recommended`; `optional` is
  cut first. Keep the outline's section map, the tier tags, and the cover-image numbering in
  sync when sections move.
- **Within a section**, an optional slide may be gated by a Slidev build/`v-if` flag; this is
  the *only* sanctioned use of per-slide toggling, and it never crosses section boundaries.

## Consequences

- Authoring is write-once: a fix to `pages/S05-pod/` lands in every deck that imports it.
- "What's in this delivery" is one readable list of `src:` blocks at the top of a root deck.
- Each root deck must build and export independently (`slidev <file>.md`); this is enforced by
  CI ([0008](0008-validation-and-ci.md)).
- Toggling a `recommended`/`optional` section off must leave both decks building — sections
  therefore cannot hard-link across each other (forward references are made in prose, not via
  slide numbers or shared component state).
- This composition model is the deck-side complement to the paired slide+lab authoring in
  [0004](0004-parallel-slide-and-lab-authoring.md): the lab library toggles the same way.
