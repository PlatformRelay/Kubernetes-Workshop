# ADR 0015: Ship self-check quizzes as a static Pages player, not a hosted service

- **Status:** accepted (2026-09-05)
- **Scope:** how a learner answers a workshop quiz question and gets feedback — the delivery
  surface, where the question bank lives at runtime, what is persisted, and what the workshop is
  allowed to claim about the result. It does **not** decide the live-room aggregate question, which
  stays with [ADR 0011](0011-live-quiz-spike.md) and US-QUIZ-3.

## Context

[ADR 0011](0011-live-quiz-spike.md) evaluated three FOSS live-quiz runtimes and adopted **none of
them (0 of 3)**: every candidate failed the complete-runtime licence gate. That verdict was correct
and it is not being reopened here. But it left the workshop with a reviewed question bank —
`quiz/questions.json`, 54 questions across 27 authored sections, each with an answer, an
explanation, and a per-distractor rationale — whose **only** learner-facing delivery was a printed
Markdown handout. A learner working through the deck alone at home could read the questions and
could read the answer key; there was nothing that let them *commit* to an answer first.

That gap matters more than it looks. Retrieval practice works because the learner commits before
seeing the answer; a document that shows the question and its answer in the same scroll is a
reference sheet, not a check. Meanwhile the material the bank already carries — *why this distractor
was tempting* — is exactly the feedback a self-directed learner cannot get from a handout, because
they never picked the distractor.

Four forces constrain the answer:

1. **The publishing surface already exists.** `scripts/pages-build.sh` builds an MkDocs landing plus
   six Slidev decks under `/deck/` and GitHub Pages serves the result. Anything that fits in that
   tree costs one build step and no infrastructure.
2. **A host is a standing obligation.** [ADR 0006](0006-workshop-environment-and-iac.md) and
   [ADR 0007](0007-kubernetes-currency-and-version-pinning.md) put every runtime component behind a
   pin and a per-delivery review. A quiz backend is a service to run, patch, back up, and eventually
   turn off — and ADR 0011 already found no FOSS candidate whose licence position was clean.
3. **The bank must stay the source of truth.** Correct answers, explanations, rationales, learning
   objectives, and currency references live in the repository and are gated by
   `scripts/quiz/validate.mjs`. Any delivery that copies them into a vendor database forks the truth.
4. **A static page cannot keep a secret.** Whatever ships to the browser is readable by whoever
   receives it. That is a hard property, not an implementation detail, and it decides what the
   feature is allowed to be.

## Options considered

Criteria and weights. Weights reflect what actually gates this workshop: a learner reaching the
material unaided, and the maintenance load of anything that has to keep running.

| # | Criterion | Weight |
| --- | --- | --- |
| C1 | A solo learner gets commit-then-feedback with no host, account, or install | 5 |
| C2 | Operational cost — anything that must be run, patched, or paid for | 5 |
| C3 | Keeps `quiz/questions.json` the single source of truth | 4 |
| C4 | Privacy — what leaves the learner's browser | 4 |
| C5 | Authoring + maintenance cost of the delivery itself | 3 |
| C6 | Supports a facilitator's live room (aggregate answers, show of hands) | 2 |
| C7 | Reversibility if the decision is wrong | 2 |

Scores are 1–5, where **5 is best for the workshop** (so a cheap option scores high on C2 and C5).

| Option | C1 ×5 | C2 ×5 | C3 ×4 | C4 ×4 | C5 ×3 | C6 ×2 | C7 ×2 | **Total /125** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A** — Markdown handout only (status quo) | 1 (5) | 5 (25) | 5 (20) | 5 (20) | 5 (15) | 3 (6) | 5 (10) | **101** |
| **B** — static player on the existing Pages tree | 5 (25) | 5 (25) | 5 (20) | 5 (20) | 4 (12) | 2 (4) | 5 (10) | **116** |
| **C** — questions embedded in the Slidev deck | 3 (15) | 4 (20) | 2 (8) | 5 (20) | 2 (6) | 4 (8) | 3 (6) | **83** |
| **D** — self-hosted live quiz service | 4 (20) | 1 (5) | 2 (8) | 2 (8) | 1 (3) | 5 (10) | 2 (4) | **58** |

### Option A — keep the Markdown handout only

The participant/facilitator export from `scripts/quiz/export.mjs` already works, costs nothing, and
is the right artifact for a room with no internet. It scores full marks on everything except the one
thing this decision is about: a learner reading `participant.md` has no way to commit to an answer
and no way to see the rationale for the distractor that tempted them without also reading the whole
key. C1 = 1.

### Option B — a zero-dependency static player under `/quiz/`

Plain HTML, CSS, and ES modules published as a sibling of `/deck/` on the artifact
`scripts/pages-build.sh` already produces. The bank is copied in verbatim at build time, so the
repository stays the source of truth (C3 = 5). No server, no account, no database, no third-party
script, so C2 and C4 are free. The cost is a real one — a small UI the workshop now owns and must
keep working — which is why C5 is 4 rather than 5, and why the player's decision-making logic is
kept in one pure, directly tested module rather than tangled into DOM handlers.

Its honest weakness is C6: it tells one learner how they did and nobody else. It cannot show a
facilitator how the room answered, which is the entire point of a live quiz.

### Option C — embed the questions in the Slidev deck

Slides can hold interactive Vue components, so the questions could live inside the deck. This looks
tempting because the deck is already published, but it fails on C3: the questions would either be
duplicated into slide sources (two truths, drifting) or injected by a build step that makes the deck
depend on the bank. [ADR 0003](0003-deck-composition-superset-and-boil-down.md) already keeps deck
composition mechanical and generated; adding quiz bodies to slide source works against that, and
US-QUIZ-2 explicitly ruled that quiz bodies do not enter slide sources. It also spends slide minutes
the three-day schedule does not have.

### Option D — self-host a live quiz service

The right shape for a facilitated room, and the only option that answers C6 properly. It is also the
option ADR 0011 already tested and rejected: 0 of 3 candidates passed the complete-runtime FOSS
licence gate. Beyond the licence position it is a service with a database, a TLS endpoint, a backup
story, and a per-delivery pin — against a workshop whose entire value proposition is that you can
clone it and go. C2 = 1.

## Decision

**Option B.** Self-check quizzes ship as a zero-dependency static player published at `/quiz/` on
the existing GitHub Pages artifact. These rules apply:

1. **No runtime dependencies.** The player is vanilla HTML, CSS, and ES modules. It adds **no npm
   package, no Python package, no CDN script, no webfont, and no third-party origin**. A test asserts
   the player sources load nothing external.
2. **The bank stays the source of truth.** `scripts/quiz/build-player.mjs` copies
   `quiz/questions.json` verbatim into the published tree and derives the section index from
   `scripts/deck-manifest.mjs`. Questions are never re-authored for the player.
3. **Session-only, and nothing leaves the browser.** No `localStorage`, no cookie, no telemetry, no
   analytics, no central collection, no account. A reload clears the score. This is enforced by a
   test, not by intent.
4. **Feedback is the point.** Choosing an option locks the question, marks chosen against correct,
   **always** shows the `explanation`, and on a wrong choice also shows that option's `rationale`.
   Every rationale is available behind an explicit "show all rationales" opt-in.
5. **Authored sections only.** The landing page is grouped by day with titles from the deck
   manifest, and lists only sections that are `authored` **and** actually have questions — so
   deferred **S24** is not offered. A `#SNN` deep link filters to that section; a link naming a
   section with no questions falls back to the rendered landing page with an explanation, never to a
   blank page.
6. **The Markdown export survives.** `participant.md` and `facilitator.md` remain the offline and
   show-of-hands fallback for rooms without internet. The player is an addition, not a replacement.
7. **`quiz-live` is not revived.** ADR 0011's verdict stands; US-QUIZ-3 remains exploring. This ADR
   does not deliver live-room aggregates and must not be cited as if it did.

### Non-goal: this is not exam security, and must never be described as such

**The player cannot hide an answer, and the workshop will not pretend it can.** Every correct
answer, explanation, and distractor rationale is in `questions.json` next to the page; a reader can
open the file, read the network tab, or read the source. This is a property of static publishing,
not a bug to be fixed later by obfuscation.

The consequences are binding on wording as well as code:

- No proctoring, no score submission, no certificate, no pass mark, no leaderboard, no identity.
- No hashing, encryption, or server round-trip to "protect" answers. Obfuscation on a static page
  buys nothing and would misrepresent what the page is.
- The player itself, `quiz/README.md`, and the front-door docs must say plainly that answers ship in
  the static files and that a score is feedback for the learner alone.
- If the workshop ever needs an assessment whose answers are genuinely withheld, that is a different
  system with a server and a new ADR — it is **not** a hardening pass on this one.

## Consequences

- A solo learner can check their mental model from the published site with no host, account,
  install, or network beyond loading the page. That is what the story asked for.
- The workshop now owns a small piece of UI. The cost is contained by keeping every decision
  (grading, deep-link resolution, session walk) in `quiz/player/logic.mjs`, which `node --test`
  imports and drives directly, with DOM wiring in a thin `app.mjs`; the published tree is built by
  `scripts/quiz/build-player.mjs` and then driven in a real browser by `scripts/pages-site.test.mjs`.
  Neither test settles for asserting that a file exists.
- Adding a question to `quiz/questions.json` publishes it to the player on the next Pages build. No
  second place to edit, and `pnpm quiz:validate` still gates it.
- Deferred **S24** appears nowhere in the player. When that section is authored and gains questions,
  it appears automatically — no player change.
- The player answers one learner and cannot answer a room. Facilitators keep the Markdown
  facilitator copy for show-of-hands, and the live-aggregate question stays open under ADR 0011 /
  US-QUIZ-3 rather than being quietly declared solved.
- Publishing the answers is a deliberate, permanent trade. It is written into the page, the quiz
  README, and this ADR so nobody later mistakes the feature for an assessment tool.
- **Revert path:** delete `quiz/player/`, `scripts/quiz/build-player.mjs`, the `/quiz/` step in
  `scripts/pages-build.sh`, and the player tests. The bank, the Markdown export, and the rest of the
  Pages tree are untouched, because the player only ever reads them.
