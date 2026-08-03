# Workshop quiz prototype

Generated from `quiz/questions.prototype.json`; the repository remains the source of truth.

## S05 · S05-Q-SPK-01

A Pod's container exits and the kubelet restarts it. Which statement is accurate?

- [ ] **same-pod** — The Pod identity stays the same while its container restart count increases.
- [ ] **new-pod** — The kubelet creates a new Pod with a new UID.
- [ ] **new-deployment** — Kubernetes creates a Deployment to preserve the workload.

---

## S07 · S07-Q-SPK-01

A Service has no ready endpoints although matching Pods are Running. What should you inspect first?

- [ ] **readiness** — The Pods' readiness conditions and the Service selector.
- [ ] **nodeport** — Whether the Service uses NodePort.
- [ ] **replicaset** — Whether the Pods share a ReplicaSet owner.

---

## S09 · S09-Q-SPK-01

Who chooses which GatewayClass a Gateway uses?

- [ ] **gateway-author** — The Gateway author sets spec.gatewayClassName.
- [ ] **controller-default** — Whichever controller starts first becomes the default.
- [ ] **route-author** — Each HTTPRoute chooses the GatewayClass directly.
