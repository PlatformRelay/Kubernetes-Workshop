# Lab 22 — The operator pattern (S22)

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

## Step 0 — a cluster, and the operator itself

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl wait --for=condition=Available --timeout=300s deployment --all -n cert-manager
deployment.apps/cert-manager condition met
deployment.apps/cert-manager-cainjector condition met
deployment.apps/cert-manager-webhook condition met

$ kubectl get pods -n cert-manager
NAME                                       READY   STATUS    RESTARTS   AGE
cert-manager-5b9ff77b7d-xxxxx              1/1     Running   0          75s
cert-manager-cainjector-7d8b8f6c9-xxxxx    1/1     Running   0          75s
cert-manager-webhook-6c9dd58f5-xxxxx       1/1     Running   0          75s
```

Three Deployments make up the operator: the **controller** (runs the reconcile loop), the
**webhook** (validates/defaults CRs — the thing that must be up before you create a CR), and
**cainjector** (a helper). All three are ordinary Pods — an operator is just software you
install. The image registry `quay.io/jetstack/*` is the cert-manager project's, not a
vendor's.
</details>

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

## Step 1 — inspect the API the operator added

Installing cert-manager registered several **CRDs**. That's the "extends the API" half of
the operator — new kinds you can now `kubectl get` like any built-in.

```bash
kubectl get crd | grep cert-manager.io
kubectl explain certificate.spec --api-version=cert-manager.io/v1 | head -30
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl get crd | grep cert-manager.io
certificaterequests.cert-manager.io   2026-07-10T09:00:00Z
certificates.cert-manager.io          2026-07-10T09:00:00Z
challenges.acme.cert-manager.io       2026-07-10T09:00:00Z
clusterissuers.cert-manager.io        2026-07-10T09:00:00Z
issuers.cert-manager.io               2026-07-10T09:00:00Z
orders.acme.cert-manager.io           2026-07-10T09:00:00Z

$ kubectl explain certificate.spec --api-version=cert-manager.io/v1 | head -30
GROUP:      cert-manager.io
KIND:       Certificate
VERSION:    v1

FIELD: spec <Object>
...
   secretName    <string> -required-
     SecretName is the name of the secret resource that will be automatically created...
   issuerRef     <Object> -required-
     IssuerRef is a reference to the issuer for this certificate.
   dnsNames      <[]string>
   ...
```

`kubectl explain` works on `Certificate` **because the CRD ships an OpenAPI schema** — the
same mechanism that lets `kubectl explain pod.spec` work for built-ins. The API server now
treats `cert-manager.io/v1` kinds as first-class. Nothing has *reconciled* anything yet;
this is purely the API surface.
</details>

**Question:** you just ran `kubectl explain` and `kubectl get` against a kind Kubernetes
doesn't ship. Where did the ability to `get`/`explain`/`-w` a `Certificate` come from?

<details><summary>Answer</summary>

From the **CustomResourceDefinition**. A CRD registers a new group/version/kind plus an
**OpenAPI v3 schema** with the API server. Once registered, the resource is stored in etcd,
validated on apply, and exposed through the same REST/discovery machinery as built-in kinds
— so **all** the standard verbs (`get`, `describe`, `explain`, `-o yaml`, `-w`, RBAC, ...)
work for free. That's the "extend the API" half of an operator; the controller (Step 2+) is
the half that makes it *do* something.
</details>

---

## Step 2 — declare intent: an Issuer and a Certificate

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

<details><summary>Solution / expected output</summary>

```console
NAME                                 READY   SECRET    AGE
certificate.cert-manager.io/s22-cert   False   s22-tls   0s
certificate.cert-manager.io/s22-cert   True    s22-tls   2s

NAME                 TYPE                DATA   AGE
secret/s22-tls       kubernetes.io/tls   3      2s
```

You declared a `Certificate` (desired state) and **created no Secret** — yet a
`kubernetes.io/tls` Secret named `s22-tls` appeared, holding `tls.crt`, `tls.key`, and
`ca.crt` (`DATA 3`). The **cert-manager controller** observed your CR, saw no matching
Secret (the gap), signed a cert with the self-signed Issuer, and wrote the Secret — then
flipped the Certificate to `READY=True`. That's **observe → diff → act**, over a resource
cert-manager invented. No imperative command created the Secret.
</details>

**Question:** you never ran a command that creates a Secret. What created `s22-tls`, and
what does that make cert-manager?

<details><summary>Answer</summary>

The **cert-manager controller** created it, by running its **reconcile loop** over your
`Certificate`: desired = *"a valid cert in Secret `s22-tls`"*; observed = *"no such
Secret"*; act = *sign the cert and write the Secret*. Because it (a) added a new API kind
via a **CRD** and (b) runs a **controller** that reconciles instances of that kind using
**domain knowledge about certificates** (issue, store as a TLS Secret, later renew before
expiry), cert-manager is an **operator** — not just a controller. See the next step for the
sharper controller-vs-operator answer.
</details>

---

## Step 3 — read the status: the controller reporting back

The controller doesn't just act — it **writes state back onto your CR**, so `kubectl` can
tell you what happened. This is the `.status` sub-resource the slides described.

```bash
kubectl get certificate s22-cert -o jsonpath='{.status.conditions}' | jq .
```

<details><summary>Solution / expected output</summary>

```console
[
  {
    "type": "Ready",
    "status": "True",
    "reason": "Ready",
    "message": "Certificate is up to date and has not expired",
    "lastTransitionTime": "2026-07-10T09:01:00Z"
  }
]
```

(No `jq`? Use `kubectl describe certificate s22-cert` and read the **Status → Conditions**
block.) The `Ready=True` condition is the **controller reporting observed state back onto
the desired-state object** — `spec` is what you asked for, `status` is what the controller
achieved. Every well-behaved operator does this; it's how `kubectl get` can show a CR as
healthy or not.
</details>

---

## Step 4 — break→fix: delete the Secret, watch the loop remake it

This is the reconcile loop made visible. The `Secret` is a **child** the controller
produced from your `Certificate`. Delete it, and the loop notices the gap and closes it.

```bash
# in one terminal, keep watching:
kubectl get secret s22-tls -w &

# now delete the child the controller produced:
kubectl delete secret s22-tls
```

<details><summary>Solution / expected output</summary>

```console
secret/s22-tls   kubernetes.io/tls   3   90s
secret "s22-tls" deleted
secret/s22-tls   kubernetes.io/tls   3   0s     # ← reappears, seconds later
```

The Secret vanishes on delete, then **the same-named Secret reappears within seconds** — you
did nothing to recreate it. The controller's loop is always running: it re-observed the
`Certificate` (desired: a Secret `s22-tls` with a valid cert), observed the world (Secret
missing → drift), and **acted** (re-signed, re-wrote the Secret). Stop the background watch
with `kill %1` when done.
</details>

**Question:** the Secret came back on its own. Was that **garbage collection /
`ownerReferences`**, or the **reconcile loop**? (They're easy to confuse.)

<details><summary>Answer</summary>

The **reconcile loop** — *not* ownerReferences. `ownerReferences` drive **garbage
collection**, which only ever *deletes* children when a parent is removed; GC never
**creates** anything. Here the *parent* Certificate still exists and its child Secret was
deleted, so the controller **re-created** it by re-running observe → diff → act. In fact
cert-manager does **not** set an `ownerReference` on the Secret by default
(`--enable-certificate-owner-ref` is `false`), precisely so the TLS Secret survives if you
delete the Certificate. Rule of thumb: **child reappears after you delete it → a controller
is reconciling it; child disappears when you delete its parent → ownerReference GC.**
</details>

---

## Step 5 — the payoff question: controller *or* operator?

**Question:** the ReplicaSet controller also recreates things you delete (delete a Pod, it
comes back). So what makes cert-manager an **operator** and not *just* a controller?

<details><summary>Answer</summary>

Both run the **same reconcile loop** — that's the point, an operator is not a new mechanism.
The difference is two things:

1. **What it reconciles.** A plain controller reconciles **built-in** kinds (ReplicaSet →
   Pods). An operator reconciles a **CRD it added** (`Certificate`) — it *extended the API*.
2. **What's in "act".** A plain controller's act is **generic** (*make N replicas*).
   cert-manager's act is **domain knowledge**: issue an X.509 cert, store it as a
   `kubernetes.io/tls` Secret, and **renew it before it expires**. You could not express
   *"keep this certificate valid"* with any built-in kind — that expertise lives in the
   controller, exposed through the `Certificate` CRD.

So: **operator = CRD (new API) + controller with operational knowledge encoded in the loop.**
A bare controller has no opinion about *your* domain; an operator *is* the opinion.
</details>

## Expected observations

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

## Cleanup / panic reset

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

<details><summary>What you're looking at</summary>

```console
$ kubectl get certificaterequest
NAME              APPROVED   DENIED   READY   ISSUER           AGE
s22-cert-xxxxx    True                True    s22-selfsigned   3m

# describe Events (abridged):
#   Normal  Issuing    Issuing certificate as Secret does not exist
#   Normal  Generated  Stored new private key in temporary Secret ...
#   Normal  Requested  Created new CertificateRequest resource "s22-cert-xxxxx"
#   Normal  Issuing    The certificate has been successfully issued
```

The `Certificate` controller created a **`CertificateRequest`** (yet another CRD) to carry
the signing request, which a second controller **Approved** and marked **Ready** — operators
routinely reconcile *chains* of their own CRs. The **Events** are the controller narrating
its reconcile loop: it acts *because* the Secret does not exist, and re-emits an `Issuing`
event every time it has to close that gap. Delete `s22-tls` again and watch a fresh `Issuing`
→ `successfully issued` pair appear — the loop, on demand.
</details>
