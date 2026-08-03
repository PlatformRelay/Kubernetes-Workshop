#!/usr/bin/env bats
# Fail-closed tests for the disposable-cluster identity guard (US-SAFETY-1).

load helpers

setup() {
  setup_mocks
  GUARD_STUBS="$ROOT/infra/tests/context-guard-stubs"
  PATH="$GUARD_STUBS:$PATH"
  export PATH
  chmod +x "$GUARD_STUBS"/* "$ROOT/infra/context-guard.sh"

  export WORKSHOP_CLUSTER_NAME="workshop"
  export MOCK_KUBECTL_CONTEXT="kind-workshop"
  export MOCK_KUBECTL_CLUSTER="kind-workshop"
  export MOCK_KUBECTL_SERVER="https://127.0.0.1:6443"
  export MOCK_KUBECTL_NAMESPACE="escape"
  export MOCK_KIND_CLUSTERS="workshop"
  export MOCK_KIND_NODES="workshop-control-plane"
  export MOCK_KIND_SERVER="https://127.0.0.1:6443"
  export MOCK_NODE_IDENTITY="workshop-control-plane|kind://docker/workshop/workshop-control-plane"
  export MOCK_OWNERSHIP_CLUSTER="workshop"
  export MOCK_OWNERSHIP_ERROR='Error from server (NotFound): configmaps "platformrelay-workshop-ownership" not found'
  unset MOCK_CURRENT_CONTEXT_EXIT MOCK_CONFIG_VIEW_EXIT MOCK_KIND_EXIT
  unset MOCK_NODE_EXIT MOCK_OWNERSHIP_EXIT MOCK_OWNERSHIP_ERROR_KIND
}

write_guarded_step() {
  cat > "$BATS_TEST_TMPDIR/guarded-step.sh" <<EOF
#!/usr/bin/env sh
"$ROOT/infra/context-guard.sh" || exit \$?
kubectl $1
EOF
  chmod +x "$BATS_TEST_TMPDIR/guarded-step.sh"
}

assert_no_offensive_call() {
  local leaked
  leaked="$(grep -E '^kubectl (apply|create|delete|label|patch|replace|exec|run|cp)( |$)' "$MOCK_LOG" || true)"
  [ -z "$leaked" ] || {
    echo "offensive kubectl call(s) escaped the guard:" >&2
    echo "$leaked" >&2
    return 1
  }
}

assert_guarded_apply_refused() {
  write_guarded_step "apply -f pod-escape.yaml"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "REFUSING"
  assert_no_offensive_call
}

@test "guard accepts only the fully identified, owned workshop kind cluster" {
  run "$ROOT/infra/context-guard.sh"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "context: kind-workshop"
  echo "$output" | grep -q "cluster: kind-workshop"
  echo "$output" | grep -q "server: https://127.0.0.1:6443"
  echo "$output" | grep -q "namespace: escape"
  echo "$output" | grep -q "OK: disposable workshop kind cluster identity verified"
}

@test "guarded step reaches its mutation after the complete guard passes" {
  write_guarded_step "apply -f pod-escape.yaml"
  run "$BATS_TEST_TMPDIR/guarded-step.sh"
  [ "$status" -eq 0 ]
  grep -q '^kubectl apply -f pod-escape.yaml$' "$MOCK_LOG"
}

@test "deceptive kind-* context bound to another kubeconfig cluster fails closed" {
  export MOCK_KUBECTL_CLUSTER="production"
  assert_guarded_apply_refused
}

@test "deceptive kind-* context pointing to a non-kind server fails closed" {
  export MOCK_KUBECTL_SERVER="https://prod.example.invalid:6443"
  assert_guarded_apply_refused
}

@test "deceptive kind-* context on another loopback API server fails closed" {
  export MOCK_KUBECTL_SERVER="https://127.0.0.1:7443"
  assert_guarded_apply_refused
}

@test "wrong lab namespace fails closed before a guarded mutation" {
  export MOCK_KUBECTL_NAMESPACE="default"
  assert_guarded_apply_refused
}

@test "kind-looking kubeconfig without the local kind cluster fails closed" {
  export MOCK_KIND_CLUSTERS="someone-elses-cluster"
  assert_guarded_apply_refused
}

@test "kind-looking cluster without kind node/provider evidence fails closed" {
  export MOCK_NODE_IDENTITY="prod-node|gce://project/zone/prod-node"
  assert_guarded_apply_refused
}

@test "missing ownership marker fails closed" {
  export MOCK_OWNERSHIP_EXIT=1
  assert_guarded_apply_refused
}

@test "ownership marker for another cluster fails closed" {
  export MOCK_OWNERSHIP_CLUSTER="other"
  assert_guarded_apply_refused
}

@test "empty current context fails closed before a guarded mutation" {
  export MOCK_KUBECTL_CONTEXT=""
  assert_guarded_apply_refused
}

@test "kubectl current-context failure fails closed before a guarded mutation" {
  export MOCK_CURRENT_CONTEXT_EXIT=1
  assert_guarded_apply_refused
}

@test "kubectl config inspection failure fails closed before a guarded mutation" {
  export MOCK_CONFIG_VIEW_EXIT=1
  assert_guarded_apply_refused
}

@test "shared cloud context fails closed before a guarded mutation" {
  export MOCK_KUBECTL_CONTEXT="gke_project_europe-west1_prod"
  export MOCK_KUBECTL_CLUSTER="gke_project_europe-west1_prod"
  export MOCK_KUBECTL_SERVER="https://10.0.0.1"
  assert_guarded_apply_refused
}

@test "shared context blocks every offensive kubectl verb used by S25" {
  export MOCK_KUBECTL_CONTEXT="arn:aws:eks:eu-central-1:123456789012:cluster/prod"
  export MOCK_KUBECTL_CLUSTER="prod"
  export MOCK_KUBECTL_SERVER="https://prod.eks.amazonaws.com"

  for mutation in \
    "label --overwrite namespace escape pod-security.kubernetes.io/enforce=privileged" \
    "apply -f pod-escape.yaml" \
    "exec escape -- cat /host/etc/os-release" \
    "delete -f pod-escape.yaml"
  do
    write_guarded_step "$mutation"
    run "$BATS_TEST_TMPDIR/guarded-step.sh"
    [ "$status" -ne 0 ]
  done
  assert_no_offensive_call
}

@test "cluster-name input with shell metacharacters is rejected without execution" {
  export WORKSHOP_CLUSTER_NAME='workshop; touch /tmp/context-guard-pwned'
  run "$ROOT/infra/context-guard.sh"
  [ "$status" -ne 0 ]
  [ ! -e /tmp/context-guard-pwned ]
  assert_no_offensive_call
}

@test "claim mode safely establishes a missing marker after identity checks" {
  export MOCK_OWNERSHIP_EXIT=1
  export MOCK_KUBECTL_NAMESPACE="default"
  run "$ROOT/infra/context-guard.sh" --claim
  [ "$status" -eq 0 ]
  grep -q '^kubectl create configmap platformrelay-workshop-ownership --namespace kube-system --from-literal=cluster=workshop$' "$MOCK_LOG"
  echo "$output" | grep -q "Ownership marker created"
}

@test "claim mode fails closed on marker Forbidden without creating anything" {
  export MOCK_OWNERSHIP_EXIT=1
  export MOCK_OWNERSHIP_ERROR_KIND=forbidden
  export MOCK_KUBECTL_NAMESPACE="default"
  run "$ROOT/infra/context-guard.sh" --claim
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "REFUSING"
  ! grep -q '^kubectl create ' "$MOCK_LOG"
}

@test "claim mode fails closed on marker timeout without creating anything" {
  export MOCK_OWNERSHIP_EXIT=1
  export MOCK_OWNERSHIP_ERROR_KIND=timeout
  export MOCK_KUBECTL_NAMESPACE="default"
  run "$ROOT/infra/context-guard.sh" --claim
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "REFUSING"
  ! grep -q '^kubectl create ' "$MOCK_LOG"
}

@test "claim mode fails closed on marker TLS error without creating anything" {
  export MOCK_OWNERSHIP_EXIT=1
  export MOCK_OWNERSHIP_ERROR_KIND=tls
  export MOCK_KUBECTL_NAMESPACE="default"
  run "$ROOT/infra/context-guard.sh" --claim
  [ "$status" -ne 0 ]
  echo "$output" | grep -q "REFUSING"
  ! grep -q '^kubectl create ' "$MOCK_LOG"
}

@test "claim mode never creates a marker when provider identity is wrong" {
  export MOCK_OWNERSHIP_EXIT=1
  export MOCK_KUBECTL_NAMESPACE="default"
  export MOCK_NODE_IDENTITY="workshop-control-plane|gce://project/zone/workshop-control-plane"
  run "$ROOT/infra/context-guard.sh" --claim
  [ "$status" -ne 0 ]
  ! grep -q '^kubectl create ' "$MOCK_LOG"
}

@test "S25 host-read command block starts with an independent guard before escape execs" {
  lab="$ROOT/labs/day-3/25-pod-escape.md"
  run awk '
    /\*\*Task:\*\* prove you.re reading/ { task=1 }
    task && /^```bash$/ { code=1; next }
    code && /^```$/ { exit bad || execs == 0 }
    code && /^\.\/context-check\.sh / { armed=1; next }
    code && /^kubectl exec escape / {
      execs++
      if (!armed) bad=1
    }
  ' "$lab"
  [ "$status" -eq 0 ]
}

@test "S25 cleanup re-guards each destructive delete before removing the guard" {
  lab="$ROOT/labs/day-3/25-pod-escape.md"
  run awk '
    /^## Cleanup \/ panic reset/ { cleanup=1 }
    cleanup && /^```bash$/ { code=1; next }
    code && /^```$/ { exit bad || deletes != 3 || !removed }
    code && /^\.\/context-check\.sh / { armed=1; next }
    code && /^(kubectl delete pod|kubectl delete namespace|kind delete cluster)/ {
      deletes++
      if (!armed || removed) bad=1
      armed=0
      if ($1 == "kind") cluster_deleted=1
      next
    }
    code && /^rm -f context-check\.sh/ {
      if (!cluster_deleted) bad=1
      removed=1
    }
  ' "$lab"
  [ "$status" -eq 0 ]
}

@test "S25 inline guard is a non-empty byte-identical copy of the canonical guard" {
  lab="$ROOT/labs/day-3/25-pod-escape.md"
  awk "/cat > context-check.sh <<'EOF'/{f=1;next} f&&/^EOF\$/{f=0} f" "$lab" \
    > "$BATS_TEST_TMPDIR/lab-guard.sh"

  [ "$(wc -l < "$BATS_TEST_TMPDIR/lab-guard.sh" | tr -d ' ')" -ge 20 ]
  [ "$(head -n 1 "$BATS_TEST_TMPDIR/lab-guard.sh")" = "#!/usr/bin/env sh" ]
  run diff -u "$ROOT/infra/context-guard.sh" "$BATS_TEST_TMPDIR/lab-guard.sh"
  [ "$status" -eq 0 ]
}
