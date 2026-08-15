# ADR 0014 option sketches

Full concept sketches referenced from
[ADR 0014](../0014-i18n-without-forking.md). These are **not** accepted ADRs; they are comparable
design notes (mermaid + worked samples).

| File | Concept | Full-corpus slides? |
| --- | --- | --- |
| [01-extracted-catalogs-generated-decks.md](01-extracted-catalogs-generated-decks.md) | Catalogs + generate + **locale overrides** (primary candidate) | Yes |
| [02-caption-subtitle-track.md](02-caption-subtitle-track.md) | Caption / subtitle track | No (overlay) |
| [03-quiz-and-lab-prose-first.md](03-quiz-and-lab-prose-first.md) | Quiz and lab prose first | Spike only |

Short-form concepts (parallel trees, inline bilingual, `$t()`, runtime overlay, YAML beats) live
in the umbrella ADR only.

The [Workshop Localization Hub architecture pack](../0014-tms-architecture/README.md) develops the
primary candidate into a standalone, multi-workshop, multi-TMS design with usability journeys,
testing architecture, operational boundaries, and proposed implementation ADRs.
