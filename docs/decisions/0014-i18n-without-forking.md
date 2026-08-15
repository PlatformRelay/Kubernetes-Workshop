# ADR 0014: Internationalization without forking the section library

- **Status:** proposed
- **Scope:** how this workshop ships additional languages for **slides, labs, and quiz**
  without freezing English authoring or treating a full parallel tree as architecture. This ADR
  **catalogues concepts and records emerging requirements**; it does **not** choose a final
  option. A later ADR may accept one design after a spike.

## Context

A community contribution ([PR #55](https://github.com/PlatformRelay/Kubernetes-Workshop/pull/55))
offered a full Brazilian Portuguese (pt-BR) translation. That PR is the right *intent* and the wrong
*shape*: a parallel tree of `pages/` and labs recreates the drift problem
[ADR 0003](0003-deck-composition-superset-and-boil-down.md) already rejected for delivery variants
(one section library, generated root decks).

The corpus is large and mixed. Roughly 28 sections and ~400 Slidev slides combine layout
frontmatter (`heading` / `kicker`), markdown prose, HTML-comment speaker notes, Vue islands, and
fenced YAML/bash. Labs pair the same way. The quiz bank is already structured JSON keyed by
question id. Slidev has no native content i18n ([slidevjs/slidev#1125](https://github.com/slidevjs/slidev/issues/1125)).

### Goals (operator direction, 2026-08-15)

1. **Localize everything** — slides, labs, and quiz — even if the slide path needs complex tooling.
   Quiz/lab-only approaches are useful *spikes*, not the end state.
2. **English markdown stays editable** — ADR 0003 write-once library; no `$t()` key-soup as the
   primary authoring surface.
3. **YAML / bash / kubectl / API kinds / image refs stay English** and identical across locales.
4. **Automatic tracking of stale translation** — when English changes, the matching locale strings
   (or whole overridden slides) are marked for retranslation / human revalidation. No silent drift.
5. **Human validation is mandatory** before a locale string or override is considered shipping-grade
   (AI may draft; humans accept).
6. **Layout reality** — German (and similar) often needs *more* characters than English. String
   substitution alone will overflow some slides. Locales must be able to **replace a whole slide**
   (or split one English slide into several locale slides), not only swap text nodes.

## Elevator pitches

Eight distinct *shapes*. Three are expanded under
[`0014-i18n-options/`](0014-i18n-options/); five stay short-form below. None is accepted here.

1. **Parallel locale trees** — Copy `pages/` (and labs) per language, as #55 did. Fastest ship;
   every English edit must be replayed by hand. This is the failure ADR 0003 already rejected for
   delivery variants.
2. **Inline bilingual markdown** — Both languages live in the same slide (`<Tr>`, `||`, or a
   second `lang:` block). Fine for a two-language talk; a third locale and the section library both
   choke. Overflow still forces duplicated structure.
3. **Keyed templates (`$t()`)** — Replace prose with keys; YAML holds the strings. Slides become
   abstract. Authors stop reading markdown and start hunting keys. The literal "replace only text"
   answer, and the one that freezes *editing*.
4. **Extracted catalogs + generated decks (+ locale overrides)** — Keep English markdown as it is.
   A tool extracts translatable nodes into a sidecar (gettext/XLIFF). Locale decks are generated;
   code fences stay identical. **Fuzzy / needs-review flags** track English churn. Where a
   translation does not fit (or pedagogy must differ), a locale may **override or split** a slide
   by stable id. AI may fill *fuzzy* entries, never the source. Structure sits *on top of* markdown.
5. **Runtime overlay (`?lang=`)** — Same catalogs as (4), applied in the browser instead of
   generating a tree. Nice switcher; PDF export and CI still need a generate pass. Not a different
   source model; override slides still need a generate or dual-entry story.
6. **Caption / subtitle track** — English slides stay English. A sidecar of captions and speaker
   notes. Useful overlay; **does not meet the full-localization goal**.
7. **Quiz and lab prose first** — Localize structured quiz JSON and lab paragraphs first; slides
   later. Strong *incremental spike*; **insufficient alone** if the goal is a full locale workshop.
8. **YAML beats / screenplay rewrite** — Author structure as YAML, render through Vue templates.
   Maximum abstraction; it is a new workshop, not an i18n layer.

## Options considered (short-form)

### Parallel locale trees

**Pitch:** as (1). **Fatal trade-off:** no automatic stale tracking without a custom sync bot;
guaranteed drift. Overflow *is* solvable (you rewrite freely) but at ADR 0003's cost. Not expanded.

### Inline bilingual markdown

**Pitch:** as (2). **Fatal trade-off:** does not scale past two languages; overflow still means
duplicating slide bodies inline. Not expanded.

### Keyed templates (`$t()`)

**Pitch:** as (3). **Fatal trade-off:** freezes authoring. Warning shape:

```md
---
layout: statement
kicker: {{ $t('s00.why.kicker') }}
---

{{ $t('s00.why.body') }}
```

Override/split slides are possible via Vue conditionals, but the day-to-day edit surface is worse.
Not expanded.

### Runtime overlay (`?lang=`)

**Pitch:** as (5). **Fatal trade-off:** presentation variant of catalogs, not a different source
model. Export/CI still generate. See
[01-extracted-catalogs-generated-decks.md](0014-i18n-options/01-extracted-catalogs-generated-decks.md).

### YAML beats / screenplay rewrite

**Pitch:** as (8). **Fatal trade-off:** boils the ocean. Not expanded.

## Options considered (full sketches)

| # | Concept | Meets full localize? | Overflow / new slides? | Stale tracking? | File |
| --- | --- | --- | --- | --- | --- |
| 4 | Catalogs + generate + **locale overrides** | Yes (target) | Yes — override/split by slide id | Yes — fuzzy + review queue | [01-…](0014-i18n-options/01-extracted-catalogs-generated-decks.md) |
| 6 | Caption / subtitle track | No (overlay only) | N/A (English stays) | Partial | [02-…](0014-i18n-options/02-caption-subtitle-track.md) |
| 7 | Quiz and lab prose first | Partial (spike path) | Labs: prose only | Yes on those surfaces | [03-…](0014-i18n-options/03-quiz-and-lab-prose-first.md) |

Canonical English sample every full sketch may rewrite (from
[`pages/S00-welcome/index.md`](../../pages/S00-welcome/index.md)):

```md
---
layout: statement
kicker: Why we're here
---

Three days to take you from **"what is a container"** to confidently
**authoring, running, and operating** core Kubernetes workloads.
```

**Primary direction to study (still not accepted):** option **4** with overrides — catalogs for the
common case, explicit locale slide replacements when German (etc.) cannot fit. Options 6 and 7
remain documented as overlays / spike hedges, not competitors for the full-corpus goal.

### Mature TMS architecture follow-up

The [Workshop Localization Hub architecture pack](0014-tms-architecture/README.md) expands option 4
into a proposed standalone product shared by multiple workshops. Its important correction to this
sketch is that fuzzy tracking, translation memory, terminology, editor UX, and linguistic workflow
should come from an established TMS rather than custom catalog YAML. The custom hub owns the
workshop-specific integration: safe extraction, stable identities, provider portability, overrides,
rendered review, release policy, and evidence.

The pack includes system and deployment diagrams, role-specific journeys, domain and integration
contracts, an executable-story test architecture, operations/security guidance, an incremental
delivery plan, and twelve proposed ADRs for the future standalone repository.

### Critical review and optimized cut (2026-08-15)

An adversarial architecture review of the pack concluded: **excellent domain analysis, premature
product.** Its keepers — explicit immutable identities, the build-vs-buy boundary, English
authoritative with generated artifacts and governed overrides, fail-closed dual approval,
story-driven multi-layer tests — survive unchanged. Its runtime does not: a modular-monolith
service (PostgreSQL, queue, object store, portal, webhook ingestion, SLOs) is speculative
generality for two workshops, ~two maintainers, and zero shipped localization code, and the
"every story × two live TMS adapters" requirement bought lock-in insurance no one can afford to
maintain. XLIFF 2.1 as the canonical format was also inverted: the first TMS target (Weblate)
documents XLIFF 2 and Markdown support as under development while its gettext PO path is its
strongest, so PO becomes the working format and XLIFF an export.

The optimized cut now lives as the standalone repository
**[`PlatformRelay/workshop-i18n`](https://github.com/PlatformRelay/workshop-i18n)** (local:
`../workshop-i18n`): a stateless, git-native TypeScript CLI — extract → PO catalogs → compose
locale trees with governed overrides → staleness report — with all localization state committed
in the consumer workshop repos. Its `docs/adr/0001–0011` supersede this pack's twelve proposed
ADRs (triage recorded there), and its Spec Kit specs 001–004 are the executable form of the four
spikes listed under Acceptance below. A service tier may still be built later; its reversal
trigger (≥3 consumers **and** measured failure of file-based TMS sync) is recorded in that repo's
ADR 0003.

## Cross-cutting (not separate options)

- **AI as draft, not source.** Fill *fuzzy* catalog entries (and draft override prose) with a
  do-not-translate glossary (`Pod`, `Deployment`, `kubectl`, `kind`, image names, flag names).
  Human accepts. Never auto-merge. Never translate fences.
- **Review queue.** English change → extractor marks fuzzy / `needs-review`; CI or a report lists
  outstanding items per locale; shipping a locale with open fuzzy entries is a policy choice
  (fail closed vs English fallback), recorded when accepted.
- **Overflow gate (aspirational).** Prefer catching overflow in CI (e.g. export/screenshot budget
  or layout heuristics) so long German does not silently clip. Exact mechanism is spike work.
- **Weblate / Crowdin** — mature workflow backends behind a conformance-tested adapter boundary, not
  merely a UI and not the owner of workshop composition or release policy.
- **Tagged snapshots** — optional *staleness policy* (locale lags an English tag), not a source
  model.
- **Browser auto-translate** of the Pages site is out.

## Decision

**Direction chosen; final acceptance pending spike evidence.** Option 4's shape — generated
locale artifacts + governed slide overrides, covering slides, labs, and quiz — proceeds as a
**stateless, git-native CLI in the standalone `workshop-i18n` repository** (see the 2026-08-15
critique above), with translations in committed gettext PO catalogs and Weblate consuming them
file-based. The pack's service tier and dual-live-adapter requirement are explicitly **not**
adopted; portability is carried by portable exports plus a conformance-tested port contract.

Do **not** merge a parallel locale tree as the workshop's i18n architecture. Do **not** wrap the
section library in `$t()` keys without an explicit superseding ADR. Do **not** treat quiz/lab-only
or caption-only approaches as the final answer if the goal remains full localization.

Acceptance requires a later ADR after spikes: (1) Slidev extract/reinsert round-trip on one section;
(2) override/split slide composition; (3) fuzzy report + human accept path; (4) fence-identity CI.
These four spikes are now specified as executable Spec Kit features 001–004 in `workshop-i18n`;
their evidence closes this ADR via a short superseding acceptance note rather than a new sketch.

## Consequences

- Contributors can compare shapes with samples instead of rediscovering forks.
- PR #55 can stay open as a *reference* for prose while a language-pack + override landing zone is
  designed.
- Roadmap lists internationalization as **exploring** and points here.
- OpenTofu-Workshop (same Slidev pattern) can reuse this catalog later.
