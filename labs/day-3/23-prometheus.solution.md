# Lab 23 — Prometheus Operator (S23) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 0 — um cluster com a stack

### Caminho kind (faça este)

```bash
kind create cluster --name monitoring
kubectl get nodes
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get nodes
NAME                       STATUS   ROLES           AGE   VERSION
monitoring-control-plane   Ready    control-plane   40s   v1.3x.x
```

Um cluster kind de um node só é mais que suficiente para este lab. A stack que você instala em
seguida roda o Prometheus Operator mais um Prometheus pequeno, Grafana, kube-state-metrics e
node-exporter.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ helm list -n monitoring
NAME        NAMESPACE   REVISION  STATUS    CHART                          APP VERSION
monitoring  monitoring  1         deployed  kube-prometheus-stack-xx.x.x   v0.xx.x

$ kubectl get pods -n monitoring
NAME                                                     READY   STATUS    RESTARTS   AGE
monitoring-kube-prometheus-operator-xxxxxxxxx-xxxxx      1/1     Running   0          2m
prometheus-monitoring-kube-prometheus-prometheus-0       2/2     Running   0          2m
alertmanager-monitoring-kube-prometheus-alertmanager-0   2/2     Running   0          2m
monitoring-grafana-xxxxxxxxxxx-xxxxx                      3/3     Running   0          2m
monitoring-kube-state-metrics-xxxxxxxxx-xxxxx            1/1     Running   0          2m
monitoring-prometheus-node-exporter-xxxxx                1/1     Running   0          2m
```

O Pod do **operator** é o controller; `prometheus-…-0` é o **StatefulSet** do Prometheus que o
operator criou a partir de um CR `Prometheus`. `kube-state-metrics` e `node-exporter` são as duas
fontes padrão — cada uma já tem seu próprio ServiceMonitor, então a stack faz scrape da saúde do
cluster + nodes antes de você adicionar qualquer coisa.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
alertmanagers.monitoring.coreos.com              2026-...
podmonitors.monitoring.coreos.com                2026-...
probes.monitoring.coreos.com                     2026-...
prometheuses.monitoring.coreos.com               2026-...
prometheusrules.monitoring.coreos.com            2026-...
servicemonitors.monitoring.coreos.com            2026-...
thanosrulers.monitoring.coreos.com               2026-...
```

Estes são os CRDs dos slides (`servicemonitors`, `podmonitors`, `prometheuses`, `alertmanagers`,
mais alguns outros). Todos são do grupo `monitoring.coreos.com` — esta é a API que o operator
adicionou. `kubectl get servicemonitor -A` agora funciona exatamente como `kubectl get pod`.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ curl -s http://localhost:8080/metrics | grep '^http_requests_total'
http_requests_total{code="200",method="get"} 1
```

O app expõe `http_requests_total` (um **contador**), com labels de `code` e `method` HTTP. Neste
momento a contagem é minúscula — esse curl para `/metrics` não atinge o handler `/` que é contado.
Você vai gerar tráfego real no Step 6 antes de fazer a query. A porta do Service é **nomeada**
`web`, e `targetPort: web` aponta para a porta nomeada do container — a cadeia inteira é por nome.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n demo get servicemonitor
NAME         AGE
sample-app   10s
```

O objeto aplica sem problemas — o API server nunca valida se o selector casa com alguma coisa
(exatamente como um Service com um selector que não casa com nenhum Pod também aplica sem erro).
O operator o adota (a camada 1 está correta), mas resolve **zero** Services (a camada 2 está
errada), então gera um scrape job **sem targets**. Nada avisa você na linha de comando; o
diagnóstico é feito no Prometheus.
</details>

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

<details><summary>Solução / saída esperada</summary>

Em `/targets`, os pools embutidos (`node-exporter`, `kube-state-metrics`, `apiserver`, …) estão
**UP**, mas **nosso app não aparece como UP em lugar nenhum**. Você deve ver o scrape pool do
nosso monitor **sem nenhum target ativo**:

```text
serviceMonitor/demo/sample-app/0 (0 / 0 up)
```

O operator adotou o ServiceMonitor (a camada 1 está correta), mas não encontrou **nenhum Service**
com `app: sample-APP-typo`, então produziu um scrape job com uma **lista de targets vazia**.

> A renderização exata em `/targets` — se o pool aparece como "0 / 0 up" ou nem é listado até ter
> um target vivo — **varia conforme o build do Prometheus**. Não ancore seu diagnóstico nisso;
> ancore-o no fato determinístico abaixo. Confirme o texto exato em uma rodada de ensaio.
</details>

**Pergunta:** o ServiceMonitor foi aplicado sem erro e o operator o adotou, mas o app nunca
aparece **UP**. Onde está a falha — e em que essa falha difere de *esquecer* o label
`release: monitoring`?

<details><summary>Resposta</summary>

A falha está na **camada (2): seleção ServiceMonitor → Service.** O objeto foi aplicado sem
problemas (`kubectl -n demo get servicemonitor` o lista), então o problema não é sintaxe nem
descoberta — é que o `spec.selector.matchLabels` (`app: sample-APP-typo`) não casa com **nenhum
Service**, então o operator não tem endpoints para o scrape e o target nunca fica **UP**. Essa é
uma camada diferente da **descoberta**: se você tivesse removido o `release: monitoring`, o
Prometheus da stack **nunca adotaria o monitor** — nenhum scrape job seria gerado para ele, então
não haveria absolutamente nada em `/targets` a seu respeito.

A forma confiável de distingui-los (independente das peculiaridades da UI de `/targets`):

- **`spec.selector` errado (esta quebra):** o SM é adotado mas não seleciona nenhum Service → um
  scrape job **sem target vivo**. Confira com `kubectl -n demo get endpoints sample-app` (o
  Service *tem* endpoints) versus o selector do SM — eles não casam.
- **Label `release` ausente:** o SM **nunca é adotado** → nenhum scrape job. Confira confirmando
  que o label está ausente em `kubectl -n demo get servicemonitor sample-app -o yaml`.

Regra de debugging: **adotado-mas-sem-target → conserte o selector ServiceMonitor→Service;
não-adotado → conserte o label de descoberta** (ou o `serviceMonitorSelector` do Prometheus).
</details>

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

<details><summary>Solução / saída esperada</summary>

Dentro de um ciclo de reload, o pool passa a ter um target vivo:

```text
serviceMonitor/demo/sample-app/0 (1 / 1 up)
  Endpoint                          State   Labels
  http://10.244.x.x:8080/metrics    UP      job="sample-app" ...
```

O operator viu o ServiceMonitor editado, resolveu `app: sample-app` para o Service `sample-app`,
consultou os **endpoints** desse Service (o Pod em execução) e escreveu um scrape job apontando
para o `:8080/metrics` do Pod. **Você nunca tocou no `prometheus.yml`.** Se ainda estiver 0/0, dê
mais um ciclo de reload ou confirme que o nome `port: web` casa com o nome da porta do Service
(veja a próxima pergunta).
</details>

**Pergunta (obrigatória):** por que o `endpoints[].port` do ServiceMonitor precisa ser `web` (um
**nome**), e não `8080` (um número)?

<details><summary>Resposta</summary>

Porque o campo é definido como o **nome de uma porta no Service**, não como um número de porta
bruto. Um Service do Kubernetes pode expor várias portas nomeadas, e o mesmo número de porta pode
aparecer sob nomes diferentes em Services diferentes — por isso o ServiceMonitor referencia uma
porta pelo **nome estável** (`web`) que o Service atribui a ela. O operator consulta o
`spec.ports[]` do Service, encontra a entrada cujo `name` é `web` e faz o scrape dela. É
exatamente por isso que o Service do Step 2 dá à sua porta `name: web`. Se você escrever um
**número** ali, o operator não consegue casá-lo com uma porta nomeada e o target não aparece —
uma falha sutil que se parece muito com a quebra do Step 4. (O `PodMonitor` é diferente — ele
aceita um número bruto de `targetPort` — mas `ServiceMonitor.endpoints[].port` é um **nome**.)
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
{
    "status": "success",
    "data": {
        "resultType": "vector",
        "result": [
            {
                "metric": {
                    "__name__": "http_requests_total",
                    "code": "200",
                    "method": "get",
                    "job": "sample-app",
                    "namespace": "demo",
                    "pod": "sample-app-xxxxxxxxx-xxxxx"
                },
                "value": [ 1718000000, "0.66" ]
            }
        ]
    }
}
```

O `value` é `[timestamp, "<taxa por segundo>"]` — aqui **~0.66 requests/seg** para `code="200"`,
na média dos últimos 5 minutos (200 requests espalhados pela janela). O contador bruto
(`http_requests_total`) só sobe; **`rate(counter[5m])`** o transforma na taxa por segundo, que é
o útil, e lida com resets do contador. Adicione `sum(rate(http_requests_total[5m]))` para obter o
**tráfego** total entre todos os Pods — o golden signal nº 2 em uma linha. (O número exato depende
do timing; qualquer taxa diferente de zero prova que o caminho scrape → query funciona.)
</details>

## Extra (opcional) — veja o operator regenerar a config conforme os Pods mudam

O trabalho inteiro do operator é manter a scrape config em sincronia conforme Pods vêm e vão.
Prove isso: escale o app e observe a contagem de targets em `/targets` acompanhar.

```bash
kubectl -n demo scale deploy/sample-app --replicas=3
kubectl -n demo rollout status deploy/sample-app
# atualize http://localhost:9090/targets
```

<details><summary>O que você deve ver</summary>

O pool `serviceMonitor/demo/sample-app/0` cresce de **1/1 up** para **3/3 up** — um target por
endpoint de Pod — **sem** nenhuma mudança em ServiceMonitor algum e **sem** config editada à mão.
Você mudou a contagem de réplicas do Deployment; os endpoints do Service mudaram; o operator
percebeu e regenerou a scrape config. Esse é o loop de reconciliação do S22/S03 rodando por baixo
do monitoramento:

```text
serviceMonitor/demo/sample-app/0 (3 / 3 up)
```

Volte com `kubectl -n demo scale deploy/sample-app --replicas=1` e o pool encolhe para 1/1. É
exatamente por isso que uma scrape config estática não sobrevive ao Kubernetes — e por isso o
operator existe.
</details>

## Expected state / output

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

Os status representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de
RBAC, histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do
Prometheus — compare o significado, não os nomes efêmeros.

## Explanation

O Prometheus Operator transforma objetos ServiceMonitor em scrape config. Dois selectors
independentes precisam ambos casar: quais Services o monitor seleciona e qual porta nomeada
recebe o scrape. A falha em qualquer uma das camadas causa uma lista de targets vazia mesmo
quando os Pods estão Ready.

Os passos guiados acima provam o comportamento do control plane para esta seção; leia os Events e
os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de corrigir
o campo quebrado, ou delete apenas os objetos com label a partir de Cleanup / reset e reinicie a
guided task. Prefira os Events de `kubectl describe` a chutar. Não rode deletes amplos no
cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl -n demo get svc,endpoints,servicemonitor -l lab=s23 -o wide
kubectl -n demo get servicemonitor sample-app -o yaml | sed -n '/selector:/,/endpoints:/p'
# conserte o selector/labels para casar com o Service, depois:
kubectl -n demo apply -f servicemonitor.yaml
kubectl -n demo get endpoints -l lab=s23
```

### Expected state / output

Antes do conserto, o scrape pool está ausente ou em 0/0. Depois do alinhamento de
selector/porta, os Endpoints são populados e o Prometheus lista um target up para o app.

### Explanation

O Prometheus Operator transforma objetos ServiceMonitor em scrape config. Dois selectors
independentes precisam ambos casar: quais Services o monitor seleciona e qual porta nomeada
recebe o scrape. A falha em qualquer uma das camadas causa uma lista de targets vazia mesmo
quando os Pods estão Ready.

### Hints

Compare serviceMonitor.spec.selector com os labels do Service e endpoints.port com a
porta nomeada do Service; use kubectl get servicemonitor,svc,endpoints -n demo.
