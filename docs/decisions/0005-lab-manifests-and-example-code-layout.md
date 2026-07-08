# ADR 0005: Lab manifests and example-code layout

- **Status:** accepted
- **Scope:** the internal layout of a lab folder — where a lab's Markdown, manifests, example
  application code, and reference solutions live, and how slides reference them.

## Context

[0002](0002-repository-and-content-structure.md) puts each lab under `labs/day-N/NN-topic/`, and
[0004](0004-parallel-slide-and-lab-authoring.md) makes the lab folder the single source of truth
for the YAML a slide teaches. A lab therefore holds more than prose: the starting manifests, the
deliberately broken variants used in break→fix, any small application source and its Dockerfile,
installers for a lab's prerequisites, and the reference/solution files that back the spoilers. We
need one predictable internal shape so contributors and learners find these without hunting, and
so tooling can validate every manifest generically.

## Options considered

1. **Everything in one big Markdown file** with fenced YAML blocks. Rejected: learners can't
   `kubectl apply -f` a fenced block cleanly, manifests can't be dry-run-validated by tooling,
   and copy-paste errors become the lab's main failure mode.
2. **A central `manifests/` tree** separate from the labs. Rejected: it re-introduces the
   distance [0002] closed — the manifest and the lab that uses it drift apart.
3. **Self-contained lab folder** with the prose plus a conventional set of subfolders for
   manifests, source, and solutions. Chosen.

## Decision

A lab folder has this conventional shape (subfolders appear only when the lab needs them):

```
labs/day-1/05-pod/
├── README.md            # the lab body — follows the lab authoring contract, referenced by the slide
├── manifests/           # applyable starting manifests (pod.yaml, service.yaml, …)
├── broken/              # deliberately-broken variants for break→fix steps (pod-broken.yaml, …)
├── solutions/           # fixed manifests / expected YAML that back the spoilers
├── src/                 # example application source, when the lab builds an image
├── Dockerfile[.variant] # image builds, when the lab builds an image
└── setup.sh / checks.sh # optional per-lab helpers (pre-flight checks, load generators)
```

Rules:

- **`README.md` is the lab.** It follows the lab authoring contract (title+metadata with the
  environment badge, objective, prerequisites, files used, explicit copy-pasteable steps, a
  `<details>` **spoiler for every task and question**, expected observations, reset-safe cleanup,
  optional stretch). The slide's `lab:` reference points at the folder.
- **Manifests are real files, applied by path.** Steps run `kubectl apply -f manifests/pod.yaml`,
  never "paste this block." Every file under `manifests/`, `broken/`, and `solutions/` must be a
  valid manifest that tooling can dry-run ([0008](0008-validation-and-ci.md)).
- **Broken variants are explicit, not improvised.** The exact failure a learner is meant to hit
  lives in `broken/` with a name that says why (`service-wrong-selector.yaml`), and its fix lives
  in `solutions/`. Spoilers reference these files.
- **Example code is minimal and local.** `src/` holds the smallest app that makes the point;
  Dockerfiles sit at the lab root. Image-building labs (S01/S02) run locally and need no cluster.
- **Slides show these files, not copies.** Per [0004], a `magic-move` walkthrough is a view of
  the lab's real manifest; the file in `manifests/` is authoritative.
- **Naming mirrors the numbering.** `labs/day-1/05-pod/` pairs with `pages/S05-pod/`. Manifest
  filenames use the resource they create (`deployment.yaml`, `httproute-header.yaml`).

## Consequences

- Learners copy commands, not YAML — the dominant lab failure mode disappears.
- Every manifest, including the broken ones, is machine-validatable, so CI catches a typo before a
  room full of people does.
- The break→fix content is version-controlled and reviewable rather than living only in prose.
- Cross-cutting infrastructure (cluster/addon installs shared by many labs) does **not** live
  here — it lives in `infra/` ([0006](0006-workshop-environment-and-iac.md)); a lab that needs an
  addon references the `infra/` installer rather than vendoring its own copy.
