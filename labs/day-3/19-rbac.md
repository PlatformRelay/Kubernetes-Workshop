# Lab 19 — RBAC (S19)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S19 — RBAC |
| **Environment** | **namespace ✓ / kind ✓** (os dois caminhos são idênticos para o trabalho com a Role) |
| **Estimated time** | 25 min |

## Objective

Dar a um workload uma **identidade** e exatamente as permissões de que ele precisa — nada além
disso. Você vai criar uma **ServiceAccount**, uma **Role** somente leitura (`get`/`list`/`watch`
em pods) e um **RoleBinding** que une as duas, depois provar a concessão com `kubectl auth can-i`.
Você vai rodar comandos reais **como a ServiceAccount**: ler Pods funciona, **deletar** um é
**Forbidden** — a quebra proposital — e adicionar um único verb à Role inverte a resposta.

O lab inteiro gira em torno de uma ideia: **RBAC é deny-by-default e allow-only.** Um subject só
consegue fazer algo porque uma Role lista o verb *e* um binding amarra essa Role ao subject.

> **Uma observação sobre `--as`.** Impersonation (`kubectl … --as=…`) é, ela mesma, uma ação
> privilegiada — quem **chama** precisa do verb `impersonate` no nível do cluster. No **kind** você
> é cluster-admin, então funciona direto. Em um **cluster compartilhado** onde você só tem o seu
> namespace, `--as` pode retornar *"cannot impersonate"* — peça ao seu facilitador para conceder
> impersonation durante o lab, ou verifique a Role **de dentro de um Pod** usando o token da SA (o
> stretch goal). Criar a Role, a SA e o RoleBinding **não** exige cluster-admin — RBAC é
> namespaced, então os dois caminhos são idênticos em tudo, exceto nas checagens com `--as`.

## Prerequisites

- **Caminho kind:** Docker + `kind` + `kubectl` e permissão para criar um cluster local. Você vai
  criar um cluster descartável chamado `rbac`.
- **Caminho do cluster compartilhado:** seu namespace atribuído. Criar a SA/Role/RoleBinding
  funciona como está; as checagens com `--as` precisam de direitos de impersonation (veja a
  observação acima).
- Acesso à internet para pull de `ghcr.io/platformrelay/workshop-web:v1` (um Pod para ler).

## Files used

- `workload.yaml` — um Deployment minúsculo, `reader-target`, para que `get`/`list`/`delete pods`
  tenham Pods reais sobre os quais agir.
- `rbac.yaml` — a **ServiceAccount + Role + RoleBinding** (o quadro final do magic-move do slide,
  byte a byte).

Tudo carrega o label `app: s19`, então o cleanup é um único delete com escopo.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./19-rbac.solution.md#guided-solutions)

### Step 0 — um namespace para trabalhar

### Caminho kind

```bash
kind create cluster --name rbac
export NS=default
kubectl get nodes
```

### Caminho do cluster compartilhado

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl auth can-i create rolebindings          # deve imprimir: yes
```

---

### Step 1 — um Pod para ler, e a identidade + Role + binding

Primeiro, algo para ler:

```bash
cat > workload.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reader-target
  labels: { app: s19 }
spec:
  replicas: 1
  selector: { matchLabels: { app: reader-target } }
  template:
    metadata:
      labels: { app: reader-target, part-of: s19 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
EOF

kubectl apply -f workload.yaml
kubectl rollout status deploy/reader-target
```

Agora os objetos de RBAC — a **ServiceAccount**, a **Role** somente leitura e o **RoleBinding**
que une as duas. Este é exatamente o manifesto do quadro final do magic-move do slide:

```bash
cat > rbac.yaml <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]                 # "" = o core API group (é onde vivem os pods)
    resources: ["pods"]
    verbs: ["get", "list", "watch"] # somente leitura: sem create/delete
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader-sa
  labels: { app: s19 }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  labels: { app: s19 }
subjects:
  - kind: ServiceAccount
    name: pod-reader-sa
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
EOF

kubectl apply -f rbac.yaml
```

---

### Step 2 — verifique a concessão com `can-i --list`

```bash
kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa
```

**Tarefa:** confirme que a SA pode ler Pods (`get`/`list`/`watch`) e não pode escrevê-los.

---

### Step 3 — rode comandos reais como a SA (e chegue à quebra)

Aponte o `kubectl` para a SA com `--as` e aja sobre o Pod real do Step 1.

```bash
# leitura — permitido
kubectl get pods --as=system:serviceaccount:$NS:pod-reader-sa

# capture o nome de um Pod real para agir sobre ele
POD=$(kubectl get pod -l app=reader-target -o jsonpath='{.items[0].metadata.name}')

# escrita — a quebra proposital
kubectl delete pod "$POD" --as=system:serviceaccount:$NS:pod-reader-sa
```

**Tarefa:** o `get pods` deve listar o Pod `reader-target`; o `delete pod` deve ser **Forbidden**.

**Pergunta:** você pediu para `delete` um Pod que **existe** e você mesmo é cluster-admin — por que
o comando falhou?

---

### Step 4 — conserte: adicione o verb `delete` e recheque

A quebra é um verb faltando, então o conserto é uma linha na **Role**. Adicione `delete`, reaplique
e rode o `can-i` de novo.

```bash
kubectl patch role pod-reader --type='json' \
  -p='[{"op":"add","path":"/rules/0/verbs/-","value":"delete"}]'

# re-verifique — agora permitido
kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa
```

**Tarefa:** o `can-i delete pods` agora deve imprimir `yes`, e o delete real deve ter sucesso.

**Pergunta:** você mudou apenas a **Role** — não o RoleBinding, não a ServiceAccount. Por que isso
foi suficiente?

---

### Step 5 — pergunta: quando você precisa de uma ClusterRole no lugar?

Você construiu uma **Role** + um **RoleBinding**, inteiramente dentro de um namespace. Esse é o
padrão certo.

**Pergunta:** quando uma `Role` seria a escolha errada — forçando uma `ClusterRole` (e possivelmente
um `ClusterRoleBinding`) no lugar?

## Observe

- **Deny by default:** uma ServiceAccount recém-criada não consegue fazer nada; uma permissão só
  existe porque uma **Role lista o verb** *e* um **RoleBinding** amarra essa Role ao subject.
- **O binding é a junção:** a Role e a SA são inertes sozinhas; o `roleRef` + os `subjects` do
  RoleBinding as conectam. Editar a **Role** muda o acesso ao vivo — sem rebind, sem restart.
- **`get pods --as=…` → permitido; `delete pod --as=…` → `Forbidden`** até a Role ganhar o verb
  `delete`. O erro nomeia o subject, o verb, o resource, o API group `""` e o namespace.
- **`--as` testa outra identidade** sem se tornar ela — seus próprios direitos autorizam a
  impersonation, mas quem decide a resposta é a Role da SA impersonada.
- **Escopo:** `Role`/`RoleBinding` são namespaced; resources cluster-scoped ou reúso entre
  namespaces exigem uma `ClusterRole`.

## Challenge

Uma ServiceAccount de aplicação consegue fazer get em Pods mas ainda não consegue deletá-los, e
adicionar verbs a uma Role que não está vinculada não muda nada. Diagnostique Role versus
RoleBinding, depois conceda o delete com o menor privilégio e prove que o Forbidden vira permitido
apenas para aquele subject.

**Difficulty:** Intermediate

**Success criteria:** Mostre que kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa muda de
no para yes depois que a Role lista delete e o RoleBinding continua referenciando essa Role, e
demonstre que um get continua funcionando enquanto um verb não vinculado ainda apresenta Forbidden.

**Hints:** Inspecione o roleRef e os subjects do RoleBinding; edite os verbs da Role e use
novamente can-i --list --as=... sem recriar a ServiceAccount.

[Spoiler: solução do challenge](./19-rbac.solution.md#challenge-solution)

## Verify

Confirme as evidências de RBAC antes do cleanup.

```bash
kubectl get sa,role,rolebinding,deploy -n "$NS" -l app=s19
kubectl auth can-i list pods -n "$NS" --as="system:serviceaccount:$NS:pod-reader-sa"
```

Esperado: a Role/RoleBinding ainda concedem os verbs que você verificou com can-i --as.

## Cleanup / reset

```bash
# cleanup com escopo — tudo tem o label app=s19
kubectl delete sa,role,rolebinding -l app=s19 -n "$NS" --ignore-not-found
kubectl delete deploy -l app=s19 -n "$NS" --ignore-not-found
rm -f workload.yaml rbac.yaml

# reset de pânico (kind): jogue o cluster inteiro fora
# kind delete cluster --name rbac
```

> No caminho **kind** o reset mais rápido é `kind delete cluster --name rbac` — o cluster era
> descartável. Em um cluster **compartilhado**, o `delete -l app=s19` com escopo remove tudo que
> você criou.

## Stretch (opcional) — chame a API *de dentro* de um Pod, como a SA

O `--as` faz impersonation de fora. A coisa real é um Pod rodando **como** a SA, usando seu
**token projetado** para chamar a API — exatamente como funcionam o Argo CD (S21) e os operators
(S22).

```bash
# um Pod que roda como a pod-reader-sa
cat > reader-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: api-reader
  labels: { app: s19 }
spec:
  serviceAccountName: pod-reader-sa
  containers:
    - name: shell
      image: curlimages/curl:8.10.1
      command: ["sleep", "3600"]
EOF
kubectl apply -f reader-pod.yaml
kubectl wait --for=condition=Ready pod/api-reader --timeout=60s

# de dentro: leia o token projetado e chame a API para LISTAR pods
kubectl exec api-reader -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  curl -sk -o /dev/null -w "list pods → %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://kubernetes.default.svc/api/v1/namespaces/$NS/pods
'
```
