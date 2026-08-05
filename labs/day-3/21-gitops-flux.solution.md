# Lab 21 — GitOps with Flux (S21) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n flux-system wait --for=condition=available --timeout=300s \
    deploy/source-controller deploy/kustomize-controller \
    deploy/helm-controller deploy/notification-controller
deployment.apps/source-controller condition met
deployment.apps/kustomize-controller condition met
deployment.apps/helm-controller condition met
deployment.apps/notification-controller condition met
```

We install with `--server-side` because the bundled `install.yaml` is large; a plain
client-side `kubectl apply` can warn or fail on annotation size. This is Flux's **dev
install** path — controllers only, no `flux bootstrap` and no Git-managed Flux itself —
which is what a throwaway kind lab needs. Waiting on named Deployments (not `--all`) keeps
the lab green when `latest` also ships optional image-* / source-watcher controllers.
</details>

**Question (optional):** which four controllers does this lab actually wait on, and what do
the optional ones do?

<details><summary>Answer</summary>

This lab waits on the four controllers the guestbook path needs:

- **source-controller** — fetches Git/Helm/OCI/Bucket artifacts
- **kustomize-controller** — builds and applies Kustomizations (this lab's apply path)
- **helm-controller** — reconciles HelmReleases (not used in the required steps)
- **notification-controller** — alerts / providers (not used in the required steps)

`latest` may also install **image-automation-controller**, **image-reflector-controller**,
and **source-watcher** — useful in production image-update flows, but parked at 0 replicas
on kind so a small laptop isn't fighting seven controllers. The optional `flux` CLI's
`flux check` prints CRD readiness for whatever is still running.
</details>

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

<details><summary>Solution / expected output</summary>

```console
gitrepository.source.toolkit.fluxcd.io/guestbook created (server dry run)
kustomization.kustomize.toolkit.fluxcd.io/guestbook created (server dry run)
```

`--dry-run=server` runs schema + admission checks against the real API (the Flux CRDs were
installed in Step 0) without persisting anything. If it errors with `no matches for kind
"GitRepository"`, Flux isn't installed yet — finish Step 0.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n flux-system get gitrepository,kustomization guestbook
NAME                                               URL                                                   AGE   READY   STATUS
gitrepository.source.toolkit.fluxcd.io/guestbook   https://github.com/argoproj/argocd-example-apps.git   5s    True    stored artifact for revision 'master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5'

NAME                                                  AGE   READY   STATUS
kustomization.kustomize.toolkit.fluxcd.io/guestbook   5s    True    Applied revision: master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5

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

It goes `READY=False → True` over ~30–90s: Flux pulled the manifests from the repo
`path: ./guestbook` and applied them — **you never ran `kubectl apply` on the guestbook
itself.** That's the pull model: you declared *what* (source + kustomization) and the
in-cluster agents did the *how*.
</details>

**Question:** you set `ref.branch: master`. What does that track, and when would you pin a
tag or commit SHA instead?

<details><summary>Answer</summary>

`branch: master` tracks the **tip of that branch** — whatever's latest on each fetch
interval. In production you'd usually pin a **tag** (`v1.4.0`) or an exact **commit SHA** so
a deploy is reproducible and a rollback is "point `ref` at the previous commit." A floating
branch is convenient for a demo but means "always the newest thing on that branch."
</details>

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

<details><summary>Solution / expected output</summary>

```console
READY   MESSAGE
True    stored artifact for revision 'master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5'

READY   MESSAGE
True    Applied revision: master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5
```

- **GitRepository Ready** answers *did we fetch and store an artifact from Git?*
- **Kustomization Ready** answers *did we build and apply that artifact successfully?*

They're sequential: a fetch failure keeps the Kustomization from applying a new revision; an
apply failure can leave source Ready while the Kustomization is not. The next step
manufactures cluster drift that the Kustomization heals when not suspended.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ kubectl -n default scale deployment guestbook-ui --replicas=5
deployment.apps/guestbook-ui scaled

$ kubectl -n default get deploy guestbook-ui -w
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   1/5     5            1           6m
guestbook-ui   5/5     5            5           6m
guestbook-ui   1/1     1            1           6m    # reconcile reverted it
```

You scaled to 5; within a reconcile interval Flux compared live against Git, saw **drift**,
and **re-applied Git** — back to 1. The cluster *refuses to stay drifted from Git* while the
Kustomization is active. This is the S03 reconcile loop with Git in the "desired" slot:
observe → diff (5 ≠ 1) → act (re-apply) → repeat.
</details>

**Question (required):** what would happen to that hand-scale if the Kustomization were
**suspended** (`spec.suspend: true` — the `selfHeal: false` analog)?

<details><summary>Answer — prove it</summary>

With the Kustomization suspended, Flux **stops applying** — the drift stays until a human
resumes (or deletes/recreates). Prove it:

```bash
# suspend reconciliation
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":true}}'

# drift it again
kubectl -n default scale deployment guestbook-ui --replicas=5
sleep 40
kubectl -n flux-system get kustomization guestbook \
  -o custom-columns='SUSPEND:.spec.suspend,READY:.status.conditions[?(@.type=="Ready")].status'
kubectl -n default get deploy guestbook-ui
```

```console
SUSPEND   READY
true      True
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   5/5     5            5           8m      # stays at 5 — NOT reverted
```

`suspend: true` is Flux's **selfHeal: false** analog: the last applied state can still look
Ready, but the controller will not correct new cluster drift. Put it back:

```bash
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":false}}'
kubectl -n default get deploy guestbook-ui -w
```

Re-enabling reconciliation makes Flux revert the drift again within an interval — back to 1
replica, Ready=True.

</details>

---

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

<details><summary>What you should see — and why it matters</summary>

Within the GitRepository fetch interval (1m here) and the next Kustomization reconcile, the
revision advances and the live Deployment moves to **2 replicas** — because **Git changed**,
not because anyone touched the cluster. That's the whole discipline: the **only** way to
change the cluster is to change Git, and every change is a reviewable, revertable commit.
Contrast with Step 4, where a *cluster* change (drift) was reverted; here a *Git* change is
what actually propagates.

Clean up the fork path the same way: delete the Kustomization (prune removes workloads), then
the GitRepository.
</details>

## Expected state / output

- **Pull, not push.** You applied a `GitRepository` + `Kustomization`; Flux pulled the
  guestbook repo and deployed it — you never `kubectl apply`'d the guestbook manifests yourself.
- **Source Ready ≠ Apply Ready.** Fetch success and apply success are separate conditions.
- **Reconcile reverts drift.** A hand-scale to 5 was dragged back to Git's 1, automatically.
- **Suspend ⇒ drift stays.** With `spec.suspend: true`, the same drift is *not* reverted —
  the Argo `selfHeal: false` analog.

Representative statuses include Ready/Running Pods, NetworkPolicy timeouts, RBAC Forbidden,
Helm revision history, Flux Ready conditions, Certificate Ready, or Prometheus targets —
compare meaning, not ephemeral names.

## Explanation

Flux continuously reconciles when a Kustomization is not suspended, but only an active
(non-suspended) Kustomization acts to correct cluster drift. Source Ready and apply Ready are
independent axes — a Ready GitRepository can still feed a failing Kustomization — so the
challenge is reading both status fields and the suspend flag that authorizes the fix.

The guided steps above prove the control-plane behaviour for this section; read Events and
status fields when a one-line phase is ambiguous.

## Troubleshooting and recovery

Re-apply the lab's named manifests with `kubectl apply -f gitrepository.yaml -f kustomization.yaml`
after fixing the broken field, or delete only the named guestbook CRs from Cleanup / reset and
restart the guided task. Prefer `kubectl describe gitrepository,kustomization -n flux-system`
Events over guessing. Do not run broad cluster deletes.

## Challenge solution

### Commands / manifest

```bash
kubectl -n flux-system get kustomization guestbook \
  -o jsonpath='{.spec.suspend} {.status.conditions[?(@.type=="Ready")].status} {.status.conditions[?(@.type=="Ready")].message}{"\n"}'
kubectl -n default get deploy guestbook-ui
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":false}}'
kubectl -n flux-system get kustomization guestbook -w
```

### Expected state / output

With suspend true, replicas stay at the drifted count. After suspend is cleared (or a Ready
failure is fixed), status returns Ready=True and the Deployment replica count matches Git.

### Explanation

Flux continuously reconciles when a Kustomization is not suspended, but only an active
(non-suspended) Kustomization acts to correct cluster drift. Source Ready and apply Ready are
independent axes — a Ready GitRepository can still feed a failing Kustomization — so the
challenge is reading both status fields and the suspend flag that authorizes the fix.

### Hints

Inspect spec.suspend and status.conditions on the Kustomization; compare kubectl
get deploy replicas with the Git guestbook manifest; patch suspend false or fix the Ready
message.
