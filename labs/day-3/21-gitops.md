# Lab 21 — GitOps with Argo CD (S21)

<!-- lab-contract:v1 -->

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

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./21-gitops.solution.md#guided-solutions)

### Step 0 — a cluster, and Argo CD on it

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

**Question (optional):** where's the admin password, if you want to open the UI?

### shared-cluster path (read-only)

```bash
# only if a facilitator Argo CD exists; you are a spectator here
kubectl config set-context --current --namespace=argocd
kubectl get applications
```

Skip Steps 0–2's writes; join at **Step 3** to read a running Application's status.

---

### Step 1 — write the Application

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

---

### Step 2 — apply it and watch Git pull into the cluster

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

**Question:** you set `targetRevision: HEAD`. What does that track, and when would you change it?

---

### Step 3 — read both statuses (the two independent axes)

Argo reports **two** things that move independently: is the cluster == Git (**sync**), and are the
workloads OK (**health**)?

```bash
kubectl -n argocd get application guestbook \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status'
```

**Task:** read off the sync status and the health status separately.

---

### Step 4 — break→fix: drift it by hand, watch self-heal revert

The GitOps moment. Git says `guestbook-ui` has **1** replica. Change it by hand and watch Argo
CD notice the drift and **put it back** — no human, no `kubectl apply`.

```bash
kubectl -n default scale deployment guestbook-ui --replicas=5
kubectl -n default get deploy guestbook-ui -w    # Ctrl-C after it settles back to 1
```

**Task:** watch the replica count briefly jump toward 5, then get dragged back to **1** by Argo.

**Question (required):** what would happen to that hand-scale if `selfHeal` were **off**?

---

## Observe

- **Pull, not push.** You applied one `Application`; Argo CD pulled the guestbook repo and
  deployed it — you never `kubectl apply`'d the guestbook manifests yourself.
- **Synced / Healthy are independent.** Sync = "cluster == Git?"; health = "workloads OK?" — read
  both off `.status.sync.status` and `.status.health.status`.
- **Self-heal reverts drift.** A hand-scale to 5 was dragged back to Git's 1, automatically.
- **Drift detection ≠ self-heal.** With `selfHeal: false`, the same drift stays `OutOfSync` and is
  *not* reverted — detection always runs; self-heal is the auto-fix on top.

## Challenge

Guestbook shows OutOfSync after a manual scale, but replicas do not return to Git.
Diagnose automated sync versus selfHeal, restore self-heal (or sync), and prove the live
Deployment matches Git again.

**Difficulty:** Intermediate

**Success criteria:** Read Application .status.sync.status and .status.health.status, identify that
selfHeal is false or automated sync is incomplete, re-enable selfHeal or sync, and show
replicas return to the Git-desired count with Synced status.

**Hints:** Inspect spec.syncPolicy.automated on the Application; compare kubectl get deploy
replicas with the Git guestbook manifest; patch selfHeal true or run argocd/kubectl sync.

[Spoiler: challenge solution](./21-gitops.solution.md#challenge-solution)

## Verify

Confirm Application evidence before cleanup.

```bash
kubectl -n argocd get application guestbook
kubectl -n default get deploy,svc guestbook-ui
```

Expected: sync/health status are still readable so self-heal behaviour can be re-checked.

## Cleanup / reset

```bash
# delete the Application; prune:true means Argo removes the guestbook workloads it created
kubectl -n argocd delete application guestbook
kubectl -n default get deploy,svc guestbook-ui   # expect: NotFound

# tidy local files
rm -f application.yaml
```

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
