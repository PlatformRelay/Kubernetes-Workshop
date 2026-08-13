---
layout: section-cover
image: /covers/section-16-elastic-herd.webp
day: Day 2
section: '16'
tier: optional
track: Workloads
---

# Autoscaling (HPA)

Deixe o **rebanho** crescer e encolher com a demanda.

**optional** · sugerido para o Day 2 · trilha Workloads

<!--
Seção S16 — Autoscaling (HPA). Tempo: ~20 min de slides + 20 min de lab. Fecha o Day 2 (última
seção, tier optional). Vem depois do S15. Trilha Workloads.
Animação: HpaScaling.vue (nova, autocontida). DESVIO do "reuse a animação do rebanho em rolling,
escalada por carga" do outline — RollingUpdate.vue modela SUBSTITUIÇÃO de pods (o RS antigo drena
enquanto o novo enche), não uma mudança de CONTAGEM dirigida por métrica, então não serve; um
componente focado é a decisão certa (mesmo raciocínio do ResourcePressure do S13). Vue/CSS puro
com prop de step conforme o ADR 0001.
Resultado: os participantes conseguem ligar um HPA à CPU de um Deployment, sabem que ele escala
sobre um % do `requests.cpu` do Pod (sem request → sem HPA — o gancho de volta ao S13), leem
TARGETS/REPLICAS, e sabem por que o scale-down atrasa (a janela de estabilização). VPA e Cluster
Autoscaler nomeados como vizinhos.
Beats: problema (uma contagem fixa de réplicas é errada nos dois sentidos) · modelo mental (HPA =
um controller: observar uma métrica → comparar com o alvo → definir réplicas; callback ao loop de
reconciliação do S03) · code-annotated (o objeto HPA; a dependência do "% do request") ·
magic-move (HPA no Deployment `web` → adicionar um gerador de carga) · animação (o medidor dirige
o rebanho) · comportamento de escala (janela de estabilização + políticas) · vizinhos (VPA /
Cluster Autoscaler) · recap de fim de Day 2 · lab. CKx: CKA/CKAD autoscaling — HPA, sua
dependência de métricas, relação com os requests.
-->

---
layout: statement
kicker: O problema
---

Uma contagem **fixa** de réplicas é errada nos **dois** sentidos — ou você paga pelo pico o dia inteiro, ou você cai no pico.

Escolha `replicas: 3` e você congelou um número contra uma carga que não é constante. Dimensione
para o **pico do meio-dia** e ele fica ocioso — e cobrando — às 3 da manhã. Dimensione para as
**horas calmas** e o próximo surto de tráfego enfileira, estoura timeout e derruba requisições. O
que você quer de verdade é um controller que **observa a demanda e move o número por você** —
para cima quando está ocupado, de volta para baixo quando não está.

<!--
Speaker: o beat do "por que se importar". Todo workload que rodamos até agora tem um valor de
replicas escolhido à mão — um chute, congelado. Carga real tem uma forma: picos diários, ciclos
semanais, surtos imprevisíveis. Um único número estático não pode estar certo para tudo isso —
superprovisione e você desperdiça dinheiro segurando Pods ociosos; subprovisione e você derruba
tráfego quando mais importa. O conserto é parar de definir replicas à mão e deixar um controller
dirigi-lo a partir de um sinal ao vivo. Esse controller é o HorizontalPodAutoscaler: horizontal =
mais Pods (vs vertical = Pods maiores, que é o VPA, depois). Segure esse enquadramento — o HPA é
dono da contagem de réplicas para você não precisar ser.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · um controller que define réplicas a partir de uma métrica</span>

# O HPA é só mais um loop de reconciliação

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Observar → comparar → agir" kind="hpa" variant="ok">
      A cada ~15s o HPA lê uma <strong>métrica</strong> (CPU média entre os Pods), compara com o
      seu <strong>alvo</strong>, e escreve um novo <code>replicas</code> no Deployment.
      O mesmo loop observar → diff → agir de todo outro controller — o tamanho do workload agora é o estado reconciliado.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="A fórmula" icon="🧮">
      <code>desired = ceil(current × currentUtil / targetUtil)</code>. Com 2 Pods, 90% observado,
      alvo de 50% → <code>ceil(2 × 90/50) = 4</code>. Restrito a <code>[minReplicas, maxReplicas]</code>.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">de onde vem a métrica</span>

<div class="kw-cols-2 mt-1">
  <KwCard heading="metrics-server (o caso comum)" icon="📈">
    Um add-on do cluster que raspa CPU/memória do kubelet e serve a API
    <strong>metrics.k8s.io</strong>. Sem metrics-server → o HPA não tem o que ler.
  </KwCard>
  <KwCard heading="custom / external (uma menção)" icon="🌐">
    O HPA também pode escalar sobre métricas <strong>custom</strong> (métricas de aplicação por
    Pod, ex.: requisições/s) ou <strong>external</strong> (a profundidade de uma fila) via
    adapters. O mesmo loop, sinal mais rico.
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: o HPA não é mágica — é o loop de reconciliação do S03 apontado para um campo. Seu estado
desejado é "a CPU média fica no alvo"; o atuador que ele gira é a contagem de réplicas do
Deployment. A fórmula vale ir para o quadro: desiredReplicas = ceil(currentReplicas ×
currentMetric / targetMetric). Dois Pods quentes a 90% contra um alvo de 50% → ele quer 4; o ceil
e a trava de min/max o mantêm são. A fonte da métrica importa para o lab: o default é o
metrics-server, um add-on separado que serve a API metrics.k8s.io a partir das estatísticas do
kubelet — se ele não está instalado (ou não está Ready), o `kubectl top` fica vazio e o HPA
reporta TARGETS <unknown>. Métricas custom e external (via os adapters custom.metrics.k8s.io /
external.metrics.k8s.io) deixam você escalar sobre sinais de aplicação ou uma fila — nomeie-as
para os alunos saberem que CPU não é o único eixo, mas hoje dirigimos CPU.
-->

---
layout: code-annotated
heading: 'A dependência que derruba todo mundo: % do request'
compact: true
lab: labs/day-2/16-hpa.md
---

```yaml {none|1-2|5-8|9-10|11-17}
apiVersion: autoscaling/v2       # v2 — a API atual e GA do HPA (a v1 era só CPU)
kind: HorizontalPodAutoscaler
metadata: { name: web, labels: { app: s16 } }
spec:
  scaleTargetRef:                # O QUE ele escala — um Deployment, pelo nome
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2                 # nunca abaixo disto…
  maxReplicas: 10                # …nunca acima disto
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50 # 50% DO requests.cpu DE CADA POD — não 50% de um core
```

::notes::

<CodeNote at="1" label="autoscaling/v2 — use a v2" variant="ok">
A API GA. A <code>v2</code> suporta memória, múltiplas métricas, fontes custom/external e
<code>behavior</code> de escala; a velha <code>v1</code> era só CPU. Recorra sempre à v2.
</CodeNote>

<CodeNote at="2" label="scaleTargetRef — o objeto que ele dirige">
O HPA é dono do <code>replicas</code> deste Deployment. Não defina também <code>replicas</code>
à mão no Deployment — o HPA vai brigar com ele. Ele pode mirar qualquer workload escalável
(Deployment, StatefulSet, ReplicaSet).
</CodeNote>

<CodeNote at="3" label="min / max — os guarda-corpos">
A trava sobre a fórmula. <code>minReplicas</code> mantém um piso de capacidade; <code>maxReplicas</code>
limita o raio da explosão (e o custo). O HPA nunca escala fora desta banda.
</CodeNote>

<CodeNote at="4" label="Utilization = % do requests.cpu — o gancho de volta aos resources" variant="danger">
<code>averageUtilization: 50</code> significa "mantenha a CPU média em <strong>50% do
<code>requests.cpu</code> de cada Pod</strong>". Sem <code>requests.cpu</code> no Pod → o % não
tem denominador → o HPA mostra <code>TARGETS &lt;unknown&gt;</code> e <strong>não consegue
escalar</strong>.
</CodeNote>

<!--
Speaker: este é O slide da seção — o modo de falha que todo mundo acerta uma vez.
`averageUtilization` é uma porcentagem DO requests.cpu do Pod, definido lá no S13. Então o alvo é
relativo: com requests.cpu: 200m e averageUtilization: 50, o HPA mira manter cada Pod perto de
100m de CPU real. Remova o request e a porcentagem fica sem base — o HPA não consegue calcular a
utilização, reporta TARGETS <unknown>, e fica congelado na contagem atual de réplicas. Esse é o
quebre→conserte do lab. Contraste Utilization com AverageValue (um valor absoluto tipo 100m por
Pod), que NÃO precisa de request — mas Utilization é o que as pessoas usam e onde a dependência
do request morde. Aterrisse: um HPA sobre utilização de CPU só é tão válido quanto os requests
por baixo dele. requests → agendamento (S13) E autoscaling (aqui).
-->

---
layout: code-walkthrough
heading: 'Ligue-o à aplicação em execução — depois dê a ele algo para reagir'
lab: labs/day-2/16-hpa.md
---

````md magic-move
```yaml
# 1: o Deployment alvo — o request é o que o torna autoescalável
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s16 } }
spec:
  replicas: 2                          # um ponto de partida; o HPA assume daqui
  selector: { matchLabels: { app: s16 } }
  template:
    metadata: { labels: { app: s16 } }
    spec:
      containers:
        - name: web
          image: registry.k8s.io/hpa-example   # uma demo que queima CPU (o workshop-web mal se mexe)
          resources:
            requests: { cpu: 200m }    # <- o denominador contra o qual o HPA escala
```

```yaml
# 2: adicione o HPA — agora ele é dono de replicas, dirigindo a CPU rumo a 50% daquele request de 200m
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: web, labels: { app: s16 } }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: web }
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 50 } }
```

```yaml
# 3: dê carga a ele — um cliente que martela o Service num loop apertado
apiVersion: apps/v1
kind: Deployment
metadata: { name: load, labels: { app: s16-load } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s16-load } }
  template:
    metadata: { labels: { app: s16-load } }
    spec:
      containers:
        - name: load
          image: busybox:1.37
          # acerte o Service web para sempre → a CPU sobe → o HPA escala o web para cima
          command: ["sh","-c","while true; do wget -q -O- http://web; done"]
```
````

<!--
Speaker: três quadros, um diagrama de ligação. (1) O Deployment — note que a image é a demo
canônica de queimar CPU (registry.k8s.io/hpa-example, um php-apache que faz trabalho real por
requisição), NÃO a aplicação de demo workshop-web da red line: um servidor de status trivial
responde um wget em microssegundos e nunca move CPU, então o HPA ficaria parado e a demo inteira
silenciosamente não faria nada. Este é o alvo do lab, e o requests.cpu: 200m é o denominador do
slide anterior. (2) O HPA assume a posse de replicas — daqui em diante você NÃO define replicas
à mão. (3) O gerador de carga: um Deployment descartável cujo único trabalho é fazer curl no
Service web num loop apertado, empurrando a CPU agregada além do alvo de 50% para o HPA reagir.
No lab você escala o gerador de carga para cima (ou roda vários) para empurrar mais forte, depois
o deleta para ver o scale-down. Note que os Pods de carga carregam um label de selector DIFERENTE
(app: s16-load) para não serem capturados pelo Service web nem pelo seu HPA. Esta é a visão
compacta de ensino; o lab entrega os arquivos completos em estilo de bloco mais a instalação do
metrics-server.
-->

---
clicks: 5
---

<span class="kw-kicker">O loop de controle, tornado físico · a carga dirige o rebanho</span>

# Veja o medidor mover a contagem

<div class="mt-2">
  <HpaScaling :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- **A carga dispara** para 90% — acima do alvo de 50%. O HPA calcula `ceil(2 × 90/50) = 4`.
- **Escalado para 4** — a mesma carga agora se espalha por mais Pods, então a CPU por Pod recua.
- **Assentado** — a utilização fica no alvo, desired == current, o rebanho se mantém.
- **Carga embora**, a CPU cai — mas as réplicas **seguram** pela janela de scale-down, depois encolhem até o mínimo.

</v-clicks>
</div>

<!--
Speaker: conduza com os cliques. (0) estável no mínimo, medidor baixo. (1) a carga chega, o
medidor salta além da linha tracejada do alvo, o chip da fórmula recalcula desired=4. (2) o
rebanho cresce para 4 e — insight-chave — o medidor desce de volta, porque a MESMA carga total
dividida por mais Pods é menos por Pod; autoscaling é feedback negativo encontrando equilíbrio.
(3) ele assenta onde CPU por Pod == alvo. (4) a carga some, o medidor cai, mas o rebanho NÃO
encolhe imediatamente — ele segura pela janela de estabilização de scaleDown (default 300s). (5)
a janela passa e ele volta ao mínimo — pause aqui para o encolhimento atrasado registrar. Essa
assimetria é o próximo slide: escalar para cima rápido, para baixo devagar. Este é o beat 3 do
lab (por que o scale-down atrasou?).
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Comportamento de escala · por que subir é rápido e descer é lento</span>

# A estabilização para o flapping

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="Scale UP — responsivo" kind="hpa" variant="ok">
      Default <code>stabilizationWindowSeconds: 0</code> para cima: reaja a um pico quase
      imediatamente. Políticas limitam a <em>taxa</em> (ex.: no máximo +100% ou +4 Pods por 15s)
      para ele subir rápido mas não sem limite num único tick.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Scale DOWN — cauteloso" icon="🕒">
      Default <code>stabilizationWindowSeconds: 300</code> para baixo: o HPA usa a contagem
      desejada <strong>mais alta</strong> dos últimos 5 min. Uma queda breve não vai encolher
      você — ele espera ter certeza de que a calmaria é real.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-3 text-sm">

```yaml {all}
  behavior:                        # spec.behavior — sobrescreva os defaults por direção
    scaleDown:
      stabilizationWindowSeconds: 300   # ← a resposta do "por que o scale-down atrasou?"
      policies: [{ type: Pods, value: 1, periodSeconds: 60 }]   # no máximo -1 Pod/min
```

</div>

<div v-click="4" class="mt-2 kw-muted text-sm">

A assimetria é deliberada: **reagir de menos a um pico derruba tráfego; reagir demais a uma
calmaria só sacode Pods à toa.** Então o HPA erra para o lado da capacidade — sobe rápido, desce
com paciência.

</div>

</div>

<!--
Speaker: isto explica o último passo da animação e responde a manchete do lab. A escala do
HPA é intencionalmente assimétrica. A estabilização do scale-up tem default 0 — um pico real deve
ser atendido agora; as *políticas* de scale-up limitam a taxa por intervalo para ele não passar
do ponto loucamente num único loop. A estabilização do scale-down tem default 300s: o controller
olha para trás pela janela e pega a recomendação MAIS ALTA nela, então uma queda momentânea de
carga não consegue encolher a frota — ela precisa ficar baixa pela janela inteira primeiro. Você
ajusta os dois em spec.behavior (v2). O modelo mental para deixar com eles: o custo de descer
cedo demais é sacudida (e capacidade derrubada logo antes do próximo pico); o custo de subir cedo
demais é pequeno. Então os defaults pendem para manter capacidade — rápido para cima, lento para
baixo. Esses 300s são exatamente o motivo de, no lab, as réplicas demorarem depois de você matar
o gerador de carga.
-->

---
layout: comparison
heading: 'Três autoscalers, três eixos — o HPA é só um'
leftHeading: 'HPA — mais Pods'
leftBadge: 'horizontal · no escopo'
rightHeading: 'VPA & Cluster Autoscaler'
rightBadge: 'outros eixos · vizinhos'
---

**O HPA escala o workload PARA FORA** — ele muda `replicas`.

- Reage à carga ao vivo: mais Pods quando ocupado, menos quando ocioso.
- Precisa de uma fonte de métricas (metrics-server) e de `requests.cpu` para escalar por utilização.
- A ferramenta certa quando a sua aplicação escala **adicionando cópias idênticas**.

<v-clicks>

- ⚠️ Não ajuda se um **único** Pod está simplesmente subdimensionado — isso é trabalho do VPA.

</v-clicks>

::right::

**Duas ferramentas adjacentes resolvem problemas diferentes — nomeadas, não cobertas hoje:**

- **VPA (Vertical Pod Autoscaler)** — redimensiona os `requests`/`limits` de um Pod (Pods
  maiores, não mais Pods). Útil para right-sizing; **não o rode em CPU no mesmo workload que um
  HPA** — eles brigam pelo mesmo sinal.
- **Cluster Autoscaler** — adiciona/remove **nodes** quando Pods não conseguem ser agendados (ou
  nodes ficam vazios). O HPA faz mais Pods; o Cluster Autoscaler faz espaço para eles.

<v-clicks>

- ✅ Eles se compõem: o HPA adiciona Pods → eles não cabem → o Cluster Autoscaler adiciona um node.

</v-clicks>

<!--
Speaker: mantenha os três eixos separados para ninguém confundi-los. HPA = horizontal = mais
réplicas, reagindo à carga — o tópico de hoje. VPA = vertical = redimensionar os requests/limits
de um Pod; ótimo para "meu Pod é cronicamente OOMKilled ou superprovisionado", mas o tiro no pé
clássico é rodar VPA e HPA sobre a MESMA métrica (CPU) para o MESMO workload — eles ficam se
perseguindo, então no máximo emparelhe HPA-em-CPU com VPA-em-memória, ou mantenha-os separados.
O Cluster Autoscaler opera em NODES, não Pods: quando o HPA (ou qualquer coisa) cria Pods que não
conseguem agendar por falta de capacidade, o Cluster Autoscaler adiciona um node; quando nodes
ficam ociosos, ele os drena e remove. A composição é o aprendizado: o HPA aumenta a demanda por
capacidade, o Cluster Autoscaler a supre — e o VPA ajusta o tamanho de cada unidade. Os três são
ferramentas atuais do ecossistema CNCF; só o HPA é embutido no core e está no escopo aqui.
-->

---
layout: recap
heading: 'Recap — e isso fecha o Day 2'
story: 'O rebanho cresceu de 2 para 10 sob carga e voltou devagar para 2 depois da janela — a contagem de réplicas não é mais um número que você chuta, é um sinal que o cluster acompanha.'
next: 'Day 3 · Segurança de Pods — restrinja o que um container pode fazer em runtime'
---

- **HPA = um loop de reconciliação sobre `replicas`:** observe a CPU média → `ceil(current × util/target)` → restrinja a `[min,max]`
- **Utilization é % do `requests.cpu`** — sem request → `TARGETS <unknown>` → sem escala (o gancho de volta aos resources)
- **`autoscaling/v2`**, `scaleTargetRef` no Deployment, e **não** defina também `replicas` à mão
- **Assimétrico por design:** sobe rápido (janela 0), desce **devagar** (janela de **300s**) — é por isso que a frota demora
- **Vizinhos:** o VPA redimensiona Pods · o Cluster Autoscaler adiciona nodes — o HPA só adiciona Pods

<div class="mt-4 text-sm kw-muted">

**O Day 2 em camadas sobre uma aplicação em execução:** roteamento com Gateway API · ConfigMap/Secret ·
storage & StatefulSet · requests/limits & QoS · probes · Jobs/CronJobs
· **e agora ela autoescala**. A aplicação `web` agora roteia, persiste, se autocura e se
dimensiona pela carga.

</div>

<!--
Speaker: aterrisse a seção E o dia. O HPA é o loop de reconciliação do S03 com replicas como o
campo reconciliado: ele lê a CPU média, aplica desired = ceil(current × util/target), e restringe
a [min,max]. A única coisa que eles não podem esquecer: a utilização é relativa ao requests.cpu,
então um HPA só é válido em um Pod que declara um request de CPU — o mesmo request que dirige o
agendamento no S13 agora dirige o autoscaling. autoscaling/v2 é a API; deixe o HPA ser dono de
replicas (definir os dois é um cabo de guerra). E a assimetria — rápido para cima, devagar para
baixo (default de 300s) — é o motivo de as réplicas do lab não voltarem no instante em que a
carga para. Depois afaste o zoom: ao longo do Day 2 pegamos a aplicação da red line e a fizemos
rotear com Gateway API, externalizar config, persistir estado como StatefulSet, declarar
resources e QoS, expor saúde via probes, rodar trabalho batch, e agora autoescalar. O Day 3 muda
de "rode bem" para "rode com segurança" — começando com o S17, segurança de Pods.
-->

---
layout: lab
lab: labs/day-2/16-hpa.md
duration: 20 min
env: kind ✓ (metrics-server) / namespace read-only
---

## Lab 16 — Escale sob carga

- Confirme o **metrics-server** (`kubectl top pods` retorna dados), aplique um Deployment que
  consome CPU **com `requests.cpu`** + um HPA (`min`/`max`, alvo de 50%)
- Gere carga → veja o `TARGETS` cruzar 50% e o `REPLICAS` subir rumo ao máximo; pare-a → veja-o
  **assentar de volta depois da janela**
- **Quebre→conserte:** remova o `requests.cpu` → `TARGETS <unknown>`, o HPA não consegue escalar → restaure-o
- Responda a manchete: *por que o scale-down atrasou em relação à queda da carga?*
