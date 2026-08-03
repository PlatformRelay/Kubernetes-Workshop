# Cutting a release

Maintainer notes for immutable, ordered publication (US-RELEASE-1). Ordinary
pushes never release — only an annotated or lightweight `v*` tag does.

## Policy

1. **Order — build then publish.** `.github/workflows/release.yml` exports and
   validates PDFs + the offline site zip in the `build` job, then the `publish`
   job creates the GitHub Release. Publish cannot run without `needs: build`, and
   `fail_on_unmatched_files: true` refuses a Release with missing artifacts.
2. **Immutability — tags never move.** A release tag names one commit forever.
   Do not `git tag -f` / force-push a published `v*` tag. The publish job runs
   `scripts/release-tag-guard.sh`, which allows same-commit retries (idempotent)
   and **refuses** when the remote tag or GitHub Release already points at a
   different commit.
3. **Provenance.** Every exported deck stamps `VITE_WORKSHOP_VERSION` (the tag)
   and `VITE_WORKSHOP_SHA` (the tagged commit) into the slide chrome.
4. **Permissions.** Workflow default + `build` use `contents: read`. Only
   `publish` gets `contents: write`.

## What a release ships

| Artifact | Source |
| --- | --- |
| `kubernetes-workshop-day-{1,2,3}-<tag>.pdf` | Live Day 1/2/3 entry decks |
| `kubernetes-workshop-full-<tag>.pdf` | Compatibility superset (`slides.md`) |
| `kubernetes-workshop-3day-<tag>.pdf` | Compatibility combined cut |
| `kubernetes-workshop-site-<tag>.zip` | Offline HTML: full at `/`, days under `/day-N/`, plus `/3day/` and `/templates/` |

Pre-release tags (name contains `-`, e.g. `v0.2.0-beta.1`) set
`prerelease: true` and prepend [`beta-limitations.md`](./beta-limitations.md).

## How to cut

```bash
# Confirm main is the commit you intend (and CI is green for that tip).
git checkout main && git pull --ff-only

# Optional local preflight (needs gh auth); dry-run prints the decision only.
bash scripts/release-tag-guard.sh check --dry-run v1.2.0 "$(git rev-parse HEAD)"

git tag v1.2.0                 # stable
# git tag v0.3.0-beta.1        # pre-release
git push origin v1.2.0         # → Release workflow
```

If the guard refuses, do **not** move the tag. Cut a new version or investigate
why the existing tag/release points elsewhere.

## Out of scope here

The `workshop-web` container image (`workshop-web.yml`) is a separate pipeline
with its own digest/alias rules. This document covers GitHub Release
PDF/site publication only.
