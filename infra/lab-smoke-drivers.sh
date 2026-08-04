#!/usr/bin/env bash
# Per-lab smoke drivers for infra/lab-smoke.sh (US-ENV-4A).
# Manifests mirror sibling *.solution.md heredocs — do not invent alternate YAML.
# shellcheck shell=bash
set -euo pipefail

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

lab_smoke_wait_pods_gone() {
  kubectl delete pod tmp s10-probe -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  kubectl wait --for=delete pod --all -n "$LAB_SMOKE_NS" --timeout="${1:-90s}" >/dev/null 2>&1 || true
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
  if kubectl get pod crash -n "$LAB_SMOKE_NS" >/dev/null 2>&1; then
    lab_smoke_err "crash pod should not exist after delete"
    return 1
  fi

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

# --- Day 2 ------------------------------------------------------------------

lab_smoke_driver_day_2_09_gateway_api() {
  local ingress_class="${ENVOY_GATEWAYCLASS_NAME:-eg}"
  # Profile day-2 installs Gateway API CRDs + Envoy Gateway + GatewayClass `eg`.
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
        - name: web2
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
  cat >"$LAB_SMOKE_ARTIFACTS/gateway.yaml" <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: ${ingress_class}
  listeners:
    - name: http
      port: 80
      protocol: HTTP
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/route.yaml" <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }
EOF
  kubectl get gatewayclass "$ingress_class" >/dev/null \
    || { lab_smoke_err "GatewayClass ${ingress_class} missing — install profile day-2 first"; return 1; }
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/backends.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  kubectl rollout status deployment/web2 -n "$LAB_SMOKE_NS" --timeout=180s
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/gateway.yaml" -f "$LAB_SMOKE_ARTIFACTS/route.yaml" -n "$LAB_SMOKE_NS" \
    || { lab_smoke_err "Gateway/HTTPRoute apply failed"; return 1; }
  route_conditions=""
  envoy_svc=""
  local attempt=1 max_attempts=40 sleep_s=3
  while [ "$attempt" -le "$max_attempts" ]; do
    route_conditions="$(kubectl get httproute web -n "$LAB_SMOKE_NS" \
      -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status}{"\n"}{end}' 2>/dev/null || true)"
    if echo "$route_conditions" | grep -q 'Accepted=True' \
      && echo "$route_conditions" | grep -q 'ResolvedRefs=True'; then
      if envoy_svc="$(kubectl get svc -n envoy-gateway-system \
        --selector=gateway.envoyproxy.io/owning-gateway-namespace="${LAB_SMOKE_NS}",gateway.envoyproxy.io/owning-gateway-name=web \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" && [ -n "$envoy_svc" ]; then
        break
      fi
    fi
    sleep "$sleep_s"
    attempt=$((attempt + 1))
  done
  [ -n "$envoy_svc" ] || {
    lab_smoke_err "Envoy Gateway Service for Gateway web not ready after ${max_attempts} attempts"
    return 1
  }
  attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    if kubectl get endpoints "$envoy_svc" -n envoy-gateway-system \
      -o jsonpath='{.subsets[0].addresses[0].ip}' 2>/dev/null | grep -q .; then
      break
    fi
    sleep "$sleep_s"
    attempt=$((attempt + 1))
  done
  kubectl get endpoints "$envoy_svc" -n envoy-gateway-system \
    -o jsonpath='{.subsets[0].addresses[0].ip}' 2>/dev/null | grep -q . \
    || { lab_smoke_err "Envoy dataplane endpoints for ${envoy_svc} not ready"; return 1; }
  kubectl -n envoy-gateway-system port-forward "service/${envoy_svc}" 8888:80 >/tmp/lab-smoke-gw-pf.log 2>&1 &
  gw_pf_pid=$!
  sleep 3
  gw_body=""
  attempt=1
  while [ "$attempt" -le 20 ]; do
    if gw_body="$(curl --noproxy '*' -fsS -H 'Host: web.example.com' 'http://127.0.0.1:8888/' 2>/dev/null)" \
      && echo "$gw_body" | grep -q 'workshop-web'; then
      break
    fi
    sleep 3
    attempt=$((attempt + 1))
  done
  kill "$gw_pf_pid" 2>/dev/null || true
  echo "$gw_body" | grep -q 'workshop-web' \
    || { lab_smoke_err "Gateway HTTPRoute curl via port-forward failed"; return 1; }
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete httproute,gateway web -n "$NS" --ignore-not-found --wait=true'
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete -f '"$LAB_SMOKE_ARTIFACTS"'/backends.yaml -n "$NS" --ignore-not-found --wait=true'
  kubectl delete deploy,svc -l 'app in (web,web2)' -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  lab_smoke_wait_pods_gone 120s
}

lab_smoke_driver_day_2_10_config() {
  cat >"$LAB_SMOKE_ARTIFACTS/configmap.yaml" <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  labels:
    app: s10
data:
  VERSION: "config-v1"
  LOG_LEVEL: "info"
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/deployment-env.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s10
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s10
  template:
    metadata:
      labels:
        app: s10
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: web-config
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/configmap.yaml" -f "$LAB_SMOKE_ARTIFACTS/deployment-env.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=120s
  pod_ip="$(kubectl get pod -l app=s10 -n "$LAB_SMOKE_NS" -o jsonpath='{.items[0].status.podIP}')"
  kubectl run s10-probe -n "$LAB_SMOKE_NS" --restart=Never --image=busybox:1.37 \
    -- sh -c "wget -qO- http://${pod_ip}:8080 | head -1"
  kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/s10-probe -n "$LAB_SMOKE_NS" --timeout=60s
  body="$(kubectl logs s10-probe -n "$LAB_SMOKE_NS")"
  echo "$body" | grep -q 'workshop-web config-v1'
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete configmap,secret,deployment -l app=s10 -n "$NS" --ignore-not-found --wait=true'
  lab_smoke_wait_pods_gone
}

lab_smoke_driver_day_2_11_storage() {
  cat >"$LAB_SMOKE_ARTIFACTS/pvc.yaml" <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-data
  labels:
    app: s11
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/deployment-pvc.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s11
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s11
  template:
    metadata:
      labels:
        app: s11
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: web-data
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/pvc.yaml" -f "$LAB_SMOKE_ARTIFACTS/deployment-pvc.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  kubectl wait --for=jsonpath='{.status.phase}'=Bound pvc/web-data -n "$LAB_SMOKE_NS" --timeout=120s
  kubectl exec deploy/web -n "$LAB_SMOKE_NS" -c toolbox -- sh -c 'echo sentinel > /data/data.txt'
  kubectl delete pod -l app=s11 -n "$LAB_SMOKE_NS" --wait=true
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  sentinel="$(kubectl exec deploy/web -n "$LAB_SMOKE_NS" -c toolbox -- cat /data/data.txt)"
  [ "$sentinel" = "sentinel" ]
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete deploy/web -n "$NS" --ignore-not-found --wait=true'
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete pvc web-data -n "$NS" --ignore-not-found --wait=true'
  lab_smoke_wait_pods_gone
}

lab_smoke_driver_day_2_12_statefulset() {
  cat >"$LAB_SMOKE_ARTIFACTS/headless-svc.yaml" <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: s12
spec:
  clusterIP: None
  selector:
    app: s12
  ports:
    - port: 80
      targetPort: 8080
      name: http
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/statefulset.yaml" <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
  labels:
    app: s12
spec:
  serviceName: web
  replicas: 3
  selector:
    matchLabels:
      app: s12
  template:
    metadata:
      labels:
        app: s12
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/headless-svc.yaml" -f "$LAB_SMOKE_ARTIFACTS/statefulset.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status statefulset/web -n "$LAB_SMOKE_NS" --timeout=300s
  kubectl exec web-1 -n "$LAB_SMOKE_NS" -c toolbox -- sh -c "echo \"written by \$(hostname)\" > /data/data.txt"
  kubectl delete pod web-1 -n "$LAB_SMOKE_NS" --wait=true
  lab_smoke_wait_ready pod web-1 180s
  data="$(kubectl exec web-1 -n "$LAB_SMOKE_NS" -c toolbox -- cat /data/data.txt)"
  echo "$data" | grep -q 'written by web-1'
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete statefulset web -n "$NS" --ignore-not-found --wait=true'
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete pvc -l app=s12 -n "$NS" --ignore-not-found --wait=true'
  kubectl delete pvc data-web-0 data-web-1 data-web-2 -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete svc web -n "$NS" --ignore-not-found'
  lab_smoke_wait_pods_gone 120s
}

lab_smoke_driver_day_2_13_resources() {
  cat >"$LAB_SMOKE_ARTIFACTS/oom-demo.yaml" <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: oom-demo
  labels: { app: s13 }
spec:
  containers:
    - name: hog
      image: polinux/stress
      command: ["stress"]
      args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]
      resources:
        requests: { memory: 50Mi }
        limits:   { memory: 100Mi }
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/oom-demo.yaml" -n "$LAB_SMOKE_NS"
  reason=""
  i=0
  while [ "$i" -lt 60 ]; do
    reason="$(kubectl get pod oom-demo -n "$LAB_SMOKE_NS" -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}' 2>/dev/null || true)"
    if [ "$reason" = "OOMKilled" ]; then
      break
    fi
    sleep 2
    i=$((i + 1))
  done
  [ "$reason" = "OOMKilled" ]
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete pod -l app=s13 -n "$NS" --ignore-not-found --wait=true'
  lab_smoke_wait_pods_gone
}

lab_smoke_driver_day_2_14_probes() {
  cat >"$LAB_SMOKE_ARTIFACTS/deployment-probes.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s14 }
spec:
  replicas: 3
  selector:
    matchLabels: { app: s14 }
  template:
    metadata:
      labels: { app: s14 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/service.yaml" <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels: { app: s14 }
spec:
  selector: { app: s14 }
  ports:
    - port: 80
      targetPort: 8080
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/deployment-probes.yaml" -f "$LAB_SMOKE_ARTIFACTS/service.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  ready_count="$(kubectl get pods -l app=s14 -n "$LAB_SMOKE_NS" -o jsonpath='{range .items[*]}{.status.containerStatuses[0].ready}{"\n"}{end}' | grep -c true || true)"
  [ "${ready_count:-0}" = "3" ]
  addr_count="$(kubectl get endpointslices -n "$LAB_SMOKE_NS" -l kubernetes.io/service-name=web \
    -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{"\n"}{end}' | grep -c . || true)"
  [ "${addr_count:-0}" -ge 3 ]
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete deployment,svc -l app=s14 -n "$NS" --ignore-not-found --wait=true'
  lab_smoke_wait_pods_gone 120s
}

lab_smoke_driver_day_2_15_jobs() {
  cat >"$LAB_SMOKE_ARTIFACTS/job-report.yaml" <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: report
  labels: { app: s15 }
spec:
  backoffLimit: 4
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: report
          image: busybox:1.37
          command: ["sh", "-c", "echo 'nightly report generated'; sleep 3"]
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/job-report.yaml" -n "$LAB_SMOKE_NS"
  kubectl wait --for=condition=complete job/report -n "$LAB_SMOKE_NS" --timeout=120s
  succeeded="$(kubectl get job report -n "$LAB_SMOKE_NS" -o jsonpath='{.status.succeeded}')"
  [ "${succeeded:-0}" = "1" ]
  kubectl logs job/report -n "$LAB_SMOKE_NS" | grep -q 'nightly report generated'
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete cronjob,job -l app=s15 -n "$NS" --ignore-not-found --wait=true'
  lab_smoke_wait_pods_gone
}

lab_smoke_driver_day_2_16_hpa() {
  # Profile day-2 installs metrics-server (with kind kubelet-insecure-tls patch).
  cat >"$LAB_SMOKE_ARTIFACTS/web.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s16 }
spec:
  replicas: 2
  selector: { matchLabels: { run: web } }
  template:
    metadata:
      labels: { run: web, app: s16 }
    spec:
      containers:
        - name: web
          image: registry.k8s.io/hpa-example
          ports: [{ containerPort: 80 }]
          resources:
            requests: { cpu: 200m }
            limits:   { cpu: 500m }
---
apiVersion: v1
kind: Service
metadata:
  name: web
  labels: { app: s16 }
spec:
  selector: { run: web }
  ports: [{ port: 80, targetPort: 80 }]
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/hpa.yaml" <<'EOF'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
  labels: { app: s16 }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/web.yaml" -f "$LAB_SMOKE_ARTIFACTS/hpa.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=180s
  util=""
  i=0
  while [ "$i" -lt 36 ]; do
    util="$(kubectl get hpa web -n "$LAB_SMOKE_NS" -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}' 2>/dev/null || true)"
    if [ -n "$util" ] && [ "$util" != "null" ]; then
      break
    fi
    sleep 10
    i=$((i + 1))
  done
  echo "$util" | grep -Eq '^[0-9]+$'
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete hpa,deployment,service -l app=s16 -n "$NS" --ignore-not-found --wait=true'
  kubectl delete hpa,deploy,svc web -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  lab_smoke_wait_pods_gone 120s
}

# --- Day 3 ------------------------------------------------------------------

lab_smoke_driver_day_3_17_pod_security() {
  kubectl label --overwrite namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce=restricted \
    pod-security.kubernetes.io/warn=restricted \
    pod-security.kubernetes.io/audit=restricted
  cat >"$LAB_SMOKE_ARTIFACTS/pod-insecure.yaml" <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
EOF
  set +e
  apply_out="$(kubectl apply -f "$LAB_SMOKE_ARTIFACTS/pod-insecure.yaml" -n "$LAB_SMOKE_NS" 2>&1)"
  apply_rc=$?
  set -e
  [ "$apply_rc" -ne 0 ] || { lab_smoke_err "expected Forbidden for insecure pod"; return 1; }
  echo "$apply_out" | grep -qi forbidden
  if kubectl get pod web -n "$LAB_SMOKE_NS" >/dev/null 2>&1; then
    lab_smoke_err "insecure pod must not exist after Forbidden"
    return 1
  fi
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete pod -l app=s17 -n "$NS" --ignore-not-found --wait=true'
  kubectl label namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce- \
    pod-security.kubernetes.io/warn- \
    pod-security.kubernetes.io/audit- >/dev/null 2>&1 || true
}

lab_smoke_driver_day_3_18_networkpolicy() {
  kubectl label --overwrite namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce=privileged \
    pod-security.kubernetes.io/warn=privileged \
    pod-security.kubernetes.io/audit=privileged >/dev/null
  cat >"$LAB_SMOKE_ARTIFACTS/apps.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  labels: { app: backend, lab: s18 }
spec:
  replicas: 1
  selector: { matchLabels: { app: backend } }
  template:
    metadata:
      labels: { app: backend, lab: s18 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  labels: { lab: s18 }
spec:
  selector: { app: backend }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: v1
kind: Pod
metadata: { name: frontend, labels: { app: frontend, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: other, labels: { app: other, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: scanner, labels: { app: scanner, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/default-deny-ingress.yaml" <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  labels: { app: s18 }
spec:
  podSelector: {}
  policyTypes:
    - Ingress
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/apps.yaml" -n "$LAB_SMOKE_NS"
  kubectl wait --for=condition=Ready pod/frontend pod/other pod/scanner -n "$LAB_SMOKE_NS" --timeout=120s
  kubectl rollout status deployment/backend -n "$LAB_SMOKE_NS" --timeout=120s
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/default-deny-ingress.yaml" -n "$LAB_SMOKE_NS"
  set +e
  kubectl exec frontend -n "$LAB_SMOKE_NS" -- curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://backend >/dev/null 2>&1
  curl_rc=$?
  set -e
  [ "$curl_rc" -eq 28 ]
  cat >"$LAB_SMOKE_ARTIFACTS/allow-frontend-to-backend.yaml" <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels: { app: backend }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: { app: frontend }
      ports:
        - { protocol: TCP, port: 8080 }
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/allow-frontend-to-backend.yaml" -n "$LAB_SMOKE_NS"
  sleep 2
  allow_code="$(kubectl exec frontend -n "$LAB_SMOKE_NS" -- curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://backend 2>/dev/null || echo 000)"
  [ "$allow_code" = "200" ]
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete networkpolicy -l app=s18 -n "$NS" --ignore-not-found'
  kubectl delete pod frontend other scanner -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  kubectl delete deploy/backend svc/backend -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  lab_smoke_wait_pods_gone 120s
  kubectl label namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce- \
    pod-security.kubernetes.io/warn- \
    pod-security.kubernetes.io/audit- >/dev/null 2>&1 || true
}

lab_smoke_driver_day_3_19_rbac() {
  kubectl label --overwrite namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce=privileged \
    pod-security.kubernetes.io/warn=privileged \
    pod-security.kubernetes.io/audit=privileged >/dev/null
  cat >"$LAB_SMOKE_ARTIFACTS/workload.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reader-target
  labels: { app: s19 }
spec:
  replicas: 1
  selector: { matchLabels: { app: reader-target } }
  template:
    metadata:
      labels: { app: reader-target, part-of: s19 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/rbac.yaml" <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader-sa
  labels: { app: s19 }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  labels: { app: s19 }
subjects:
  - kind: ServiceAccount
    name: pod-reader-sa
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/workload.yaml" -f "$LAB_SMOKE_ARTIFACTS/rbac.yaml" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/reader-target -n "$LAB_SMOKE_NS" --timeout=120s
  pod="$(kubectl get pod -l app=reader-target -n "$LAB_SMOKE_NS" -o jsonpath='{.items[0].metadata.name}')"
  kubectl get pods --as="system:serviceaccount:${LAB_SMOKE_NS}:pod-reader-sa" -n "$LAB_SMOKE_NS" >/dev/null
  set +e
  del_out="$(kubectl delete pod "$pod" --as="system:serviceaccount:${LAB_SMOKE_NS}:pod-reader-sa" -n "$LAB_SMOKE_NS" 2>&1)"
  del_rc=$?
  set -e
  [ "$del_rc" -ne 0 ] || { lab_smoke_err "expected Forbidden for SA delete"; return 1; }
  echo "$del_out" | grep -qi forbidden
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete sa,role,rolebinding -l app=s19 -n "$NS" --ignore-not-found'
  kubectl delete deploy reader-target -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  lab_smoke_wait_pods_gone 120s
  kubectl label namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce- \
    pod-security.kubernetes.io/warn- \
    pod-security.kubernetes.io/audit- >/dev/null 2>&1 || true
}

lab_smoke_driver_day_3_20_helm() {
  kubectl label --overwrite namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce=privileged \
    pod-security.kubernetes.io/warn=privileged \
    pod-security.kubernetes.io/audit=privileged >/dev/null
  local chart="$LAB_SMOKE_ARTIFACTS/demo-app"
  mkdir -p "$chart/templates"
  cat >"$chart/Chart.yaml" <<'EOF'
apiVersion: v2
name: demo-app
description: A minimal web app packaged as a Helm chart
type: application
version: 0.1.0
appVersion: "v1"
EOF
  cat >"$chart/values.yaml" <<'EOF'
replicaCount: 1
image:
  repository: ghcr.io/platformrelay/workshop-web
  tag: "v1"
service:
  port: 80
EOF
  cat >"$chart/templates/deployment.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: 8080
EOF
  cat >"$chart/templates/service.yaml" <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: 8080
EOF
  helm lint "$chart" >/dev/null
  helm install web "$chart" -n "$LAB_SMOKE_NS"
  kubectl rollout status deployment/web -n "$LAB_SMOKE_NS" --timeout=120s
  ready="$(kubectl get deploy web -n "$LAB_SMOKE_NS" -o jsonpath='{.status.readyReplicas}')"
  [ "${ready:-0}" = "1" ]
  helm list -n "$LAB_SMOKE_NS" | grep -q '^web[[:space:]]'
  helm uninstall web -n "$LAB_SMOKE_NS" >/dev/null 2>&1 || true
  kubectl delete deploy,svc web -n "$LAB_SMOKE_NS" --ignore-not-found --wait=true >/dev/null 2>&1 || true
  lab_smoke_wait_pods_gone 120s
  kubectl label namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce- \
    pod-security.kubernetes.io/warn- \
    pod-security.kubernetes.io/audit- >/dev/null 2>&1 || true
}

lab_smoke_driver_day_3_21_gitops() {
  # Profile day-3 installs Argo CD.
  cat >"$LAB_SMOKE_ARTIFACTS/application.yaml" <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/application.yaml"
  sync="" health=""
  i=0
  while [ "$i" -lt 60 ]; do
    sync="$(kubectl -n argocd get application guestbook -o jsonpath='{.status.sync.status}' 2>/dev/null || true)"
    health="$(kubectl -n argocd get application guestbook -o jsonpath='{.status.health.status}' 2>/dev/null || true)"
    if [ "$sync" = "Synced" ] && [ "$health" = "Healthy" ]; then
      break
    fi
    sleep 5
    i=$((i + 1))
  done
  [ "$sync" = "Synced" ] && [ "$health" = "Healthy" ]
  kubectl -n argocd delete application guestbook --ignore-not-found --wait=true >/dev/null 2>&1 || true
  kubectl -n default delete deploy,svc guestbook-ui --ignore-not-found --wait=true >/dev/null 2>&1 || true
}

lab_smoke_driver_day_3_22_operator_concept() {
  # Profile day-3 installs cert-manager.
  cat >"$LAB_SMOKE_ARTIFACTS/issuer.yaml" <<'EOF'
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: s22-selfsigned
  labels: { app: s22 }
spec:
  selfSigned: {}
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/certificate.yaml" <<'EOF'
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: s22-cert
  labels: { app: s22 }
spec:
  secretName: s22-tls
  secretTemplate:
    labels: { app: s22 }
  duration: 2160h
  renewBefore: 360h
  commonName: s22.example.com
  dnsNames:
    - s22.example.com
  issuerRef:
    name: s22-selfsigned
    kind: Issuer
EOF
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/issuer.yaml" -f "$LAB_SMOKE_ARTIFACTS/certificate.yaml" -n "$LAB_SMOKE_NS"
  i=0
  ready=""
  while [ "$i" -lt 60 ]; do
    ready="$(kubectl get certificate s22-cert -n "$LAB_SMOKE_NS" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
    if [ "$ready" = "True" ]; then
      break
    fi
    sleep 2
    i=$((i + 1))
  done
  [ "$ready" = "True" ]
  kubectl get secret s22-tls -n "$LAB_SMOKE_NS" >/dev/null
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete certificate,issuer,secret -l app=s22 -n "$NS" --ignore-not-found'
  kubectl delete certificate s22-cert issuer s22-selfsigned secret s22-tls -n "$LAB_SMOKE_NS" --ignore-not-found >/dev/null 2>&1 || true
}

lab_smoke_driver_day_3_23_prometheus() {
  # Profile day-3 installs kube-prometheus-stack as release `monitoring`.
  cat >"$LAB_SMOKE_ARTIFACTS/app.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  namespace: demo
  labels: { app: sample-app, lab: s23 }
spec:
  replicas: 1
  selector: { matchLabels: { app: sample-app } }
  template:
    metadata:
      labels: { app: sample-app, lab: s23 }
    spec:
      containers:
        - name: app
          image: quay.io/brancz/prometheus-example-app:v0.6.0
          ports:
            - name: web
              containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  namespace: demo
  labels: { app: sample-app, lab: s23 }
spec:
  selector: { app: sample-app }
  ports:
    - name: web
      port: 8080
      targetPort: web
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/servicemonitor.yaml" <<'EOF'
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  namespace: demo
  labels:
    release: monitoring
    lab: s23
spec:
  selector:
    matchLabels:
      app: sample-app
  endpoints:
    - port: web
      path: /metrics
EOF
  kubectl create namespace demo --dry-run=client -o yaml | kubectl apply -f -
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/app.yaml"
  kubectl -n demo rollout status deploy/sample-app --timeout=120s
  kubectl apply -f "$LAB_SMOKE_ARTIFACTS/servicemonitor.yaml"
  sleep 30
  prom_pod="$(kubectl get pod -n monitoring -l app.kubernetes.io/name=prometheus -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  [ -n "$prom_pod" ]
  kubectl -n monitoring port-forward "pod/${prom_pod}" 9090:9090 >/tmp/lab-smoke-prom-pf.log 2>&1 &
  local pf_pid=$!
  sleep 3
  curl --noproxy '*' -sf 'http://127.0.0.1:9090/api/v1/query' --data-urlencode 'query=up{job=~".*sample-app.*"}' \
    | grep -q '"value":\[.*,"1"\]'
  kill "$pf_pid" 2>/dev/null || true
  kubectl delete namespace demo --ignore-not-found --wait=true >/dev/null 2>&1 || true
}

lab_smoke_driver_day_3_25_pod_escape() {
  # Workshop kind cluster: assert restricted PSA blocks the escape Pod (Phase B).
  # Offensive hostPath steps require escape-lab + context-check.sh — not run here.
  kubectl label --overwrite namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce=restricted \
    pod-security.kubernetes.io/warn=restricted \
    pod-security.kubernetes.io/audit=restricted
  cat >"$LAB_SMOKE_ARTIFACTS/pod-escape.yaml" <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: escape
  labels: { app: s25 }
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        privileged: true
      volumeMounts:
        - name: host
          mountPath: /host
  volumes:
    - name: host
      hostPath:
        path: /
EOF
  set +e
  apply_out="$(kubectl apply -f "$LAB_SMOKE_ARTIFACTS/pod-escape.yaml" -n "$LAB_SMOKE_NS" 2>&1)"
  apply_rc=$?
  set -e
  [ "$apply_rc" -ne 0 ] || { lab_smoke_err "expected Forbidden for escape pod under restricted"; return 1; }
  echo "$apply_out" | grep -qi forbidden
  if kubectl get pod escape -n "$LAB_SMOKE_NS" >/dev/null 2>&1; then
    lab_smoke_err "escape pod must not exist after Forbidden"
    return 1
  fi
  export NS="${NS:-$LAB_SMOKE_NS}"
  # shellcheck disable=SC2016
  lab_smoke_apply_cleanup 'kubectl delete pod -l app=s25 -n "$NS" --ignore-not-found --wait=true'
}

lab_smoke_driver_day_3_26_capstone() {
  kubectl label --overwrite namespace "$LAB_SMOKE_NS" \
    pod-security.kubernetes.io/enforce=restricted \
    pod-security.kubernetes.io/warn=restricted \
    pod-security.kubernetes.io/audit=restricted
  cat >"$LAB_SMOKE_ARTIFACTS/flawed-pod.yaml" <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: web }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
EOF
  cat >"$LAB_SMOKE_ARTIFACTS/fixed-pod.yaml" <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app.kubernetes.io/name: web }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 65532
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
      ports:
        - containerPort: 8080
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
EOF
  set +e
  flawed_out="$(kubectl apply --dry-run=server -f "$LAB_SMOKE_ARTIFACTS/flawed-pod.yaml" -n "$LAB_SMOKE_NS" 2>&1)"
  flawed_rc=$?
  fixed_out="$(kubectl apply --dry-run=server -f "$LAB_SMOKE_ARTIFACTS/fixed-pod.yaml" -n "$LAB_SMOKE_NS" 2>&1)"
  fixed_rc=$?
  set -e
  [ "$flawed_rc" -ne 0 ] || { lab_smoke_err "expected flawed pod rejected"; return 1; }
  echo "$flawed_out" | grep -qi forbidden
  [ "$fixed_rc" -eq 0 ] || { lab_smoke_err "expected fixed pod admitted (dry-run)"; return 1; }
  echo "$fixed_out" | grep -qi 'created (server dry run)'
}

# Scaffold helper retained for deferred labs only.
lab_smoke_driver_scaffold() {
  local lab_id="$1"
  lab_smoke_mark_scaffold "$lab_id"
  lab_smoke_info "scaffolded skip for ${lab_id} (no per-lab assertion yet)"
  return 0
}
