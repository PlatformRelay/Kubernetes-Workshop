# Windows participant setup with WSL2

The workshop's Windows route is **WSL2**, using a Linux distribution and a
container engine that is reachable from that distribution. This route is
currently **partial: contract-tested, live-smoke pending**. It must not be
advertised as officially supported until the live acceptance gate below passes.
Native PowerShell,
Command Prompt, Git Bash, MSYS2, and WSL1 are not supported execution
environments for `./workshop` or the labs.

If company policy prevents local installations, administrator privileges, or
container-engine access, use the [assigned cloud namespace](#managed-device-route)
instead. Do not try to work around device policy.

## Recommended topology

```text
Windows host
├── WSL2 Linux distribution
│   ├── workshop repository under ~/src
│   ├── bash, git, mise, kubectl and kind
│   └── docker CLI ───────────────┐
└── Docker Desktop               │
    └── WSL integration socket ◀─┘
```

The bootstrap can select Podman, but the first Windows acceptance target is
Docker Desktop with WSL integration. Treat Podman on Windows as experimental
until it has its own live-smoke row. Check Docker Desktop's licence terms before
using it for work.

## Version support policy

The provisional minimum tuple for the first live acceptance is:

| Component | Provisional minimum |
| --- | --- |
| Windows | Windows 11 23H2, build 22631 |
| WSL package | 2.1.5, with the distribution running as generation 2 |
| Linux distribution | Ubuntu 24.04 LTS |
| Docker Desktop | 4.44.0 with the WSL2 backend and per-distribution integration enabled |
| Workshop resources | 4 CPUs and 8 GiB RAM available to WSL2/containers |

These are workshop policy floors, not a claim that every newer combination has
already been exercised. The Windows and WSL floors align with Docker's current
[Windows installation requirements](https://docs.docker.com/desktop/setup/install/windows-install/).
Use `wsl --version`, `wsl --status`, and `wsl --list --verbose` as documented by
[Microsoft's WSL command reference](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).

No live tuple has passed yet. The first successful acceptance record must state
the exact Windows build, WSL/kernel, distribution, architecture, engine, and
workshop commit. That tuple becomes the tested baseline; raising a minimum later
requires another recorded smoke. Stubbed tests establish only the diagnostic
contract.

## One-time host setup

1. In an elevated PowerShell, install WSL and make version 2 the default:

   ```powershell
   wsl --install
   wsl --update
   wsl --set-default-version 2
   wsl --version
   wsl --list --verbose
   ```

   Confirm that the chosen distribution shows `VERSION 2`. Reboot if Windows
   requests it. WSL2 requires hardware virtualization to be enabled; on a
   managed laptop, IT may need to enable the Windows features or firmware
   setting.

2. Install and start a compatible container engine. For Docker Desktop, enable
   its WSL2 backend and then enable **Settings > Resources > WSL integration**
   for the chosen distribution.

3. Open the Linux distribution and verify the integration from its shell:

   ```bash
   docker info
   ```

   This must succeed without `sudo`. If it does not, start Docker Desktop,
   enable the distribution integration, then run `wsl --shutdown` in
   PowerShell and reopen the distribution.

4. Clone the repository inside the Linux filesystem, not under `/mnt/c`:

   ```bash
   mkdir -p ~/src
   cd ~/src
   git config --global core.autocrlf input
   git clone <this-repo-url> kubernetes-workshop
   cd kubernetes-workshop
   ./workshop up
   ```

   A checkout under `/mnt/c` can be substantially slower and can blur Linux
   executable-bit semantics. The bootstrap warns when it detects this layout.

Do not install the Windows build of mise with `winget` for this path. The tools
must run inside the WSL2 Linux distribution; `./workshop up` installs the Linux
build of mise interactively when needed.

## Resource and network preparation

Allocate at least 4 CPUs and 8 GiB RAM to the combined WSL2/container-engine
environment. The bootstrap warns below these values. Close unused local
clusters and containers before the workshop.

Corporate proxies and VPN clients can affect WSL DNS, image pulls, and access
to the Kubernetes API:

- Configure the approved proxy in both the container engine and the WSL2 shell.
  Preserve TLS verification and use the company CA bundle; do not bypass
  certificate checks.
- Connect the VPN before opening WSL2. If connectivity changes after a VPN
  reconnect, run `wsl --shutdown` in PowerShell and reopen the distribution.
- Verify `docker pull`, DNS resolution, and the target cluster before class.
  A facilitator can pre-pull pinned workshop images when conference networking
  is constrained.
- Do not replace `/etc/resolv.conf` or add unapproved proxy exceptions unless
  that is part of the organisation's supported WSL configuration.

## Managed-device route

Participants who cannot or do not want to install a container engine should
receive a kubeconfig and an assigned namespace in a facilitator-managed cloud
cluster. They can skip local kind setup and follow the namespace path in
[`../labs/day-1/00-setup.md`](../labs/day-1/00-setup.md).

This route still requires a terminal with `kubectl` today. A literal
zero-install, browser-only shell is future work tracked by **US-ENV-6**; do not
promise it as part of the current workshop.

Cluster-wide exercises must provide a namespace-safe observation path. The
facilitator, not the participant, owns shared add-on installation and
cluster-scoped permissions.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `native Windows ... is not supported` | Open the WSL2 distribution and run the command from its Linux shell. |
| `WSL1 is not supported` | Back up the distribution, run `wsl --set-version <DistributionName> 2` in PowerShell, and confirm `VERSION 2` with `wsl --list --verbose`. |
| `Docker Desktop WSL integration may be disabled` | Enable integration for this distribution, restart Docker Desktop, run `wsl --shutdown`, reopen WSL2, and verify `docker info`. |
| Repository path starts with `/mnt/c/` | Re-clone under `~/src`; do not move `node_modules` or a kind data directory across filesystems. |
| `bad interpreter` or `$'\r': command not found` | Set `git config --global core.autocrlf input`, re-clone inside WSL2, and verify the scripts use LF endings. |
| `Permission denied` for `./workshop` | Run `chmod +x workshop infra/bootstrap.sh infra/doctor.sh`, then check that the checkout is on the Linux filesystem. |
| Pulls or API calls fail only on VPN | Reconnect the VPN, `wsl --shutdown`, reopen WSL2, and verify DNS/proxy/CA configuration before retrying. |

## Reproducible validation checklist

Run this checklist on a host meeting the provisional tuple. Every item is a
release gate: do not call the Windows route officially supported until all
items pass and the exact tuple is recorded.

1. Record Windows version, `wsl --version`, `wsl --list --verbose`, Linux
   distribution/version, architecture, engine version, and available CPU/RAM.
2. In a clean WSL2 distribution with Docker integration enabled, clone under
   `~/src`, complete Lab 00, run `./workshop up`, then run `./workshop doctor`;
   expect zero failures.
3. Disable WSL integration for the distribution and run `./workshop up`; expect
   a non-zero exit and the integration recovery instructions.
4. Re-enable integration. Clone a disposable copy under `/mnt/c` and run
   `./workshop up`; expect the mounted-drive warning before cluster creation.
5. In disposable copies, introduce CRLF into `workshop` and remove its
   executable bit. Run `bash infra/doctor.sh`; expect specific repair commands
   and a non-zero result.
6. Exercise representative cluster behaviour: Service/DNS networking, dynamic
   PVC provisioning and persistence, and one canonical cluster add-on lab.
   Record commands, timings, failures, and cleanup; a green bootstrap alone is
   insufficient.
7. Run the namespace path using a facilitator-provided kubeconfig without
   Docker or kind. Confirm that namespace-scoped labs work and cluster-wide
   steps direct the participant to the read-only alternative.
8. Run `./workshop down --yes` for the local path and confirm the workshop kind
   cluster is removed.

Until this checklist is recorded as passing, the state is `contract-tested` /
`live-smoke pending`, the story remains partial, and release notes must not
claim official Windows support. Automated tests reproduce detection and
messages with stubs, but do not replace live WSL2 validation.
