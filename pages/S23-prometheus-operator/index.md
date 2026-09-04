---
layout: section-cover
image: /covers/section-23-observatory.webp
day: Day 3
section: '23'
tier: recommended
track: Operators
---

# Prometheus Operator

Veja um operator gerenciar um sistema real; aprenda o básico de observabilidade.

**recommended** · sugerido para o Day 3 · trilha Operators

<!--
Seção S23 — Prometheus Operator. Recommended, Day 3, trilha Operators. O padrão operator
do S22 tornado CONCRETO: o S22 ensinou operator = CRD + controller rodando o loop de
reconciliação; aqui um operator real e onipresente (o Prometheus Operator, distribuído no
kube-prometheus-stack) observa CRs ServiceMonitor/PodMonitor e GERA a scrape config do
Prometheus — o padrão exato do S22 na natureza. Tempo: ~30 min de slides + 25 min de lab.
Resultado: os participantes conseguem explicar por que Pods dinâmicos quebram scrape
config escrita à mão, nomear os quatro CRDs chave (Prometheus, ServiceMonitor, PodMonitor,
Alertmanager), afirmar que um ServiceMonitor seleciona um Service por label e o operator o
transforma em scrape config, nomear os quatro golden signals e métricas-vs-logs-vs-traces,
nomear kube-state-metrics + node-exporter como as fontes padrão, ler um ServiceMonitor +
uma query PromQL com rate(), e no lab instalar o kube-prometheus-stack, expor uma app com
/metrics, ligar um ServiceMonitor (quebrá-lo com um selector desencontrado, diagnosticar
no /targets, consertar) e rodar uma query PromQL. Resultado da coda (ADR 0013): relacionar
o OpenTelemetry ao pipeline do Prometheus em nível de conceito — OTLP como o protocolo de
transporte, o collector como um pipeline receive → process → export, traces nomeados e
motivados mas não exercitados.
Beats: problema (dezenas de Pods dinâmicos — editar scrape config na mão não escala) ·
modelo mental (o operator observa ServiceMonitor/PodMonitor → GERA scrape config = S22
tornado concreto, callback explícito) · os quatro CRDs
(Prometheus/ServiceMonitor/PodMonitor/Alertmanager) · os quatro golden signals + métricas
vs logs vs traces · as duas fontes padrão (kube-state-metrics + node-exporter) ·
code-annotated (um ServiceMonitor selecionando um Service por label + porta nomeada) ·
magic-move (ServiceMonitor seleciona o Service → o target aparece no Prometheus → uma
query PromQL retorna dados) · um gostinho de PromQL (rate() sobre um counter) · coda OTel,
2 slides (OTLP + collector como conceitos · traces = a pergunta que métricas não
respondem) · recap → lab.
O tempo da coda é NET-ZERO (ADR 0013 regra 3): os minutos vêm do beat enxugado dos três
pilares no slide de golden signals — a expansão dos pilares mudou-se para cá — não de nova
alocação. sectionTimings S23 permanece [30, 25]; a coda é limitada a seis slides e não
inclui lab, pin nem install (docs/decisions/0013-opentelemetry-scope.md).
Animação: NENHUMA (guardrail: o S23 é "tornado concreto" — magic-move + comparison +
cards). NÃO escreva um componente Vue. O reuso do ReconcileLoop é opcional e não é usado
aqui; o dispositivo de ensino é a geração ServiceMonitor→scrape-config, mostrada nos
slides code-annotated + magic-move.

ACCURACY LOCKS (verificados na web em 2026-07-10):
- App de exemplo: quay.io/brancz/prometheus-example-app — as tags v0.6.0 (mais recente,
  MULTI-ARCH, funciona no kind em Apple Silicon) e v0.5.0 (amd64-only) existem ambas.
  Serve /metrics na porta 8080; expõe o counter `http_requests_total` (mais o histograma
  http_request_duration_seconds e o gauge de versão) e os endpoints / (200) e /err (404).
  A demo de rate() é sobre http_requests_total.
- API group dos CRDs: monitoring.coreos.com. ServiceMonitor/PodMonitor/Prometheus/
  Alertmanager são apiVersion monitoring.coreos.com/v1; CRDs listados como
  servicemonitors.monitoring.coreos.com etc.
- Helm chart: prometheus-community/kube-prometheus-stack (repo
  https://prometheus-community.github.io/helm-charts). Empacota o Prometheus Operator + um
  Prometheus + Alertmanager + Grafana + kube-state-metrics + node-exporter.
- DUAS camadas de selector (NÃO misturar): (1) DISCOVERY Prometheus→ServiceMonitor — o
  Prometheus do chart só adota ServiceMonitors carregando `release: monitoring` por
  default (serviceMonitorSelectorNilUsesHelmValues=true → selector = label release). (2)
  Seleção de TARGET ServiceMonitor→Service — spec.selector.matchLabels escolhe o Service.
  O BREAK deliberado do lab é na camada (2). Um TERCEIRO campo, separado:
  spec.endpoints[].port é um NOME (string) que deve casar com a porta nomeada do Service —
  essa é a PERGUNTA do nome da porta no lab, não o break.

ACCURACY LOCKS DA CODA OTEL (verificados na web em 2026-08-09, opentelemetry.io +
prometheus.io):
- OTLP = o OpenTelemetry Protocol: codificação, transporte e entrega de telemetria entre
  fontes, nós intermediários como collectors, e backends. Transportes: gRPC (porta default
  4317) e HTTP com payloads protobuf (porta default 4318). Os sinais traces/metrics/logs
  são estáveis; profiles está em desenvolvimento. Push-based (a app/SDK exporta), ao
  contrário do pull do Prometheus.
- Collector: agnóstico de vendor; pipeline = receivers → processors → exporters (receive →
  process → export); desacopla o que uma app emite de onde aterrissa; roda como agent ou
  gateway. Nada nos slides nomeia versão, image ou chart de collector — só conceitos,
  então nenhum pin é necessário.
- O Prometheus (v3.x) consegue ingerir nativamente MÉTRICAS OTLP: um receiver opt-in,
  desabilitado por default (--web.enable-otlp-receiver), servindo POST
  /api/v1/otlp/v1/metrics. Só métricas — não traces. Só nas speaker notes, e re-verificar
  contra a stack implantada a cada entrega; os slides não fixam versão (ADR 0013 regra 6).
  Ainda precisa de um produtor instrumentado, então o hands-on fica de fora.
Amarração CKx: observabilidade de CKA/CKAD (métricas, monitoramento) — uma linha no recap.
-->

---
layout: statement
kicker: O problema
---

Você tem **quarenta Pods** espalhados por uma dúzia de Deployments, e eles vêm e vão a cada deploy. Como um sistema de monitoramento sabe **o que raspar (scrape)**?

O Prometheus clássico lê uma **scrape config estática**: uma lista escrita à mão de hosts e portas para consultar em busca de `/metrics`. Isso era ótimo para três servidores com IPs fixos. Mas Pods de Kubernetes são **gado** — são criados, reagendados e destruídos constantemente, e cada um ganha um IP novo. Editar o `prometheus.yml` na mão toda vez que um Deployment escala ou rola é **impossível**, e é o exato oposto de tudo que você aprendeu: você declara *intenção* com labels e deixa um controller fazer a contabilidade. E se o **próprio monitoramento** funcionasse assim?

<!--
Speaker: o beat do "por que se importar". O modelo original do Prometheus é pull-based
sobre uma scrape config ESTÁTICA — um arquivo listando targets (host:porta) para consultar
em /metrics a cada N segundos. Numa frota fixa, tudo bem. No Kubernetes é insustentável:
Pods são efêmeros e ganham IPs novos a cada reagendamento, Deployments escalam para cima e
para baixo, rollouts fazem churn de ReplicaSets. Você não consegue manter uma lista de
targets à mão contra isso. O workshop inteiro ensinou intenção declarativa dirigida por
labels — Services selecionam Pods por label, não por IP; NetworkPolicy permite por label.
Monitoramento não deveria ser diferente: declare "raspe o que quer que esteja atrás DESTE
Service" e deixe algo manter a scrape config em sincronia enquanto os Pods fazem churn.
Esse "algo" é um operator — e é o padrão do S22, empacotado de verdade. A seguir: o modelo
mental, com callback explícito ao S22.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · o padrão operator tornado concreto — um CRD + um controller que você não escreveu</span>

# O operator observa CRs e **gera a scrape config**

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Você declara intenção como um CR" icon="🎯" variant="ok">
      Um <strong>ServiceMonitor</strong> diz <em>"raspe o que quer que esteja atrás do
      Service com estes labels, nesta porta."</em> É só YAML que você aplica com
      <code>kubectl apply</code> — sem host, sem IP, sem <code>prometheus.yml</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="O operator faz a contabilidade" icon="⚙️" variant="ok">
      O <strong>Prometheus Operator</strong> observa ServiceMonitors, resolve os Pods
      atuais atrás de cada Service, e <strong>escreve a scrape config</strong> por você —
      reescrevendo-a toda vez que Pods vêm e vão.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">isto é literalmente o padrão operator</span>

Relembre a equação: **operator = CRD + controller customizado rodando observar → diffar →
agir.** Aqui os **CRDs** são `ServiceMonitor`/`PodMonitor` (a sua intenção) e o
**controller** é o Prometheus Operator. Seu passo de **"agir"** é: *transformar os CRs numa
scrape config viva do Prometheus.* Você conheceu o padrão antes com um `Backup`
ilustrativo; este é o mesmo padrão, **empacotado e rodando em produção em todo lugar.**

</div>

</div>

<!--
Speaker: O slide que carrega o peso, e o callback explícito ao S22 que a história exige.
Diga: S22 = operator é um CRD (estende a API) + um controller (roda
observar→diffar→agir). Agora nomeie a instância concreta. O CRD que você vai usar é o
ServiceMonitor: um YAML pequeno que expressa INTENÇÃO de monitoramento — "raspe os
endpoints de qualquer Service que case com estes labels, nesta porta nomeada, neste path".
O controller é o Prometheus Operator. Seu loop de reconciliação observa ServiceMonitors (e
PodMonitors, objetos Prometheus, Alertmanager), descobre o conjunto atual de endpoints de
Pods atrás de cada Service selecionado, e GERA/atualiza a configuração de scrape do
Prometheus — a coisa que você costumava editar à mão. Conforme os Pods fazem churn, o
operator mantém essa config atual. Esse é o passo de "agir": CRs entram, scrape config
sai. Ninguém edita o prometheus.yml. O lab faz você sentir: aplique um ServiceMonitor,
veja um target aparecer no Prometheus. A seguir: nomear os quatro CRDs que este operator
dá a você.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">A API que o operator adiciona · quatro kinds em monitoring.coreos.com</span>

# Quatro CRDs: `Prometheus`, `ServiceMonitor`, `PodMonitor`, `Alertmanager`

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.7rem;">
  <v-click at="1">
    <KwCard heading="Prometheus" kind="crd" variant="ok">
      Declara um <strong>servidor Prometheus</strong> — réplicas, retenção, quais monitors
      adotar. O operator o transforma num <code>StatefulSet</code> rodando. <em>Estado
      desejado para o próprio servidor.</em>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="ServiceMonitor" kind="crd" variant="ok">
      Targets de scrape <strong>via um Service</strong> — selecione o Service por label,
      nomeie sua porta de métricas. O operator o resolve para os
      <strong>endpoints</strong> do Service. <em>O que você vai usar no lab.</em>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="PodMonitor" kind="crd" variant="ok">
      Raspa Pods <strong>diretamente</strong> por label de Pod — sem precisar de Service.
      A mesma ideia, uma camada abaixo, para workloads que não ficam atrás de um Service.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Alertmanager" kind="crd" variant="ok">
      Declara um deployment de <strong>Alertmanager</strong> que roteia e deduplica alertas
      (e-mail, chat, pager). Pareado com CRs <code>PrometheusRule</code> que definem as
      expressões dos alertas.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
Confirme que estão instalados com <code>kubectl get crd | grep monitoring.coreos.com</code> —
todos são <code>monitoring.coreos.com/v1</code>.
</div>

</div>

<!--
Speaker: a chamada dos CRDs — estes são os novos kinds que o operator registra (todos no
group monitoring.coreos.com, versão v1). Prometheus: um SERVIDOR Prometheus declarativo —
você não roda um Deployment você mesmo, você declara um objeto Prometheus (réplicas,
retenção, storage, e um selector para quais ServiceMonitors ele adota) e o operator
materializa um StatefulSet. ServiceMonitor: a estrela do lab — discovery de targets
ATRAVÉS de um Service: selecione o Service por label, nomeie sua porta de métricas, e o
operator raspa os Endpoints do Service (ou seja, os Pods atuais). PodMonitor: igual, mas
seleciona Pods diretamente (para coisas que não estão atrás de um Service). Alertmanager:
um Alertmanager declarativo para roteamento/dedup/silenciamento de alertas, alimentado por
objetos PrometheusRule (as expressões dos alertas). Existem mais (Probe, ThanosRuler,
PrometheusRule), mas estes quatro são a espinha dorsal. A linha de verificação — kubectl
get crd | grep monitoring.coreos.com — é a primeira coisa que o lab checa. A seguir: o que
você deveria sequer medir? Os golden signals.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">O que medir · os quatro golden signals</span>

# Latência · Tráfego · Erros · Saturação

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem;">
  <v-click at="1">
    <KwCard heading="Latência" icon="⏱️" variant="ok">
      Quanto <strong>tempo</strong> as requisições levam — e olhe a <em>cauda</em>
      (p95/p99), não só a média. Lento também é um modo de falha.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Tráfego" icon="📈" variant="ok">
      <strong>Quanta</strong> demanda — requisições/s, queries/s. O denominador de quase
      todo o resto.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Erros" icon="❌" variant="ok">
      A <strong>taxa de falhas</strong> — HTTP 5xx, timeouts, respostas erradas. Muitas
      vezes expressa como fração do tráfego.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Saturação" icon="🌡️" variant="ok">
      Quão <strong>cheio</strong> o sistema está — CPU, memória, profundidade de fila. O
      indicador antecipado dos outros três indo mal.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-4 text-sm">

<span class="kw-kicker">métricas ≠ logs ≠ traces — os três pilares</span>

**Métricas** são séries temporais numéricas baratas — *"quantos, quão rápido, quão cheio"*
(isto é o Prometheus). **Logs** são eventos de texto discretos; **traces** seguem **uma
requisição** através dos serviços. O Prometheus é dono do pilar de **métricas** — como os
*outros* sinais viajam é a coda de fechamento desta seção.

</div>

</div>

<!--
Speaker: o beat do "o que eu sequer observo". Os quatro golden signals (do Google SRE) são
o checklist inicial para qualquer serviço: LATÊNCIA (quanto tempo — e sempre olhe a cauda,
p95/p99, uma média esconde a dor); TRÁFEGO (quanta demanda — req/s, o denominador das
taxas); ERROS (taxa de falhas — 5xx, timeouts, respostas ruins); SATURAÇÃO (quão cheio —
CPU/mem/fila, o indicador antecipado de que os outros três estão prestes a degradar). Se
você instrumentar só esses quatro já tem a maior parte do valor. Depois nomeie os três
pilares numa SÓ RESPIRADA — métricas (séries temporais numéricas, Prometheus), logs
(eventos discretos), traces (uma requisição através dos serviços) — complementares, não
concorrentes. NÃO expanda logs/traces aqui: a coda de fechamento da seção gasta esses
minutos em como os outros sinais viajam (OTLP, o collector) e no que traces compram para
você. A seguir: de onde vêm as métricas de todo o cluster.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">As duas fontes padrão · o que a stack raspa de fábrica</span>

# `kube-state-metrics` + `node-exporter`

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="kube-state-metrics" icon="📊" variant="ok">
      Escuta o <strong>API server</strong> e expõe o <strong>estado dos objetos
      Kubernetes</strong> como métricas: quantas réplicas de Deployment estão desejadas vs
      prontas, fase do Pod, sucesso de Job, status de PVC. <em>Responde "o que o cluster
      acha que tem?"</em>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="node-exporter" icon="🖥️" variant="ok">
      Um <code>DaemonSet</code> — um Pod por <strong>node</strong> — expondo métricas do
      <strong>host</strong>: CPU, memória, disco, filesystem, rede. <em>Responde "como as
      máquinas em si estão indo?"</em> (o sinal de saturação para os nodes.)
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm kw-muted">

Ambos vêm <strong>dentro</strong> do <code>kube-prometheus-stack</code>, cada um já ligado
com seu próprio ServiceMonitor. Então no momento em que a stack é instalada você já está
raspando a saúde do cluster + dos nodes — <strong>antes</strong> de adicionar uma única
app. No lab você adiciona por cima o ServiceMonitor da <em>sua</em> app.

</div>

</div>

<!--
Speaker: as duas fontes que todo setup de Prometheus em k8s inclui, e a distinção que as
pessoas misturam. kube-state-metrics (KSM): um Deployment que OBSERVA o API server e
transforma o estado dos OBJETOS Kubernetes em métricas — kube_deployment_status_replicas,
kube_pod_status_phase, kube_job_* etc. NÃO é sobre CPU de node; é "o que o control plane
acha que existe e em que estado". node-exporter: um DaemonSet (um Pod por node) expondo as
métricas do próprio HOST — CPU, memória, disco, filesystem, rede — ou seja, o sinal de
saturação em nível de máquina. Regra de bolso: KSM = estado de cluster/objetos,
node-exporter = estado de máquina/SO; você precisa dos dois. A recompensa: o
kube-prometheus-stack traz AMBOS, cada um com seu próprio ServiceMonitor já aplicado,
então uma instalação fresca já está raspando a saúde do cluster + dos nodes com zero
config. Seu trabalho no lab é adicionar UM ServiceMonitor a mais para a sua própria app —
que é exatamente a tarefa do dia a dia. A seguir: como esse ServiceMonitor se parece,
campo a campo.
-->

---
layout: code-annotated
heading: 'Um ServiceMonitor: selecione um Service, nomeie sua porta de métricas'
compact: true
lab: labs/day-3/23-prometheus.md
---

```yaml {none|4-6|7-9|10-13|all}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  labels:
    release: monitoring        # (1) para ESTE Prometheus adotar o monitor
spec:
  selector:
    matchLabels:
      app: sample-app          # (2) escolhe o Service por label
  endpoints:
    - port: web                # (3) a porta NOMEADA do Service (uma string)
      path: /metrics
```

::notes::

<CodeNote at="1" label="labels.release — discovery" variant="warn">
O Prometheus da stack só adota ServiceMonitors carregando <code>release: monitoring</code>
(seu <code>serviceMonitorSelector</code>). Esqueça isto e o monitor é <strong>ignorado por
completo</strong> — uma falha diferente da de baixo.
</CodeNote>

<CodeNote at="2" label="spec.selector — seleção de target" variant="ok">
<code>matchLabels</code> seleciona o <strong>Service</strong> (não os Pods) pelos labels
dele. O operator então raspa os <strong>endpoints</strong> desse Service — os Pods vivos
atrás dele.
</CodeNote>

<CodeNote at="3" label="endpoints[].port — um NOME" variant="warn">
<code>port</code> é o <strong>nome</strong> da porta do Service (<code>web</code>), uma
string — nunca um número. Ele deve casar com um <code>name:</code> nas <code>ports</code>
do Service.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
Duas camadas de selector, um campo string — e o lab quebra exatamente uma delas para você
ver como cada uma falha.
</div>

<!--
Speaker: a anatomia da qual o lab inteiro depende — e os três campos são TRÊS COISAS
DIFERENTES, diga isso explicitamente. (1) metadata.labels.release: monitoring — esta é a
camada de DISCOVERY: o Prometheus do kube-prometheus-stack é configurado
(serviceMonitorSelectorNilUsesHelmValues=true) para só pegar ServiceMonitors carregando o
label release. Omita e o Prometheus nunca sequer olha para o seu monitor — ele fica
inerte, como um CRD sem controller observando. (2) spec.selector.matchLabels — a camada de
SELEÇÃO DE TARGET: isto seleciona o SERVICE (pelos labels do Service), e o operator raspa
os Endpoints desse Service (os Pods atuais). (3) spec.endpoints[].port: web — uma porta
NOMEADA, uma STRING, que deve casar com uma porta nomeada no Service. Não um número. É por
isso que o Service precisa dar um nome à sua porta. O lab quebra deliberadamente a camada
(2) — um selector que não casa com Service nenhum — e faz a pergunta do nome da porta
separadamente. Não os funda. A seguir: vê-lo ganhar vida em três frames.
-->

---
layout: code-walkthrough
heading: 'De um CR a um target vivo a uma resposta, em três frames'
lab: labs/day-3/23-prometheus.md
---

````md magic-move
```yaml
# 1 — O SERVICE: dê um NOME à porta de métricas
apiVersion: v1
kind: Service
metadata:
  name: sample-app
  labels:
    app: sample-app
spec:
  selector:
    app: sample-app
  ports:
    - name: web            # ← o nome que o ServiceMonitor referencia
      port: 8080
      targetPort: 8080
```

```yaml
# 2 — O SERVICEMONITOR: intenção — "raspe o /metrics desse Service na porta 'web'"
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app
  labels:
    release: monitoring    # descoberto por este Prometheus
spec:
  selector:
    matchLabels:
      app: sample-app      # escolhe o Service acima
  endpoints:
    - port: web            # casa com a porta NOMEADA do Service
      path: /metrics
```

```text
# 3 — O OPERATOR gerou a scrape config; o target agora está UP.
#     Faça ao Prometheus uma pergunta sobre a métrica raspada:
rate(http_requests_total[5m])

#   → taxa de requisições por segundo, média sobre 5 minutos, por série:
#   {job="sample-app", code="200", method="get"}   4.73
#   {job="sample-app", code="404", method="get"}   0.20
```
````

<!--
Speaker: o arco da recompensa, três frames. Frame 1: o Service — a ÚNICA coisa especial é
que sua porta de métricas tem um NOME (name: web). Esse nome é o contrato que o
ServiceMonitor referencia. Frame 2: o ServiceMonitor — intenção pura: label release para
este Prometheus adotá-lo, selector escolhe o Service por app=sample-app, endpoints.port:
web referencia a porta nomeada, path /metrics. Você aplica esses dois objetos e não toca
em mais nada — nenhum prometheus.yml. Frame 3: o que aconteceu sem você — o operator viu o
ServiceMonitor, resolveu os endpoints do Service, ESCREVEU a scrape config, e o Prometheus
começou a raspar; o target aparece UP em /targets. Agora você pode consultar a métrica
raspada: rate(http_requests_total[5m]) = a taxa de requisições por segundo, média sobre
uma janela de 5 minutos, uma série de resultado por combinação de labels (status code,
method). Esse é o loop: CR entra → target UP → dados saem. O lab faz exatamente isto, mas
quebra o selector do frame 2 primeiro para você diagnosticar em /targets. A seguir: ler
esse PromQL direito.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Um gostinho de PromQL · transforme um counter cru numa taxa</span>

# `rate(http_requests_total[5m])`

<div class="mt-3 text-sm">

```text
rate(http_requests_total{code="200"}[5m])
```

</div>

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="http_requests_total é um COUNTER" icon="🔢" variant="ok">
      Ele só <strong>sobe</strong> (até o processo reiniciar). O valor cru —
      <em>"12.904 requisições desde o boot"</em> — quase nunca é o que você quer plotar ou
      usar em alerta.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="rate(…[5m]) o torna útil" icon="📉" variant="ok">
      <code>rate</code> dá o <strong>aumento por segundo</strong> sobre a janela móvel de
      <strong>5 minutos</strong> — <em>"~4,7 requisições/s agora"</em> — e trata os
      <strong>resets</strong> do counter por você.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

O `{code="200"}` dentro das chaves é um **filtro de label** — o PromQL seleciona séries
temporais por label, exatamente como todo o resto no Kubernetes seleciona por label.
Embrulhe isso em `sum(rate(...))` e você agregou através de todos os Pods. **Tráfego**
(golden signal nº 2) numa linha — e erros é a mesma query com `code=~"5.."`.

</div>

</div>

<!--
Speaker: desmistifique a única query que o lab roda. http_requests_total é um COUNTER — um
total monotonicamente crescente (requisições desde que o processo iniciou). Seu valor cru
é quase inútil: "12.904 no total" não diz nada sobre o agora. rate(counter[5m]) é o cavalo
de batalha: ele calcula o aumento médio por SEGUNDO sobre a janela móvel de 5 minutos, e
crucialmente ele é ciente de resets — quando um Pod reinicia e o counter cai para 0, o
rate() não reporta um pico negativo enorme. {code="200"} é um label matcher — PromQL é uma
linguagem de seleção por label, o mesmo pensamento de labels de Services e NetworkPolicy,
aplicado a séries temporais. Aterrisse a amarração com os golden signals:
sum(rate(http_requests_total[5m])) = tráfego total (sinal 2); o mesmo com code=~"5.."
sobre o total = a taxa de erros (sinal 3). Uma função transforma um counter sem graça nos
dois sinais mais importantes. Esta é a query que o participante roda contra a própria app
no lab. A seguir: a coda prometida — como os OUTROS sinais viajam. Dois slides, só
conceitos, depois o recap.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Coda · "usamos OpenTelemetry no trabalho — como isso se relaciona?"</span>

# OpenTelemetry: um protocolo de transporte, uma forma de pipeline

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="OTLP — o protocolo de transporte" icon="🔌" variant="ok">
      O <strong>OpenTelemetry</strong> é o padrão aberto e neutro de vendor para emitir
      telemetria, e o <strong>OTLP</strong> é o <strong>protocolo de transporte</strong> no
      qual o ecossistema convergiu — um formato que carrega sinais das apps rumo a
      <em>qualquer</em> backend.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="O collector — uma forma de pipeline" icon="🔀" variant="ok">
      Um <strong>collector</strong> é um pipeline: <strong>receive → process →
      export</strong>. Ele <strong>desacopla</strong> o que sua app emite de onde
      aterrissa — troque o backend editando o pipeline, nunca a app.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm kw-muted">

Nada para instalar hoje — isto é um **mapa**, não um lab. Seu pipeline de **pull**
(ServiceMonitor → scrape) e um pipeline de **push** OTLP são duas formas que podem alimentar
o **mesmo tipo de armazenamento**.

</div>

</div>

<!--
Speaker: a coda que o slide dos pilares prometeu — calibrada para o participante que já
roda OTel no trabalho e quer posicioná-lo no mapa de hoje. Dois conceitos, nenhuma
instalação. (1) OpenTelemetry é o padrão aberto neutro de vendor para emitir telemetria, e
OTLP é seu protocolo de transporte — a codificação e o transporte que movem telemetria das
fontes através de intermediários até os backends (gRPC ou HTTP/protobuf no fio; os sinais
estáveis são traces, métricas e logs). A convergência é o ponto: um protocolo em vez de um
agente por vendor. (2) O collector é uma FORMA de pipeline — receivers recebem dados,
processors fazem batch/filtro/transformação, exporters mandam adiante. Essa forma
desacopla a emissão do destino: reaponte o exporter, não redeploye nada. Contraste com
hoje: o Prometheus faz PULL via a scrape config que o operator gera; OTLP é um PUSH do SDK
da app. Duas formas de pipeline, mesma ideia de destino — aliás, um Prometheus atual
consegue ingerir métricas OTLP nativamente (um receiver opt-in, desligado por default;
verifique a stack implantada a cada entrega — nenhuma versão prometida no slide). Ainda
precisa de um produtor instrumentado, que é o ponto do próximo slide. A seguir: o sinal
que métricas não conseguem dar.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Coda · a pergunta que métricas não respondem</span>

# Traces: **qual** requisição foi lenta — e **onde**

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Métricas agregam" icon="📉" variant="ok">
      O <code>rate()</code> disse <em>"~4,7 req/s e a latência p99 subiu."</em> Médias e
      quantis sobre <strong>todas</strong> as requisições — nenhuma requisição
      <strong>individual</strong> à vista.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Um trace segue UMA requisição" icon="🧵" variant="ok">
      Através de <strong>todo serviço que ela toca</strong>, registrando onde o tempo foi —
      o sinal para <em>"esta requisição específica foi lenta: qual salto?"</em>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

Produzir traces significa **instrumentar a app** — mudanças de código, não só YAML — e é
por isso que eles são **nomeados aqui, não executados**. O Prometheus Operator continua
sendo a espinha hands-on desta seção; o OpenTelemetry **estende** o que você construiu
hoje, não o substitui.

</div>

</div>

<!--
Speaker: nomeie e motive traces sem fingir ensiná-los. Métricas são agregados: rate() e
quantis de histograma resumem TODAS as requisições — perfeitos para dashboards e alertas,
estruturalmente incapazes de mostrar UMA requisição. Um trace é o complemento: a jornada
de uma requisição através de todo serviço que ela toca, cada salto cronometrado, de modo
que "o checkout está lento" vira "a chamada de pagamento dentro do checkout está lenta".
Por que não tem lab: traces não existem até a APP emiti-los — um SDK no código ou um agent
injetado — e instrumentar a app de demo é uma preocupação diferente de operar workloads,
então fica fora de escopo por decisão (ADR 0013: sem instalação de collector, sem backend
de traces, sem pin). Feche o quadro: o OTel ESTENDE a observabilidade que você construiu
hoje — mais um pipeline que pode alimentar o mesmo tipo de armazenamento — ele não
substitui o operator, o ServiceMonitor nem o PromQL. A seguir: recap da seção inteira,
depois o lab.
-->

---
layout: recap
compact: true
heading: 'Recap — declare a intenção de monitoramento; deixe o operator escrever a config'
story: 'Editar scrape config na mão contra Pods efêmeros é impossível. Então o monitoramento virou declarativo: você aplica um CR ServiceMonitor que seleciona um Service por label e nomeia sua porta de métricas, e o Prometheus Operator — o padrão operator empacotado de verdade — o observa e gera a scrape config. O target aparece no Prometheus, e uma query rate() transforma o counter raspado numa taxa de requisições ao vivo.'
next: 'Operator dev 101 — você USOU operators (cert-manager, Prometheus); agora espie como construir um com kubebuilder'
---

- **O problema:** Pods efêmeros tornam a **scrape config estática** insustentável — o
  monitoramento precisa ser **declarativo e dirigido por labels**, como todo o resto no
  Kubernetes
- **O padrão operator tornado concreto:** o **Prometheus Operator** observa CRs
  `ServiceMonitor`/`PodMonitor` e **gera a scrape config** — CRD + controller, exatamente a
  equação do operator
- **Quatro CRDs** em `monitoring.coreos.com/v1`: **`Prometheus`** (o servidor),
  **`ServiceMonitor`** (targets via um Service), **`PodMonitor`** (targets por Pod),
  **`Alertmanager`** (roteamento de alertas)
- **O que observar:** os **quatro golden signals** — latência, tráfego, erros, saturação; e
  **métricas ≠ logs ≠ traces** — o Prometheus é dono do pilar de **métricas**
- **Fontes padrão:** **`kube-state-metrics`** (estado dos objetos) + **`node-exporter`**
  (métricas do host), ambos entregues e ligados pela stack
- **Um ServiceMonitor** seleciona o **Service por label** e nomeia sua **porta de métricas**
  (um **nome**, não um número); **`rate(counter[5m])`** transforma um counter cru numa taxa
  por segundo
- **A coda:** **OpenTelemetry** — **OTLP** é o protocolo de transporte, um **collector** é
  um pipeline **receive → process → export**, e **traces** respondem *qual* requisição foi
  lenta — só conceitos, nada instalado
- **Amarração CKx:** **observabilidade** de CKA/CKAD (métricas, monitoramento) — *como* o
  cluster é raspado é a habilidade relevante para o exame

<!--
Speaker: feche o laço e aponte para frente. O problema: você não consegue manter scrape
config à mão contra Pods efêmeros, então o monitoramento teve de virar declarativo e
dirigido por labels como o resto do Kubernetes. A resposta: o Prometheus Operator — o
padrão CRD+controller do S22 empacotado de verdade — observa CRs ServiceMonitor/PodMonitor
e GERA a scrape config. Fatos para deixar com eles: os quatro CRDs (Prometheus = o
servidor, ServiceMonitor = targets via um Service, PodMonitor = via Pods, Alertmanager =
roteamento de alertas); os quatro golden signals (latência/tráfego/erros/saturação) e a
divisão métricas/logs/traces (Prometheus = métricas); as duas fontes padrão
(kube-state-metrics para estado de objetos, node-exporter para estado do host); e a
mecânica do ServiceMonitor — selecionar o Service por label, nomear a porta de métricas
(um NOME), e rate() para ler um counter como taxa. Uma linha sobre a coda: o OpenTelemetry
se relaciona via OTLP (o protocolo de transporte) e o collector (receive → process →
export) — traces foram nomeados, não executados, e nada foi instalado. Passe para o Lab
23: instalar o kube-prometheus-stack, expor uma app em /metrics, ligar um ServiceMonitor,
quebrá-lo com um selector desencontrado e diagnosticar na página /targets, consertar,
então rodar rate(http_requests_total). Adiante para o S24: você agora USOU dois operators
— a seguir, uma espiada em como construir um.
-->

---
layout: lab
lab: labs/day-3/23-prometheus.md
duration: 25 min
env: 'kind ✓ (self-install) / namespace: read-only'
---

## Lab 23 — Raspe a sua app

- Instale o **`kube-prometheus-stack`** (Helm); confirme o operator + os CRDs (`kubectl get crd | grep monitoring.coreos.com`)
- Faça o deploy de uma app expondo **`/metrics`** numa porta **nomeada**; aplique um **`ServiceMonitor`** selecionando seu Service por label
- **Quebre:** um **selector desencontrado** → nenhum target aparece; diagnostique na página **`/targets`** do Prometheus (`port-forward`)
- **Conserte:** case o selector com os labels do Service → o target vai a **UP**
- Gere carga, depois rode **`rate(http_requests_total[5m])`** e leia o resultado
