# ADR 0010: Keep the workshop entrypoint and defer a task-runner migration

- **Status:** accepted
- **Scope:** the participant-facing environment command and the thin orchestration layer behind
  it. This ADR amends only the "Single task entrypoint" part of
  [ADR 0006](0006-workshop-environment-and-iac.md).

## Context

The workshop currently has two related interfaces:

- `./workshop up|down|doctor` is the documented participant contract; and
- a small root `Makefile` exposes compatibility verbs and is called by the bootstrap.

The environment is expected to grow composed add-on profiles, so Go Task and mise tasks may be
more readable than progressively extending Make. Any runner change must still work for a learner
on macOS, Linux, or WSL2, including a shell where mise-managed tools have not been activated.
Native Windows is not a supported lab environment today.

This timeboxed spike compared the current Make layer, Go Task 3.52.0, and mise tasks using an
installed mise 2026.7.15 and a CI fixture pinned to mise 2026.8.1. The fixture and recorded results
are in [the ADR evidence directory](evidence/0010-task-runner-spike/results.md). The comparison used
real candidate configuration behind one `workshop` wrapper: command discovery, `up`, `down`,
`doctor`, an observability profile that composes Gateway API and metrics-server add-ons, arguments
containing whitespace and globs, non-interactive environment propagation, dependencies, and
preconditions.

## Options considered

### Keep thin Make

Make already exists in the repository and its targets are easy compatibility aliases. It has
dependency ordering and supports any shell command, but help, argument validation, and actionable
preconditions are hand-written. Shell embedded in a Makefile is also less directly lintable than a
standalone script.

Most importantly, Make is not guaranteed on a clean supported host. A pristine Ubuntu 26.04 image
had no `make`, `task`, `mise`, or `curl`. The tested workshop laptop had GNU Make 4.4.1, but that is
machine state rather than a workshop guarantee. Calling Make from `./workshop up` therefore leaves
a hidden bootstrap prerequisite.

### Replace Make with Go Task

[Task](https://taskfile.dev/) provides native task listing, dependency graphs, preconditions,
status checks, platform filters, and structured composition. Arguments after `--` are available as
`CLI_ARGS`, as documented in its [CLI reference](https://taskfile.dev/docs/reference/cli). It is a
single native binary for Linux, macOS, and Windows. Official release archives publish SHA-256
checksums, and the installer can request a specific release
([installation documentation](https://taskfile.dev/docs/installation)). It could also be pinned as
`task = "3.52.0"` through mise's Aqua backend and covered by `mise.lock`.

Those features do not currently justify another required executable. Task was absent from the
tested pristine Ubuntu image and Ubuntu laptop. WSL2 was not available for this spike and no claim
is made about a particular WSL2 installation. Installing Task through mise avoids an
unverified curl bootstrap, but then Task is not available until the existing bootstrap has installed
mise and the locked toolchain. Native Windows support is not a present advantage because the
workshop intentionally directs Windows participants to WSL2.

### Use mise tasks

Mise already owns the pinned participant toolchain. Its task system provides native descriptions,
arguments, dependencies, parallel graph execution, source/output tracking, and Windows-specific
commands ([task documentation](https://mise.jdx.dev/tasks/) and
[task configuration](https://mise.jdx.dev/tasks/task-configuration.html)). A mise task runs in the
configured tool environment, so it avoids the post-install PATH problem without requiring shell
activation. The strict fixture confirmed that every candidate, including Make and Task, resolved a
fixture-managed `kind` 0.32.0 while the host PATH contained only `/usr/bin:/bin` and had no `kind`.

Mise has the same bootstrap boundary as Task: it cannot run a task before `./workshop` finds or
installs mise. Inline TOML commands are no more shellcheck-friendly than inline Make or YAML, so
non-trivial behavior must remain in standalone scripts.

## Decision

Do not migrate to a Taskfile now.

1. `./workshop up|down|doctor` remains the stable and only required participant task entrypoint.
   Labs and setup instructions must not require learners to know Make, Task, or `mise run`.
2. Environment behavior stays in shell scripts under `infra/`. Runner definitions may compose and
   validate scripts but must not reimplement Kubernetes operations.
3. The small Makefile remains as an optional compatibility interface while it has only thin aliases.
   The bootstrap critical path must be made independent of a system `make`; that follow-up moves the
   remaining kind create/delete behavior into lintable `infra/` scripts and lets both `./workshop`
   and Make call those scripts. This spike does not implement that follow-up.
4. Mise tasks are the preferred successor if the material-advantage threshold below is reached.
   Go Task is not selected because its strongest additional benefit, native Windows operation, is
   outside the supported environment and it would add a second bootstrapped runner.

### Material-advantage threshold

A migration is justified only when all of these conditions hold:

- there are at least eight public environment verbs, including at least two composed add-on
  profiles with real dependency or precondition graphs;
- a mise-task prototype removes at least 25 lines of duplicated orchestration or three repeated
  shell checks while keeping the scripts as the logic source;
- `./workshop` remains usable before mise is installed and does not require Make or Task on its
  bootstrap path; and
- the unchanged participant commands pass macOS, Linux, fresh Ubuntu, and WSL2 smoke tests.

Native PowerShell support would trigger a new comparison rather than automatically selecting Go
Task. The comparison must include the actual container-engine and Kubernetes tooling constraints,
not only whether a runner binary starts on Windows.

### Compatibility and rollback

If the threshold is reached, add mise tasks behind `./workshop` first and retain matching Make
aliases for at least one compatibility cycle. No lab command changes during that period. A rollback
removes the task definitions and points the aliases back at the same `infra/` scripts; no Kubernetes
logic or participant command changes because neither lives in the runner configuration.

## Consequences

- There is no new runtime dependency or participant command from this spike.
- Taskfile's better YAML ergonomics are deliberately deferred until they solve a measured problem.
- Mise remains responsible for tool versions, checksums, and activated command execution; a future
  mise-task layer would reuse that trust boundary.
- Removing Make from the bootstrap path is a separate reliability fix, not a task-runner migration.
- A future native-Windows commitment may change the result, but WSL2 support alone does not.
- WSL2 remains an explicit migration gate because it was not exercised in this spike.
