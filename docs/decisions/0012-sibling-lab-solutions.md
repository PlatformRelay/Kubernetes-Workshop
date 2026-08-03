# ADR 0012: Single-file labs with sibling solution companions

- **Status:** accepted (supersedes [0009](0009-single-file-lab-convention.md))
- **Scope:** the internal layout of a lab — how a lab's prose, manifests, broken variants, and
  reference solutions are stored and referenced. Supersedes [0009](0009-single-file-lab-convention.md),
  which kept the single-file heredoc form but still required inline `<details>` spoilers and forbade a
  separate solutions companion.

## Context

[0009](0009-single-file-lab-convention.md) correctly replaced the never-adopted per-lab folder tree
from [0005](0005-lab-manifests-and-example-code-layout.md) with one Markdown file per lab and
in-file heredoc manifests. Its Decision, however, still required every task and question to carry an
inline `<details>` spoiler in that same file and forbade a separate `solutions/` companion.

Day 1 Labs 01–08, `AGENT.md`, `labs/README.md`, and the lab-contract checker now ship a different
contract: the participant file stays spoiler-light, and answers live in a sibling
`NN-topic.solution.md` linked at `#guided-solutions` and `#challenge-solution`. Leaving 0009
accepted would tell authors to undo a convention the corpus and CI already enforce.

## Options considered

1. **Keep inline `<details>` spoilers in the participant lab (0009 as written).** Rejected: it
   collapses facilitator/learner separation, bloats the exercise the learner should attempt first,
   and contradicts the enforced Day 1 contract tests.
2. **Restore a per-lab `solutions/` folder tree (0005).** Rejected again: high churn for no
   learner-visible gain; the sibling companion already separates answers without a folder tree.
3. **Sibling `NN-topic.solution.md` beside the participant lab.** Chosen — it matches the shipped
   Day 1 Labs 01–08 corpus, keeps the single-file heredoc apply-by-path form, and lets contract
   tests enforce both halves.

## Decision

A lab remains **one participant Markdown file**: `labs/day-N/NN-topic.md` (pairing with
`pages/SNN-topic/`). For the enforced Day 1 slice (Labs 01–08) it is paired with a sibling
**`NN-topic.solution.md`**.

Rules carried forward from 0009:

- **Manifests are materialised as real files, then applied by path** via quoted heredocs, then
  `kubectl apply -f <file>` — never paste-into-kubectl.
- **Every materialised happy-path manifest must dry-run clean**; broken variants are explicit,
  must parse, and fail at apply/admission.
- **Example code stays minimal and local** for image-building labs; cross-cutting installers stay
  in `infra/` ([0006](0006-workshop-environment-and-iac.md)).
- **Slides show the lab's real YAML** per [0004](0004-parallel-slide-and-lab-authoring.md).

Rules that replace 0009's inline-spoiler mandate:

- **Solutions live in the sibling companion**, not as a required inline `<details>` block for every
  task in the participant file. The companion holds the collapsible spoilers, expected output, and
  challenge answers.
- **The participant lab links the companion** at the required anchors:
  `[Spoiler: guided solutions](./NN-topic.solution.md#guided-solutions)` and
  `[Spoiler: challenge solution](./NN-topic.solution.md#challenge-solution)`.
- **There is still no per-lab `solutions/` folder tree.** The companion is one sibling Markdown
  file beside `NN-topic.md`.
- Days 2–3 may still use older inline-spoiler shapes until those labs are migrated; the contract
  checker scopes the sibling requirement to Day 1 Labs 01–08.

## Consequences

- The decision record matches the Day 1 corpus, `AGENT.md`, facilitator guidance, and
  `pnpm test:labs`.
- Facilitators can point stuck learners at the companion without spoiling the participant file for
  everyone else.
- Validation ([0008](0008-validation-and-ci.md)) still materialises heredocs from the participant
  lab (and companion where needed) before dry-run; the folder-tree approach from 0005 stays retired.
- Revert path: restore ADR 0009's prior Decision text / status, delete this ADR, and remove the
  Day 1 `*.solution.md` siblings (plus the contract checks that require them).
