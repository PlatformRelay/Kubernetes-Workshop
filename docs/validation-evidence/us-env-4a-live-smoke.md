# US-ENV-4A live disposable-cluster smoke receipt

- **When (UTC):** 2026-08-04T13:39:07Z → 2026-08-04T13:40:27Z
- **Host:** Ubuntu lab host `a242168@192.168.178.74` (Docker 29.6.2; mise-pinned kind/kubectl)
- **Command:** `infra/lab-smoke.sh pr-day1`
- **Result:** **passed** (exit 0)
- **Coverage:** Day-1 PR selection — `00-setup`, `03-cluster-tour`, `04-kubectl`,
  `05-pod`, `06-deployment`, `07-service`, `08-ingress` (via `./workshop profile day-1`
  Contour). Local-container labs S01/S02 skipped by design.
- **Cluster:** created, used, and **destroyed** (`./workshop down --yes`); no leftover
  `workshop` kind cluster.
- **Kubernetes pin:** `kindest/node:v1.36.1` (from `infra/versions.env`)

## Honesty

This receipt documents a **real** disposable-cluster automation run. It does **not**
change any row in [`docs/validation-matrix.md`](../validation-matrix.md) to
`kind-smoke` and does **not** claim pedagogical validation (US-BETA-6). Matrix
promotion remains a deliberate maintainer edit.
