# Lab 18 — NetworkPolicy (S18)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S18 — NetworkPolicy |
| **Environment** | **kind ✓** (com um self-test de enforcement) / namespace: **read-only** |
| **Estimated time** | 25 min |

## Objective

Pegar uma **rede de Pods plana (flat)** onde tudo alcança tudo, cercar um `backend` com uma
policy de ingress **`default-deny`** e reabrir exatamente um portão com uma regra **aditiva
`allow-frontend-to-backend`**. No caminho você vai ver os dois fatos que derrubam todo mundo:
um pacote descartado **trava e estoura o timeout** (*não* é "connection refused"), e uma policy
default-deny de *ingress* deixa **egress e DNS intocados**.

O lab inteiro gira em torno de uma ideia: **NetworkPolicy só *permite*, nunca nega.** "Deny" é o
que um Pod recebe quando uma policy o *seleciona* e nenhuma regra de allow corresponde.

> **⚠️ Uma policy é inerte a menos que um CNI capaz de policies a aplique.** `kubectl apply`
> armazena uma NetworkPolicy em **qualquer** cluster sem erro — mas se um pacote é de fato
> descartado depende do CNI. Por isso o **Step 2 é um self-test de enforcement**: aplique um
> default-deny e confirme que o tráfego realmente quebra *antes* de confiar em qualquer resultado.
> CNIs que aplicam policies incluem Calico, Cilium, Antrea e o **kindnet** moderno; alguns CNIs
> gerenciados/básicos não aplicam. Se o seu default-deny não mudar nada, seu CNI não está
> aplicando — use o fallback do kind no Step 2 ou o caminho read-only.

## Prerequisites

- **Caminho kind (recomendado):** Docker + `kind` + `kubectl` e permissão para criar um cluster
  local. Você vai criar um cluster descartável chamado `netpol`.
- **Caminho do cluster compartilhado:** seu namespace atribuído — **read-only** aqui (você pode
  inspecionar uma policy pré-aplicada, mas não subir um CNI com enforcement). Prefira o kind se
  puder.
- Acesso à internet para pull de `curlimages/curl` e `ghcr.io/platformrelay/workshop-web:v1`.

## Files used

- `apps.yaml` — `backend` (Deployment + Service na 8080) e três clientes: `frontend`, `other`,
  `scanner`.
- `default-deny-ingress.yaml` — seleciona todos os Pods, nega todo o ingress.
- `allow-frontend-to-backend.yaml` — reabre apenas `frontend → backend:8080` (o quadro final do
  magic-move do slide, byte a byte).

Os apps carregam o label `lab: s18`; as NetworkPolicies carregam `app: s18` (igual aos slides).
Ambos são limpos por selector ao final.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./18-networkpolicy.solution.md#guided-solutions)

### Step 0 — um cluster para cercar

### Caminho kind (faça este)

```bash
kind create cluster --name netpol
export NS=default
kubectl get nodes
```

### Caminho do cluster compartilhado (read-only)

Você não consegue subir um CNI com enforcement em um cluster compartilhado, e uma policy sem
enforcement silenciosamente não faz nada. Então aqui você **apenas lê** uma policy que seu
facilitador pré-aplicou:

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl get networkpolicy
kubectl describe networkpolicy default-deny-ingress   # se houver uma disponível
```

Leia os blocos `PodSelector`, `PolicyTypes` e `Allowing ingress traffic` na saída do describe,
depois acompanhe o restante lendo os manifestos e os spoilers — os *objetos* são idênticos;
só o enforcement difere.

---

### Step 1 — a rede flat: todo mundo alcança o backend

```bash
cat > apps.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  labels: { app: backend, lab: s18 }
spec:
  replicas: 1
  selector: { matchLabels: { app: backend } }
  template:
    metadata:
      labels: { app: backend, lab: s18 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  labels: { lab: s18 }
spec:
  selector: { app: backend }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: v1
kind: Pod
metadata: { name: frontend, labels: { app: frontend, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: other, labels: { app: other, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: scanner, labels: { app: scanner, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
EOF

kubectl apply -f apps.yaml
kubectl wait --for=condition=Ready pod/frontend pod/other pod/scanner --timeout=90s
kubectl rollout status deploy/backend
```

**Tarefa:** a partir dos **três** clientes, faça curl no Service do backend. Todos devem
retornar `200`.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}\n" --max-time 5 http://backend
done
```

---

### Step 2 — quebre (e faça o self-test): o `default-deny` cerca o backend

```bash
cat > default-deny-ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  labels: { app: s18 }
spec:
  podSelector: {}            # seleciona todos os Pods do namespace
  policyTypes:
    - Ingress                # governa o ingress; sem regras abaixo → nega tudo
EOF

kubectl apply -f default-deny-ingress.yaml
```

**Tarefa:** rode os três curls de novo. Agora eles **travam** até o `--max-time` disparar.
Capture o exit code — ele é a pista, e é o seu self-test de enforcement.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
done
```

**Pergunta:** o curl **travou e estourou o timeout** (exit 28) em vez de falhar na hora. Por que
um drop de NetworkPolicy parece diferente de "connection refused"?

---

### Step 3 — conserte: abra um portão com um allow aditivo

O `default-deny` **fica**. Nós **adicionamos** uma policy que permite `frontend → backend:8080`.
NetworkPolicies são **unidas (union)** — isso não substitui o deny, apenas empilha um portão
permitido por cima.

```bash
cat > allow-frontend-to-backend.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels:
      app: backend           # esta policy governa os Pods do backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend  # …apenas de Pods com o label app=frontend
      ports:
        - protocol: TCP
          port: 8080
EOF

kubectl apply -f allow-frontend-to-backend.yaml
```

**Tarefa:** rode os três curls de novo. O `frontend` recebe `200`; `other` e `scanner` continuam
estourando o timeout.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
done
```

**Pergunta:** nunca deletamos o `default-deny-ingress`. Por que adicionar uma policy de allow
mudou o resultado do `frontend` mas não o de `other`/`scanner`?

---

### Step 4 — observe: ingress ≠ egress (o DNS continua funcionando)

O default-deny é `policyTypes: [Ingress]` — o egress, incluindo o **DNS**, nunca foi tocado. A
prova está escondida no exit code que você já viu.

**Pergunta:** no Step 2, os curls saíram com **28** (timeout), não **6** (*"Could not resolve
host"*). O que isso te diz sobre o DNS sob o nosso default-deny?

---

### Step 5 — observe: a regra de allow é só um label match

O `allow-frontend-to-backend` faz match pelo label `app: frontend`. Mude o label e o match
evapora — sem nenhuma edição de policy.

```bash
kubectl label pod frontend app=stranger --overwrite
kubectl exec frontend -- curl -s -o /dev/null -w "frontend → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
```

## Observe

- **O padrão é flat/allow-all:** sem nenhuma policy, todo Pod alcança todo Pod. O isolamento é
  opt-in.
- Um **ingress `default-deny`** = `podSelector: {}` + `policyTypes: [Ingress]` + nenhuma regra →
  todo o tráfego de entrada é descartado. Tráfego descartado **trava e estoura o timeout** (curl
  exit **28**), **não** é "refused" (exit 7). Essa quebra *é* o self-test de enforcement.
- Policies são **aditivas/allow-only:** o `allow-frontend-to-backend` abre exatamente um portão;
  `other`/`scanner` continuam cortados porque nada os permite. Deny = a ausência de um allow.
- **Ingress ≠ egress:** o default-deny de ingress deixou **DNS/egress funcionando** (exit 28,
  não 6).
- **Selectors são labels:** trocar o label do `frontend` quebra o match do allow sem nenhuma
  mudança de policy.
- **Só um CNI capaz de policies aplica qualquer parte disso** — os mesmos objetos em um CNI sem
  enforcement aplicam sem erro e não fazem nada.

## Challenge

Depois do default-deny de ingress, o frontend consegue alcançar o backend, mas um terceiro Pod
com labels parecidos com os do frontend ainda estoura o timeout. Diagnostique se a regra de allow
faz match por labels de Pod ou por seletores de namespace, depois restaure a conectividade para o
cliente pretendido sem abrir a cerca para todo mundo.

**Difficulty:** Intermediate

**Success criteria:** Prove que o cliente bloqueado falha com timeout (não connection refused),
identifique o label divergente na NetworkPolicy de allow ou no Pod, restaure um allow que faça
match e mostre que apenas o cliente pretendido retorna HTTP 200 enquanto um cliente sem match
continua estourando o timeout.

**Hints:** Use kubectl get networkpolicy e describe nos Pods com labels lab=s18; compare
o podSelector.matchLabels da regra de allow com os labels dos Pods clientes antes de aplicar o patch.

[Spoiler: solução do challenge](./18-networkpolicy.solution.md#challenge-solution)

## Verify

Confirme as evidências de NetworkPolicy antes do cleanup.

```bash
kubectl get networkpolicy,deploy,svc,pods -n "$NS" -l 'lab=s18'
kubectl get networkpolicy -n "$NS" -l app=s18
```

Esperado: as policies de default-deny e de allow ainda existem, para que você possa re-executar
a checagem de timeout do wget de um cliente versus 200, se necessário.

## Cleanup / reset

```bash
# cleanup com escopo — policies têm o label app=s18, apps têm o label lab=s18
kubectl delete networkpolicy -l app=s18 -n "$NS" --ignore-not-found
kubectl delete deploy,svc,pod -l lab=s18 -n "$NS" --ignore-not-found
rm -f apps.yaml default-deny-ingress.yaml allow-frontend-to-backend.yaml kind-netpol.yaml

# reset de pânico (kind): jogue o cluster inteiro fora
# kind delete cluster --name netpol
```

> No caminho **kind** o reset mais rápido é `kind delete cluster --name netpol` — o cluster era
> descartável. No caminho **compartilhado** você não criou nada (read-only), então não há nada
> para limpar.

## Stretch (opcional) — trave o egress também, e libere o DNS de novo

Um default-deny de **egress** é a clássica indisponibilidade autoinfligida: bloqueie a saída e
você também bloqueia o **DNS**, então toda resolução de nome falha. Prove isso, depois conserte
do jeito certo.

```bash
cat > default-deny-egress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  labels: { app: s18 }
spec:
  podSelector: {}
  policyTypes:
    - Egress
EOF
kubectl apply -f default-deny-egress.yaml

# agora o DNS quebra — a resolução falha rápido (exit 6), não é timeout
kubectl exec frontend -- curl -s --max-time 5 http://backend; echo " exit=$?"
```
