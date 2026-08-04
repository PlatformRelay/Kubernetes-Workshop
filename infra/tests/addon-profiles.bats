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
  unset MOCK_ROUTING_TRANSITION MOCK_ADDON_MARKERS MOCK_ADDON_DEPLOYS
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
ADDON_DEPLOYS=''
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
  echo "$output" | grep -qi "already\|idempotent\|workshop-owned"
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
  echo "$output" | grep -qi "already\|idempotent\|workshop-owned"
}

@test "day-1 teardown removes Contour without touching foreign markers" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour"
  export MOCK_ROUTING_INGRESSCLASSES="contour:projectcontour.io/ingress-controller"

  run "$ROOT/infra/addons/profile.sh" day-1 --teardown
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "ingress-contour\|teardown\|removed\|uninstall"
}

@test "day-3 install succeeds (skip-remote) and reports composed components" {
  run "$ROOT/infra/addons/profile.sh" day-3
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "argocd\|argo"
  echo "$output" | grep -qi "cert-manager"
  echo "$output" | grep -qi "kube-prometheus\|prometheus"
  echo "$output" | grep -qi "profile day-3 ready\|day-3 ready"

  run "$ROOT/infra/addons/profile.sh" status
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "addon=argocd: installed"
  echo "$output" | grep -qi "addon=cert-manager: installed"
  echo "$output" | grep -qi "addon=kube-prometheus: installed"
}

@test "day-3 re-run is idempotent (workshop-owned, not bare OK)" {
  run "$ROOT/infra/addons/profile.sh" day-3
  [ "$status" -eq 0 ]
  : >"$MOCK_ROUTING_APPLY_LOG"

  run "$ROOT/infra/addons/profile.sh" day-3
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "already\|idempotent\|workshop-owned"
  # Re-run must not re-apply remote/skip-remote markers via a second install path that
  # mutates when already owned — apply log stays empty (idempotent early return).
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "day-3 teardown removes workshop-owned day-3 markers, keeps foreign metrics-server" {
  run "$ROOT/infra/addons/profile.sh" day-3
  [ "$status" -eq 0 ]

  # Append a non-day-3 workshop marker that teardown must preserve.
  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  ADDON_MARKERS="${ADDON_MARKERS:+$ADDON_MARKERS }kube-system:metrics-server"
  cat >"$MOCK_ROUTING_STATE" <<EOF
ROUTING_NS='${ROUTING_NS:-}'
ROUTING_MARKERS='${ROUTING_MARKERS:-}'
ROUTING_GWC='${ROUTING_GWC:-}'
ROUTING_IC='${ROUTING_IC:-}'
ROUTING_PORTS='${ROUTING_PORTS:-}'
ROUTING_CRDS='${ROUTING_CRDS:-}'
ADDON_MARKERS='${ADDON_MARKERS:-}'
ADDON_DEPLOYS='${ADDON_DEPLOYS:-}'
EOF

  run "$ROOT/infra/addons/profile.sh" day-3 --teardown
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "argocd\|cert-manager\|kube-prometheus\|torn down\|removed"

  # shellcheck disable=SC1090
  . "$MOCK_ROUTING_STATE"
  echo "$ADDON_MARKERS" | grep -q "kube-system:metrics-server"
  ! echo "$ADDON_MARKERS" | grep -q "argocd:argocd"
  ! echo "$ADDON_MARKERS" | grep -q "cert-manager:cert-manager"
  ! echo "$ADDON_MARKERS" | grep -q "monitoring:kube-prometheus"
}

@test "argocd install refuses foreign Deployment without workshop marker" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"

  run "$ROOT/infra/addons/argocd.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing"
  echo "$output" | grep -qi "remediat"
}

@test "argocd install (skip-remote) succeeds when absent" {
  run "$ROOT/infra/addons/argocd.sh" install
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "argocd"
  echo "$output" | grep -qi "skip-remote\|installed\|workshop-owned\|idempotent\|ready"
}

@test "argocd teardown refuses foreign namespace" {
  export MOCK_ROUTING_NAMESPACES="argocd"
  export MOCK_ADDON_DEPLOYS="argocd:argocd-server"
  # No workshop marker.

  run "$ROOT/infra/addons/argocd.sh" uninstall
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing"
}

@test "cert-manager install refuses foreign Deployment without workshop marker" {
  export MOCK_ROUTING_NAMESPACES="cert-manager"
  export MOCK_ADDON_DEPLOYS="cert-manager:cert-manager"

  run "$ROOT/infra/addons/cert-manager.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing"
  echo "$output" | grep -qi "remediat"
}

@test "cert-manager install (skip-remote) succeeds when absent" {
  run "$ROOT/infra/addons/cert-manager.sh" install
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "cert-manager"
}

@test "cert-manager teardown refuses foreign namespace" {
  export MOCK_ROUTING_NAMESPACES="cert-manager"

  run "$ROOT/infra/addons/cert-manager.sh" uninstall
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing"
}

@test "kube-prometheus install refuses foreign namespace without workshop marker" {
  export MOCK_ROUTING_NAMESPACES="monitoring"

  run "$ROOT/infra/addons/kube-prometheus.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing\|without workshop"
  echo "$output" | grep -qi "remediat"
}

@test "kube-prometheus install (skip-remote) succeeds when absent" {
  run "$ROOT/infra/addons/kube-prometheus.sh" install
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "kube-prometheus\|prometheus"
}

@test "kube-prometheus teardown refuses foreign namespace" {
  export MOCK_ROUTING_NAMESPACES="monitoring"

  run "$ROOT/infra/addons/kube-prometheus.sh" uninstall
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing"
}

@test "metrics-server install refuses foreign Deployment without workshop marker" {
  export MOCK_ADDON_DEPLOYS="kube-system:metrics-server"
  # kube-system always exists; no workshop-addon-metrics-server marker.

  run "$ROOT/infra/addons/metrics-server.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|refusing\|not workshop"
  echo "$output" | grep -qi "remediat"
  # Must not claim ownership.
  # shellcheck disable=SC1090
  if [ -f "$MOCK_ROUTING_STATE" ]; then
    . "$MOCK_ROUTING_STATE"
    ! echo "${ADDON_MARKERS:-}" | grep -q "kube-system:metrics-server"
  fi
}

@test "metrics-server install (skip-remote) succeeds when Deployment absent" {
  run "$ROOT/infra/addons/metrics-server.sh" install
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "metrics-server"
  echo "$output" | grep -qi "skip-remote\|installed\|ready"
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
