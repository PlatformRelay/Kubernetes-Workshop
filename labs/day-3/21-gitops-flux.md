# Lab 21 — GitOps with Flux (S21)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S21 — GitOps with Flux |
| **Environment** | **kind ✓** (installs Flux) / shared namespace: **read-only** |
| **Estimated time** | 25 min |

## Objective

Install **Flux** (the GitOps Toolkit) on a throwaway kind cluster, hand it a
**`GitRepository`** + **`Kustomization`** that point at a public Git repo, and watch
them **pull** that repo into the cluster — going **Ready** on their own. Then feel
the part that makes GitOps different from `kubectl apply`: **drift** a managed
resource by hand and watch Flux **reconcile** it back to Git. Finally **suspend**
the Kustomization (the `selfHeal: false` analog) and prove the same drift **stays**.

The whole lab turns on one idea: **Git is the desired state, and an in-cluster agent
continuously reconciles the cluster toward it** — the S03 reconcile loop, with Git as `spec`.

> **Why not the `web` app?** Every other Day-1/2 lab extends the `web` Deployment. This one
> deliberately uses the canonical public repo **`argoproj/argocd-example-apps` / `guestbook`**
> so it runs on kind with **nothing to host** (same hostless source as the Argo CD variant).
> The one beat that needs a *writable* repo (change Git → re-reconcile) is the optional
> **Stretch** at the end; the required drift break→fix needs no Git write at all.

## Prerequisites

- **kind path (do this):** Docker + `kind` + `kubectl`, and rights to create a local cluster.
  You'll make a throwaway cluster named `gitops`. Flux runs cluster-wide, so this is
  **kind-only** — you can't install it into a shared assigned namespace.
- **Shared-cluster path:** **read-only.** If the facilitator has hung Flux in the room,
  you can *inspect* a running `GitRepository` / `Kustomization` (Steps 3–4 read-only) but
  not install or drift them. Prefer kind if you can.
- The `flux` CLI is **optional** — every required step here works with `kubectl` alone.
- Internet pull access for the Flux controller images and the guestbook image
  (`gcr.io/google-samples/gb-frontend:v5`).

## Files used

- `gitrepository.yaml` — Flux `GitRepository` that polls the guestbook Git source.
- `kustomization.yaml` — Flux `Kustomization` that builds/applies that path and keeps
  the cluster matching Git (`prune: true`, short `interval` for the lab).

The CRs live in `flux-system` and are cleaned up by name; the guestbook workloads they
create land in `default` and are pruned by Flux on delete when `prune: true`.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./21-gitops-flux.solution.md#guided-solutions)

### Step 0 — a cluster, and Flux on it

### kind path (do this)

```bash
kind create cluster --name gitops

# Flux "dev install": controllers only (no bootstrap / no Git-managed Flux itself)
# server-side apply: the install manifest is large
kubectl apply --server-side --force-conflicts \
  -f https://github.com/fluxcd/flux2/releases/latest/download/install.yaml

# latest install.yaml may also ship image-* / source-watcher — park them on kind
kubectl -n flux-system scale deploy/image-automation-controller \
  deploy/image-reflector-controller deploy/source-watcher --replicas=0 2>/dev/null || true

# wait for the four controllers this lab uses (~1–2 min on a fresh kind)
kubectl -n flux-system wait --for=condition=available --timeout=300s \
  deploy/source-controller deploy/kustomize-controller \
  deploy/helm-controller deploy/notification-controller
```

**Task:** confirm those four Flux Deployments in `flux-system` are Available.

**Question (optional):** which four controllers does this lab actually wait on, and what do
the optional ones do?

### shared-cluster path (read-only)

```bash
# only if a facilitator Flux exists; you are a spectator here
kubectl config set-context --current --namespace=flux-system
kubectl get gitrepositories,kustomizations
```

Skip Steps 0–2's writes; join at **Step 3** to read a running Kustomization's status.

---

### Step 1 — write the GitRepository and Kustomization

Create two files. Together they are the entire GitOps declaration: **source** (the desired
state, in Git) + **apply pipeline** (where it lands, how often, whether to prune).

```bash
cat > gitrepository.yaml <<'EOF'
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: guestbook
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/argoproj/argocd-example-apps.git
  ref:
    branch: master
EOF

cat > kustomization.yaml <<'EOF'
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: guestbook
  namespace: flux-system
spec:
  interval: 30s
  path: ./guestbook
  prune: true
  sourceRef:
    kind: GitRepository
    name: guestbook
  targetNamespace: default
EOF
```

**Task:** validate both against the server before applying (the CRDs ship with Flux).

```bash
kubectl apply --dry-run=server -f gitrepository.yaml -f kustomization.yaml
```

---

### Step 2 — apply them and watch Git pull into the cluster

There is **no separate "sync" command** here — declaring the CRs is enough. The
source-controller fetches the repo; the kustomize-controller builds `./guestbook` and
applies it on every `interval`.

```bash
kubectl apply -f gitrepository.yaml -f kustomization.yaml
kubectl -n flux-system get gitrepository,kustomization guestbook -w
# Ctrl-C once both show READY=True
```

**Task:** watch both reach `READY=True`, then confirm the guestbook workload landed in
`default`.

```bash
kubectl -n default get deploy,svc guestbook-ui
kubectl -n default get pods -l app=guestbook-ui
```

**Question:** you set `ref.branch: master`. What does that track, and when would you pin a
tag or commit SHA instead?

---

### Step 3 — read Ready conditions (source vs apply)

Flux reports readiness on **each** object. The GitRepository answers "did we fetch Git?";
the Kustomization answers "did we apply that artifact successfully?"

```bash
kubectl -n flux-system get gitrepository guestbook \
  -o custom-columns='READY:.status.conditions[?(@.type=="Ready")].status,MESSAGE:.status.conditions[?(@.type=="Ready")].message'
kubectl -n flux-system get kustomization guestbook \
  -o custom-columns='READY:.status.conditions[?(@.type=="Ready")].status,MESSAGE:.status.conditions[?(@.type=="Ready")].message'
```

**Task:** read off Ready for source and Kustomization separately.

---

### Step 4 — break→fix: drift it by hand, watch reconcile revert

The GitOps moment. Git says `guestbook-ui` has **1** replica. Change it by hand and watch
Flux notice the drift on the next reconcile and **put it back** — no human, no
`kubectl apply` of the guestbook.

```bash
kubectl -n default scale deployment guestbook-ui --replicas=5
kubectl -n default get deploy guestbook-ui -w    # Ctrl-C after it settles back to 1
```

**Task:** watch the replica count briefly jump toward 5, then get dragged back to **1** by Flux
(within ~30s — the Kustomization `interval`).

**Question (required):** what would happen to that hand-scale if the Kustomization were
**suspended** (`spec.suspend: true` — the `selfHeal: false` analog)?

Prove it:

```bash
# suspend reconciliation (detection/apply stops acting on the cluster)
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":true}}'

# drift it again
kubectl -n default scale deployment guestbook-ui --replicas=5
sleep 40
kubectl -n flux-system get kustomization guestbook \
  -o custom-columns='SUSPEND:.spec.suspend,READY:.status.conditions[?(@.type=="Ready")].status'
kubectl -n default get deploy guestbook-ui
```

Expected: replicas **stay at 5** while suspended. Resume and watch Flux heal:

```bash
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":false}}'
kubectl -n default get deploy guestbook-ui -w    # back to 1
```

---

## Observe

- **Pull, not push.** You applied a `GitRepository` + `Kustomization`; Flux pulled the
  guestbook repo and deployed it — you never `kubectl apply`'d the guestbook manifests yourself.
- **Source Ready ≠ Apply Ready.** Fetch success and apply success are separate conditions —
  read both.
- **Reconcile reverts drift.** A hand-scale to 5 was dragged back to Git's 1, automatically.
- **Suspend ≠ drift detection forever-on.** With `suspend: true`, Flux **stops applying** —
  the same drift stays (the Argo `selfHeal: false` analog). Resume and it heals again.

## Challenge

Guestbook replicas stay drifted after a manual scale, and the Kustomization no longer
corrects them. Diagnose suspend versus a failed Ready condition, resume (or fix), and prove
the live Deployment matches Git again.

**Difficulty:** Intermediate

**Success criteria:** Read Kustomization `.spec.suspend` and Ready condition, identify that
suspend is true or apply is failing, clear the block, and show replicas return to the
Git-desired count with Ready=True.

**Hints:** Inspect spec.suspend and status.conditions on the Kustomization; compare kubectl
get deploy replicas with the Git guestbook manifest; patch suspend false or fix the Ready
message.

[Spoiler: challenge solution](./21-gitops-flux.solution.md#challenge-solution)

## Verify

Confirm Flux evidence before cleanup.

```bash
kubectl -n flux-system get gitrepository,kustomization guestbook
kubectl -n default get deploy,svc guestbook-ui
```

Expected: Ready status is still readable so suspend / reconcile behaviour can be re-checked.

## Cleanup / reset

```bash
# delete the Kustomization first; prune:true means Flux removes the guestbook workloads
kubectl -n flux-system delete kustomization guestbook
kubectl -n default get deploy,svc guestbook-ui   # expect: NotFound
kubectl -n flux-system delete gitrepository guestbook

# tidy local files
rm -f gitrepository.yaml kustomization.yaml
```

## Stretch (optional) — change Git, watch it re-reconcile

This is the "Git is the source of truth" beat end-to-end — it needs a repo **you can push to**.

1. **Fork** `https://github.com/argoproj/argocd-example-apps` on GitHub (or push a copy to any Git
   host you control).
2. Point the GitRepository at your fork: edit `gitrepository.yaml`'s `url` to your fork's URL and
   `kubectl apply -f gitrepository.yaml` again.
3. In your fork, edit `guestbook/guestbook-ui-deployment.yaml` — bump `replicas` to `2` — and
   `git commit && git push`.
4. Watch Flux detect the new commit and re-reconcile:

```bash
kubectl -n flux-system get gitrepository,kustomization guestbook -w
```
