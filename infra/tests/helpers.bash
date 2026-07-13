# shellcheck shell=bash
# Shared bats helpers: point PATH at the mock binaries and load the pin file
# so assertions can never drift from infra/versions.env.

repo_root() {
  cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd
}

setup_mocks() {
  ROOT="$(repo_root)"
  export ROOT

  # Every stub appends its invocation here; tests assert against it.
  MOCK_LOG="$BATS_TEST_TMPDIR/mock.log"
  : > "$MOCK_LOG"
  export MOCK_LOG

  PATH="$ROOT/infra/tests/stubs:$PATH"
  export PATH

  # Load the pins (KIND_VERSION, KIND_NODE_IMAGE, ...) for assertions.
  # shellcheck source=../versions.env disable=SC1091
  . "$ROOT/infra/versions.env"
}
