# Lab 16 — Autoscaling (HPA) (S16) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl top nodes
NAME                 CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
kind-control-plane   180m         2%     1200Mi          15%

$ kubectl top pods -A | head
NAMESPACE     NAME                              CPU(cores)   MEMORY(bytes)
kube-system   coredns-...                       3m           14Mi
kube-system   metrics-server-...                5m           18Mi
```

Se o `kubectl top` retorna números, o HPA tem uma fonte de métricas. Se ainda diz
`Metrics API not available`, o metrics-server ainda não coletou uma amostra (aguarde um pouco) ou
o patch `--kubelet-insecure-tls` não foi aplicado — re-verifique `kubectl -n kube-system get deploy
metrics-server -o jsonpath='{..args}'`. **Lembre-se deste sintoma:** um metrics-server quebrado
TAMBÉM faz um HPA ler `<unknown>` — essa é uma causa *diferente* da quebra por request ausente do Step 4.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get hpa web
NAME   REFERENCE        TARGETS       MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 0%/50%   2         10        2          60s
```

`TARGETS cpu: 0%/50%` = "a CPU média atual é ~0% do request, o alvo é 50%." O app está
ocioso, então o HPA segura em `minReplicas: 2`. Se em vez disso você vê `cpu: <unknown>/50%`, ou o
metrics-server ainda não produziu uma amostra (aguarde) ou o Deployment está sem o `requests.cpu`
(você fará isso de propósito no Step 4). Note que você definiu `replicas: 2` no Deployment como
*ponto de partida* — daqui em diante o HPA é dono desse campo; não faça `kubectl scale` nele à mão.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get hpa web -w
NAME   REFERENCE        TARGETS         MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 0%/50%     2         10        2          3m
web    Deployment/web   cpu: 240%/50%   2         10        2          3m30s
web    Deployment/web   cpu: 240%/50%   2         10        4          3m45s
web    Deployment/web   cpu: 130%/50%   2         10        8          4m30s
web    Deployment/web   cpu: 55%/50%    2         10        10         5m30s
```

A carga empurra a CPU média bem acima do alvo, então o HPA aplica
`ceil(current × util/target)` e adiciona Pods — você verá `REPLICAS` subir em degraus
(2 → 4 → 8 → 10) conforme ele reavalia a cada ~15s. Note que `TARGETS` **cai enquanto REPLICAS
sobe**: a mesma carga total espalhada por mais Pods é menos CPU por Pod. Ele para em
`maxReplicas: 10` mesmo se `TARGETS` ainda estiver acima de 50% — o `max` é o teto rígido. Os
números exatos dependem da sua máquina; o formato (acima do alvo → subida → CPU por Pod alivia) é
o que importa.
</details>

**Pergunta:** `TARGETS` leu por um instante `240%/50%` — como a utilização de CPU de um Pod pode
passar de 100%?

<details><summary>Resposta</summary>

A utilização aqui é **relativa ao `requests.cpu` (200m)**, não a um core inteiro.
`240%` significa que os Pods estavam em média usando ~`480m` de CPU real contra um request de
`200m` — eles podem fazer burst acima do request até o seu `limit` (500m). Então "utilização" para
o HPA é "CPU real ÷ CPU requisitada", o que pode passar de 100% sempre que um Pod usa mais do que
pediu. É exatamente por essa causa que um request precisa existir para o número significar alguma
coisa (Step 4).
</details>

---

### Step 3 — pare a carga e observe a *demora*

```bash
kubectl delete -f load.yaml       # ou: kubectl scale deployment/load --replicas=0
kubectl get hpa web -w            # continue observando — note por quanto tempo REPLICAS fica alto
```

**Tarefa:** cronometre aproximadamente quanto tempo `REPLICAS` leva para voltar a `2` depois que
`TARGETS` cai para perto de 0%. **Não** é imediato.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get hpa web -w
NAME   REFERENCE        TARGETS        MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 55%/50%   2         10        10         6m
web    Deployment/web   cpu: 0%/50%    2         10        10         6m30s   # carga sumiu, ainda 10
web    Deployment/web   cpu: 0%/50%    2         10        10         10m     # ...ainda segurando
web    Deployment/web   cpu: 0%/50%    2         10        2          11m30s  # finalmente encolhe
```

A CPU cai para ~0% quase de imediato, mas `REPLICAS` **fica em 10 por cerca de cinco minutos**
antes de colapsar de volta ao `min`. O scale-up foi rápido; o scale-down é deliberadamente lento.
Esse atraso é todo o ponto da próxima pergunta.
</details>

**Pergunta (a manchete):** por que o scale-down ficou atrás da queda da carga?

<details><summary>Resposta</summary>

Por causa da **janela de estabilização do scale-down**, `behavior.scaleDown.stabilizationWindowSeconds`,
cujo **padrão é 300 segundos (5 minutos)**. Ao decidir se encolhe, o HPA olha para trás dentro
dessa janela e usa a recomendação de réplicas **mais alta** nela — então uma queda súbita de carga
não consegue encolher a frota de imediato; a leitura baixa precisa persistir pela janela inteira
primeiro. (A janela de **scale-up** tem padrão `0` — picos são atendidos na hora.) A assimetria é
intencional: reagir demais a uma calmaria breve só **sacode** (thrashing) os Pods (e te deixa
curto logo antes do próximo pico), enquanto reagir de menos a um pico **derruba tráfego**. Então o
HPA erra para o lado de manter capacidade — **sobe rápido, desce paciente**. Você pode ajustar
isso em `spec.behavior` se 5 minutos for errado para seu workload.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get hpa web
NAME   REFERENCE        TARGETS              MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: <unknown>/50%   2         10        2          14m

$ kubectl describe hpa web
...
Conditions:
  Type           Status  Reason                   Message
  ----           ------  ------                   -------
  AbleToScale    True    SucceededGetScale        the HPA controller was able to get the target's current scale
  ScalingActive  False   FailedGetResourceMetric  failed to get cpu utilization: missing request for cpu ...
```

`TARGETS <unknown>/50%` e `ScalingActive: False` com **`missing request for cpu`**. Sem um
`requests.cpu`, "50% de utilização" é indefinido, então o HPA desiste de calcular uma contagem
desejada e **congela na contagem de réplicas atual** — ele não consegue nem subir sob carga nem
descer quando ocioso. Esta é a causa mais comum de "meu HPA não faz nada". (Contraste com o
`<unknown>` do Step 0, que veio do metrics-server sem servir dados — mesmo sintoma, causa raiz
diferente: verifique `kubectl top pods` para distingui-los. Se o `top` funciona mas o HPA está
`<unknown>`, é o request ausente; se o próprio `top` falha, é o metrics-server.)
</details>

**Tarefa:** restaure o request e confirme que o HPA se recupera.

```bash
kubectl apply -f web.yaml          # o original, COM requests.cpu
kubectl rollout status deployment/web
kubectl get hpa web -w             # TARGETS volta a cpu: X%/50%, depois Ctrl-C
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get hpa web
NAME   REFERENCE        TARGETS       MINPODS   MAXPODS   REPLICAS   AGE
web    Deployment/web   cpu: 0%/50%   2         10        2          16m
```

Com o request de volta, o HPA consegue calcular utilização de novo — `TARGETS` mostra um
percentual real e `ScalingActive` volta a `True`. A correção de um `<unknown>` no mundo real é
quase sempre "adicione o `requests.cpu` faltante" (ou conserte o metrics-server) — sem tocar no
HPA em nada.
</details>

### Stretch (opcional) — deixe o scale-down mais ágil com `behavior`

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

<details><summary>O que muda</summary>

Você cortou a janela de estabilização do scale-down de 300s para **30s** e limitou a taxa a
**2 Pods a cada 15s**. Re-execute os Steps 2–3: depois que a carga para, `REPLICAS` agora cai de
volta rumo ao `min` em cerca de meio minuto em vez de cinco, descendo no máximo 2 por vez. Este é
exatamente o bloco `spec.behavior.scaleDown` dos slides — prova de que o "desce devagar" é um
**padrão, não uma lei**. (Baixar demais reintroduz o flapping que a janela existe para prevenir,
então 300s é um padrão de produção sensato.)
</details>

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

<details><summary>Resposta</summary>

Leia as **Conditions**. Um HPA saudável mostra `AbleToScale: True` e **`ScalingActive: True`**
(`ValidMetricFound`) — ele está lendo uma métrica e livre para agir. Um travado mostra
**`ScalingActive: False`** com uma razão como `FailedGetResourceMetric` (sem métrica —
`missing request for cpu`, ou metrics-server fora do ar) ou `FailedGetScale` (não encontra o
alvo). A condition/event `ScaleDownStabilized` também explica uma frota que segura alto depois da
carga cair: ela está dentro da janela de estabilização. `TARGETS` lendo `<unknown>` no
`kubectl get hpa` é o sinal rápido; o `describe` te dá o *porquê*.
</details>

## Expected state / output

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

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions
Accepted de Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes efêmeros.

## Explanation

As métricas de resource do HPA são percentuais dos requests — sem um request de CPU não há
nada pelo que dividir. Sem o metrics-server, o HPA não consegue ler utilização de forma alguma.
Distinguir essas causas de falha evita instalar o metrics-server quando o Deployment
simplesmente omitiu os requests.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e os
campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Quando os `TARGETS` do HPA ficam `<unknown>` sob carga, execute `kubectl describe hpa -n "$NS"` e
procure `failedGetResourceMetric`. Um `resources.requests.cpu` ausente é corrigido restaurando o
template do Deployment — `kubectl apply -f web.yaml -n "$NS"` — e depois confirmando que
`kubectl get hpa -n "$NS"` mostra CURRENT/TARGET numéricos. Se o próprio metrics-server estiver
fora do ar, verifique `kubectl -n kube-system get deploy metrics-server` antes de culpar o HPA;
não delete o HPA como primeiro passo de recuperação.

## Challenge solution

### Commands / manifest

```bash
kubectl describe hpa -n "$NS" | sed -n '/Events:/,$p'
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes >/dev/null && echo metrics-ok
kubectl get deploy -n "$NS" -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.template.spec.containers[0].resources}{"\n"}{end}'
kubectl apply -f web.yaml -n "$NS"
kubectl apply -f hpa.yaml -n "$NS"
kubectl get hpa -n "$NS"
```

### Expected state / output

O describe nomeia ou uma falha na coleta de métricas ou um request de CPU ausente (alvo
indefinido). Após a correção, o HPA mostra um status de alvo numérico e consegue elevar a
contagem de réplicas quando há carga aplicada.

### Explanation

As métricas de resource do HPA são percentuais dos requests — sem um request de CPU não há
nada pelo que dividir. Sem o metrics-server, o HPA não consegue ler utilização de forma alguma.
Distinguir essas causas de falha evita instalar o metrics-server quando o Deployment
simplesmente omitiu os requests.

### Hints

Leia kubectl describe hpa procurando failedGetResourceMetric; compare o
resources.requests.cpu do template de Pod do Deployment com a prontidão do metrics-server.
