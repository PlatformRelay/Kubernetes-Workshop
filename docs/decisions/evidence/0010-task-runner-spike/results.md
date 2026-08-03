# Task-runner spike evidence

Captured on 2026-08-03. The fixture places Make, Go Task, and mise tasks behind the same
`workshop --runner <candidate>` wrapper. Every verb delegates to standalone scripts, matching the
intended architecture in which runner files contain discovery and composition rather than
Kubernetes logic.

## Strict feature comparison

From the repository root:

```sh
docs/decisions/evidence/0010-task-runner-spike/verify.sh --strict
```

Strict mode fails if Make or mise is missing, or if locked Task 3.52.0, kind 0.32.0, and ShellCheck
0.11.0 cannot be installed.
There are no skipped candidates. It asserts exact output for:

- discovery of `help`, `up`, `down`, `doctor`, `profile-observability`, `args`, and `tool-version`;
- ordered `up` → Gateway API add-on → metrics-server add-on → `doctor` composition;
- `WORKSHOP_NONINTERACTIVE=1` on every composed operation;
- argument boundaries and literal metacharacters: `alpha`, `beta gamma`, the unexpanded `*.md`
  glob, `$HOME`, `$(printf injected)`, `semi;colon`, and backtick command text; and
- kind 0.32.0 resolved from mise while `kind` is absent from the restricted host PATH.

It also requires all candidates to reject a missing `.ready` precondition and checks all fixture
shell with ShellCheck. `mise.lock` contains platform URLs and SHA-256 checksums for Task, kind, and
ShellCheck.

The Make adapter uses a temporary NUL-delimited argument file. Passing arguments in a Make
command-line variable is intentionally not used: Make expands dollar syntax before the recipe
shell sees it. Task and mise receive the same argument vector directly after `--`.

Observed on macOS 26.5.2 arm64:

```text
GNU Make 3.81
Task 3.52.0
mise 2026.7.15 macos-arm64
ShellCheck 0.11.0
```

The official latest-release API reported Task v3.52.0 and mise v2026.8.1 at capture time:

```sh
gh api repos/go-task/task/releases/latest --jq '.tag_name + " " + .published_at'
gh api repos/jdx/mise/releases/latest --jq '.tag_name + " " + .published_at'
```

## Bootstrap evidence

The Ubuntu workshop laptop was inspected without changing its installed tools:

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

The image contained Bash, but Make, Task, mise, and curl were absent. This does not model Docker
installation or a complete participant machine; it only proves that none of the candidate runners
is guaranteed by the Ubuntu base image.

No live WSL2 host was available. WSL2 bootstrap, filesystem, and Docker Desktop integration remain
untested and are explicitly required before any runner migration.

## CI ergonomics

`ci-workflow.yml` is an inactive, reproducible GitHub Actions fixture, not a repository workflow.
It pins checkout and mise actions by commit, pins mise 2026.8.1, installs the evidence lock, and runs
the strict suite on Ubuntu 24.04. It can be copied to a temporary branch for an actual Actions run;
that remote execution was not part of this spike.

The fixture makes the CI trade-off concrete:

| Candidate | CI preparation in the fixture | Tool PATH behavior |
| --- | --- | --- |
| Make | Relies on the runner image's Make; strict mode fails if absent | Wrapper uses `mise exec` |
| Go Task | Downloads locked Task 3.52.0 through the existing mise install step | Wrapper uses `mise exec` |
| mise tasks | Uses the already-required pinned mise action | Tasks activate locked tools directly |

Task therefore needs no separate setup action if adopted, but it remains an additional downloaded
binary. Mise tasks reuse the runner already needed for the workshop toolchain. Make has no download
in this specific GitHub image, but that is image state rather than a repository pin.

Validate the inactive workflow fixture locally with the repository-managed `yq`:

```sh
mise exec -- yq '.' \
  docs/decisions/evidence/0010-task-runner-spike/ci-workflow.yml >/dev/null
```
