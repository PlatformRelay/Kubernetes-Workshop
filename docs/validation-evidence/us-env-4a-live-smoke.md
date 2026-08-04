# US-ENV-4A live disposable-cluster smoke receipt

- **When (UTC):** 2026-08-04T13:47:27Z → 2026-08-04T13:48:50Z
- **Host:** Ubuntu lab host `a242168@192.168.178.74` (Docker 29.6.2; mise-pinned kind/kubectl)
- **Architecture:** `x86_64`
- **Profile:** `day-1` (Contour via `./workshop profile day-1`)
- **Command:** `infra/lab-smoke.sh pr-day1`
- **Result:** **passed** (exit 0); `/usr/bin/time` real **83.34s**; script wall-clock total **82s**
- **Coverage:** Day-1 PR selection — `00-setup`, `03-cluster-tour`, `04-kubectl`,
  `05-pod` (incl. deterministic crash-Pod challenge), `06-deployment`, `07-service`,
  `08-ingress`. Local-container labs S01/S02 skipped by design.
- **Cluster:** created, used, and **destroyed** (`./workshop down --yes`); no leftover
  `workshop` kind cluster.
- **Kubernetes pin:** `kindest/node:v1.36.1` (from `infra/versions.env`)

## Wall-clock timings (measured this run)

| Phase | Seconds |
| --- | --- |
| bootstrap (`./workshop up`, kind create) | 37 |
| doctor | 3 |
| idempotence bootstrap | 3 |
| profile day-1 (Contour install + idempotent re-run) | 15 |
| lab day-1/00-setup | 0 |
| lab day-1/03-cluster-tour | 0 |
| lab day-1/04-kubectl | 1 |
| lab day-1/05-pod (+ challenge) | 13 |
| lab day-1/06-deployment | 2 |
| lab day-1/07-service | 2 |
| lab day-1/08-ingress | 6 |
| teardown | (included in wall-clock) |
| **wall-clock total** | **82** |

Warm image/layer cache on this host makes Contour + workshop-web pulls cheap; a cold host
will be slower. The prior ~80s claim was therefore plausible for a warm host — this receipt
replaces it with phase timings from a re-run that also records Architecture + Profile.

## Honesty

This receipt documents a **real** disposable-cluster automation run. It does **not**
change any row in [`docs/validation-matrix.md`](../validation-matrix.md) to
`kind-smoke` and does **not** claim pedagogical validation (US-BETA-6). Matrix
promotion remains a deliberate maintainer edit.
