# ADR 0002: Repository and content structure

- **Status:** accepted
- **Scope:** the whole repository — where slides, sections, labs, example code, workshop
  infrastructure, shared components, decisions, and local planning material live.

## Context

The workshop is three things at once: a Slidev slide deck, a set of standalone hands-on labs,
and the code/manifests/infrastructure those labs run against. It is authored as a **superset**
of toggleable sections and boiled down per delivery (see [0003](0003-deck-composition-superset-and-boil-down.md)),
and slides and labs are authored **in parallel** as one unit (see
[0004](0004-parallel-slide-and-lab-authoring.md)). All of that has to sit in one repo without
the pieces stepping on each other, and a contributor must be able to find "the Pod section",
"the Pod lab", and "the Pod manifests" without a map.

The starter Slidev project put everything in one folder with demo content. We need a stable,
predictable layout before curriculum authoring starts, so every section folder, lab folder, and
manifest path is boringly guessable.

## Options considered

1. **Deck-centric, labs embedded in slides.** Rejected: labs must be printable, runnable, and
   reviewable independently of the deck, and embedding them couples lab edits to slide numbers.
2. **Two repos (deck vs labs/infra).** Rejected: the slide code snippet and the lab manifest are
   the *same artifact* ([0004](0004-parallel-slide-and-lab-authoring.md)); splitting repos
   guarantees drift and doubles the review surface.
3. **One repo, three top-level trees (deck / labs / infra) with a shared component library and a
   tracked decision log.** Chosen.

## Decision

One repository, laid out at the root as follows. Names are conventions, not suggestions —
sections are `SNN-topic`, labs are `NN-topic`, and the two numbers line up.

```
.
├── slides.md                 # root deck — superset (imports every section)
├── slides-3day.md            # root deck — canonical 3-day cut
├── slides-templates.md       # root deck — template/component gallery
├── slides-<variant>.md       # future custom cuts (one file each; never copy sections)
│
├── pages/                    # the section library — one folder per section
│   ├── S00-welcome/index.md
│   ├── S05-pod/index.md
│   └── S27-wrap-up/index.md
│
├── layouts/                  # shared Slidev layouts (section-cover, lab, code-walkthrough…)
├── components/               # shared Vue components (animations, PodCard, LabCallout…)
├── style.css  ·  setup/  ·  public/{covers,icons}/   # theme, runtime setup, static assets
│
├── labs/                     # standalone hands-on labs (NOT embedded in the deck)
│   ├── day-1/NN-topic/       # one folder per lab — see ADR 0005
│   ├── day-2/…
│   └── day-3/…
│
├── infra/                    # workshop environment as code — see ADR 0006
│   ├── kind/  ·  addons/  ·  shared-cluster/  ·  versions.env
│
├── docs/decisions/           # this ADR log (tracked)
├── AGENT.md  ·  README.md    # contributor guidance + public readme (tracked)
│
├── agent-context/            # local planning material (roadmap, user stories, outline) — GITIGNORED
└── references/               # vendored reference theme + CNCF artwork, for rehearsal — GITIGNORED
```

Rules that follow:

- **Sections own only slides.** `pages/SNN-topic/index.md` is a self-contained section
  (divider + content). It must not depend on another section's slide numbers and must not carry
  lab bodies — it *references* a lab by path.
- **Labs own steps, manifests, and example code.** Everything a lab needs is under its own
  `labs/day-N/NN-topic/` folder ([0005](0005-lab-manifests-and-example-code-layout.md)). A lab
  is runnable from a clean checkout with nothing from the deck.
- **The `SNN` ↔ `NN` numbering is load-bearing.** `pages/S05-pod/` pairs with
  `labs/day-1/05-pod/`. Keep the outline's section map, the tier tags, and the image-prompt
  numbering in sync when adding or moving sections.
- **Infrastructure is code, in one place.** Cluster configs, addon installers, and
  shared-cluster provisioning live under `infra/`, never scattered into lab folders
  ([0006](0006-workshop-environment-and-iac.md)).
- **Tracked vs local.** `pages/`, `labs/`, `infra/`, `layouts/`, `components/`, `docs/`,
  `AGENT.md`, and the root decks are tracked. `agent-context/` (planning) and `references/`
  (vendored artwork/theme) are gitignored local working material.

## Consequences

- Any contributor can guess a path: section `S13` → `pages/S13-resources/`, its lab →
  `labs/day-2/13-resources/`, its manifests → that lab folder's `manifests/`.
- Slides and labs are edited in the same repo and the same PR, keeping the shared manifest a
  single source of truth ([0004](0004-parallel-slide-and-lab-authoring.md)).
- Adding a delivery cut is one new `slides-<variant>.md`; adding a section is one new
  `pages/SNN-topic/` + one `labs/day-N/NN-topic/`, wired into the root decks.
- The starter deck's demo slides are not workshop content and are removed as sections land.
