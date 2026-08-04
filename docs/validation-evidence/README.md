# Validation evidence (US-ENV-4A)

Automation may write run summaries and failure diagnostics here (for example
`last-smoke/` from a local `infra/lab-smoke.sh` run, or CI artifacts uploaded from
`docs/validation-evidence/ci-artifacts`).

## Honesty rules

1. **Do not** edit `docs/validation-matrix.md` to claim `kind-smoke` unless a
   maintainer recorded a **real** end-to-end execution for that lab.
2. Evidence files here are **automation receipts**, not pedagogical validation.
   US-BETA-6 remains the human timing/teaching rehearsal.
3. A green CI Day-1 smoke proves disposable-cluster behaviour for the selected
   drivers; it still does not rewrite matrix rows automatically.

## Inventory

Machine-readable inventory: [`infra/lab-inventory.json`](../infra/lab-inventory.json),
generated from the Markdown matrix (`node scripts/lab-inventory.mjs --write`).
The Markdown matrix stays the human source of truth; CI `--check` rejects drift.
