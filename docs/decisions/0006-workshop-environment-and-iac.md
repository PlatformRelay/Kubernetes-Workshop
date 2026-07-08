# ADR 0006: Workshop environment provisioning and IaC

- **Status:** accepted
- **Scope:** how the runnable environment for the labs is provisioned and where that
  infrastructure-as-code lives — both the local `kind` path and the shared-cluster/namespace
  path, plus the per-lab prerequisites (controllers, CRDs, operators).

## Context

Every lab must run in one of two environments: an assigned **namespace** on a shared cluster, or
a local **kind** cluster ([roadmap teaching model]). Several labs need cluster-scoped
prerequisites — an ingress controller, the Gateway API CRDs + a controller, `metrics-server`,
Argo CD, the kube-prometheus-stack, a policy-capable CNI. If each lab installs its own copy, the
installs drift, conflict, and can't be validated centrally. We need the environment itself to be
version-controlled, reproducible from a clean machine, and honest about which parts need admin.

The workshop is a teaching artifact, not a production platform, so the tooling must stay light:
things a learner already has or can install in minutes (`kubectl`, a container engine, `kind`,
`helm`), driven by readable scripts — not a heavyweight IaC stack.

## Options considered

1. **Per-lab installers vendored into each lab folder.** Rejected: N drifting copies of the same
   ingress-controller install, no single place to bump a version.
2. **A full IaC stack (e.g. a cloud-provisioning tool) for the shared cluster.** Rejected as
   overkill and vendor-coupling; the shared cluster is provided by the host, and we only need to
   provision *namespaces* and *addons* within it.
3. **One `infra/` tree of thin, composable scripts + declarative configs**, split by
   environment, with a single task entrypoint. Chosen.

## Decision

All environment code lives under `infra/`, referenced by labs — never vendored into them.

```
infra/
├── kind/
│   ├── cluster.yaml         # kind cluster config (ingress-ready ports, extra mounts)
│   └── up.sh / down.sh      # create/tear down a local cluster
├── addons/                  # one installer per shared prerequisite, each idempotent
│   ├── ingress-nginx/
│   ├── gateway-api/         # standard-channel CRDs + a conformant controller
│   ├── metrics-server/
│   ├── network-policy-cni/  # policy-capable CNI for the NetworkPolicy lab
│   ├── argo-cd/
│   └── kube-prometheus-stack/
├── shared-cluster/
│   ├── namespace.yaml       # per-attendee namespace + RBAC + ResourceQuota/LimitRange template
│   └── provision.sh         # facilitator script to mint attendee namespaces
├── versions.env             # single source of pinned tool/image/chart versions (see ADR 0007)
└── README.md                # which path needs admin; what each addon is for
```

Rules:

- **Single task entrypoint.** A root `Makefile` (or equivalent task file) exposes the verbs a
  facilitator/learner runs: `make kind-up`, `make addons-<name>`, `make ns-provision`,
  `make kind-down`. The Makefile calls the `infra/` scripts; it does not contain the logic.
- **Environment-honest by construction.** Anything cluster-scoped (a controller, CRDs, a CNI,
  metrics-server, Argo CD) is an **addon** and is therefore **kind-only** or facilitator-run. The
  matching lab is marked `kind-only` and ships a namespace-safe **read-only** alternative
  ([lab authoring contract]). No lab installs a cluster-scoped addon as a normal learner step.
- **Idempotent and reset-safe.** Every installer can run twice without error and has a matching
  teardown; the ultimate local panic-reset is `make kind-down && make kind-up`.
- **Labs reference, never copy.** A lab that needs an addon says "run `make addons-gateway-api`"
  and points at `infra/`; the addon's manifests/values are not duplicated in the lab folder
  ([0005](0005-lab-manifests-and-example-code-layout.md)).
- **Shared-cluster provisioning is facilitator-owned.** `shared-cluster/provision.sh` mints one
  namespace per attendee with an RBAC role scoped to that namespace and a quota/limit template,
  so a learner never needs cluster-admin for the core red line.
- **Versions are pinned in one file.** `infra/versions.env` is the only place tool/image/chart
  versions are hard-set, per [0007](0007-kubernetes-currency-and-version-pinning.md).

## Consequences

- The environment is reproducible from a clean checkout: `make kind-up && make addons-…` yields
  the exact cluster the labs expect.
- A version bump (kind node image, a chart, the Gateway API channel) is a one-line change in
  `infra/versions.env`, not a scavenger hunt across labs.
- The kind-only vs namespace split is defined once, in `infra/`, and the labs inherit it, keeping
  the dual-environment promise honest.
- Addon installers are the natural target for the environment smoke test in
  [0008](0008-validation-and-ci.md).
