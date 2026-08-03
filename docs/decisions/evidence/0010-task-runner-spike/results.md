# Task-runner spike evidence

Captured on 2026-08-03. The fixture delegates every verb to `runner.sh`, matching the intended
architecture in which the task runner contains composition rather than product logic.

## Reproduce the feature comparison

From the repository root:

```sh
docs/decisions/evidence/0010-task-runner-spike/verify.sh
```

The script tests task discovery, a sequential `up` plus `doctor` profile, non-interactive
environment propagation, whitespace-preserving arguments, and a failing precondition. A missing
optional runner is reported as skipped. The two shell files are checked with ShellCheck.

Observed on macOS 26.5.2 arm64:

```text
GNU Make 3.81
Task 3.52.0
mise 2026.7.15 macos-arm64
ShellCheck 0.11.0
```

All three runners produced the same action order and preserved `alpha` plus `beta gamma` as two
arguments. All three rejected the missing `.ready` precondition. Task and mise provided their task
lists from descriptions; Make needed a custom help recipe.

The official latest-release API reported Task v3.52.0 and mise v2026.8.1 at the time of the spike:

```sh
gh api repos/go-task/task/releases/latest --jq '.tag_name + " " + .published_at'
gh api repos/jdx/mise/releases/latest --jq '.tag_name + " " + .published_at'
```

## Bootstrap evidence

The Ubuntu workshop laptop was inspected without changing its tools:

```sh
ssh a242168@192.168.178.74 \
  'for tool in make task mise; do command -v "$tool" || echo "$tool=missing"; done'
```

It ran Ubuntu 26.04 x86_64 with GNU Make 4.4.1; Task and mise were absent from PATH.

A pristine Ubuntu 26.04 container on that laptop was also checked:

```sh
ssh a242168@192.168.178.74 \
  "docker run --rm ubuntu:26.04 sh -c \
  'for tool in make task mise curl bash; do command -v \"\$tool\" || echo \"\$tool=missing\"; done'"
```

The image contained Bash, but Make, Task, mise, and curl were all absent. This is not a complete
Docker-enabled participant image, but it proves none of the candidate runners is an Ubuntu base
guarantee. WSL2 with an Ubuntu distribution has the same package-level risk.

## PATH and pinning evidence

From the repository root, an intentionally restricted PATH still resolved the locked tools through
mise:

```sh
env PATH=/usr/bin:/bin /opt/homebrew/bin/mise exec -- \
  sh -c 'command -v kind; kind version'
env PATH=/usr/bin:/bin /opt/homebrew/bin/mise exec -- \
  sh -c 'command -v kubectl; kubectl version --client=true'
```

The commands resolved `kind` 0.32.0 and `kubectl` 1.36.1 under the mise install directory. Their
platform URLs and SHA-256 checksums are recorded in the repository's existing `mise.lock`.

Go Task 3.52.0 is available through mise's Aqua registry:

```sh
mise registry task
mise ls-remote task | tail
```

Therefore a future Task adoption could be pinned and checksummed without adding a separate install
script. It would still be an additional managed executable, while mise tasks reuse the runner that
already installs the Kubernetes tools.
