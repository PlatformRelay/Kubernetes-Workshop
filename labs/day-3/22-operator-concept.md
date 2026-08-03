# Lab 22 — The operator pattern (S22)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S22 — The operator pattern |
| **Environment** | **kind ✓** (self-install) / namespace: **read-only** |
| **Estimated time** | 15 min |

## Objective

Meet a **real operator** — no code written. You'll install **cert-manager** (a CNCF
project: a set of **CRDs** plus a **controller**), inspect the API it added, then declare a
**`Certificate`** and watch the controller reconcile it into a **`Secret`**. Finally you'll
**delete that Secret** and watch the controller **put it back** — the S03 reconcile loop
(observe → diff → act) running over a resource cert-manager *invented*.

The single idea to leave with: **an operator = a CRD (a new API kind) + a controller that
runs the reconcile loop over instances of it, with operational knowledge in the "act"
step.** cert-manager's knowledge is *"issue this certificate, store it in a Secret, and keep
it valid."*

> **⚠️ The recreated Secret is the reconcile *loop*, not garbage collection.** cert-manager
> does **not** put an `ownerReference` on the Secret by default
> (`--enable-certificate-owner-ref` defaults to `false`), so the Secret isn't *owned* by the
> Certificate. It comes back because the controller **continuously re-ensures**
> `spec.secretName` exists — exactly the desired-vs-observed loop. Don't conflate the two.

## Prerequisites

- **kind path (recommended):** Docker + `kind` + `kubectl`, and rights to create a local
  cluster. You'll make a throwaway cluster named `operator`. cert-manager is a
  **cluster-wide** install, so this path needs a cluster you own — hence kind.
- **Shared-cluster path:** your assigned namespace — **read-only** here. You can inspect an
  operator's CRDs and `explain` its schema, but you **cannot** install cert-manager or (in
  general) create its CRs unless a facilitator pre-installed it. Prefer kind if you can.
- Internet pull access for the cert-manager images (`quay.io/jetstack/*`).

## Files used

- `issuer.yaml` — a self-signed **`Issuer`** (the simplest CR to prove the pattern; no CA,
  no ACME, nothing external).
- `certificate.yaml` — a **`Certificate`** CR that asks for a cert in a Secret named
  `s22-tls`.

Both CRs carry the label `app: s22`, and the Certificate copies that label onto its Secret
via `spec.secretTemplate` — so a single labelled cleanup removes everything, Secret included.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./22-operator-concept.solution.md#guided-solutions)

### Step 0 — a cluster, and the operator itself

### kind path (do this)

```bash
kind create cluster --name operator
export NS=default

# install cert-manager — CRDs + controller + webhook (verified current stable: v1.21.0)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml
```

Now **wait for the controller and webhook to be ready** — creating a `Certificate` before
the webhook is up fails with a `connection refused` error, not because your YAML is wrong.

```bash
kubectl wait --for=condition=Available --timeout=300s \
  deployment --all -n cert-manager
kubectl get pods -n cert-manager
```

### Shared-cluster path (read-only)

You can't do a cluster-wide install in your namespace. Instead, inspect whatever operator
CRDs already exist on the shared cluster and read their schema — the *pattern* is identical,
only the install differs:

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl get crd                                  # any *.something CRDs = an installed operator
kubectl api-resources --api-group=cert-manager.io  # empty if cert-manager isn't installed
```

If cert-manager (or any operator) is present, follow Step 1 with its CRDs. Creating CRs
needs the operator's controller running — state that, and read the manifests + spoilers for
the rest.

---

### Step 1 — inspect the API the operator added

Installing cert-manager registered several **CRDs**. That's the "extends the API" half of
the operator — new kinds you can now `kubectl get` like any built-in.

```bash
kubectl get crd | grep cert-manager.io
kubectl explain certificate.spec --api-version=cert-manager.io/v1 | head -30
```

**Question:** you just ran `kubectl explain` and `kubectl get` against a kind Kubernetes
doesn't ship. Where did the ability to `get`/`explain`/`-w` a `Certificate` come from?

---

### Step 2 — declare intent: an Issuer and a Certificate

A `Certificate` needs an **issuer** to sign it. The simplest is a **self-signed** `Issuer` —
no CA, no ACME, nothing to reach out to. Then we declare the `Certificate` itself: *"I want
a cert for `s22.example.com`, stored in a Secret called `s22-tls`."*

```bash
cat > issuer.yaml <<'EOF'
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: s22-selfsigned
  labels: { app: s22 }
spec:
  selfSigned: {}
EOF

cat > certificate.yaml <<'EOF'
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: s22-cert
  labels: { app: s22 }
spec:
  secretName: s22-tls            # the Secret the controller will create/keep
  secretTemplate:
    labels: { app: s22 }         # copy our label onto the generated Secret
  duration: 2160h                # 90 days
  renewBefore: 360h              # renew 15 days before expiry
  commonName: s22.example.com
  dnsNames:
    - s22.example.com
  issuerRef:
    name: s22-selfsigned
    kind: Issuer
EOF

kubectl apply -f issuer.yaml -f certificate.yaml
```

**Task:** watch the controller reconcile the `Certificate` into a `Secret`. Run the watch
and stop it (`Ctrl-C`) once the Certificate is `READY=True` and the Secret exists.

```bash
kubectl get certificate,secret -l app=s22 -w
```

**Question:** you never ran a command that creates a Secret. What created `s22-tls`, and
what does that make cert-manager?

---

### Step 3 — read the status: the controller reporting back

The controller doesn't just act — it **writes state back onto your CR**, so `kubectl` can
tell you what happened. This is the `.status` sub-resource the slides described.

```bash
kubectl get certificate s22-cert -o jsonpath='{.status.conditions}' | jq .
```

---

### Step 4 — break→fix: delete the Secret, watch the loop remake it

This is the reconcile loop made visible. The `Secret` is a **child** the controller
produced from your `Certificate`. Delete it, and the loop notices the gap and closes it.

```bash
# in one terminal, keep watching:
kubectl get secret s22-tls -w &

# now delete the child the controller produced:
kubectl delete secret s22-tls
```

**Question:** the Secret came back on its own. Was that **garbage collection /
`ownerReferences`**, or the **reconcile loop**? (They're easy to confuse.)

---

### Step 5 — the payoff question: controller *or* operator?

**Question:** the ReplicaSet controller also recreates things you delete (delete a Pod, it
comes back). So what makes cert-manager an **operator** and not *just* a controller?

## Observe

- **The operator is just software:** installing cert-manager added three ordinary Pods
  (controller, webhook, cainjector) and several **CRDs** — new API kinds you can
  `get`/`explain`/`-w` like built-ins.
- **A CRD extends the API:** `kubectl explain certificate.spec` works because the CRD ships
  an OpenAPI schema; the API server stores/validates `Certificate`s like any built-in.
- **The controller reconciles:** you declared a `Certificate` and **created no Secret**, yet
  the controller produced `s22-tls` and set `Ready=True` — observe → diff → act.
- **`.status` is the report:** the controller writes `Ready=True` back onto your CR;
  `spec` = desired, `status` = achieved.
- **The loop, not GC:** delete the child Secret and the controller **recreates** it (the
  parent still exists). ownerReferences would *delete* children, never recreate them — and
  cert-manager doesn't set one on the Secret by default anyway.
- **Operator vs controller:** same loop; the operator reconciles a **CRD it defined** with
  **encoded domain knowledge** in the act step.

## Challenge

The Certificate reports Ready but someone deleted the tls Secret. Predict whether the
Secret stays gone, then prove the controller recreates it and explain why ownerReferences alone
would not produce that behaviour.

**Difficulty:** Intermediate

**Success criteria:** Delete the Certificate's Secret, watch it reappear with the same name, show the
Certificate Ready condition remains or returns True, and explain that reconcile recreates
desired children rather than only garbage-collecting them.

**Hints:** Use kubectl delete secret on the Certificate secretName, then kubectl get secret -w
and kubectl describe certificate; look for controller logs or Ready=True on the CR.

[Spoiler: challenge solution](./22-operator-concept.solution.md#challenge-solution)

## Verify

Confirm cert-manager evidence before cleanup.

```bash
kubectl get issuer,certificate,secret -n "$NS" -l app=s22
kubectl get certificate -n "$NS" -l app=s22 -o jsonpath='{.items[*].status.conditions[*].type}{"\n"}'
```

Expected: Certificate/Issuer still present with Ready conditions from the guided path.

## Cleanup / reset

```bash
# scoped cleanup — CRs and the generated Secret all carry app=s22
kubectl delete certificate,issuer,secret -l app=s22 -n "$NS" --ignore-not-found
rm -f issuer.yaml certificate.yaml

# optional: uninstall the operator itself (removes CRDs + controller + all CRs)
# kubectl delete -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml

# panic reset (kind): throw the whole cluster away
# kind delete cluster --name operator
```

> On the **kind** path the fastest reset is `kind delete cluster --name operator` — the
> cluster was disposable, and it takes the operator, its CRDs, and every CR with it. On the
> **shared** path you created nothing (read-only), so there's nothing to clean.

> **Note:** deleting a CRD deletes **every** custom resource of that kind cluster-wide. The
> `kubectl delete -f cert-manager.yaml` line removes the cert-manager CRDs, so it will also
> remove any `Certificate`/`Issuer` anywhere on the cluster — only run it on your throwaway
> kind cluster.

## Stretch (optional) — see the intermediate CR, and prove it's the loop

cert-manager doesn't sign the cert directly from the `Certificate`; it spawns an
intermediate **`CertificateRequest`** — another CR its controller reconciles. Peek at the
chain, then re-run the break→fix to watch it heal a second time.

```bash
# the request the Certificate spawned (a CR carrying the issued cert's status).
# no label selector: cert-manager names the request itself and a throwaway
# cluster has exactly one — it also doesn't copy your app=s22 label onto it.
kubectl get certificaterequest
kubectl describe certificate s22-cert | sed -n '/Events:/,$p'
```
