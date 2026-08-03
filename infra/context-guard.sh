#!/usr/bin/env sh
# Fail closed unless this is the exact, locally owned disposable kind cluster.

set -eu

marker_name="platformrelay-workshop-ownership"
claim_marker=false

refuse() {
  echo "REFUSING: $*" >&2
  echo "This lab performs a container escape and must run ONLY in a disposable kind cluster you own." >&2
  exit 1
}

case "${1:-}" in
  "") ;;
  --claim) claim_marker=true ;;
  *) refuse "unknown option '$1'" ;;
esac
[ "$#" -le 1 ] || refuse "too many arguments"

expected_cluster="${WORKSHOP_CLUSTER_NAME:-workshop}"
printf '%s\n' "$expected_cluster" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$' || \
  refuse "WORKSHOP_CLUSTER_NAME is not a safe kind cluster name"
expected_context="kind-${expected_cluster}"
expected_node="${expected_cluster}-control-plane"

if ! context="$(kubectl config current-context 2>/dev/null)" || [ -z "$context" ]; then
  refuse "kubectl has no readable current context"
fi
if ! cluster="$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.cluster}' 2>/dev/null)" || [ -z "$cluster" ]; then
  refuse "kubectl cannot resolve the current kubeconfig cluster"
fi
if ! server="$(kubectl config view --minify -o 'jsonpath={.clusters[0].cluster.server}' 2>/dev/null)" || [ -z "$server" ]; then
  refuse "kubectl cannot resolve the current cluster server"
fi
if ! namespace="$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.namespace}' 2>/dev/null)"; then
  refuse "kubectl cannot resolve the current namespace"
fi
namespace="${namespace:-default}"

[ "$context" = "$expected_context" ] || \
  refuse "context must be exactly '$expected_context'"
[ "$cluster" = "$expected_context" ] || \
  refuse "kubeconfig cluster must be exactly '$expected_context'"
printf '%s\n' "$server" | LC_ALL=C grep -Eq '^https://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+$' || \
  refuse "API server is not a loopback kind endpoint"
printf '%s\n' "$namespace" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' || \
  refuse "current namespace is not a safe Kubernetes namespace name"

echo "Resolved Kubernetes target:"
echo "  context: $context"
echo "  cluster: $cluster"
echo "  server: $server"
echo "  namespace: $namespace"

if ! local_clusters="$(kind get clusters 2>/dev/null)"; then
  refuse "kind cannot enumerate local clusters"
fi
printf '%s\n' "$local_clusters" | grep -Fxq "$expected_cluster" || \
  refuse "'$expected_cluster' is not a cluster owned by the local kind provider"

if ! kind_nodes="$(kind get nodes --name "$expected_cluster" 2>/dev/null)"; then
  refuse "kind cannot resolve nodes for '$expected_cluster'"
fi
printf '%s\n' "$kind_nodes" | grep -Fxq "$expected_node" || \
  refuse "kind does not report the expected control-plane node '$expected_node'"

if ! node_identity="$(kubectl get node "$expected_node" -o 'jsonpath={.metadata.labels.kubernetes\.io/hostname}|{.spec.providerID}' 2>/dev/null)"; then
  refuse "kubectl cannot read the expected kind node identity"
fi
case "$node_identity" in
  "$expected_node|kind://"*"/$expected_cluster/$expected_node") ;;
  *) refuse "node metadata does not identify the expected kind provider/cluster" ;;
esac

if ownership_cluster="$(kubectl --namespace kube-system get configmap "$marker_name" -o 'jsonpath={.data.cluster}' 2>/dev/null)"; then
  [ "$ownership_cluster" = "$expected_cluster" ] || \
    refuse "ownership marker belongs to '$ownership_cluster', not '$expected_cluster'"
else
  [ "$claim_marker" = true ] || \
    refuse "workshop ownership marker is missing; recreate the cluster or run this guard once with --claim"
  kubectl create configmap "$marker_name" \
    --namespace kube-system \
    --from-literal="cluster=$expected_cluster" >/dev/null || \
    refuse "could not create the workshop ownership marker"
  echo "Ownership marker created for disposable cluster '$expected_cluster'."
fi

echo "OK: disposable workshop kind cluster identity verified — safe to proceed."
