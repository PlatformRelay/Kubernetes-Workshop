#!/usr/bin/env bash
# Per-lab smoke drivers for infra/lab-smoke.sh (US-ENV-4A).
# Manifests mirror sibling *.solution.md heredocs — do not invent alternate YAML.
# shellcheck shell=bash

lab_smoke_apply_cleanup() {
  # Intentionally eval inventory/lab cleanup strings that reference $NS.
  # shellcheck disable=SC2086
  eval "$1"
}

lab_smoke_wait_ready() {
  local kind="$1" name="$2" timeout="${3:-120s}"
  kubectl wait --for=condition=Ready "${kind}/${name}" -n "$LAB_SMOKE_NS" --timeout="$timeout"
}

# HTTP check via kind's localhost:80 port-map (mirrors Lab 08 kind curls). REL-001.
lab_smoke_assert_http_host() {
  local host="$1"
  local attempt=1
  local max_attempts="${LAB_SMOKE_HTTP_ATTEMPTS:-20}"
  local sleep_s="${LAB_SMOKE_HTTP_SLEEP_S:-3}"
  local body=""

  command -v curl >/dev/null 2>&1 || {
    lab_smoke_err "curl required for ingress HTTP assertion (REL-001)"
    return 1
  }

  while [ "$attempt" -le "$max_attempts" ]; do
    if body="$(curl --noproxy '*' -fsS -H "Host: ${host}" "http://127.0.0.1/" 2>/dev/null)"; then
      if [ -n "$body" ]; then
        lab_smoke_ok "ingress HTTP Host:${host} (attempt ${attempt})"
        return 0
      fi
    fi
    sleep "$sleep_s"
    attempt=$((attempt + 1))
  done
  lab_smoke_err "ingress HTTP Host:${host} failed after ${max_attempts} attempts"
  return 1
}

# --- Day 1 ------------------------------------------------------------------

lab_smoke_driver_day_1_00_setup() {
  kubectl config current-context | grep -q .
  kubectl cluster-info >/dev/null
  kubectl get nodes >/dev/null
  lab_smoke_ensure_ns
  lab_smoke_ok "00-setup: context + API + namespace"
}

lab_smoke_driver_day_1_03_cluster_tour() {
  kubectl get nodes -o wide >/dev/null
  kubectl get --raw /livez >/dev/null
  kubectl api-resources >/dev/null
  lab_smoke_ok "03-cluster-tour: read-only tour"
}

lab_smoke_driver_day_1_04_kubectl() {
  kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 \
    --dry-run=client -o yaml | grep -q 'kind: Deployment'
  kubectl get pods -A >/dev/null
  lab_smoke_ok "04-kubectl: generate/dry-run path"
}

lab_smoke_driver_day_1_05_pod() {
  # From labs/day-1/05-pod.solution.md Step 1
  cat >"$LAB_SMOKE_ARTIFACTS/pod.yaml" <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/pod.yaml" -n "$LAB_SMOKE_NS"
  lab_smoke_wait_ready pod web 120s
  phase="$(kubectl get pod web -n "$LAB_SMOKE_NS" -o jsonpath='{.status.phase}')"
  [ "$phase" = "Running" ]
  ready="$(kubectl get pod web -n "$LAB_SMOKE_NS" -o jsonpath='{.status.containerStatuses[0].ready}')"
  [ "$ready" = "true" ]

  # Deterministic Challenge (solution companion): bare Pod restart keeps UID;
  # delete does not recreate.
  cat >"$LAB_SMOKE_ARTIFACTS/crash.yaml" <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: crash
spec:
  restartPolicy: Always
  containers:
    - name: crash
      image: busybox:1.37
      command: ["sh", "-c", "sleep 2; exit 1"]
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/crash.yaml" -n "$LAB_SMOKE_NS"
  uid_before="$(kubectl get pod crash -n "$LAB_SMOKE_NS" -o jsonpath='{.metadata.uid}')"
  # Wait for at least one container restart while UID stays stable.
  i=0
  rc_count=0
  while [ "$i" -lt 60 ]; do
    rc_count="$(kubectl get pod crash -n "$LAB_SMOKE_NS" -o jsonpath='{.status.containerStatuses[0].restartCount}' 2>/dev/null || echo 0)"
    if [ "${rc_count:-0}" -ge 1 ]; then
      break
    fi
    sleep 2
    i=$((i + 1))
  done
  [ "${rc_count:-0}" -ge 1 ]
  uid_after="$(kubectl get pod crash -n "$LAB_SMOKE_NS" -o jsonpath='{.metadata.uid}')"
  [ "$uid_before" = "$uid_after" ]
  kubectl delete pod crash -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true
  # After delete, bare Pod must stay gone (no controller).
  ! kubectl get pod crash -n "$LAB_SMOKE_NS" >/dev/null 2>&1

  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016 # $NS expanded by eval inside lab_smoke_apply_cleanup
  lab_smoke_apply_cleanup 'kubectl delete pod web web-typo crash -n "$NS" --ignore-not-found'
}
lab_smoke_driver_day_1_06_deployment() {
  # From labs/day-1/06-deployment.solution.md Step 1
  cat >"$LAB_SMOKE_ARTIFACTS/deployment.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/deployment.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  available="$(kubectl get deploy web -n "$LAB_SMOKE_NS" -o jsonpath='{.status.availableReplicas}')"
  [ "${available:-0}" = "3" ]
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete -f '"$LAB_SMOKE_ARTIFACTS"'/deployment.yaml -n "$NS" --ignore-not-found'
  kubectl delete deploy,rs,pod -l app=web -n "$LAB_SMOKE_NS" --ignore-not-found >/dev/null 2>&1 || true
}

lab_smoke_driver_day_1_07_service() {
  # Deployment from Lab 06 solution + Service from Lab 07 solution.
  cat >"$LAB_SMOKE_ARTIFACTS/deployment.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/deployment.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  cat >"$LAB_SMOKE_ARTIFACTS/service.yaml" <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: 8080
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/service.yaml" -n "$LAB_SMOKE_NS"
  kubectl get service web -n "$LAB_SMOKE_NS" >/dev/null
  # EndpointSlice should list addresses once Pods are Ready.
  endpoints="$(kubectl get endpointslices -n "$LAB_SMOKE_NS" -l kubernetes.io/service-name=web -o jsonpath='{.items[0].endpoints}' 2>/dev/null || true)"
  [ -n "$endpoints" ]
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete -f '"$LAB_SMOKE_ARTIFACTS"'/service.yaml -n "$NS" --ignore-not-found'
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete -f '"$LAB_SMOKE_ARTIFACTS"'/deployment.yaml -n "$NS" --ignore-not-found'
  kubectl delete deploy,rs,pod,svc -l app=web -n "$LAB_SMOKE_NS" --ignore-not-found >/dev/null 2>&1 || true
}

lab_smoke_driver_day_1_08_ingress() {
  # Profile day-1 (Contour) is installed by the orchestrator. Smoke uses the
  # workshop IngressClass (contour) rather than the lab's random class name so
  # we exercise the composed profile path.
  local ingress_class="${CONTOUR_INGRESSCLASS_NAME:-contour}"
  cat >"$LAB_SMOKE_ARTIFACTS/backends.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: web } }
spec:
  replicas: 2
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [ { containerPort: 8080 } ]
---
apiVersion: v1
kind: Service
metadata: { name: web, labels: { app: web } }
spec:
  selector: { app: web }
  ports: [ { name: http, port: 80, targetPort: 8080 } ]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: web2, labels: { app: web2 } }
spec:
  replicas: 2
  selector: { matchLabels: { app: web2 } }
  template:
    metadata: { labels: { app: web2 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v2
          ports: [ { containerPort: 8080 } ]
---
apiVersion: v1
kind: Service
metadata: { name: web2, labels: { app: web2 } }
spec:
  selector: { app: web2 }
  ports: [ { name: http, port: 80, targetPort: 8080 } ]
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/ingress.yaml" <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: ${ingress_class}
  rules:
    - host: web.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
    - host: web2.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web2
                port:
                  number: 80
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/backends.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  kubectl rollout status deployment/web2 -n "$LAB_SMOKE_NS" --timeout=180s
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/ingress.yaml" -n "$LAB_SMOKE_NS"
  kubectl get ingress web -n "$LAB_SMOKE_NS" >/dev/null
  kubectl get ingressclass "$ingress_class" >/dev/null
  # Contour Envoy must be Ready before Host-header curls are meaningful (REL-001).
  if kubectl get daemonset envoy -n projectcontour >/dev/null 2>&1; then
    kubectl -n projectcontour rollout status daemonset/envoy --timeout=180s
  elif kubectl get deployment envoy -n projectcontour >/dev/null 2>&1; then
    kubectl -n projectcontour rollout status deployment/envoy --timeout=180s
  fi
  lab_smoke_assert_http_host "web.example.com"
  lab_smoke_assert_http_host "web2.example.com"
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete -f '"$LAB_SMOKE_ARTIFACTS"'/ingress.yaml -f '"$LAB_SMOKE_ARTIFACTS"'/backends.yaml -n "$NS" --ignore-not-found --wait=true'
  kubectl delete secret web-tls -n "$LAB_SMOKE_NS" --ignore-not-found >/dev/null 2>&1 || true
  # Controllers may leave terminating Pods briefly; force a clean namespace for the next lab.
  kubectl delete pod --all -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  kubectl wait --for=delete pod --all -n "$LAB_SMOKE_NS" --timeout=60s >/dev/null 2>&1 || true
}

# --- Day 2/3 scaffolding (profile + inventory selection; deep lab drivers later) -

lab_smoke_driver_scaffold() {
  local lab_id="$1"
  lab_smoke_mark_scaffold "$lab_id"
  lab_smoke_info "scaffolded skip for ${lab_id} (no per-lab assertion yet)"
  return 0
}

# Wrappers kept for discoverability; orchestrator routes day-2/3 via scaffold-only.
lab_smoke_driver_day_2_09_gateway_api() { lab_smoke_driver_scaffold "day-2/09-gateway-api"; }
lab_smoke_driver_day_2_10_config() { lab_smoke_driver_scaffold "day-2/10-config"; }
lab_smoke_driver_day_2_11_storage() { lab_smoke_driver_scaffold "day-2/11-storage"; }
lab_smoke_driver_day_2_12_statefulset() { lab_smoke_driver_scaffold "day-2/12-statefulset"; }
lab_smoke_driver_day_2_13_resources() { lab_smoke_driver_scaffold "day-2/13-resources"; }
lab_smoke_driver_day_2_14_probes() { lab_smoke_driver_scaffold "day-2/14-probes"; }
lab_smoke_driver_day_2_15_jobs() { lab_smoke_driver_scaffold "day-2/15-jobs"; }
lab_smoke_driver_day_2_16_hpa() { lab_smoke_driver_scaffold "day-2/16-hpa"; }

lab_smoke_driver_day_3_17_pod_security() { lab_smoke_driver_scaffold "day-3/17-pod-security"; }
lab_smoke_driver_day_3_18_networkpolicy() { lab_smoke_driver_scaffold "day-3/18-networkpolicy"; }
lab_smoke_driver_day_3_19_rbac() { lab_smoke_driver_scaffold "day-3/19-rbac"; }
lab_smoke_driver_day_3_20_helm() { lab_smoke_driver_scaffold "day-3/20-helm"; }
lab_smoke_driver_day_3_21_gitops() { lab_smoke_driver_scaffold "day-3/21-gitops"; }
lab_smoke_driver_day_3_22_operator_concept() { lab_smoke_driver_scaffold "day-3/22-operator-concept"; }
lab_smoke_driver_day_3_23_prometheus() { lab_smoke_driver_scaffold "day-3/23-prometheus"; }
lab_smoke_driver_day_3_25_pod_escape() { lab_smoke_driver_scaffold "day-3/25-pod-escape"; }
lab_smoke_driver_day_3_26_capstone() { lab_smoke_driver_scaffold "day-3/26-capstone"; }
