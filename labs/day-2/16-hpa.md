# Lab 16 — Autoscaling (HPA) (S16)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S16 — Autoscaling (HPA) |
| **Environment** | **kind ✓** (instala um **metrics-server** cluster-wide) · **namespace: alternativa read-only** (observe um HPA pré-instalado — veja o final) |
| **Estimated time** | 20 min |

## Objective

Tornar a contagem de réplicas um **sinal que o cluster acompanha**, não um número que você chuta.
Você vai confirmar que o **metrics-server** está servindo CPU, aplicar um Deployment **CPU-bound**
que declara um `requests.cpu`, envolvê-lo em um **HorizontalPodAutoscaler**, depois despejar carga
nele e observar `REPLICAS` subir rumo ao `max` — e, quando a carga parar, observá-lo **demorar**
antes de encolher (a janela de estabilização do scale-down). Por fim, você vai quebrar a única
coisa da qual todo HPA depende — o **request** de CPU — e ver `TARGETS` virar `<unknown>`.

> **Por que só kind no caminho principal?** O metrics-server é um add-on **cluster-wide** instalado
> no `kube-system`; você precisa de cluster-admin, que você tem no kind mas não em um namespace
> compartilhado. Se você está em um cluster compartilhado, pule para a **alternativa read-only por
> namespace** no final.

> **Defina seu contexto uma única vez.**
>
> ```bash
> kubectl config set-context --current --namespace=default   # kind: default está ok
> export NS=default
> ```

## Prerequisites

- Um cluster **kind** local e cluster-admin (`kubectl get nodes` funciona; você consegue criar
  objetos no `kube-system`).
- Acesso de pull à internet para `registry.k8s.io/hpa-example` (a clássica demo que queima CPU) e
  `busybox:1.37` (o gerador de carga).
- `metrics-server` — instalado no **Step 0** se ainda não estiver presente.
- Um pouco de paciência: o HPA reavalia a cada ~15s e a janela de **scale-down** é de **5 minutos**
  por padrão, então o último passo envolve alguma observação.

## Files used

- `web.yaml` — um Deployment CPU-bound (`hpa-example`, **com `requests.cpu`**) + seu Service.
- `hpa.yaml` — um HPA `autoscaling/v2` mirando a utilização de CPU do Deployment.
- `load.yaml` — um Deployment descartável que faz curl no Service em um loop apertado.
- `web-no-requests.yaml` — o Deployment **sem** `requests.cpu`, para o break→fix.

Tudo tem o label `app: s16`, então o cleanup é um único label selector. (Os Pods usam um label
`run:` separado para a ligação Service/selector, para que os Pods de load não sejam capturados
como endpoints do web.)

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./16-hpa.solution.md#guided-solutions)

### Step 0 — metrics-server: os olhos do HPA

O HPA lê a CPU da API **metrics.k8s.io**, que o **metrics-server** serve. Sem
metrics-server → sem dados → o HPA não consegue calcular um alvo. Verifique primeiro:

```bash
kubectl top pods -A            # se isto imprimir CPU/MEM, o metrics-server já está no ar — pule adiante
```

Se der erro com `Metrics API not available`, instale-o (o kind precisa de uma flag extra):

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# o kubelet do kind serve métricas com um cert autoassinado; o metrics-server o rejeita por padrão e
# nunca fica Ready. Permita isso (APENAS kind/dev — nunca em produção):
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

kubectl -n kube-system rollout status deployment/metrics-server   # aguarde ficar Available
```

**Tarefa:** confirme que o metrics-server agora serve dados (dê ~30–60s após o Ready para ele
coletar a primeira amostra).

```bash
kubectl top nodes
kubectl top pods -A | head
```

---

### Step 1 — um app CPU-bound com request, e um HPA por cima

O `hpa-example` é um pequeno app PHP que queima CPU a cada request — ao contrário do app de demo
workshop-web, que responde na hora e nunca moveria o ponteiro. O `requests.cpu: 200m` é o
**denominador** contra o qual o HPA escala.

```bash
cat > web.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s16 }
spec:
  replicas: 2
  selector: { matchLabels: { run: web } }
  template:
    metadata:
      labels: { run: web, app: s16 }
    spec:
      containers:
        - name: web
          image: registry.k8s.io/hpa-example
          ports: [{ containerPort: 80 }]
          resources:
            requests: { cpu: 200m }        # o HPA escala a CPU rumo a 50% DISTO
            limits:   { cpu: 500m }
---
apiVersion: v1
kind: Service
metadata:
  name: web
  labels: { app: s16 }
spec:
  selector: { run: web }                   # seleciona os Pods web (NÃO os Pods de load)
  ports: [{ port: 80, targetPort: 80 }]
EOF

kubectl apply -f web.yaml
kubectl rollout status deployment/web
```

Agora o HPA — `autoscaling/v2`, mirando **Utilization** de CPU (um percentual do request):

```bash
cat > hpa.yaml <<'EOF'
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
  labels: { app: s16 }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50           # manter a CPU média em 50% do requests.cpu (=100m)
EOF

kubectl apply -f hpa.yaml
```

**Tarefa:** observe o HPA se assentar na sua linha de base. Em ~30–60s `TARGETS` deve mostrar um
percentual real (perto de 0%) e `REPLICAS` deve ficar em `minReplicas` (2).

```bash
kubectl get hpa web -w        # aguarde TARGETS mostrar cpu: X%/50% (não <unknown>), depois Ctrl-C
```

---

### Step 2 — despeje carga e veja-o crescer

Execute um gerador de carga que martela o Service `web` em um loop apertado. Ele carrega o label
`run: load` (para o Service `web` **não** tratá-lo como backend) mais `app: s16` (para o cleanup
pegá-lo).

```bash
cat > load.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load
  labels: { app: s16 }
spec:
  replicas: 1
  selector: { matchLabels: { run: load } }
  template:
    metadata:
      labels: { run: load, app: s16 }
    spec:
      containers:
        - name: load
          image: busybox:1.37
          command: ["sh", "-c", "while true; do wget -q -O- http://web >/dev/null; done"]
EOF

kubectl apply -f load.yaml
```

**Tarefa:** observe o HPA reagir. Nos próximos 1–3 minutos `TARGETS` deve subir **além de 50%** e
`REPLICAS` deve escalar rumo ao `max`. (Um loop pode não bastar em uma máquina rápida — se
`TARGETS` continuar baixo, aumente a carga: `kubectl scale deployment/load --replicas=3`.)

```bash
kubectl get hpa web -w        # TARGETS cruza 50%, REPLICAS sobe 2 → … → rumo a 10
# em outra visão:
kubectl get pods -l run=web
```

**Pergunta:** `TARGETS` leu por um instante `240%/50%` — como a utilização de CPU de um Pod pode
passar de 100%?

---

### Step 3 — pare a carga e observe a *demora*

```bash
kubectl delete -f load.yaml       # ou: kubectl scale deployment/load --replicas=0
kubectl get hpa web -w            # continue observando — note por quanto tempo REPLICAS fica alto
```

**Tarefa:** cronometre aproximadamente quanto tempo `REPLICAS` leva para voltar a `2` depois que
`TARGETS` cai para perto de 0%. **Não** é imediato.

**Pergunta (a manchete):** por que o scale-down ficou atrás da queda da carga?

---

### Step 4 — break→fix: um HPA sem nada pelo que dividir

O HPA escala com base em um **percentual de `requests.cpu`**. Tire o request e o percentual fica
sem denominador.

```bash
cat > web-no-requests.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s16 }
spec:
  replicas: 2
  selector: { matchLabels: { run: web } }
  template:
    metadata:
      labels: { run: web, app: s16 }
    spec:
      containers:
        - name: web
          image: registry.k8s.io/hpa-example
          ports: [{ containerPort: 80 }]
          # resources.requests.cpu REMOVIDO — o HPA não tem base para calcular o % contra
EOF

kubectl apply -f web-no-requests.yaml
kubectl rollout status deployment/web
kubectl get hpa web            # TARGETS agora <unknown>
```

**Tarefa:** confirme que o HPA não consegue mais calcular um alvo, e leia o *porquê* no `describe`.

```bash
kubectl get hpa web
kubectl describe hpa web | sed -n '/Conditions/,/Events/p'
```

**Tarefa:** restaure o request e confirme que o HPA se recupera.

```bash
kubectl apply -f web.yaml          # o original, COM requests.cpu
kubectl rollout status deployment/web
kubectl get hpa web -w             # TARGETS volta a cpu: X%/50%, depois Ctrl-C
```

## Observe

- O **metrics-server** precisa servir o `kubectl top` antes de um HPA conseguir ler qualquer
  coisa; no kind ele precisa de `--kubelet-insecure-tls` para ficar Ready.
- Com um app **CPU-bound** que declara `requests.cpu`, a carga empurra `TARGETS` além de 50% e o
  HPA escala `REPLICAS` rumo a `maxReplicas`; a CPU por Pod **cai** conforme as réplicas sobem.
- A utilização é **relativa ao request**, então `TARGETS` pode ler **>100%** (burst acima do
  request rumo ao limit).
- O scale-**up** é rápido; o scale-**down** espera a janela de estabilização de **300s** antes de
  encolher.
- Remova o `requests.cpu` → `TARGETS <unknown>`, `ScalingActive: False`,
  `FailedGetResourceMetric: missing request for cpu` → o HPA fica congelado até você restaurá-lo.

## Challenge

Um HPA nunca escala apesar da carga. Diagnostique um request de CPU ausente versus um
metrics-server ausente, depois restaure um scaling que reage à carga.

**Difficulty:** Intermediate

**Success criteria:** Identifique a condition ou o Event do HPA que nomeia o sinal ausente,
restaure os requests ou o metrics-server conforme o caso, e prove que as métricas CURRENT/TARGET
ficam numéricas ou que o status do HPA mostra as réplicas aumentando sob carga.

**Hints:** Leia kubectl describe hpa procurando failedGetResourceMetric; compare o
resources.requests.cpu do template de Pod do Deployment com a prontidão do metrics-server.

[Spoiler: solução do challenge](./16-hpa.solution.md#challenge-solution)

## Verify

Confirme o caminho do sinal do HPA antes do cleanup.

```bash
kubectl get deploy,hpa,pods -n "$NS" -l app=s16
kubectl describe hpa -n "$NS" | sed -n '/Metrics:/,/Events:/p'
```

Esperado: o HPA ainda existe e mostra ou TARGETS numéricos ou uma condition clara
explicando por que as métricas estão indisponíveis.

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou tem o label app=s16
kubectl delete hpa,deployment,service -l app=s16 -n "$NS" --ignore-not-found
kubectl delete pod -l app=s16 -n "$NS" --ignore-not-found
rm -f web.yaml hpa.yaml load.yaml web-no-requests.yaml

# reset de pânico (namespace): remove também qualquer outra coisa que este lab possa ter deixado
# kubectl delete hpa,deployment,service,pod --all -n "$NS" --ignore-not-found

# OPCIONAL — remova também o metrics-server (apenas se você o instalou para este lab):
# kubectl delete -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
```

> **Delete o gerador de carga quando terminar.** Um loop apertado de `wget` deixado rodando vai
> manter o HPA escalado (e queimar a CPU do seu laptop) — `kubectl delete deployment load` o
> interrompe.

## Stretch (opcional) — deixe o scale-down mais ágil com `behavior`

O padrão de 5 minutos do scale-down é conservador. Adicione um bloco `behavior` para encolher mais
rápido — útil para *ver* o scale-down sem esperar, e um bom jeito de sentir na prática o knob dos
slides.

```bash
kubectl patch hpa web --type=merge -p '{
  "spec": { "behavior": { "scaleDown": {
    "stabilizationWindowSeconds": 30,
    "policies": [ { "type": "Pods", "value": 2, "periodSeconds": 15 } ]
  } } }
}'
```

---

## Alternativa read-only por namespace (cluster compartilhado)

Você não pode instalar o metrics-server nem escalar nodes em um namespace compartilhado, então o
facilitador vai pré-provisionar um Deployment + HPA sob carga no seu namespace. Você o **observa**
em vez de construí-lo:

```bash
kubectl get hpa
kubectl describe hpa <name>              # leia as Conditions + os Events (ScalingActive, decisões de scale)
kubectl get hpa <name> -w                # observe TARGETS e REPLICAS se moverem se houver carga aplicada
kubectl top pods -l app=<label>          # a CPU bruta que o HPA está dividindo pelo request
```

**Pergunta:** a partir do `kubectl describe hpa`, como você distingue um HPA *saudável* de um
*travado*?

---

> **Nota de entrega (convenção do repo).** Os manifestos aqui usam `autoscaling/v2` e foram
> escritos e validados com `kubectl apply --dry-run=server`, mas o lab **não foi executado de
> ponta a ponta** no ambiente de autoria (o único cluster alcançável era um namespace de produção
> compartilhado, fora dos limites para instalar metrics-server ou criar um loop de carga). Antes
> do ensaio, execute isto uma vez em um cluster **kind** limpo para confirmar: o metrics-server
> fica Ready com `--kubelet-insecure-tls` e o `kubectl top` serve dados; uma única réplica de
> `load` realmente empurra `TARGETS` acima de 50% no seu hardware (aumente a carga se não); a
> rampa exata de `REPLICAS` e o atraso de ~5 minutos do scale-down; e as strings exatas de
> condition do `describe hpa` (`FailedGetResourceMetric` / `missing request for
> cpu`).
