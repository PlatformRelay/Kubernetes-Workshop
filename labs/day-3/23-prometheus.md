# Lab 23 — Prometheus Operator (S23)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S23 — Prometheus Operator |
| **Environment** | **kind ✓** (instale a stack você mesmo) / namespace: **read-only** |
| **Estimated time** | 25 min |

## Objective

Instalar o **`kube-prometheus-stack`** (o Prometheus Operator + um Prometheus + Grafana +
kube-state-metrics + node-exporter) em um cluster kind, fazer o deploy de um pequeno app que expõe
métricas Prometheus reais em **`/metrics`** e conectá-lo com um **`ServiceMonitor`** — o padrão de
operator do S22 tornado concreto: você declara a **intenção** de monitoramento como um CR, e o
operator **gera a scrape config**.

Depois, o ponto central do lab inteiro: **quebre** o ServiceMonitor com um **label selector que não
casa**, de modo que o target nunca apareça, **diagnostique** na página **`/targets`** do
Prometheus, **conserte** o selector e observe o target ficar **UP**. Termine com uma query
**PromQL**.

O lab gira em torno de uma única ideia: **você nunca edita o `prometheus.yml`.** Você aplica um
ServiceMonitor; o operator resolve os endpoints do Service e escreve a scrape config por você.
Quando um target está faltando, você depura os **selectors**, não o arquivo de config.

> **Duas camadas de selector — mantenha-as separadas.** (1) **Descoberta Prometheus →
> ServiceMonitor:** este Prometheus só adota ServiceMonitors que carregam o label
> `release: monitoring`. (2) **Seleção de target ServiceMonitor → Service:**
> `spec.selector.matchLabels` escolhe o Service. A **quebra** deliberada nos Steps 3–4 está na
> camada (2). O label `release: monitoring` da camada (1) está presente e correto o tempo todo — se
> você removê-lo, o monitor é ignorado por uma razão *diferente*.
>
> Isso funciona com o SM em `demo` e o Prometheus em `monitoring` porque o
> `serviceMonitorNamespaceSelector` padrão do chart é vazio (`{}` = *todos os namespaces*). Se um
> facilitador restringir o Prometheus dele ao próprio namespace, coloque o app, o Service e o
> ServiceMonitor **naquele namespace**. (Confirme o padrão na versão do chart que você instalar —
> veja as flags no final.)

## Prerequisites

- **Caminho kind (recomendado):** Docker + `kind` + `kubectl` + `helm` v3.8+, e permissão para
  criar um cluster local. Você vai criar um cluster descartável chamado `monitoring`.
- **Caminho do cluster compartilhado (read-only):** seu namespace atribuído em um cluster onde um
  facilitador já instalou o `kube-prometheus-stack`. Você não pode instalar CRDs cluster-wide nem
  um operator por conta própria, então aqui você **apenas observa** os targets de uma stack em
  execução e roda queries. Prefira o kind.
- Acesso de pull à internet para `quay.io/brancz/prometheus-example-app` e para as images do chart.

> **Em Apple Silicon / arm64:** use a tag de image do app **`v0.6.0`** (multi-arch). A antiga
> `v0.5.0` é amd64-only e vai entrar em `CrashLoopBackOff` / `exec format error` em nodes kind
> arm64.

## Files used

- `app.yaml` — o Deployment + Service do `sample-app`. O Service expõe uma porta **nomeada**
  (`name: web`) — o ServiceMonitor referencia esse **nome**.
- `servicemonitor.yaml` — um `ServiceMonitor` (`monitoring.coreos.com/v1`). Aplicado primeiro com
  um selector de target **quebrado**, depois corrigido via patch para o certo.

Tudo que você adiciona carrega o label `lab: s23` e vive em um namespace `demo`, então o cleanup é
por selector mais uma deleção de namespace.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./23-prometheus.solution.md#guided-solutions)

### Step 0 — um cluster com a stack

### Caminho kind (faça este)

```bash
kind create cluster --name monitoring
kubectl get nodes
```

Adicione o repo do Helm e instale a stack no namespace `monitoring`, próprio dela. O nome da
release, `monitoring`, é o que faz o Prometheus adotar ServiceMonitors com o label
`release: monitoring`.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --wait --timeout 10m
```

**Tarefa:** confirme que a release está deployed e que o Pod do operator está Running.

```bash
helm list -n monitoring
kubectl get pods -n monitoring
```

> **O node-exporter pode entrar em CrashLoop em alguns setups de kind** (ele monta o rootfs do
> host, o que um container runtime pode restringir). É inofensivo para este lab — o ServiceMonitor
> do seu app não depende dele. Se ele for o único Pod vermelho, siga em frente.

### Caminho do cluster compartilhado (read-only)

Um facilitador já instalou a stack. Você só aponta para ela e observa — pule o `helm install` e,
nos passos seguintes, leia o ServiceMonitor pré-aplicado e faça as queries no Prometheus do
facilitador em vez de aplicar seus próprios objetos.

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
# encontre o namespace de monitoring / Prometheus que seu facilitador indicar
kubectl get servicemonitor -A | head
```

Acompanhe o restante **lendo** os manifestos e os spoilers e executando os passos de `/targets` e
de PromQL contra o Prometheus do facilitador — os *objetos e as queries* são idênticos; só muda
quem os aplicou.

---

### Step 1 — confirme que o operator instalou seus CRDs

O operator só é útil porque registrou novos **kinds**. Verifique-os.

```bash
kubectl get crd | grep monitoring.coreos.com
```

---

### Step 2 — faça o deploy de um app que expõe `/metrics` em uma porta NOMEADA

O app é o `prometheus-example-app`: ele serve `/metrics` na porta **8080** e expõe o contador
**`http_requests_total`** (perfeito para uma query com `rate()`). Note que o Service dá um
**nome** à sua porta — `web` — porque o ServiceMonitor vai referenciar esse **nome**, não o
número.

```bash
kubectl create namespace demo

cat > app.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample-app
  namespace: demo
  labels: { app: sample-app, lab: s23 }
spec:
  replicas: 1
  selector: { matchLabels: { app: sample-app } }
  template:
    metadata:
      labels: { app: sample-app, lab: s23 }
    spec:
      containers:
        - name: app
          image: quay.io/brancz/prometheus-example-app:v0.6.0
          ports:
            - name: web
              containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  namespace: demo
  labels: { app: sample-app, lab: s23 }
spec:
  selector: { app: sample-app }
  ports:
    - name: web          # ← a porta NOMEADA que o ServiceMonitor referencia
      port: 8080
      targetPort: web
EOF

kubectl apply -f app.yaml
kubectl -n demo rollout status deploy/sample-app
```

**Tarefa:** confirme que o app serve métricas. Faça port-forward do Service e um curl em
`/metrics`.

```bash
kubectl -n demo port-forward svc/sample-app 8080:8080 >/tmp/pf-app.log 2>&1 &
APP_PF=$!
sleep 2
curl -s http://localhost:8080/metrics | grep '^http_requests_total'
# pare este port-forward antes de prosseguir
kill "$APP_PF" 2>/dev/null
```

---

### Step 3 — conecte-o (do jeito ERRADO, de propósito)

Aplique um ServiceMonitor cujo **selector de target está deliberadamente errado** — ele seleciona
`app: sample-APP-typo`, label que nenhum Service tem. A camada (1) está correta (ele carrega
`release: monitoring`, então este Prometheus *vai* adotá-lo); só a camada (2) está quebrada.

```bash
cat > servicemonitor.yaml <<'EOF'
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  namespace: demo
  labels:
    release: monitoring          # (1) descoberta: este Prometheus adota o monitor
    lab: s23
spec:
  selector:
    matchLabels:
      app: sample-APP-typo       # (2) QUEBRA: nenhum Service tem este label
  endpoints:
    - port: web                  # (3) a porta nomeada do Service
      path: /metrics
EOF

kubectl apply -f servicemonitor.yaml
kubectl -n demo get servicemonitor
```

---

### Step 4 — quebre: diagnostique na página `/targets` do Prometheus

Faça port-forward da web UI do Prometheus e olhe **`/targets`** — a página que lista cada scrape
target e sua saúde. Como nosso selector não casa com nenhum Service, nosso app **não está lá** (ou
aparece **sem** target ativo).

```bash
# o nome do Service do Prometheus depende da release; encontre-o e depois faça o forward
kubectl -n monitoring get svc | grep prometheus
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090 \
  >/tmp/pf-prom.log 2>&1 &
PROM_PF=$!
sleep 2
echo "open http://localhost:9090/targets"
```

**Tarefa:** abra <http://localhost:9090/targets> em um navegador. Procure um scrape pool com o
nome do nosso ServiceMonitor (`serviceMonitor/demo/sample-app/0`). Ele mostra **0 targets** —
nosso app nunca aparece como **UP**.

**Pergunta:** o ServiceMonitor foi aplicado sem erro e o operator o adotou, mas o app nunca
aparece **UP**. Onde está a falha — e em que essa falha difere de *esquecer* o label
`release: monitoring`?

---

### Step 5 — conserte: faça o selector casar com os labels do Service

Aplique um patch no selector para o label que o Service realmente carrega (`app: sample-app`).
Nada mais muda.

```bash
kubectl -n demo patch servicemonitor sample-app --type=merge \
  -p '{"spec":{"selector":{"matchLabels":{"app":"sample-app"}}}}'
```

**Tarefa:** espere ~30 s (o operator regenera a config e o Prometheus recarrega), depois atualize
<http://localhost:9090/targets>. Nosso target agora aparece como **UP**.

**Pergunta (obrigatória):** por que o `endpoints[].port` do ServiceMonitor precisa ser `web` (um
**nome**), e não `8080` (um número)?

---

### Step 6 — gere carga, depois execute uma query PromQL

O `http_requests_total` mal se move até o app servir requests reais, e o `rate()` precisa de
alguns pontos de dado na sua janela. Gere tráfego contra o handler `/` do app, espere um scrape ou
dois, depois faça a query.

```bash
# faça o forward do app de novo e bombardeie o endpoint "/" que é contado
kubectl -n demo port-forward svc/sample-app 8080:8080 >/tmp/pf-app.log 2>&1 &
APP_PF=$!
sleep 2
for i in $(seq 1 200); do curl -s -o /dev/null http://localhost:8080/ ; done
kill "$APP_PF" 2>/dev/null

# dê ao Prometheus ~30s (o scrape interval padrão) para captar o aumento
sleep 40
```

**Tarefa:** na UI do Prometheus (<http://localhost:9090/graph>) — ou pela HTTP API abaixo —
execute:

```promql
rate(http_requests_total{code="200"}[5m])
```

```bash
# a mesma query pela CLI (o port-forward do Prometheus do Step 4 ainda está rodando)
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(http_requests_total{code="200"}[5m])' | \
  python3 -m json.tool
```

## Observe

- **Você nunca editou scrape config.** Você aplicou um `ServiceMonitor`; o operator resolveu os
  endpoints do Service e gerou o scrape job do Prometheus — o padrão de operator do S22 de
  verdade.
- **Duas camadas de selector, duas falhas diferentes:** um `spec.selector` errado (camada 2) → o
  scrape pool **existe mas está vazio** (0 targets); um label `release: monitoring` ausente
  (camada 1) → o pool **não existe de forma alguma**. `/targets` distingue os dois casos.
- **`endpoints[].port` é um NOME, não um número** — ele precisa casar com uma porta nomeada no
  Service, e é por isso que o Service nomeia sua porta como `web`.
- **Um contador é lido com `rate()`:** `http_requests_total` só sobe; `rate(…[5m])` dá a taxa por
  segundo — o valor bruto raramente é o que você quer.
- **A stack faz scrape da saúde do cluster + nodes por padrão** via `kube-state-metrics` e
  `node-exporter`, cada um com seu próprio ServiceMonitor pré-aplicado.

## Challenge

O Prometheus mostra zero targets para o seu ServiceMonitor mesmo com os Pods do app Ready.
Diagnostique a camada de selector (labels ServiceMonitor→Service versus endpoints/nome da porta),
corrija o match e prove que /targets ou a seleção do ServiceMonitor deixa de estar vazia.

**Difficulty:** Advanced

**Success criteria:** Identifique se o selector do ServiceMonitor erra os labels do Service ou se
o nome da porta não confere, aplique um ServiceMonitor corrigido e comprove pelo menos um target
up ou Endpoints não vazios selecionados para o scrape job.

**Hints:** Compare serviceMonitor.spec.selector com os labels do Service e endpoints.port com a
porta nomeada do Service; use kubectl get servicemonitor,svc,endpoints -n demo.

[Spoiler: solução do challenge](./23-prometheus.solution.md#challenge-solution)

## Verify

Confirme as evidências do Prometheus Operator antes do cleanup.

```bash
kubectl -n demo get deploy,svc,servicemonitor,endpoints -l lab=s23
kubectl -n monitoring get prometheus,servicemonitor | head
```

Esperado: o app e o ServiceMonitor ainda existem para que a seleção de targets possa ser
verificada de novo.

## Cleanup / reset

```bash
# pare quaisquer port-forwards ainda rodando neste shell
kill "$PROM_PF" "$APP_PF" 2>/dev/null; true

# cleanup com escopo — tudo que você adicionou carrega lab: s23
kubectl -n demo delete servicemonitor -l lab=s23 --ignore-not-found
kubectl -n demo delete deploy,svc -l lab=s23 --ignore-not-found
# reset de pânico: remova o Namespace do lab pela UI do seu cluster / destrua o kind — não use aqui uma deleção de ns sem qualificação

# remova a stack inteira
helm uninstall monitoring -n monitoring
# reset de pânico: remova o Namespace do lab pela UI do seu cluster / destrua o kind — não use aqui uma deleção de ns sem qualificação

rm -f app.yaml servicemonitor.yaml

# reset de pânico (kind): jogue o cluster inteiro fora
# kind delete cluster --name monitoring
```

> No caminho **kind**, o reset mais rápido é `kind delete cluster --name monitoring` — o cluster
> era descartável. No caminho **compartilhado**, você não criou nada (read-only), então não há
> nada para limpar.

## Extra (opcional) — veja o operator regenerar a config conforme os Pods mudam

O trabalho inteiro do operator é manter a scrape config em sincronia conforme Pods vêm e vão.
Prove isso: escale o app e observe a contagem de targets em `/targets` acompanhar.

```bash
kubectl -n demo scale deploy/sample-app --replicas=3
kubectl -n demo rollout status deploy/sample-app
# atualize http://localhost:9090/targets
```

## Notas para o facilitador — verifique em uma rodada de ensaio

Este lab foi escrito sem um cluster ao vivo. Confirme estes pontos antes da entrega (eles podem
mudar com as versões do chart/Prometheus):

- **Renderização do pool quebrado em `/targets`** — se um ServiceMonitor que não seleciona nenhum
  Service aparece como `0 / 0 up` ou fica ausente até ter um target vivo. O diagnóstico do Step 4
  se ancora em `kubectl get servicemonitor`/`endpoints`, não na UI, precisamente por causa disso.
- **Descoberta de namespaces** — o break→fix depende do padrão do chart
  `serviceMonitorNamespaceSelector: {}` (todos os namespaces) para que um SM em `demo` seja visto
  pelo Prometheus em `monitoring`. Confirme, ou coloque tudo em um único namespace.
- **Nome do Service do Prometheus** — `monitoring-kube-prometheus-prometheus` depende do nome da
  release; o lab o encontra com `kubectl -n monitoring get svc | grep prometheus`.
- **Tag da image do app** — `quay.io/brancz/prometheus-example-app:v0.6.0` (multi-arch). Confirme
  que ela ainda serve `http_requests_total` em `:8080/metrics`.
- **Labels do resultado PromQL** — a saída de exemplo usa `method="get"` (minúsculas) e uma taxa
  de `~0.66/s`; os valores exatos dependem do timing da carga.
