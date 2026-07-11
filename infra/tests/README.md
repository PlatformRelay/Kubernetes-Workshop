# infra tests

Unit tests for the root `Makefile` verbs and `infra/doctor.sh`, written for
[bats-core](https://github.com/bats-core/bats-core). No cluster and no
container engine are needed: `stubs/` provides mock `kind` / `kubectl` /
`docker` / `podman` binaries that record every invocation to `$MOCK_LOG` and
fake their responses via `MOCK_*` environment variables (see each stub's
header comment).

Run from the repo root:

```sh
bats infra/tests
```

CI runs the same suite plus `shellcheck` over the infra scripts on every
push/PR (see `.github/workflows/ci.yml`).
