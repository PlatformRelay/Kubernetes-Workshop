# Workshop quiz prototype

Generated from `quiz/questions.prototype.json`; the repository remains the source of truth.

## S05 · S05-Q-SPK-01

A Pod's container exits and the kubelet restarts it. Which statement is accurate?

- [ ] **same-pod** — The Pod identity stays the same while its container restart count increases.
- [ ] **new-pod** — The kubelet creates a new Pod with a new UID.
- [ ] **new-deployment** — Kubernetes creates a Deployment to preserve the workload.

Answer: **same-pod**

The kubelet restarts containers according to the Pod restart policy; the Pod UID is unchanged.

- **same-pod:** A container restart within the Pod does not create a replacement Pod.
- **new-pod:** A controller or user creates replacement Pods; a container restart alone does not.
- **new-deployment:** Kubernetes does not infer a Deployment from a standalone Pod.

---

## S07 · S07-Q-SPK-01

A Service has no ready endpoints although matching Pods are Running. What should you inspect first?

- [ ] **readiness** — The Pods' readiness conditions and the Service selector.
- [ ] **nodeport** — Whether the Service uses NodePort.
- [ ] **replicaset** — Whether the Pods share a ReplicaSet owner.

Answer: **readiness**

Services discover backends through selectors and EndpointSlices; unready or non-matching Pods do not become ready endpoints.

- **readiness:** EndpointSlices normally include ready matching Pods; readiness and selector mismatches are the direct checks.
- **nodeport:** Service type does not repair selector or readiness problems.
- **replicaset:** Service selection is label-based and independent of controller ownership.

---

## S09 · S09-Q-SPK-01

Who chooses which GatewayClass a Gateway uses?

- [ ] **gateway-author** — The Gateway author sets spec.gatewayClassName.
- [ ] **controller-default** — Whichever controller starts first becomes the default.
- [ ] **route-author** — Each HTTPRoute chooses the GatewayClass directly.

Answer: **gateway-author**

A Gateway references one GatewayClass by spec.gatewayClassName; Routes attach to the resulting Gateway listeners.

- **gateway-author:** GatewayClass selection is explicit in the Gateway specification.
- **controller-default:** Gateway API does not select a class by controller startup order.
- **route-author:** Routes attach to Gateways; the Gateway selects the GatewayClass.
