# Lab 13 — Resources & limits (S13)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S13 — Resources & limits |
| **Environment** | namespace ✓ / kind ✓ *(sem cluster-admin; uma ResourceQuota/LimitRange no seu próprio namespace não exige direitos especiais)* |
| **Estimated time** | 30 min |

## Objective

Sinta o gerenciamento de recursos pelas duas pontas. Você vai ler a **QoS class** que o
Kubernetes deriva dos seus `resources` (Burstable, Guaranteed, BestEffort), forçar um container
**para além do seu limit de memória** e vê-lo ser **OOMKilled** (exit 137) e reiniciado, e então
conhecer o outro tipo de imposição — uma **ResourceQuota** que rejeita um Pod no **admission**,
de modo que ele nunca chega a existir. O lab inteiro gira em torno de um contraste: imposição em
**runtime** (o kubelet mata/estrangula um Pod que se comporta mal) vs imposição no **admission**
(o API server se recusa a criá-lo).

> **Defina seu namespace uma vez.** Tudo roda no seu namespace atribuído (ou em um cluster
> kind). Defina uma variável de shell para que todo comando possa ser copiado e colado:
>
> ```bash
> export NS=<your-assigned-namespace>          # usuários de kind: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Conceitos dos Labs 05–06 (Pod, Deployment). Este lab **cria seus próprios** objetos e não
  depende de sobras de labs anteriores.
- `kubectl` apontando para seu namespace atribuído **ou** um cluster kind local. Sem direitos de admin.
- Acesso à internet para baixar `ghcr.io/platformrelay/workshop-web:v1` e `polinux/stress` (a clássica image devoradora de memória).
- Opcional: um pipeline de métricas (`kubectl top pods` retorna dados) para o stretch de CPU throttling.
  Não é necessário para o núcleo do lab.

## Files used

- `qos-burstable.yaml` — um Pod com `requests` **e** `limits` diferentes → **Burstable**.
- `qos-guaranteed.yaml` — um Pod com `requests == limits` para cpu e memória → **Guaranteed**.
- `qos-besteffort.yaml` — um Pod **sem** `resources` → **BestEffort**.
- `oom-demo.yaml` — um Pod `polinux/stress` que aloca **acima** de um limit de memória minúsculo.
- `resourcequota.yaml` — um teto agregado para o namespace.
- `quota-buster.yaml` — um Pod que faz request de **mais do que a quota permite**.

Tudo é rotulado com `app: s13` para que o cleanup seja um único label selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./13-resources.solution.md#guided-solutions)

### Step 0 — três Pods, três QoS classes

Você nunca digita uma QoS class — o Kubernetes a **deriva** dos `resources` que você define e a
mostra em `kubectl describe pod`. Aplique as três variantes do mesmo container `web` e leia a
classe de cada uma. (São Pods avulsos, então cada um mapeia para exatamente uma classe; a regra
é idêntica sob um Deployment.)

```bash
cat > qos-burstable.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: qos-burstable
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      resources:
        requests: { cpu: 100m, memory: 128Mi }
        limits:   { cpu: 500m, memory: 256Mi }   # limit != request → Burstable
EOF

cat > qos-guaranteed.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: qos-guaranteed
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      resources:
        requests: { cpu: 200m, memory: 128Mi }
        limits:   { cpu: 200m, memory: 128Mi }   # request == limit, ambos definidos → Guaranteed
EOF

cat > qos-besteffort.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: qos-besteffort
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      # nenhum bloco resources → BestEffort
EOF

kubectl apply -f qos-burstable.yaml -f qos-guaranteed.yaml -f qos-besteffort.yaml
kubectl get pods -l app=s13
```

**Tarefa:** leia a QoS class de cada Pod e case-a com a regra.

```bash
for p in qos-burstable qos-guaranteed qos-besteffort; do
  printf '%-16s ' "$p"; kubectl get pod "$p" -o jsonpath='{.status.qosClass}'; echo
done
```

**Pergunta:** se você deletar os `limits` de `qos-guaranteed` mas mantiver os `requests`, em que
QoS class ele se transforma — e se, em vez disso, você deletar os `requests` e mantiver apenas
os `limits`?

---

### Step 1 — break→fix: empurre um container para além do seu limit de memória

Memória é **incompressível** — um container que excede seu limit de memória não pode ser
"desacelerado", então o kernel o **mata**. Reproduza isso deliberadamente com `polinux/stress`,
que aloca uma quantidade fixa de memória sob demanda.

```bash
cat > oom-demo.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: oom-demo
  labels: { app: s13 }
spec:
  containers:
    - name: hog
      image: polinux/stress
      command: ["stress"]
      args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]   # quer ~150 MB
      resources:
        requests: { memory: 50Mi }
        limits:   { memory: 100Mi }        # teto ABAIXO do que o stress aloca
EOF

kubectl apply -f oom-demo.yaml
# observe-o morrer e ser reiniciado — Ctrl-C depois de alguns restarts
kubectl get pod oom-demo -w
```

**Tarefa:** o container pede ~150 MB mas está limitado a 100Mi. O que o `kubectl get`
mostra, e o que o `describe` diz que o matou?

```bash
kubectl get pod oom-demo
kubectl describe pod oom-demo | sed -n '/State:/,/Restart Count/p'
```

**Tarefa:** conserte elevando o limit acima do que a aplicação precisa, depois confirme que ele
se mantém de pé. (Os `resources` de um Pod são imutáveis, então delete e recrie.)

```bash
cat > oom-demo-fixed.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: oom-demo
  labels: { app: s13 }
spec:
  containers:
    - name: hog
      image: polinux/stress
      command: ["stress"]
      args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]
      resources:
        requests: { memory: 50Mi }
        limits:   { memory: 250Mi }        # agora confortavelmente acima de ~150 MB
EOF

kubectl delete pod oom-demo
kubectl apply -f oom-demo-fixed.yaml
kubectl get pod oom-demo -w        # Ctrl-C quando estiver Running e RESTARTS parar de subir
```

**Pergunta:** o container foi `OOMKilled` mas voltou imediatamente. Qual componente o matou,
e qual componente o reiniciou?

---

### Step 2 — um teto agregado do namespace (ResourceQuota)

Uma **ResourceQuota** limita a *soma* de requests/limits (e a contagem de objetos) no namespace
inteiro. Limpe antes os Pods de QoS para que o total usado parta de uma linha de base conhecida,
depois aplique a quota.

```bash
kubectl delete pod qos-burstable qos-guaranteed qos-besteffort oom-demo --ignore-not-found

cat > resourcequota.yaml <<'EOF'
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-cap
  labels: { app: s13 }
spec:
  hard:
    requests.memory: 256Mi     # memória total reservada somando todos os Pods
    limits.memory: 512Mi
    pods: "5"
EOF

kubectl apply -f resourcequota.yaml
kubectl describe resourcequota team-cap
```

**Tarefa:** leia quanto da quota está em uso vs o teto hard.

---

### Step 3 — break→fix: um Pod que excede a quota

```bash
cat > quota-buster.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: quota-buster
  labels: { app: s13 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      resources:
        requests: { memory: 512Mi }    # 512Mi > o teto de 256Mi de requests.memory
        limits:   { memory: 512Mi }
EOF

kubectl apply -f quota-buster.yaml
```

**Tarefa:** a criação é **rejeitada**. Leia o erro — qual resource estourou o orçamento, e o Pod
chegou a ser criado?

**Pergunta:** o que acontece se você submeter um Pod **sem** `resources` enquanto esta quota
está em vigor — e como um `LimitRange` mudaria isso?

## Observe

- A QoS class é **derivada**, não escolhida: **Guaranteed** (tudo definido, `request == limit`),
  **BestEffort** (nada definido), **Burstable** (todo o resto). Só limits ainda → Guaranteed.
- Um container acima do seu limit de **memória** é **OOMKilled** (`Exit Code 137`) e — com o
  `restartPolicy: Always` padrão — reiniciado até cair em **CrashLoopBackOff**.
- O conserto é um **limit** correto (ou uma aplicação menor), e não remover o limit.
- Uma **ResourceQuota** impõe no **admission**: um Pod que a excede recebe `exceeded quota:` e
  **nunca é criado**; um Pod que omite um resource restrito recebe `must specify…`.
- Imposição em **runtime** (o kubelet mata/reinicia um Pod vivo) vs imposição no **admission**
  (o API server rejeita antes de o Pod existir) — o modelo mental central da seção.

## Challenge

Um Pod desaparece ou nunca é agendado depois de um pico de memória. Determine se o
sinal é OOMKilled (limit do cgroup) ou uma rejeição de ResourceQuota / de agendamento, e então
restaure um Pod executável na class Guaranteed ou Burstable que o lab usa.

**Difficulty:** Intermediate

**Success criteria:** Identifique a razão exata a partir dos Events do describe (OOMKilled versus quota), restaure um
Pod Running cujos resources caibam, e mostre qual status de QoS class o Pod corrigido reporta.

**Hints:** Compare o last state reason do kubectl describe pod com o kubectl describe resourcequota;
OOMKilled é uma saída de container, falhas de quota geralmente rejeitam a criação.

[Spoiler: solução do challenge](./13-resources.solution.md#challenge-solution)

## Verify

Confirme que a evidência de QoS/quota ainda existe antes do cleanup.

```bash
kubectl get pods -n "$NS" -l app=s13 -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass,STATUS:.status.phase
kubectl get resourcequota -n "$NS"
```

Esperado: você ainda consegue ler as QoS classes e qualquer ResourceQuota que o lab aplicou.

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou é rotulado com app=s13
kubectl delete pod -l app=s13 -n "$NS" --ignore-not-found
kubectl delete resourcequota team-cap -n "$NS" --ignore-not-found   # libera o teto do namespace
rm -f qos-burstable.yaml qos-guaranteed.yaml qos-besteffort.yaml \
      oom-demo.yaml oom-demo-fixed.yaml resourcequota.yaml quota-buster.yaml

# reset de pânico (namespace): também remove qualquer outra coisa que sobrou no seu namespace
# kubectl delete pod,resourcequota,limitrange --all -n "$NS" --ignore-not-found
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
```

> **Delete a ResourceQuota quando terminar.** Enquanto ela existir, *todo* Pod do namespace
> precisa definir requests/limits — deixá-la no lugar vai fazer os Pods avulsos do próximo lab
> falharem com `must specify…`.

## Stretch (opcional) — CPU throttling: lento, mas nunca morto

Prove a outra metade da assimetria. CPU é **compressível**, então um container acima do seu
limit de CPU é **throttled** (fatia limitada) em vez de morto — ele continua `Running`.

```bash
cat > cpu-hog.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: cpu-hog
  labels: { app: s13 }
spec:
  containers:
    - name: hog
      image: polinux/stress
      command: ["stress"]
      args: ["--cpu", "2"]              # tenta queimar 2 cores
      resources:
        requests: { cpu: 100m }
        limits:   { cpu: 200m }         # ...mas limitado a 0.2 core
EOF

kubectl apply -f cpu-hog.yaml
kubectl get pod cpu-hog                 # STATUS continua Running, RESTARTS continua 0
kubectl top pod cpu-hog                 # se o metrics-server estiver presente: ~200m, colado no limit
```
