#!/usr/bin/env bats
# US-GATEWAY-1 — mutual exclusion + preflight for gateway-envoy / ingress-contour.
# Mocked kubectl only; no real cluster or remote manifest fetch.

load helpers

setup() {
  setup_mocks
  ROUTING_STUBS="$ROOT/infra/tests/routing-stubs"
  PATH="$ROUTING_STUBS:$ROOT/infra/tests/stubs:$PATH"
  export PATH
  chmod +x "$ROUTING_STUBS"/* "$ROOT"/infra/tests/stubs/* \
    "$ROOT/infra/addons/"*.sh "$ROOT/workshop"

  export WORKSHOP_NONINTERACTIVE=1
  export WORKSHOP_ADDON_SKIP_REMOTE=1
  unset MOCK_ROUTING_NAMESPACES MOCK_ROUTING_GATEWAYCLASSES MOCK_ROUTING_INGRESSCLASSES
  unset MOCK_ROUTING_PROFILE_MARKERS MOCK_ROUTING_HOSTPORTS MOCK_ROUTING_CRDS
  unset MOCK_ROUTING_TRANSITION
  : >"$BATS_TEST_TMPDIR/apply.log"
  export MOCK_ROUTING_APPLY_LOG="$BATS_TEST_TMPDIR/apply.log"
  # Mutable state so uninstall/transition can clear Contour/Envoy markers mid-test.
  export MOCK_ROUTING_STATE="$BATS_TEST_TMPDIR/routing.state"
  cat >"$MOCK_ROUTING_STATE" <<EOF
ROUTING_NS=''
ROUTING_MARKERS=''
ROUTING_GWC=''
ROUTING_IC=''
ROUTING_PORTS=''
ROUTING_CRDS=''
EOF
}

sync_routing_state_from_env() {
  # Copy MOCK_ROUTING_* into the mutable state file after a test sets them.
  cat >"$MOCK_ROUTING_STATE" <<EOF
ROUTING_NS='${MOCK_ROUTING_NAMESPACES:-}'
ROUTING_MARKERS='${MOCK_ROUTING_PROFILE_MARKERS:-}'
ROUTING_GWC='${MOCK_ROUTING_GATEWAYCLASSES:-}'
ROUTING_IC='${MOCK_ROUTING_INGRESSCLASSES:-}'
ROUTING_PORTS='${MOCK_ROUTING_HOSTPORTS:-}'
ROUTING_CRDS='${MOCK_ROUTING_CRDS:-}'
EOF
}

@test "preflight allows gateway-envoy on an empty cluster" {
  run "$ROOT/infra/addons/routing-preflight.sh" check gateway-envoy
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "ok\|clear\|pass"
}

@test "preflight allows ingress-contour on an empty cluster" {
  run "$ROOT/infra/addons/routing-preflight.sh" check ingress-contour
  [ "$status" -eq 0 ]
}

@test "preflight refuses gateway-envoy when workshop Contour is installed" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour"
  export MOCK_ROUTING_INGRESSCLASSES="contour:projectcontour.io/ingress-controller"
  export MOCK_ROUTING_HOSTPORTS="80,443:contour"

  run "$ROOT/infra/addons/routing-preflight.sh" check gateway-envoy
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "ingress-contour\|contour"
  echo "$output" | grep -qi "transition\|teardown\|remediat"
  # Must not mutate before failing.
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses ingress-contour when workshop Envoy Gateway is installed" {
  export MOCK_ROUTING_NAMESPACES="envoy-gateway-system"
  export MOCK_ROUTING_PROFILE_MARKERS="envoy-gateway-system:gateway-envoy"
  export MOCK_ROUTING_GATEWAYCLASSES="eg:gateway.envoyproxy.io/gatewayclass-controller"
  export MOCK_ROUTING_HOSTPORTS="80,443:envoy-gateway"

  run "$ROOT/infra/addons/routing-preflight.sh" check ingress-contour
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "gateway-envoy\|envoy"
  echo "$output" | grep -qi "transition\|teardown\|remediat"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses gateway-envoy when foreign Contour namespace exists" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  # No workshop ownership marker → foreign.

  run "$ROOT/infra/addons/routing-preflight.sh" check gateway-envoy
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|not workshop"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses ingress-contour when foreign Envoy Gateway namespace exists" {
  export MOCK_ROUTING_NAMESPACES="envoy-gateway-system"

  run "$ROOT/infra/addons/routing-preflight.sh" check ingress-contour
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|not workshop"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses gateway-envoy when GatewayClass eg is owned by another controller" {
  export MOCK_ROUTING_GATEWAYCLASSES="eg:example.com/other-controller"

  run "$ROOT/infra/addons/routing-preflight.sh" check gateway-envoy
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "gatewayclass\|eg\|controller"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "preflight refuses when host ports 80/443 are claimed by the other stack" {
  export MOCK_ROUTING_HOSTPORTS="80,443:contour"

  run "$ROOT/infra/addons/routing-preflight.sh" check gateway-envoy
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "port\|80\|443"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "detect reports none on an empty cluster" {
  run "$ROOT/infra/addons/routing-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "none"
}

@test "detect reports gateway-envoy when workshop marker is present" {
  export MOCK_ROUTING_NAMESPACES="envoy-gateway-system"
  export MOCK_ROUTING_PROFILE_MARKERS="envoy-gateway-system:gateway-envoy"
  export MOCK_ROUTING_GATEWAYCLASSES="eg:gateway.envoyproxy.io/gatewayclass-controller"

  run "$ROOT/infra/addons/routing-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "gateway-envoy"
}

@test "detect reports ingress-contour when workshop marker is present" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour"
  export MOCK_ROUTING_INGRESSCLASSES="contour:projectcontour.io/ingress-controller"

  run "$ROOT/infra/addons/routing-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "ingress-contour"
}

@test "detect reports conflict when both Contour and Envoy namespaces exist" {
  export MOCK_ROUTING_NAMESPACES="projectcontour envoy-gateway-system"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour envoy-gateway-system:gateway-envoy"

  run "$ROOT/infra/addons/routing-preflight.sh" detect
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx "conflict"
}

@test "install gateway-envoy is idempotent when already workshop-owned" {
  export MOCK_ROUTING_NAMESPACES="envoy-gateway-system"
  export MOCK_ROUTING_PROFILE_MARKERS="envoy-gateway-system:gateway-envoy"
  export MOCK_ROUTING_GATEWAYCLASSES="eg:gateway.envoyproxy.io/gatewayclass-controller"
  export MOCK_ROUTING_CRDS="gateways.gateway.networking.k8s.io"

  run "$ROOT/infra/addons/gateway-envoy.sh" install
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "already\|idempotent\|nothing to do\|ok"
}

@test "install ingress-contour refuses while gateway-envoy is active (no silent dual install)" {
  export MOCK_ROUTING_NAMESPACES="envoy-gateway-system"
  export MOCK_ROUTING_PROFILE_MARKERS="envoy-gateway-system:gateway-envoy"
  export MOCK_ROUTING_GATEWAYCLASSES="eg:gateway.envoyproxy.io/gatewayclass-controller"

  run "$ROOT/infra/addons/ingress-contour.sh" install
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "gateway-envoy\|mutual\|exclusive\|conflict\|transition"
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "install gateway-envoy refuses while ingress-contour is active" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour"
  export MOCK_ROUTING_INGRESSCLASSES="contour:projectcontour.io/ingress-controller"

  run "$ROOT/infra/addons/gateway-envoy.sh" install
  [ "$status" -ne 0 ]
  [ ! -s "$MOCK_ROUTING_APPLY_LOG" ]
}

@test "transition Contour→Envoy tears down Contour then installs Envoy" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  export MOCK_ROUTING_PROFILE_MARKERS="projectcontour:ingress-contour"
  export MOCK_ROUTING_INGRESSCLASSES="contour:projectcontour.io/ingress-controller"
  export MOCK_ROUTING_HOSTPORTS="80,443:contour"

  # Transition script should clear Contour then install Envoy; the stub flips state
  # when uninstall is invoked.
  export MOCK_ROUTING_TRANSITION=1

  run "$ROOT/infra/addons/routing-profile.sh" transition gateway-envoy
  [ "$status" -eq 0 ]
  grep -q "uninstall:ingress-contour\|teardown:ingress-contour\|delete.*projectcontour\|workshop-routing-profile" "$MOCK_LOG" || \
    grep -qi "teardown\|uninstall\|removed" <<<"$output"
  echo "$output" | grep -qi "gateway-envoy"
}

@test "transition Envoy→Contour tears down Envoy then installs Contour" {
  export MOCK_ROUTING_NAMESPACES="envoy-gateway-system"
  export MOCK_ROUTING_PROFILE_MARKERS="envoy-gateway-system:gateway-envoy"
  export MOCK_ROUTING_GATEWAYCLASSES="eg:gateway.envoyproxy.io/gatewayclass-controller"
  export MOCK_ROUTING_TRANSITION=1

  run "$ROOT/infra/addons/routing-profile.sh" transition ingress-contour
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "ingress-contour"
}

@test "teardown gateway-envoy removes workshop-owned resources only" {
  export MOCK_ROUTING_NAMESPACES="envoy-gateway-system"
  export MOCK_ROUTING_PROFILE_MARKERS="envoy-gateway-system:gateway-envoy"
  export MOCK_ROUTING_GATEWAYCLASSES="eg:gateway.envoyproxy.io/gatewayclass-controller"
  export MOCK_ROUTING_CRDS="gateways.gateway.networking.k8s.io"

  run "$ROOT/infra/addons/gateway-envoy.sh" uninstall
  [ "$status" -eq 0 ]
  # Must not delete shared Gateway API CRDs by default.
  ! grep -Eq 'delete.*(crd|customresourcedefinition).*gateway\.networking' "$MOCK_LOG"
  echo "$output" | grep -qi "crd\|preserv" || true
}

@test "teardown refuses foreign Contour (no ownership marker)" {
  export MOCK_ROUTING_NAMESPACES="projectcontour"
  # no MOCK_ROUTING_PROFILE_MARKERS

  run "$ROOT/infra/addons/ingress-contour.sh" uninstall
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi "foreign\|unowned\|not workshop\|refusing"
  ! grep -Eq '^kubectl delete' "$MOCK_LOG"
}

@test "./workshop profile help lists mutually exclusive routing profiles" {
  run "$ROOT/workshop" profile --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "gateway-envoy"
  echo "$output" | grep -q "ingress-contour"
  echo "$output" | grep -qi "exclusive\|mutual\|never.*alongside\|one at a time"
}

@test "make help lists profile-gateway-envoy and profile-ingress-contour" {
  run make -C "$ROOT" help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "profile-gateway-envoy"
  echo "$output" | grep -q "profile-ingress-contour"
}
