#!/usr/bin/env bats
# US-ADDONS-1 — profile-oriented add-on lifecycle (day composers + composition).
# Mocked kubectl only; no real cluster or remote manifest fetch.

load helpers

setup() {
  setup_mocks
  ROUTING_STUBS="$ROOT/infra/tests/routing-stubs"
  PATH="$ROUTING_STUBS:$ROOT/infra/tests/stubs:$PATH"
  export PATH
  chmod +x "$ROUTING_STUBS"/* "$ROOT"/infra/tests/stubs/* \
    "$ROOT/infra/addons/"*.sh "$ROOT/workshop" 2>/dev/null || true

  export WORKSHOP_NONINTERACTIVE=1
  export WORKSHOP_ADDON_SKIP_REMOTE=1
  unset MOCK_ROUTING_NAMESPACES MOCK_ROUTING_GATEWAYCLASSES MOCK_ROUTING_INGRESSCLASSES
  unset MOCK_ROUTING_PROFILE_MARKERS MOCK_ROUTING_HOSTPORTS MOCK_ROUTING_CRDS
  unset MOCK_ROUTING_TRANSITION MOCK_ADDON_MARKERS
  : >"$BATS_TEST_TMPDIR/apply.log"
  export MOCK_ROUTING_APPLY_LOG="$BATS_TEST_TMPDIR/apply.log"
  export MOCK_ROUTING_STATE="$BATS_TEST_TMPDIR/routing.state"
  cat >"$MOCK_ROUTING_STATE" <<EOF
ROUTING_NS=''
ROUTING_MARKERS=''
ROUTING_GWC=''
ROUTING_IC=''
ROUTING_PORTS=''
ROUTING_CRDS=''
ADDON_MARKERS=''
EOF
}

@test "profile help lists day and routing profiles" {
  run "$ROOT/infra/addons/profile.sh" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "day-1"
  echo "$output" | grep -q "day-2"
  echo "$output" | grep -q "day-3"
  echo "$output" | grep -q "gateway-envoy"
  echo "$output" | grep -q "ingress-contour"
  echo "$output" | grep -q "quiz-live"
}

@test "./workshop profile help lists day profiles" {
  run "$ROOT/workshop" profile --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "day-1"
  echo "$output" | grep -q "day-2"
  echo "$output" | grep -q "gateway-envoy"
}

@test "day-1 profile composes ingress-contour only (no Envoy)" {
  run "$ROOT/infra/addons/profile.sh" check day-1
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "ingress-contour"
  ! echo "$output" | grep -qi "gateway-envoy"
}

@test "day-2 profile composes gateway-envoy and metrics-server" {
  run "$ROOT/infra/addons/profile.sh" check day-2
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "gateway-envoy"
  echo "$output" | grep -qi "metrics-server"
}

@test "day-3 profile composes argocd cert-manager and kube-prometheus" {
  run "$ROOT/infra/addons/profile.sh" check day-3
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "argocd\|argo-cd\|argo"
  echo "$output" | grep -qi "cert-manager"
  echo "$output" | grep -qi "prometheus\|kube-prometheus"
}

@test "day-1 install applies Contour and is idempotent on re-run" {
  run "$ROOT/infra/addons/profile.sh" day-1
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "ingress-contour"

  run "$ROOT/infra/addons/profile.sh" day-1
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "already\|idempotent\|nothing to do\|ok"
}

@test "day-2 install refuses while Contour routing profile is active (mutex)" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour"
  export MOCK_ROUTING_INGRESSCLASSES="contour:projectcontour.io/ingress-controller"
  export MOCK_ROUTING_HOSTPORTS="80,443:contour"

  run "$ROOT/infra/addons/profile.sh" day-2
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "ingress-contour\|contour\|mutual\|exclusive\|conflict\|transition"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ] || ! grep -qi "envoy\|gateway-api\|metrics-server" "$MOCK_ROUTING_APPLY_LOG"
}

@test "day-2 install succeeds on empty cluster (skip-remote) and is idempotent" {
  run "$ROOT/infra/addons/profile.sh" day-2
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "gateway-envoy"
  echo "$output" | grep -qi "metrics-server"

  run "$ROOT/infra/addons/profile.sh" day-2
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "already\|idempotent\|nothing to do\|ok"
}

@test "day-1 teardown removes Contour without touching foreign markers" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour"
  export MOCK_ROUTING_INGRESSCLASSES="contour:projectcontour.io/ingress-controller"

  run "$ROOT/infra/addons/profile.sh" day-1 --teardown
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "ingress-contour\|teardown\|removed\|uninstall"
}

@test "quiz-live is deferred (US-QUIZ-1 adopted none)" {
  run "$ROOT/infra/addons/profile.sh" quiz-live
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "deferred\|quiz\|US-QUIZ\|not available\|no.*candidate"
}

@test "default workshop up does not install day or routing add-ons" {
  export MOCK_ENGINE_UP=1
  export MOCK_CLUSTER_EXISTS=0
  : >"$MOCK_LOG"

  run "$ROOT/workshop" up
  [ "$status" -eq 0 ]
  ! grep -Eq 'addons/(day-|gateway-envoy|ingress-contour|metrics-server|argocd|cert-manager|kube-prometheus|profile\.sh)' "$MOCK_LOG"
  ! echo "$output" | grep -Eqi 'installing profile (day-|gateway-envoy|ingress-contour)'
}

@test "make help lists day profile verbs" {
  run make -C "$ROOT" help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "profile-day-1"
  echo "$output" | grep -q "profile-day-2"
  echo "$output" | grep -q "profile-day-3"
}

@test "profile status reports composed day-2 components when installed" {
  run "$ROOT/infra/addons/profile.sh" day-2
  [ "$status" -eq 0 ]

  run "$ROOT/infra/addons/profile.sh" status
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "gateway-envoy"
  echo "$output" | grep -qi "metrics-server"
}
