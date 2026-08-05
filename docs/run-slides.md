# Run the slides locally

Preview the interactive Slidev decks on your laptop with Node.js. This path does **not**
need a Kubernetes cluster — it only serves the presentation.

The repository is locked to **pnpm** (`packageManager` in `package.json` + `pnpm-lock.yaml`).
Use the commands below as written. Plain `npm install` is not supported (there is no
`package-lock.json`).

## Prerequisites

- **Node.js 22** (LTS) — [nodejs.org](https://nodejs.org/) or a version manager
- **Corepack** (ships with Node 16.13+) to activate the pinned pnpm
- Optional: a modern browser (Chrome, Firefox, Safari, Edge)

Check versions:

```bash
node -v    # expect v22.x
corepack -v
```

## Install dependencies

From the repository root:

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
```

## Start the development server

Pick the deck you want:

```bash
# Interactive menu (day / section / range) when gum is available
pnpm dev

# Or open a specific deck directly
pnpm dev:day1        # Day 1 live entry
pnpm dev:day2        # Day 2 live entry
pnpm dev:day3        # Day 3 live entry
pnpm dev:3day        # Canonical three-day cut (compatibility entry)
pnpm dev:superset    # Full content superset
pnpm dev:optional    # Optional / Appendix
pnpm dev:templates   # Theme / template gallery
```

### Facilitator launcher and S21 GitOps tool

For a one-off facilitator selection (day, section, or range), use `pnpm deck` with an
explicit selector. Non-interactive shells must pass the selector on the command line;
the gum menu is progressive enhancement when a TTY and gum are available.

S21 ships as a two-way switch — **Argo CD** (default) or **Flux**. Exactly one tool per
delivery; there is no "both" mode and no third-tool plug-in surface.

```bash
# Default GitOps tool is Argo CD (byte-identical to the committed day decks)
pnpm deck -- --day 3 --dry-run

# Select the Flux variant for S21 (requires pages/S21-gitops-flux/ — US-GITOPS-CHOICE-B)
pnpm deck -- --day 3 --gitops flux --dry-run

# Regenerate / check committed decks for a chosen tool (default: argocd)
pnpm decks:generate
pnpm decks:check
pnpm decks:generate -- --gitops flux   # fails clearly until the Flux section exists
```

Slidev prints a local URL — typically:

```text
http://localhost:3030/
```

Open that URL in your browser. Use arrow keys or the on-screen controls to move between
slides. Presenter mode is available from Slidev’s UI (often `http://localhost:3030/presenter/`).

Stop the server with `Ctrl+C`.

## Production build and local preview

Build static SPAs (useful before changing GitHub Pages wiring):

```bash
# Live day entries (default `pnpm build`)
pnpm build

# Compatibility / gallery entries used on Pages under /deck/
pnpm exec slidev build slides.md --base /deck/ --out dist-deck --router-mode hash
pnpm exec slidev build slides-3day.md --base /deck/3day/ --out dist-deck-3day --router-mode hash
```

Serve a built folder with any static file server, for example:

```bash
pnpm dlx serve dist-deck
```

For the **exact** GitHub Pages layout (MkDocs landing + decks under `/deck/`), use the
Pages workflow locally:

```bash
pnpm pages:build
pnpm pages:preview   # serves ./site at http://localhost:4173
```

`pages:build` expects the Python MkDocs stack from [`requirements-docs.txt`](./requirements-docs.txt):

```bash
python3 -m pip install -r docs/requirements-docs.txt
pnpm pages:build
```

## Related

- Cluster/lab environment (kind): [setup.md](./setup.md)
- Live Pages decks and PDF releases: [downloads.md](./downloads.md)
- Quiz prototype (Node scripts, not Slidev): [quiz/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/quiz/README.md)
