# Lab 21 — GitOps with Argo CD (S21)

| | |
| --- | --- |
| **Section** | S21 — GitOps with Argo CD |
| **Environment** | **kind ✓** (installs Argo CD) / shared namespace: **read-only** |
| **Estimated time** | 25 min |

## Objective

Install **Argo CD** on a throwaway kind cluster, hand it one **`Application`** that points at a
public Git repo, and watch it **pull** that repo into the cluster — going **Synced / Healthy**
on its own. Then feel the part that makes GitOps different from `kubectl apply`: **drift** a
managed resource by hand and watch Argo CD's **self-heal** revert it back to Git.

The whole lab turns on one idea: **Git is the desired state, and an in-cluster agent
continuously reconciles the cluster toward it** — the S03 reconcile loop, with Git as `spec`.

> **Why not the `web` app?** Every other Day-1/2 lab extends the `web` Deployment. This one
> deliberately uses the canonical public repo **`argoproj/argocd-example-apps` / `guestbook`**
> so it runs on kind with **nothing to host**. The one beat that needs a *writable* repo
> (change Git → re-sync) is the optional **Stretch** at the end; the required self-heal
> break→fix needs no Git write at all.

## Prerequisites

- **kind path (do this):** Docker + `kind` + `kubectl`, and rights to create a local cluster.
  You'll make a throwaway cluster named `gitops`. Argo CD runs cluster-wide, so this is
  **kind-only** — you can't install it into a shared assigned namespace.
- **Shared-cluster path:** **read-only.** If the facilitator has hung an Argo CD in the room,
  you can *inspect* a running `Application` (Steps 3–4 read-only) but not install or drift it.
  Prefer kind if you can.
- The `argocd` CLI is **optional** — every required step here works with `kubectl` alone.
- Internet pull access for the Argo CD images and the guestbook image
  (`gcr.io/google-samples/gb-frontend:v5`).

## Files used

- `application.yaml` — the Argo CD `Application` that binds the guestbook Git source to this
  cluster (the slide's magic-move final frame, **byte-for-byte**).

The Application carries no extra labels — it lives in the `argocd` namespace and is cleaned up
by name; the guestbook workloads it creates land in `default` and are pruned by Argo on delete.

---

## Step 0 — a cluster, and Argo CD on it

### kind path (do this)

```bash
kind create cluster --name gitops
kubectl create namespace argocd

# server-side apply: the install manifest is too big for client-side apply
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# wait for the control plane to come up (~1–2 min on a fresh kind)
kubectl -n argocd wait --for=condition=available deploy --all --timeout=300s
```

**Task:** confirm the Argo CD Deployments are all Available.

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n argocd wait --for=condition=available deploy --all --timeout=300s
deployment.apps/argocd-applicationset-controller condition met
deployment.apps/argocd-dex-server condition met
deployment.apps/argocd-notifications-controller condition met
deployment.apps/argocd-redis condition met
deployment.apps/argocd-repo-server condition met
deployment.apps/argocd-server condition met
```

`argocd-application-controller` is a **StatefulSet**, not a Deployment, so it won't show in
that list — check it too with `kubectl -n argocd rollout status statefulset/argocd-application-controller`.
We install with `--server-side` because the bundled `install.yaml` is larger than the
`kubectl.kubernetes.io/last-applied-configuration` annotation can hold; a plain client-side
`kubectl apply` warns or fails on it.
</details>

**Question (optional):** where's the admin password, if you want to open the UI?

<details><summary>Answer</summary>

Argo CD generates an initial admin password into a Secret on first install:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d ; echo
# then, in another terminal:
kubectl -n argocd port-forward svc/argocd-server 8080:443
# browse https://localhost:8080  (user: admin) — accept the self-signed cert
```

The UI is a nice-to-have; **this lab never needs it** — we read status with `kubectl` and
`argocd` CLI. (With the CLI: `argocd admin initial-password -n argocd` prints the same
password.)
</details>

### shared-cluster path (read-only)

```bash
# only if a facilitator Argo CD exists; you are a spectator here
kubectl config set-context --current --namespace=argocd
kubectl get applications
```

Skip Steps 0–2's writes; join at **Step 3** to read a running Application's status.

---

## Step 1 — write the Application

Create `application.yaml`. This is the entire GitOps declaration: **source** (the desired state,
in Git) + **destination** (where it lands) + **syncPolicy** (keep it matching, hands-off).

```bash
cat > application.yaml <<'EOF'
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
```

**Task:** validate it against the server before applying (the CRD ships with Argo CD).

```bash
kubectl apply --dry-run=server -f application.yaml
```

<details><summary>Solution / expected output</summary>

```console
application.argoproj.io/guestbook created (server dry run)
```

`--dry-run=server` runs schema + admission checks against the real API (the `Application` CRD
was installed in Step 0) without persisting anything. If it errors with
`no matches for kind "Application"`, Argo CD isn't installed yet — finish Step 0.
</details>

---

## Step 2 — apply it and watch Git pull into the cluster

There is **no "sync" command** here — declaring the Application is enough. Because
`syncPolicy.automated` is set, Argo CD sees the new Application, pulls the repo, and applies it.

```bash
kubectl apply -f application.yaml
kubectl -n argocd get application guestbook -w   # Ctrl-C once it reads Synced / Healthy
```

**Task:** watch the app reach `SYNC STATUS: Synced` and `HEALTH STATUS: Healthy`, then confirm
the guestbook workload actually landed in `default`.

```bash
kubectl -n default get deploy,svc guestbook-ui
kubectl -n default get pods -l app=guestbook-ui
```

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n argocd get application guestbook
NAME        SYNC STATUS   HEALTH STATUS
guestbook   Synced        Healthy

$ kubectl -n default get deploy,svc guestbook-ui
NAME                          READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/guestbook-ui  1/1     1            1           40s
NAME                   TYPE        CLUSTER-IP     PORT(S)   AGE
service/guestbook-ui   ClusterIP   10.x.x.x       80/TCP    40s

$ kubectl -n default get pods -l app=guestbook-ui
NAME                           READY   STATUS    RESTARTS   AGE
guestbook-ui-xxxxxxxxx-xxxxx   1/1     Running   0          40s
```

> Note: the guestbook **Deployment and Service objects carry no `app` label** (only the *pods*
> do), so we get the workloads **by name** and only filter *pods* with `-l app=guestbook-ui`.

It goes `OutOfSync → Progressing → Synced/Healthy` over ~30–90s: Argo pulled the manifests
from the repo `path: guestbook` and applied them — **you never ran `kubectl apply` on the
guestbook itself.** That's the pull model: you declared *what* (an Application) and the
in-cluster agent did the *how*.
</details>

**Question:** you set `targetRevision: HEAD`. What does that track, and when would you change it?

<details><summary>Answer</summary>

`HEAD` tracks the **tip of the repo's default branch** — whatever's latest. In production you'd
usually pin a **branch** (`main`, `release`), a **tag** (`v1.4.0`), or an exact **commit SHA** so
a deploy is reproducible and a rollback is "point `targetRevision` at the previous commit." `HEAD`
is convenient for a demo but means "always the newest thing on that repo."
</details>

---

## Step 3 — read both statuses (the two independent axes)

Argo reports **two** things that move independently: is the cluster == Git (**sync**), and are the
workloads OK (**health**)?

```bash
kubectl -n argocd get application guestbook \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status'
```

**Task:** read off the sync status and the health status separately.

<details><summary>Solution / expected output</summary>

```console
SYNC     HEALTH
Synced   Healthy
```

- **Sync status** (`Synced` / `OutOfSync` / `Unknown`) answers *does live match Git?* — a pure diff.
- **Health status** (`Healthy` / `Progressing` / `Degraded` / `Missing` / `Suspended`) answers
  *are the workloads actually up?* — Argo's per-resource health checks.

They're orthogonal: you can be `Synced + Degraded` (you faithfully deployed a broken manifest —
fix Git) or `OutOfSync + Healthy` (a hand-patch that works but isn't in Git — self-heal will
revert it). The next step manufactures exactly that second case.
</details>

---

## Step 4 — break→fix: drift it by hand, watch self-heal revert

The GitOps moment. Git says `guestbook-ui` has **1** replica. Change it by hand and watch Argo
CD notice the drift and **put it back** — no human, no `kubectl apply`.

```bash
kubectl -n default scale deployment guestbook-ui --replicas=5
kubectl -n default get deploy guestbook-ui -w    # Ctrl-C after it settles back to 1
```

**Task:** watch the replica count briefly jump toward 5, then get dragged back to **1** by Argo.

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n default scale deployment guestbook-ui --replicas=5
deployment.apps/guestbook-ui scaled

$ kubectl -n default get deploy guestbook-ui -w
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   1/5     5            1           6m
guestbook-ui   5/5     5            5           6m
guestbook-ui   1/1     1            1           6m    # self-heal reverted it
```

You scaled to 5; within a reconcile cycle Argo CD compared live (5) against Git (1), saw
**drift**, and **re-applied Git** — back to 1. That's `selfHeal: true`. The cluster *refuses to
stay drifted from Git*. This is the S03 reconcile loop with Git in the "desired" slot: observe →
diff (5 ≠ 1) → act (re-apply) → repeat. If you were watching the Application, it flicked
`OutOfSync → Synced` as it healed.
</details>

**Question (required):** what would happen to that hand-scale if `selfHeal` were **off**?

<details><summary>Answer — prove it</summary>

With self-heal off, Argo still **detects** the drift (it always does) but does **not** revert it —
the app just sits `OutOfSync` until a human syncs. Prove it:

```bash
# turn self-heal off
kubectl -n argocd patch application guestbook --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":false}}}}'

# drift it again
kubectl -n default scale deployment guestbook-ui --replicas=5
sleep 20
kubectl -n argocd get application guestbook \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status'
kubectl -n default get deploy guestbook-ui
```

```console
SYNC       HEALTH
OutOfSync  Healthy
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   5/5     5            5           8m      # stays at 5 — NOT reverted
```

`OutOfSync + Healthy`: 5 replicas run happily, but the cluster no longer matches Git and Argo
**leaves it alone**. Drift *detection* is always on; **self-heal** is the auto-revert on top.
Put it back and restore the policy:

```bash
kubectl -n argocd patch application guestbook --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":true}}}}'
```

Re-enabling self-heal makes Argo revert the drift again within a reconcile cycle — back to 1
replica, `Synced`.

</details>

---

## Expected observations

- **Pull, not push.** You applied one `Application`; Argo CD pulled the guestbook repo and
  deployed it — you never `kubectl apply`'d the guestbook manifests yourself.
- **Synced / Healthy are independent.** Sync = "cluster == Git?"; health = "workloads OK?" — read
  both off `.status.sync.status` and `.status.health.status`.
- **Self-heal reverts drift.** A hand-scale to 5 was dragged back to Git's 1, automatically.
- **Drift detection ≠ self-heal.** With `selfHeal: false`, the same drift stays `OutOfSync` and is
  *not* reverted — detection always runs; self-heal is the auto-fix on top.

## Cleanup / panic reset

```bash
# delete the Application; prune:true means Argo removes the guestbook workloads it created
kubectl -n argocd delete application guestbook
kubectl -n default get deploy,svc guestbook-ui   # expect: NotFound

# tidy local files
rm -f application.yaml
```

<details><summary>Expected / fastest reset</summary>

```console
$ kubectl -n argocd delete application guestbook
application.argoproj.io "guestbook" deleted

$ kubectl -n default get deploy,svc guestbook-ui
Error from server (NotFound): deployments.apps "guestbook-ui" not found
```

Because the Application had `prune: true`, deleting it prunes the resources it created. The
**fastest full reset** is to throw the cluster away: `kind delete cluster --name gitops` — that
takes Argo CD and everything with it.
</details>

## Stretch (optional) — change Git, watch it re-sync

This is the "Git is the source of truth" beat end-to-end — it needs a repo **you can push to**.

1. **Fork** `https://github.com/argoproj/argocd-example-apps` on GitHub (or push a copy to any Git
   host you control).
2. Point the Application at your fork: edit `application.yaml`'s `repoURL` to your fork's URL and
   `kubectl apply -f application.yaml` again.
3. In your fork, edit `guestbook/guestbook-ui-deployment.yaml` — bump `replicas` to `2` — and
   `git commit && git push`.
4. Watch Argo detect the new commit and re-sync:

```bash
kubectl -n argocd get application guestbook -w
```

<details><summary>What you should see — and why it matters</summary>

Within Argo's polling interval (~3 min by default, or immediately if you wire a webhook / run
`argocd app get guestbook --refresh`), the app flips `Synced → OutOfSync → Synced` and the live
Deployment moves to **2 replicas** — because **Git changed**, not because anyone touched the
cluster. That's the whole discipline: the **only** way to change the cluster is to change Git,
and every change is a reviewable, revertable commit. Contrast with Step 4, where a *cluster*
change (drift) was reverted; here a *Git* change is what actually propagates.

Clean up the fork path the same way: `kubectl -n argocd delete application guestbook`.
</details>
