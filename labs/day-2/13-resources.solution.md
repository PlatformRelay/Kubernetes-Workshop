# Lab 13 — Resources & limits (S13) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ for p in qos-burstable qos-guaranteed qos-besteffort; do
    printf '%-16s ' "$p"; kubectl get pod "$p" -o jsonpath='{.status.qosClass}'; echo
  done
qos-burstable    Burstable
qos-guaranteed   Guaranteed
qos-besteffort   BestEffort
```

`kubectl describe pod qos-guaranteed | grep "QoS Class"` mostra a mesma coisa
(`QoS Class:  Guaranteed`). As regras, exatamente:

- **Guaranteed** — *todo* container define *ambos*, cpu e memória, e para cada um `request == limit`.
- **BestEffort** — *nenhum* container define *nenhum* request ou limit.
- **Burstable** — qualquer coisa no meio (pelo menos um request/limit definido, mas não Guaranteed).

</details>

**Pergunta:** se você deletar os `limits` de `qos-guaranteed` mas mantiver os `requests`, em que
QoS class ele se transforma — e se, em vez disso, você deletar os `requests` e mantiver apenas
os `limits`?

<details><summary>Resposta</summary>

- **só requests** (sem limits) → **Burstable**. Ele deixa de satisfazer "todo container tem um
  limit para ambos os resources", então cai fora de Guaranteed.
- **só limits** (sem requests) → continua **Guaranteed**. Essa é a pegadinha: quando você define
  um limit mas nenhum request, o Kubernetes **copia o limit para o request**, então
  `request == limit` vale e ambos estão definidos → Guaranteed. Definir apenas limits é um jeito
  válido de chegar a Guaranteed.

</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod oom-demo
NAME       READY   STATUS             RESTARTS      AGE
oom-demo   0/1     CrashLoopBackOff   3 (24s ago)   95s

$ kubectl describe pod oom-demo
...
    State:          Waiting
      Reason:       CrashLoopBackOff
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
    ...
    Restart Count:  3
```

O container é **OOMKilled** — `Reason: OOMKilled`, `Exit Code: 137` (137 = 128 + sinal 9,
`SIGKILL`). Como o `restartPolicy` padrão de um Pod é `Always`, o kubelet fica reiniciando-o;
cada restart dá OOM de novo, então ele para em **CrashLoopBackOff** com `RESTARTS` subindo. Um
memory leak de verdade se parece exatamente com isto.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod oom-demo
NAME       READY   STATUS    RESTARTS   AGE
oom-demo   1/1     Running   0          40s
```

Com um teto de 250Mi a alocação de ~150 MB cabe, nada é morto e `RESTARTS` fica em 0.
O conserto é **elevar o limit** (como aqui) ou **reduzir o footprint da aplicação** — nunca
simplesmente "remover o limit", o que troca um OOMKill previsível por um vizinho barulhento sem
limites.
</details>

**Pergunta:** o container foi `OOMKilled` mas voltou imediatamente. Qual componente o matou,
e qual componente o reiniciou?

<details><summary>Resposta</summary>

O **OOM killer do kernel** (guiado pelo limit de memória do cgroup do container, que o
**kubelet** programou) enviou `SIGKILL` quando o processo cruzou 100Mi. O **kubelet** então
reiniciou o container conforme o `restartPolicy: Always` do Pod. Ambos são imposição em
**runtime** — o Pod existia e estava se comportando mal. Guarde esse pensamento: a rejeição por
quota do Step 3 acontece *antes* de o Pod sequer existir.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl describe resourcequota team-cap
Name:            team-cap
Namespace:       <ns>
Resource         Used  Hard
--------         ----  ----
limits.memory    0     512Mi
pods             0     5
requests.memory  0     256Mi
```

`Used` é 0 porque deletamos os Pods anteriores. Todo Pod criado daqui em diante é conferido
contra `Hard - Used` **no admission**. (Se seu namespace já tinha workloads, `Used` reflete
isso — a quota conta tudo, não apenas os objetos deste lab.)
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f quota-buster.yaml
Error from server (Forbidden): error when creating "quota-buster.yaml": pods "quota-buster" is
forbidden: exceeded quota: team-cap, requested: requests.memory=512Mi, used: requests.memory=0,
limited: requests.memory=256Mi

$ kubectl get pod quota-buster
Error from server (NotFound): pods "quota-buster" not found
```

`exceeded quota: team-cap, requested … used … limited …` — o API server recusou o Pod no
**admission** porque `requests.memory` (512Mi) excedeu o orçamento restante (256Mi − 0). O Pod
**nunca foi criado** (`NotFound`). Nada para reiniciar, nada para matar — ele simplesmente não
existe. Conserte fazendo request dentro do orçamento:

```console
$ sed 's/512Mi/128Mi/g' quota-buster.yaml | kubectl apply -f -
pod/quota-buster created
```

</details>

**Pergunta:** o que acontece se você submeter um Pod **sem** `resources` enquanto esta quota
está em vigor — e como um `LimitRange` mudaria isso?

<details><summary>Resposta</summary>

Assim que uma quota restringe `requests.memory`/`limits.memory`, todo Pod **precisa** especificá-los.
Um Pod que os omite é rejeitado com um erro *diferente*:

```console
Error from server (Forbidden): ... is forbidden: failed quota: team-cap: must specify
limits.memory,requests.memory
```

São duas falhas de admission distintas: **`must specify…`** (você deixou de fora um resource
restrito) vs **`exceeded quota:`** (você pediu mais do que o orçamento). Um **LimitRange** no
namespace conserta a primeira automaticamente — ele **injeta** requests/limits padrão nos Pods
que os omitem, então um Pod que seria BestEffort ganha valores e é admitido (como Burstable). A
quota define o teto; o LimitRange fornece os defaults que impedem Pods avulsos de esbarrar nela.
</details>

### Stretch (opcional) — CPU throttling: lento, mas nunca morto

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

<details><summary>Solução / o que você está vendo</summary>

```console
$ kubectl get pod cpu-hog
NAME      READY   STATUS    RESTARTS   AGE
cpu-hog   1/1     Running   0          30s

$ kubectl top pod cpu-hog          # requer o metrics-server
NAME      CPU(cores)   MEMORY(bytes)
cpu-hog   200m         1Mi
```

O `stress` quer dois cores inteiros, mas a quota de CPU do cgroup o prende em `200m`. O
container **nunca é morto** — `RESTARTS` fica em 0 e `STATUS` fica `Running` — ele só roda
devagar. É essa a assimetria inteira: **memória acima do limit → morto**, **CPU acima do limit →
throttled**. Se o `top` retornar `error: Metrics API not available`, seu cluster não tem
metrics-server; a linha do `get pod` (Running, 0 restarts) já prova o ponto. Limpe com:
`kubectl delete pod cpu-hog`.
</details>

## Expected state / output

- A QoS class é **derivada**, não escolhida: **Guaranteed** (tudo definido, `request == limit`),
  **BestEffort** (nada definido), **Burstable** (todo o resto). Só limits ainda → Guaranteed.
- Um container acima do seu limit de **memória** é **OOMKilled** (`Exit Code 137`) e — com o
  `restartPolicy: Always` padrão — reiniciado até cair em **CrashLoopBackOff**.
- O conserto é um **limit** correto (ou uma aplicação menor), e não remover o limit.
- Uma **ResourceQuota** impõe no **admission**: um Pod que a excede recebe `exceeded quota:` e
  **nunca é criado**; um Pod que omite um resource restrito recebe `must specify…`.
- Imposição em **runtime** (o kubelet mata/reinicia um Pod vivo) vs imposição no **admission**
  (o API server rejeita antes de o Pod existir) — o modelo mental central da seção.

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions
Accepted de Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes efêmeros.

## Explanation

Limits de memória são impostos pelo cgroup — excedê-los causa a morte do container
(OOMKilled) mesmo quando o node tem RAM livre. A ResourceQuota rejeita Pods antes que eles
rodem. Ler o local exato da falha evita girar o botão errado.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e
os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Distinga OOMKilled (exit 137 do container em `kubectl describe pod -n "$NS"`) de uma rejeição no
admission (`kubectl describe resourcequota -n "$NS"` ou erros de criação). Restaure um Pod
executável editando requests/limits para que caibam na quota, depois reaplique o manifesto
correspondente — `oom-demo-fixed.yaml` depois de uma demo de OOM, ou um `quota-buster.yaml`
enxugado depois de uma negativa por quota — via `kubectl apply -f <manifest> -n "$NS"`. Ou
`kubectl delete pod <name> -n "$NS" --ignore-not-found` antes de reaplicar. Confirme a QoS do
Pod corrigido com
`kubectl get pod <name> -n "$NS" -o jsonpath='{.status.qosClass}{"\n"}'`.

## Challenge solution

### Commands / manifest

```bash
kubectl get pods -n "$NS" -l app=s13
kubectl describe pod -n "$NS" -l app=s13 | sed -n '/Events:/,$p' | head -n 40
kubectl describe resourcequota team-cap -n "$NS"
kubectl apply -f oom-demo-fixed.yaml -n "$NS"
kubectl get pod oom-demo -n "$NS" -o jsonpath='{.status.qosClass}{"\n"}'
```

### Expected state / output

O diagnóstico distingue OOMKilled (container terminado por passar do limit) de uma negativa
no admission ou por quota. O Pod restaurado alcança o status Running e reporta Guaranteed ou
Burstable, conforme a intenção do conserto.

### Explanation

Limits de memória são impostos pelo cgroup — excedê-los causa a morte do container
(OOMKilled) mesmo quando o node tem RAM livre. A ResourceQuota rejeita Pods antes que eles
rodem. Ler o local exato da falha evita girar o botão errado.

### Hints

Compare o last state reason do kubectl describe pod com o kubectl describe resourcequota;
OOMKilled é uma saída de container, falhas de quota geralmente rejeitam a criação.
