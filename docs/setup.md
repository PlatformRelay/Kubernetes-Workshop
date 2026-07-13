# Participant setup — the local (kind) lab environment

This guide gets you from a fresh laptop to a working, lab-ready Kubernetes
cluster with **one command**: `./workshop up`. It covers the choice of container
engine (including the Docker Desktop licensing note), installing the pinned
toolchain, the Windows/WSL2 path, and troubleshooting.

> **Prefer a shared cluster?** If your facilitator gave you a kubeconfig and an
> assigned namespace, you do **not** need any of this — skip straight to
> [`../labs/day-1/00-setup.md`](../labs/day-1/00-setup.md) and follow the
> *namespace* path. This guide is only for the **local kind** environment.

## What you get

`./workshop up` runs, in order:

1. **Preflight** — detects your OS/arch, finds a running container engine
   (Docker, then Podman), and sanity-checks CPUs/RAM (warnings only).
2. **Tools** — installs a pinned toolchain with [mise](https://mise.jdx.dev)
   (kubectl, kind, helm, k9s, jq, yq, gum), verified against real checksums in
   `mise.lock`.
3. **Cluster** — creates a single-node [kind](https://kind.sigs.k8s.io) cluster
   named `workshop`, using the node image pinned by digest in
   `infra/versions.env`.
4. **Doctor** — runs `./workshop doctor` to confirm the cluster answers, nodes
   are Ready, and a smoke Pod runs and is cleaned up.

When it finishes green, start the labs at
[`../labs/day-1/00-setup.md`](../labs/day-1/00-setup.md).

## Step 1 — choose and start a container engine

kind runs Kubernetes nodes as containers, so you need a container engine with a
running daemon/machine. Pick one:

| Engine | Platforms | Notes |
| --- | --- | --- |
| **Docker Desktop** | macOS, Windows, Linux | Easiest, but see the licensing note below. |
| **Podman Desktop** | macOS, Windows, Linux | CNCF, Apache-2.0. First-class kind support. On Windows the machine must be **rootful** for kind. |
| **colima** | macOS, Linux | Lightweight CLI (`colima start`); pairs with the Docker CLI. |
| **Rancher Desktop** | macOS, Windows, Linux | Works, but **disable its built-in Kubernetes** so it doesn't fight kind. |

> **Docker Desktop licensing note.** Docker Desktop is free for personal use,
> education, and **small businesses** — but a paid subscription is required for
> professional use in larger organisations (as of Docker's terms: **250+
> employees OR more than US $10M in annual revenue**). If that describes your
> employer, use **Podman Desktop** (CNCF, Apache-2.0) or **colima** instead —
> both work with kind and this workshop. Nothing in the labs depends on Docker
> specifically.

Start your engine before continuing:

- Docker Desktop / Rancher Desktop / Podman Desktop: launch the app.
- colima: `colima start --cpu 4 --memory 8`
- Podman (CLI): `podman machine init && podman machine start` (on Windows, make
  it rootful: `podman machine set --rootful`).

The bootstrap probes **Docker first, then Podman**, and prints a helpful error
if neither is reachable.

## Step 2 — get the repo and run it

```bash
git clone <this-repo-url> kubernetes-workshop
cd kubernetes-workshop
./workshop up
```

That's it. The first run downloads the pinned tools and the kind node image, so
budget a few minutes on conference Wi-Fi. Subsequent runs are near-instant.

You do **not** need to install mise yourself — `./workshop up` installs it if it
is missing (interactively). If you would rather install it up front, any of
these work and are picked up automatically:

```bash
# macOS / Linux
brew install mise            # Homebrew
curl https://mise.run | sh   # official installer (checksummed by upstream)

# Windows (inside WSL2 — see Step 3)
winget install jdx.mise      # or: scoop install mise
```

The pinned versions live in `mise.toml` (human-readable) and `mise.lock`
(checksummed). Participants who prefer to install tools by hand can read the
exact versions out of those files — the lockfile *is* the documentation.

## Step 3 — Windows: use WSL2

Native Windows PowerShell is **not supported** (kind + the bootstrap expect a
Linux userland). The supported path is **WSL2**. In an elevated PowerShell,
once:

```powershell
wsl --install
wsl --set-default-version 2
```

Reboot if prompted, open your WSL2 distro (e.g. Ubuntu), then run `./workshop
up` **from inside WSL2**. If you run it from PowerShell by mistake, the
bootstrap detects it and prints these same commands.

Engine choice under WSL2:

- **Docker Desktop** with the *WSL2 backend* enabled (Settings → Resources →
  WSL integration) — subject to the licensing note above.
- **Podman** inside WSL2 — remember the machine must be **rootful** for kind
  (`podman machine set --rootful`).

## Step 4 — daily use

```bash
./workshop doctor   # is my machine still lab-ready?
./workshop up       # (idempotent) bring the cluster back if it's gone
./workshop down     # delete the cluster (asks to confirm)
```

`./workshop doctor` is also the first task of Lab 00, so "is my machine ready"
is a lab step, not a support queue.

### Non-interactive / CI

Every step also runs without prompts. Set `WORKSHOP_NONINTERACTIVE=1` (or run
under `CI=true`, or with no TTY) and sane defaults are taken — this is the exact
path CI runs, so the script you run locally is the script that is tested. Use
`./workshop down --yes` (or `-y`) to skip the teardown confirmation in scripts.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `no reachable container engine` | Start Docker Desktop / `colima start` / `podman machine start`. On Podman for Windows, make the machine rootful. |
| `native Windows (PowerShell) is not supported` | You're not in WSL2. Open your WSL2 distro and re-run there (Step 3). |
| `mise is required but not installed` (non-interactive) | Install mise first (`brew install mise` / `winget install jdx.mise` / `curl https://mise.run \| sh`), then re-run. |
| kind cluster won't create / is unreachable | Panic reset: `./workshop down` then `./workshop up` (equivalently `make kind-down && make kind-up`). |
| Slow / stalls on downloads | Conference Wi-Fi. The tool cache and node image are only fetched once; retry — mise resumes. |
| `doctor` reports a version WARN | Your local kubectl/kind differs from the pin. It's a warning, not a failure; the pinned tools from `mise install` take precedence on `PATH`. |

If `./workshop up` finishes green but a later lab misbehaves, run `./workshop
doctor` first — it re-checks the cluster and prints a targeted hint per failure.

## Under the hood

- **Versions** are pinned once in `infra/versions.env` (kind + kubectl + node
  image digest) and mirrored in `mise.toml`; the checksums live in `mise.lock`.
- **`./workshop`** is a thin wrapper over `infra/bootstrap.sh`, which orchestrates
  existing, tested pieces — the cluster is created by `make kind-up` and health
  is `infra/doctor.sh`. Nothing is reimplemented.
- **gum** provides the pretty prompts/spinners when you run interactively; it is
  pure sugar and never required.

See [`../labs/README.md`](../labs/README.md) for the full tool list and the
shared-cluster alternative.
