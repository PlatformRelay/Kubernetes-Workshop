# Offline quiz rehearsal transcript

- Recorded at: 2026-08-04T00:06:23+02:00
- Scope: offline fallback only; no live service was exercised
- Input: `quiz/questions.prototype.json`
- Input SHA-256: `f3b30009703af7fb1e5ebcdf068b9d086c4cda1a3d6e63720d88d6acfc805996`
- Runner: `node v26.5.0`

## Command transcript

```text
$ node scripts/quiz/validate.mjs quiz/questions.prototype.json
Validated 3 questions across 3 sections.
$ node scripts/quiz/export.mjs --out <OUT>
Exported offline and adapter prototypes to <OUT>.
$ node scripts/quiz/export.mjs --out <OUT>  # reset/replay
Exported offline and adapter prototypes to <OUT>.
```

## Generated output hashes

- `adapter-preview.json`: `4d0210619e2a16e9c31c206bc2bd9d9a6bd287f8876420e6ba5c36fa3da76548`
- `facilitator.md`: `5ac678f307ddfebf50683e62d5e244730af653eba791c2d4861053e9344e0ba4`
- `participant.md`: `7554181709f5a96628fc6b89e0443c557b3fe3d354044840a18eed6ed4fb1a13`

## Observations

- Reveal check: PASS — 0 participant answers; 3 facilitator answers.
- Reset check: PASS — repeated export produced identical SHA-256 outputs.
- Failure fallback: PASS — participant and facilitator files remain readable without an audience service.
- The reset check proves deterministic offline regeneration only. It does not prove live cohort reset,
  network recovery, presenter controls, or audience-service behavior.

## Replay

Run the same command with this timestamp to reproduce the transcript and output hashes:

```sh
node scripts/quiz/rehearse-offline.mjs \
  --out docs/decisions/evidence/0011-live-quiz-spike/rehearsal \
  --timestamp 2026-08-04T00:06:23+02:00
```
