---
layout: section-cover
image: /covers/section-26-gleaming-harbour-city.webp
day: Day 3
section: '26'
tier: core
track: Wrap
---

# Boas práticas

Cada camada que construímos, como **um** checklist de production-readiness — rodado contra um manifesto real.

**core** · sugerido para o Day 3 · trilha Wrap

<!--
Seção S26 — Best practices (CAPSTONE). Core, Day 3, trilha Wrap. Tempo: ~30 min de slides + 40 min
de lab. Esta seção SINTETIZA o curso inteiro: não ensina um recurso novo, amarra cada
camada anterior num único checklist e o roda contra um único conjunto de manifestos "before → after"
com ~10 problemas plantados. O MESMO Deployment falho/corrigido que o magic-move dos slides percorre é o
Deployment falho/corrigido do lab (fonte única de verdade) — os frames corrigidos do magic-move == os arquivos do lab.
Beats: (1) enquadramento do capstone (a red line + toda camada do Day 3, como um checklist) · (2) checklist I —
availability (probes S14, resources S13, PDB, anti-affinity/topology spread, rollout strategy) ·
(3) checklist II — security (labels, digest pin S02, restricted PSS S17, NetworkPolicy S18,
higiene de config/secret) · (4) checklist III — operations (GitOps S21, observability S23, graceful
shutdown, cost) · (5) o Deployment falho — 10 problemas plantados, identifique-os · (6) magic-move A:
correções de HEALTH (probes, resources, graceful shutdown) · (7) magic-move B: correções de SECURITY (labels,
digest, restricted securityContext) · (8) magic-move C: AVAILABILITY + os dois objetos irmãos
(replicas+topologySpread+rollout, depois PDB, depois NetworkPolicy) · (9) REÚSO do AdmissionGate — o mesmo
gate restricted admite o Deployment corrigido · (10) o checklist como artefato de repo · (11) recap → lab.
Cada passo do magic-move é anotado com a SEÇÃO à qual remete. Reutilize AdmissionGate.vue (NÃO
escreva um novo componente). Vínculo com CKx: síntese CKAD/CKA (probes, resources, PDBs, rollouts, security).
ACCURACY LOCKS: a image ghcr.io/platformrelay/workshop-web:v1 roda como UID 65532 (distroless
nonroot) na porta 8080 → TODAS as portas são 8080; as probes usam os endpoints reais da app (/ready,
/healthz); a image NÃO tem shell → graceful shutdown usa a ação nativa preStop sleep
(lifecycle.preStop.sleep, estável), NÃO um exec sh sleep; o restricted controla QUATRO campos
(runAsNonRoot/allowPrivilegeEscalation:false/drop ALL/seccomp),
divididos entre nível de pod (runAsNonRoot,runAsUser,seccomp) e nível de container (allowPrivilegeEscalation,drop).
O placeholder de digest satisfaz o restricted admission (dry-run) mas é ImagePullBackOff em runtime —
resolver no rehearsal. Os selectors de PDB/topologySpread/NetworkPolicy todos casam app.kubernetes.io/name: web.
-->

---
layout: statement
kicker: O capstone · tudo, como uma lista só
---

Você construiu a linha inteira — agora deixe-a **production-ready**.

**Pod → Deployment → Service → Ingress → Gateway** carregou a app; o Day 3 adicionou
**security**, **policy**, **delivery** e **observability** por cima. Esta seção é a
**síntese**: nenhum recurso novo, apenas **um checklist** para o qual cada camada anterior contribui uma linha —
e um único manifesto real contra o qual vamos rodá-lo, antes e depois.

<!--
Speaker: este é o fechamento. Enquadre-o como o payoff do curso inteiro — não estamos aprendendo nada
novo, estamos coletando o que já aprendemos num único artefato que você pode levar para o trabalho. A red
line (S05–S09) é a espinha — um Deployment atrás de um Service, exposto por Ingress/Gateway. O Day 3 aparafusou
as preocupações transversais: image hygiene (S02), pod security (S17), NetworkPolicy (S18), GitOps
(S21), observability (S23). A pergunta do capstone é: "este manifesto está pronto para produção?" e a
resposta é um checklist com uma linha de cada seção. O resto deste deck É esse checklist, depois um
manifesto before→after com ~10 problemas plantados que corrigimos um de cada vez — cada correção um item do checklist.
O lab (labs/day-3/26-capstone.md) entrega ao participante o MESMO manifesto falho para auditar e corrigir.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Checklist I · availability — continue servindo apesar de falhas e mudanças</span>

# Vai continuar de pé?

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Probes — readiness / liveness / startup" kind="pod" variant="ok">
      A readiness controla o tráfego, a liveness reinicia um container travado, a startup protege um boot lento.
      <code>Running</code> ≠ saudável.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Requests & limits" kind="pod" variant="ok">
      Reserve o que você precisa (scheduling), limite o que você usa (enforcement). Sem resources → BestEffort,
      o primeiro a ser despejado.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="PodDisruptionBudget" icon="🛟" variant="ok">
      Mantenha <code>minAvailable</code> Pods de pé durante disrupções <em>voluntárias</em> — drains de node,
      upgrades — para que um rollout ou um drain não te leve a zero. <span class="kw-muted">(availability)</span>
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Anti-affinity / topology spread" kind="node" variant="ok">
      Espalhe as réplicas entre nodes (e zonas) para que a falha de um node não mate todas as réplicas.
      <span class="kw-muted">(availability)</span>
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="Estratégia de rollout" kind="deploy" variant="ok">
      <code>RollingUpdate</code> com <code>maxUnavailable</code>/<code>maxSurge</code> sensatos — mais
      <code>revisionHistoryLimit</code> para que ReplicaSets antigos não se acumulem.
    </KwCard>
  </v-click>
  <v-click at="6">
    <KwCard heading="Mais de uma réplica" kind="deploy" variant="warn">
      <code>replicas: 1</code> não tem folga — um único restart de Pod é uma indisponibilidade. HA começa em
      duas, bem separadas. <span class="kw-muted">(availability)</span>
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: checklist parte um — availability, ou seja, "isto sobrevive a falhas e mudanças?". Percorra os seis:
probes (S14) para que Running signifique servindo, não apenas iniciado; requests/limits (S13) para que seja agendado e
limitado, e não o primeiro a ser despejado; um PodDisruptionBudget para que disrupções voluntárias (drain de node, um
upgrade) não te drenem abaixo do minAvailable — isto é novo aqui, mas é availability pura; anti-
affinity / topologySpreadConstraints para que suas réplicas não caiam todas num único node que depois morre; uma
estratégia de rollout com surge/unavailable sensatos e um revisionHistoryLimit para você não acumular ReplicaSets
mortos; e simplesmente mais de uma réplica — replicas:1 é uma indisponibilidade garantida a cada restart de Pod.
Cada um destes é uma linha que o manifesto falho erra. A seguir: a metade de security.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Checklist II · security — least privilege, proveniência, isolamento</span>

# Vai aguentar?

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Labels recomendados" icon="🏷️" variant="ok">
      <code>app.kubernetes.io/name</code>, <code>/instance</code>, <code>/version</code>,
      <code>/part-of</code>, <code>/managed-by</code> — o conjunto comum do qual selectors, dashboards e
      GitOps todos dependem. <span class="kw-muted">(higiene)</span>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Digest de image imutável" icon="🔏" variant="ok">
      Fixe por <code>@sha256:…</code>, não por uma tag móvel — os bytes em execução não mudam por baixo de você.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="securityContext restricted" kind="pod" variant="ok">
      Não-root, sem priv-esc, drop <code>ALL</code> nas capabilities, seccomp <code>RuntimeDefault</code> — os
      quatro campos que o <code>restricted</code> controla.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="NetworkPolicy" kind="netpol" variant="ok">
      Default-deny, depois um allow explícito — para que um ponto de apoio não passeie por uma pod network plana.
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="Higiene de config & secret" kind="secret" variant="ok">
      Config em <code>ConfigMap</code>/<code>Secret</code>, não embutida na image nem no manifesto;
      monte com least privilege; nunca logue secrets.
    </KwCard>
  </v-click>
  <v-click at="6">
    <KwCard heading="O fio condutor" icon="🎯" variant="warn">
      O <code>enforce: restricted</code> sozinho rejeita o Pod não-hardened no admission — mas labels,
      digests e NetworkPolicy dependem de <em>você</em>.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: checklist parte dois — security, ou seja, "isto resiste a comprometimento e drift?". Os labels
recomendados (app.kubernetes.io/*) não são decoração — são o contrato sobre o qual Services, dashboards, PDBs,
topologySpread e GitOps selecionam; erre neles e metade dos outros controles silenciosamente não se
aplica. Fixe a image por digest (S02) para que os bytes que rodam hoje sejam os bytes que você escaneou. Os quatro
campos do securityContext restricted (S17) — não-root, sem priv-esc, drop ALL, seccomp — são o
piso de least privilege. NetworkPolicy (S18): default-deny e depois um allow, para que um Pod comprometido não consiga
varrer o namespace. Higiene de config/secret (S11/S12): externalize a config, não embuta secrets. Destaque
(card 6): o restricted admission vai rejeitar o Deployment não-hardened por você, mas nada garante
"você fixou um digest" ou "você escreveu uma NetworkPolicy" — isso é disciplina. A seguir: operations.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Checklist III · operations — entregar, observar, desligar e pagar a conta</span>

# Dá para operar?

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Entrega por GitOps" icon="🔁" variant="ok">
      O manifesto vive no <strong>Git</strong>; um agente dentro do cluster reconcilia o cluster com ele —
      auditável, reversível, self-healing.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Observability" icon="📈" variant="ok">
      Exponha <code>/metrics</code>; um <code>ServiceMonitor</code> seleciona o Service por label, então
      Pods novos são raspados automaticamente.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Graceful shutdown" kind="pod" variant="ok">
      <code>terminationGracePeriodSeconds</code> + um hook <code>preStop</code> — drene as requests
      em voo antes do <code>SIGTERM</code>, para que um rollout não derrube conexão nenhuma. <span class="kw-muted">(graceful shutdown)</span>
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Consciência de custo" icon="💰" variant="warn">
      Dimensione os requests pelo uso real; não superprovisione limits "por via das dúvidas". Reservas
      ociosas são dinheiro que o cluster inteiro não pode usar. <span class="kw-muted">(cost)</span>
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
Três listas, um manifesto. A seguir: um Deployment real que erra <strong>todos esses pontos</strong>.
</div>

</div>

<!--
Speaker: checklist parte três — operations, ou seja, "um time consegue de fato rodar isto ao longo do tempo?". GitOps
(S21): o manifesto está no Git e um agente reconcilia o cluster com ele, então toda mudança é revisada,
auditada e reversível, e o drift se autocorrige — é o loop de reconciliação do S03 com o Git no lugar do
desired state. Observability (S23): a app expõe /metrics e um ServiceMonitor a seleciona por label, então
escalar adiciona scrape targets automaticamente — você não opera o que não enxerga. Graceful
shutdown: terminationGracePeriodSeconds mais um hook preStop permitem que o Pod termine as requests em voo
e saia dos endpoints antes do SIGTERM, então um rollout ou scale-down derruba zero conexões. Cost:
requests são uma reserva que o cluster inteiro honra — peça demais e você paga por capacidade ociosa
que ninguém mais pode usar; dimensione pelo uso observado. Este é o checklist completo: availability, security,
operations. Agora vamos concretizar — um Deployment que viola tudo isso.
-->

---
layout: code-annotated
heading: 'O manifesto que reprova no checklist — ache os problemas'
compact: true
lab: labs/day-3/26-capstone.md
---

```yaml {none|13-14|16|16-17|7|all}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: web }            # ① só o label ad-hoc
spec:
  replicas: 1                     # ② sem HA — um Pod = downtime
  # ③ sem strategy / revisionHistoryLimit
  template:
    spec:
      containers:
        - name: web
          # ④ tag móvel — sem digest
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
          # ⑤ sem resources  ⑥ sem probes  ⑦ sem securityContext
      # ⑧ sem graceful shutdown  ⑨ sem anti-affinity/spread
# ⑩ sem PDB, ⑪ sem NetworkPolicy — irmãos também faltando
```

::notes::

<CodeNote at="1" label="④ tag de image móvel" variant="danger">
Uma tag é um <em>ponteiro móvel</em> — <code>:v1</code> pode ser reapontada e os bytes que você
escaneou não são os bytes que rodam. A <strong>higiene de image</strong> manda fixar por
<code>@sha256:…</code>.
</CodeNote>

<CodeNote at="2" label="⑤ sem resources · ⑥ sem probes" variant="danger">
Sem <code>requests/limits</code> → <strong>BestEffort</strong>, o primeiro a ser despejado. Sem probes →
<code>Running</code> é o único sinal (enganoso).
</CodeNote>

<CodeNote at="3" label="⑦ sem securityContext · ⑧ sem shutdown" variant="danger">
Roda com o usuário padrão, todas as capabilities, sem seccomp → o <code>restricted</code> o rejeita. Sem
<code>preStop</code>/grace → conexões derrubadas a cada rollout.
</CodeNote>

<CodeNote at="4" label="② replicas: 1 · ⑨ sem spread" variant="danger">
Uma réplica, sem spread → um único node ou restart de Pod é uma indisponibilidade total.
</CodeNote>

<div v-click="5" class="mt-2 text-sm kw-muted">
Dez e tantos problemas, cada um uma linha do checklist. O lab pede que você audite este mesmo arquivo <em>antes</em>
de revelar a lista — tente primeiro.
</div>

<!--
Speaker: este é o slide "ache o bug" — e é a autoauditoria de abertura do lab, então pause e deixe
as pessoas realmente encontrarem problemas antes de narrar. O manifesto é deliberadamente mínimo e cada
omissão é uma violação do checklist: (①) só um label ad-hoc `app: web`, nenhum do conjunto recomendado
app.kubernetes.io/*; (②) replicas:1; (③) sem strategy nem revisionHistoryLimit; (④) image fixada
apenas por uma tag móvel, sem digest; (⑤) sem resources; (⑥) sem probes; (⑦) sem securityContext; (⑧) sem graceful
shutdown; (⑨) sem anti-affinity/topologySpread; e os dois objetos SEPARADOS que deveriam existir
ao lado dele — (⑩) um PodDisruptionBudget e (⑪) uma NetworkPolicy. É por isso que a contagem é "dez e tantos":
oito estão errados DENTRO do Deployment, dois são objetos irmãos faltando. A porta é 8080 porque
o workshop-web escuta ali — guarde isso, atravessa toda correção. No ④, seja preciso: a tag
não é ":latest", mas QUALQUER tag é móvel — a correção é fixar por digest, não uma tag "melhor". Os próximos três
slides corrigem isto um de cada vez, agrupados por checklist: health, depois security, depois availability.
-->

---
layout: code-walkthrough
heading: 'Correção I · health — uma correção por passo (resources, probes, graceful shutdown)'
lab: labs/day-3/26-capstone.md
---

````md magic-move
```yaml
# 0: o container falho — sem probes, sem resources, sem graceful shutdown
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    ports: [{ containerPort: 8080 }]
```

```yaml
# 1: +resources — reserva + teto. Não é mais BestEffort.
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    ports: [{ containerPort: 8080 }]
    resources:
      requests: { cpu: 50m, memory: 64Mi }    # dimensionado, não inflado (cost)
      limits:   { cpu: 200m, memory: 128Mi }
```

```yaml
# 2: +probes — readiness controla o tráfego, liveness reinicia, startup protege o boot
    resources:
      requests: { cpu: 50m, memory: 64Mi }
      limits:   { cpu: 200m, memory: 128Mi }
    readinessProbe:
      httpGet: { path: /ready, port: 8080 }
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 10
    startupProbe:
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 3
      failureThreshold: 30
```

```yaml
# 3: +graceful shutdown — drene as requests em voo antes do SIGTERM (graceful shutdown)
    startupProbe:
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 3
      failureThreshold: 30
    lifecycle:
      preStop:
        sleep: { seconds: 5 }        # deixe os endpoints drenarem antes — sem precisar de shell
# no nível do pod:
# spec.template.spec.terminationGracePeriodSeconds: 30
```
````

<!--
Speaker: QUATRO frames, o grupo HEALTH — resources, probes, graceful shutdown. Cada um corrige exatamente uma
linha do checklist. Frame 1: resources (S13) — deliberadamente modesto (request de 50m/64Mi) e o ponto de custo:
não infle "por via das dúvidas", dimensione pelo uso real. Frame 2: as três probes (S14) na porta 8080 (a
porta em que o workshop-web serve), nos PRÓPRIOS endpoints de health da app — readiness em /ready, liveness e
startup em /healthz — exatamente o que "sonde o health path da própria app" significa na prática. Frame 3: o
par de graceful shutdown — um hook preStop que dorme alguns segundos para o Pod sair dos endpoints do
Service e terminar as requests em voo antes do SIGTERM, e o terminationGracePeriodSeconds no nível do
pod (mostrado como comentário; ele é definido no arquivo completo). Repare na ação sleep NATIVA
(preStop.sleep, API estável): o clássico `exec sh -c sleep` falharia aqui — a image é
distroless, não há shell — e a ação nativa é a best practice atual de qualquer forma.
Próximo grupo: security.
-->

---
layout: code-walkthrough
heading: 'Correção II · security — uma correção por passo (labels, digest de image, securityContext)'
lab: labs/day-3/26-capstone.md
---

````md magic-move
```yaml
# 0: ainda numa tag móvel, label ad-hoc, sem securityContext
metadata:
  labels: { app: web }
spec:
  template:
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
```

```yaml
# 1: +labels recomendados — o conjunto app.kubernetes.io/* sobre o qual tudo seleciona (higiene)
metadata:
  labels:
    app.kubernetes.io/name: web
    app.kubernetes.io/instance: web
    app.kubernetes.io/version: "v1"
    app.kubernetes.io/part-of: workshop
    app.kubernetes.io/managed-by: argocd
```

```yaml
# 2: +fixação por digest — bytes imutáveis, não uma tag móvel
        - name: web
          # RESOLVER no rehearsal: docker buildx imagetools inspect … / crane digest
          image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
```

```yaml
# 3: +securityContext restricted — nível de pod: usuário não-root + seccomp
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532                       # o UID não-root embutido na image (distroless nonroot)
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
```

```yaml
# 4: +securityContext restricted — nível de container: sem priv-esc, drop ALL nas capabilities
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: ["ALL"] }
```
````

<!--
Speaker: CINCO frames, o grupo SECURITY. Frame 1: os labels recomendados — app.kubernetes.io/name,
instance, version, part-of, managed-by. Eles não são cosméticos: o selector do Service, os selectors do PDB e do
topologySpread, o ServiceMonitor e o Argo se apoiam todos neles, então acertá-los é
pré-requisito para as outras correções realmente se conectarem. Frame 2: fixe por digest (S02) — @sha256:… para que os
bytes em execução sejam os bytes escaneados; o digest aqui é um PLACEHOLDER, resolvido no rehearsal com
crane/buildx (diga isto em voz alta — é ImagePullBackOff até ser resolvido). Os frames 3+4 são o securityContext
restricted, deliberadamente DIVIDIDO: o nível de pod recebe runAsNonRoot / runAsUser:65532 / seccompProfile
(são válidos no escopo do pod e cobrem todo container); o nível de container recebe
allowPrivilegeEscalation:false e capabilities.drop:["ALL"] (são campos exclusivos de container). Os
quatro juntos são exatamente o que o `restricted` controla. A seguir: availability mais os dois objetos irmãos.
-->

---
layout: code-walkthrough
heading: 'Correção III · availability + os dois objetos irmãos (HA, PDB, NetworkPolicy)'
lab: labs/day-3/26-capstone.md
---

````md magic-move
```yaml
# 0: replicas: 1, sem strategy, sem spread — um Pod, um node, uma indisponibilidade
spec:
  replicas: 1
```

```yaml
# 1: +replicas, +strategy, +spread — HA entre nodes, rollout controlado (availability)
spec:
  replicas: 3
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  template:
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector: { matchLabels: { app.kubernetes.io/name: web } }
```

```yaml
# 2: +PodDisruptionBudget — um objeto SEPARADO: mantenha ≥2 de pé durante drains (availability)
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: web }
spec:
  minAvailable: 2
  selector:
    matchLabels: { app.kubernetes.io/name: web }
```

```yaml
# 3: +NetworkPolicy — um objeto SEPARADO: default-deny de ingress para estes Pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: web-default-deny }
spec:
  podSelector:
    matchLabels: { app.kubernetes.io/name: web }
  policyTypes: [Ingress]        # sem regras de ingress abaixo → nega toda entrada
```
````

<!--
Speaker: QUATRO frames, o grupo AVAILABILITY — e repare que os frames 2 e 3 são OBJETOS SEPARADOS, não
campos do Deployment (seja honesto sobre isso — um PDB não é um campo do spec). O frame 1 corrige o próprio
Deployment: replicas:3, um revisionHistoryLimit para que ReplicaSets mortos não se acumulem, um RollingUpdate com
maxUnavailable:0/maxSurge:1 (nunca cair abaixo da capacidade total durante um rollout) e
topologySpreadConstraints para que as três réplicas caiam em nodes diferentes — seu labelSelector casa com
o label app.kubernetes.io/name:web que adicionamos no grupo de security, e é exatamente por isso que os labels vieram
primeiro. Frame 2: um PodDisruptionBudget, minAvailable:2, selecionando o mesmo label — agora um drain de node
não consegue nos levar abaixo de dois Pods. Frame 3: uma NetworkPolicy default-deny (S18) selecionando o mesmo label —
podSelector nos nossos Pods, policyTypes:[Ingress], sem regras → nega toda entrada; no lab você adicionaria em seguida
um allow explícito. Todo selector se apoia no MESMO label recomendado — esse é o payoff de acertar
os labels. O Deployment corrigido destes slides É o arquivo corrigido do lab.
-->

---

<span class="kw-kicker">O mesmo gate restricted do Pod security — ele verifica o Pod, não o Deployment</span>

# O checklist encontra o admission

<div class="mt-2">
  <AdmissionGate :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- O **Pod** do workload falho (sem `securityContext`) encontra o `enforce: restricted`…
- …os quatro gates falham → **Forbidden**. O `enforce` controla **Pods**, então um *Deployment* falho é
  admitido, mas seus **Pods** são rejeitados (`FailedCreate`) — a linha de security continua sendo aplicada *por* você.
- O Pod **corrigido** — não-root, sem priv-esc, drop `ALL`, seccomp — passa em todo gate → **admitido**.
- O admission pega **aquela** linha; **você** ainda deve os labels, o digest, o PDB e a NetworkPolicy.

</v-clicks>
</div>

<!--
Speaker: reúso do AdmissionGate do S17/S25 — ele visualiza os QUATRO campos restricted em um POD, que é
exatamente a linha de security do nosso checklist. Ponto de precisão IMPORTANTE para dizer em voz alta: o `enforce` do PSA
controla PODS, não objetos de workload. Então, se você aplicar o DEPLOYMENT falho num namespace restricted, o
Deployment é CRIADO — a rejeição chega depois, quando o controller do ReplicaSet tenta criar os
Pods, como um evento FailedCreate (kubectl describe rs). O gate continua te protegendo (nenhum Pod violador
roda), ele apenas dispara um nível abaixo. A animação mostra a verificação no nível do Pod: (step 0) o Pod falho
segue para o gate; (step 1) os quatro gates falham → Forbidden, aquele Pod nunca existe; (step 2) o Pod
corrigido; (step 3) quatro verdes, admitido. A ressalva honesta a fixar: o admission só verifica aqueles quatro
campos do securityContext — ele NÃO confere se você fixou um digest, adicionou os labels recomendados, escreveu um PDB
ou aplicou uma NetworkPolicy. Isso é disciplina de review (GitOps/CI é onde você aplica esses gates). Então o
restricted admission é um piso, não o checklist inteiro — e é por isso que o capstone é um checklist e
uma disciplina de review, não um controle único. O lab prova isto rodando o dry-run do Pod template diretamente.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">O entregável · um checklist que você guarda, não um slide que você esquece</span>

# Entregue o checklist como artefato do repo

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Commite-o ao lado dos seus manifestos" icon="📄" variant="ok">
      Um <code>PRODUCTION-CHECKLIST.md</code> no repo — availability, security, operations — contra o qual
      toda mudança é revisada. O lab imprime a lista exata.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Transforme-o em gate no review / CI" icon="✅" variant="ok">
      Converta linhas em verificações: admission <code>restricted</code>, um policy engine, um linter,
      labels obrigatórios — para que a lista não possa ser pulada sob pressão de prazo.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Reconcilie-o com GitOps" icon="🔁" variant="ok">
      O manifesto revisado é a fonte da verdade no Git; o agente mantém o cluster casando com ele
      e autocorrige o drift. O checklist viaja <em>junto</em> com o código.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Ele nunca está 'pronto'" icon="🔁" variant="warn">
      Novas seções (CVEs, novos nodes, nova carga) adicionam linhas. Trate-o como vivo — revisite-o a cada
      rollout, não uma vez só.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: o artefato que fica. Um checklist só é útil se sobreviver a esta sala — então o
entregável é um PRODUCTION-CHECKLIST.md commitado ao lado dos manifestos (o lab imprime a lista
exata para que os participantes saiam com ela). Depois torne-o impossível de pular: converta linhas em gates automatizados —
o restricted admission (S17) bloqueia a linha de security, um policy engine ou linter pode exigir labels /
resources / probes, o CI pode reprovar um PR que regrida. E reconcilie-o com GitOps (S21): o manifesto
revisado é a fonte da verdade no Git, então o checklist viaja com o código e o drift se autocorrige.
Último card: ele é vivo — cada nova ameaça, tipo de node ou padrão de carga adiciona uma linha, então revisite-o a cada
rollout, não uma vez por ano. Esse é o hábito profissional para o qual o curso inteiro estava construindo.
-->

---
layout: recap
heading: 'Recap — o curso inteiro, como uma lista que você roda sempre'
story: 'Um Deployment falho reprovou em uma dúzia de linhas do checklist de uma vez; corrigido uma linha por passo, ele ficou production-ready — e o mesmo gate restricted que o rejeitou agora o admite.'
next: 'Wrap-up & próximos passos — a red line, as camadas do Day 3 e um checklist que amarra tudo'
---

- O capstone é **síntese**, não um recurso novo: a **"linha vermelha" (red line)** mais toda camada do
  Day 3, como **um checklist** — availability · security · operations
- **Availability:** probes · requests/limits · **PDB** · anti-affinity/**topology spread**
  · estratégia de rollout + `revisionHistoryLimit` · **>1 réplica**
- **Security:** **labels** recomendados · fixação por **digest** · securityContext **restricted** ·
  **NetworkPolicy** · higiene de config/secret
- **Operations:** **GitOps** · **observability** · **graceful shutdown**
  (`terminationGracePeriodSeconds` + `preStop`) · **cost** (dimensionamento correto)
- **O admission `restricted` aplica uma linha por você; o resto é disciplina de review** — entregue o
  checklist como artefato do repo e transforme-o em gate no CI/GitOps

<!--
Speaker: assente o curso inteiro. Esta seção não ensinou um recurso — ela reuniu tudo numa
lista que você roda contra todo manifesto, para sempre. Três grupos: availability (sobreviver a falhas e mudanças),
security (resistir a comprometimento e drift), operations (entregar, observar, desligar, pagar a conta). O
gancho mental é o before→after: um manifesto reprovou em uma dúzia de linhas simultaneamente, e corrigir uma linha
por passo o tornou production-ready — e o MESMO gate restricted que rejeitou o falho admite
o corrigido. Mas o admission só cobre o piso de security; labels, digests, PDBs, NetworkPolicy e
dimensionamento correto são disciplina de review — então commite o checklist como PRODUCTION-CHECKLIST.md e transforme-o em gate no
CI/GitOps para que não possa ser pulado. Passe para o lab do capstone (labs/day-3/26-capstone.md): audite o
manifesto falho você mesmo, corrija cada linha, rode o dry-run contra um namespace restricted e confirme a cobertura
completa do checklist. Esse é o curso.
-->

---
layout: lab
lab: labs/day-3/26-capstone.md
duration: 40 min
env: namespace ✓ / kind ✓
---

## Lab 26 — Review do capstone

- **Autoauditoria primeiro:** leia o conjunto de manifestos deliberadamente falho e liste **todos** os problemas *antes*
  de revelar o gabarito (~10 problemas, cada um uma linha do checklist)
- **Corrija um problema por vez:** probes, resources, `securityContext` restricted, um **PDB**, uma
  fixação por **digest**, uma **NetworkPolicy**, graceful shutdown, labels recomendados, HA + spread
- **Valide:** rode `kubectl apply --dry-run=server` no conjunto corrigido, depois confirme que um namespace
  **restricted** (`enforce=restricted`) **admite** o Deployment corrigido
- **Responda:** quais correções são de **availability**, de **security** ou de **cost** — e confirme que os
  manifestos corrigidos cobrem todo o checklist impresso
