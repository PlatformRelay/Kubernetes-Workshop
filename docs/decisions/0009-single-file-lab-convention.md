# ADR 0009: Single-file labs with in-file manifest heredocs

- **Status:** accepted (supersedes [0005](0005-lab-manifests-and-example-code-layout.md))
- **Scope:** the internal layout of a lab — how a lab's prose, manifests, broken variants, and
  reference solutions are stored and referenced. Supersedes [0005](0005-lab-manifests-and-example-code-layout.md),
  which mandated a per-lab folder tree (`manifests/`, `broken/`, `solutions/`, `src/`) that the
  shipped corpus never adopted.

## Context

[0005](0005-lab-manifests-and-example-code-layout.md) specified a self-contained *folder* per lab
(`labs/day-1/05-pod/` with `README.md` plus `manifests/`, `broken/`, `solutions/`, `src/`
subfolders), chosen to (a) let learners `kubectl apply -f` real files rather than paste fenced
blocks, and (b) let tooling dry-run every manifest generically.

All 20 shipped labs instead use a **single Markdown file per lab** (`labs/day-1/05-pod.md`) in
which every manifest is written to disk *by the learner*, inline, via a shell heredoc:

```bash
cat > pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
# …
EOF
kubectl apply --dry-run=server -f pod.yaml   # server validates; no object created
kubectl apply -f pod.yaml
```

This form was adopted deliberately and consistently, and it satisfies 0005's primary objection:
**the learner still applies a real file by path, never a pasted block** — the heredoc materialises
`pod.yaml` first. Break→fix uses a second heredoc that writes a deliberately-broken variant; the
fix and expected output live in an inline `<details><summary>Solution / expected output</summary>`
spoiler. The decision record and the corpus have therefore diverged: 0005 says "accepted" while
zero labs implement it. This ADR records what the workshop actually does and why the single-file
form is the right default, so a contributor authoring lab 21 follows the corpus, not a dead spec.

## Options considered

1. **Refactor all 20 labs into the 0005 folder tree.** Rejected: high-churn rewrite of a
   deliberate, working, consistent convention, for no learner-visible gain — the heredoc form
   already applies real files by path and dry-runs them.
2. **Central `manifests/` tree.** Rejected for the same reason 0005 rejected it: it re-opens the
   distance between a manifest and the lab that uses it.
3. **Single self-contained Markdown file with in-file heredoc manifests.** Chosen — it is what the
   corpus uses, it keeps a lab a *standalone, copy-pasteable* artifact (aligned with the
   labs-as-standalone-Markdown goal), and it preserves apply-by-path and dry-run validation.

## Decision

A lab is **one Markdown file**: `labs/day-N/NN-topic.md` (pairing with `pages/SNN-topic/`). It
follows the lab authoring contract (title + metadata with the environment badge, objective,
prerequisites, files used, explicit copy-pasteable steps, a `<details>` **spoiler for every task
and question**, expected observations, reset-safe cleanup, optional stretch).

Rules:

- **Manifests are materialised as real files, then applied by path.** A step writes the manifest
  with a quoted heredoc (`cat > deployment.yaml <<'EOF' … EOF`) and then runs
  `kubectl apply -f deployment.yaml` — never "paste this into `kubectl`". Manifest filenames use
  the resource they create (`deployment.yaml`, `httproute-header.yaml`).
- **Every materialised manifest must dry-run clean.** A happy-path manifest must pass
  `kubectl apply --dry-run=server` (or `--dry-run=client` offline). This is the same guarantee
  0005 wanted; it now applies to the manifests a lab's heredocs generate rather than to files
  committed under `manifests/`.
- **Broken variants are explicit and must parse.** The deliberately-broken manifest is its own
  named heredoc (e.g. `service-wrong-selector.yaml`) whose name says what is wrong. It must parse
  (it fails at apply/admission, not at YAML parse), so a learner hits the intended error, not a
  syntax error. Its fix lives in the step's solution spoiler.
- **Solutions live inline, in spoilers.** The fixed manifest and expected output back each
  `<details>` spoiler in the same file — there is no separate `solutions/` folder. Every
  task and every question has a spoiler.
- **Example code stays minimal and local.** Image-building labs (S01/S02) keep their small
  `src/`/Dockerfile material alongside the lab file (these labs build locally and need no cluster);
  everything else lives in the one Markdown file.
- **Slides show the lab's real YAML.** Per [0004](0004-parallel-slide-and-lab-authoring.md) a
  `magic-move` walkthrough is a view of the manifest the lab's heredoc writes; the lab file remains
  the single source of truth, and the two must stay byte-compatible.
- **Cross-cutting infrastructure is not vendored into a lab.** Cluster/addon installs shared by
  many labs live in `infra/` ([0006](0006-workshop-environment-and-iac.md)); a lab references the
  shared installer rather than copying it.

## Consequences

- The corpus and its decision record agree again: contributors follow the single-file heredoc form,
  which every existing lab already models.
- A lab stays a **single standalone artifact** — one file a participant can read, copy, and run
  end to end, matching the labs-as-standalone-Markdown goal.
- Validation ([0008](0008-validation-and-ci.md)) shifts from "dry-run the files under
  `manifests/`/`broken/`/`solutions/`" to **"materialise the heredoc'd manifests, then dry-run
  them."** The intent is unchanged — happy-path manifests apply clean, broken variants parse but
  fail at admission — but the manifest-validation layer must extract manifests from the lab's
  heredocs (or run the lab's write-steps in a scratch dir) before dry-running, rather than globbing
  a folder tree. 0008's manifest rule is read with that substitution; 0008 is not otherwise changed.
- The break→fix content lives in the lab's prose/spoilers rather than in separate version-controlled
  files. It is still reviewable (it's in the tracked Markdown) but is validated by running the lab's
  heredocs, not by linting standalone files.
