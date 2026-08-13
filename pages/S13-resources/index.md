---
layout: section-cover
image: /covers/section-13-rationing-hall.webp
day: Day 2
section: '13'
tier: core
track: Workloads
---

# Resources & limits

Reserve o que você precisa, limite o que você usa — e saiba **como** cada teto é aplicado.

**core** · sugerido para o Day 2 · trilha Workloads

<!--
Seção S13 — Resources & limits. Tempo: ~35 min de slides + 30 min de lab. Vem depois do S12.
Resultado: os participantes conseguem dizer o que requests vs limits fazem (agendamento vs
enforcement), a assimetria CPU-throttle vs memory-OOMKill, as três classes de QoS pelas suas
regras EXATAS, como fazer right-sizing a partir do uso observado (kubectl top → request ≈
steady state, limit = folga de burst; o VPA recomenda em escala), e
como LimitRange (defaults/limites por objeto) e ResourceQuota (teto agregado do namespace)
restringem um namespace.
Beats: problema (sem resources → contenção + inagendável) · modelo mental (requests dirigem o
agendamento, limits dirigem o enforcement) · code-annotated (o bloco requests/limits no
Deployment web) · magic-move (sem resources → +requests → +limits) · animação ResourcePressure
(assimetria throttle vs OOMKill) · classes de QoS (Guaranteed/Burstable/BestEffort, regras
precisas) · right-sizing (animação RightSizing com gráfico de uso + o loop de observação com
kubectl top) · guarda-corpos de namespace (LimitRange vs ResourceQuota) · recap → lab.
Animações: ResourcePressure.vue e RightSizing.vue (ambas autocontidas). DESVIO da animação
"cabe/não cabe no agendamento" sugerida pela história: a transição de estado memorável no S13
é a assimetria throttle-vs-kill, não o agendamento — então a primeira
animação ilustra isso. Justificativa do RightSizing.vue: right-sizing é uma
história de série temporal (linhas de referência de uso vs request vs limit), uma transição
genuinamente nova que nenhum componente existente desenha.
TRAVAS DE PRECISÃO do right-sizing: kubectl top precisa do metrics-server (o add-back do S16
o instala no kind — diga isso, não deixe implícito que vem embutido); o VPA (VerticalPodAutoscaler)
é um autoscaler que você mesmo instala e que recomenda/aplica atualizações de requests a partir
do uso observado — mantenha só como conceito nomeado, sem superfície de instalação; o HPA (S16)
escala para fora enquanto o VPA dimensiona o Pod — a cautela é não deixar os dois agirem na
mesma dimensão de recurso.
CKx: CKAD/CKA — requests/limits, QoS, LimitRange, ResourceQuota.
-->

---
layout: statement
kicker: O problema
---

Não defina **nenhum** resource e você está apostando o node inteiro.

O Deployment `web` rodou o dia todo com um `requests` simbólico e sem teto. Em um node ocupado
isso são duas falhas esperando para acontecer: um **vizinho barulhento** (noisy neighbour) incha
e mata de fome todo mundo que compartilha a máquina, e o scheduler — sem nada a reservar —
**faz overcommit** até Pods serem despejados ou nunca mais caberem. Dois números consertam as
duas: um **request** (o que você reserva) e um **limit** (o que você pode usar).

<!--
Speaker: este é o beat do "por que eu deveria me importar". Dois modos de falha distintos, e
eles mapeiam para os dois números. (1) Sem limit → um memory leak ou um loop descontrolado em
um Pod consome o node e degrada ou mata os vizinhos (o problema do noisy neighbour). (2) Sem
request → o scheduler trata o Pod como se precisasse de ~nada, lota o node, e agora a demanda
real excede a capacidade: Pods são despejados por OOM ou Pods novos ficam Pending. A seção
inteira é: requests resolvem o lado do agendamento, limits resolvem o lado do enforcement.
Segure o modelo mental — próximo slide.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · dois números, dois trabalhos</span>

# Requests agendam · limits impõem

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="requests — o que o scheduler reserva" kind="pod" variant="ok">
      O Pod só cai em um node com essa quantidade de <strong>capacidade livre</strong>, e essa
      quantidade fica <strong>reservada</strong> para ele. Dirige o <strong>agendamento</strong> e o QoS.
      Alto demais → o Pod fica <code>Pending</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="limits — o teto que o kubelet impõe" kind="pod" variant="warn">
      O máximo que o container pode usar em runtime. Dirige o <strong>enforcement</strong>. Ultrapasse-o
      e — dependendo do recurso — você é <strong>throttled</strong> ou
      <strong>morto</strong>.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">a assimetria que derruba todo mundo</span>

<div class="kw-cols-2 mt-1">
  <KwCard heading="CPU é compressível" icon="🎚️">
    Acima do limit → <strong>throttled</strong>: o kernel limita sua fatia de CPU. Lento, mas
    <strong>nunca morto</strong>.
  </KwCard>
  <KwCard heading="Memória é incompressível" icon="💥" variant="danger">
    Acima do limit → <strong>OOMKilled</strong>: não dá para "fazer throttle" de RAM, então o kernel
    <strong>mata</strong> o container (exit 137).
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: o slide mais importante de todos. requests e limits parecem simétricos no YAML mas fazem
trabalhos completamente diferentes. requests é uma entrada de AGENDAMENTO — o scheduler soma os
requests em um node e só faz o bind de um Pod se o request cabe no restante alocável; é uma
reserva, não uma medição de uso real. limits é uma entrada de RUNTIME — o kubelet programa cgroups
para que o container não consiga ultrapassá-lo. Então a assimetria (clique 3): CPU é compressível,
então "demais" só significa que o CFS scheduler faz throttle — o container fica lento mas
sobrevive. Memória é incompressível — não existe "usar um pouco mais devagar", então o kernel dá
OOM-kill no container (exit code 137 = 128 + SIGKILL 9). Os alunos confundem isso o tempo todo; a
animação dois slides adiante torna isso físico. Domínio de resource-management da CKA/CKAD.
-->

---
layout: code-annotated
heading: 'Um bloco resources, quatro números'
compact: true
lab: labs/day-2/13-resources.md
---

```yaml {none|7-9|10-12|8,11|9,12}
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s13 } }
spec:
  template:
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          resources:
            requests: { cpu: 100m, memory: 128Mi }   # reserva
            limits:   { cpu: 500m, memory: 256Mi }    # teto
```

::notes::

<CodeNote at="1" label="requests = a reserva" variant="ok">
O scheduler só posiciona este Pod onde <strong>100m de CPU + 128Mi</strong> estão livres, e os
mantém reservados. <code>100m</code> = 0,1 de um core (<code>m</code> = millicores). Memória é bytes;
<code>Mi</code> = mebibytes (2²⁰), <code>M</code> = megabytes (10⁶) — não é a mesma coisa.
</CodeNote>

<CodeNote at="2" label="limits = o teto" variant="warn">
Teto de runtime. CPU acima de <code>500m</code> → throttled; memória acima de <code>256Mi</code> →
OOMKilled. Um <code>limit</code> sem <code>request</code> faz o Kubernetes copiar o limit
para o request.
</CodeNote>

<CodeNote at="3" label="CPU: request &lt; limit = espaço de burst">
O container tem <code>100m</code> garantidos e pode fazer burst até <code>500m</code> <em>se o
node tiver CPU sobrando</em>. Essa folga é o motivo de o QoS deste Pod ser <strong>Burstable</strong>.
</CodeNote>

<CodeNote at="4" label="memória: cuidado com a folga" variant="danger">
Ela pode subir até <code>256Mi</code> antes do kill — mas nada <em>reserva</em> além de
<code>128Mi</code>, então sob pressão no node o excedente não está protegido.
</CodeNote>

<!--
Speaker: decodifique as unidades, elas causam bugs de verdade. CPU é millicores: 1000m = 1 vCPU,
100m = 1/10 de um core, e é uma taxa, não uma cota. Sufixos de memória: Mi/Gi são binários (1Mi =
1048576 bytes), M/G são decimais (1M = 1000000) — misturá-los dá surpresas de ~5% e
ocasionalmente um agendamento que falha. A folga request/limit em CPU é espaço legítimo de burst;
em memória a folga é mais perigosa porque tudo acima do request não está reservado, então o
node pode recuperá-lo. A quarta nota antecipa o QoS: request != limit aqui → Burstable. Visão
compacta de ensino; o lab entrega os manifestos completos aplicáveis.
-->

---
layout: code-walkthrough
heading: 'Construa passo a passo — de BestEffort a um Pod Burstable com teto'
lab: labs/day-2/13-resources.md
---

````md magic-move
```yaml
# 1: nenhum resource — o container web como ele começou o dia
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    # (sem bloco resources)
    # o scheduler assume ~0 → risco de overcommit; classe de QoS: BestEffort
```

```yaml
# 2: +requests — agora o scheduler RESERVA capacidade (QoS → Burstable)
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    resources:
      requests:                     # o que o scheduler retém para este Pod
        cpu: 100m
        memory: 128Mi
```

```yaml
# 3: +limits — adicione o teto de runtime que o kubelet impõe
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:                       # acima em CPU → throttled; acima em memória → OOMKilled
        cpu: 500m
        memory: 256Mi
```
````

<!--
Speaker: TRÊS quadros, cada um um estado real de QoS. (1) Sem resources → BestEffort: o scheduler
acha que o Pod não precisa de nada, primeiro a ser despejado sob pressão. (2) Adicione requests →
o scheduler agora reserva e a classe vira Burstable; note que poderíamos parar aqui — um Pod com
requests e sem limits é válido e comum (reservar um piso, permitir burst). (3) Adicione limits →
o kubelet programa o teto do cgroup; continua Burstable porque request != limit. Para chegar a
Guaranteed você definiria limits == requests para AMBOS cpu e memória (daqui a dois slides). Isso
faz crescer o mesmo container web que o deck carrega desde o S06; o lab aplica os arquivos em
estilo de bloco.
-->

---

<span class="kw-kicker">Mesma violação de limit · desfecho oposto</span>

# Throttled vs morto, ao vivo

<div class="mt-2">
  <ResourcePressure :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Os dois containers **ultrapassam** o seu limit — o caminho de enforcement bifurca por recurso.
- **CPU** é compressível → o kernel faz **throttle**. Lento, ainda `Running`, sem restart.
- **Memória** é incompressível → o kernel dá **OOMKill** (`exit 137`).
- O kubelet **reinicia** o container morto conforme a `restartPolicy` → `RESTARTS 1` (um
  memory leak de verdade vira `CrashLoopBackOff`).

</v-clicks>
</div>

<!--
Speaker: conduza com os cliques; esta é a punchline da seção tornada física. (0) os dois abaixo
dos seus limits, nada a impor. (1) os dois estouram. (2) a faixa de CPU trava no teto e continua
Running — throttling é invisível no `get pods` (STATUS continua Running), você só o vê em
métricas/latência; a faixa de memória bate no teto e leva SIGKILL, exit 137. (3) o kubelet
reinicia o container de memória (RESTARTS incrementa); se ele estoura OOM de novo você tem
CrashLoopBackOff com o timer de backoff. O aprendizado que os alunos têm que levar: "Running"
NÃO significa saudável — um Pod throttled fica silenciosamente lento, e RESTARTS subindo com
OOMKilled no `describe` significa que o limit de memória está baixo demais (ou a aplicação
vaza). Isso é exatamente o quebre→conserte do lab.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Classe de QoS · atribuída pelo Kubernetes a partir do que você define — nunca digitada por você</span>

# Três classes de QoS, três prioridades de eviction

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="Guaranteed" icon="🟢" variant="ok">
      <strong>Todo</strong> container define <strong>ambos</strong> cpu &amp; memória, e cada
      <code>request == limit</code>.
      <div class="kw-muted mt-1">Último a ser despejado. (Só limits conta — o Kubernetes os copia
      para os requests.)</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Burstable" icon="🟡" variant="warn">
      Pelo menos um request ou limit definido, mas <strong>não</strong> Guaranteed.
      <div class="kw-muted mt-1">Nosso Pod <code>web</code> — reserva um piso, pode fazer burst até
      o teto. Despejado depois do BestEffort.</div>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="BestEffort" icon="🔴" variant="danger">
      <strong>Nenhum</strong> request ou limit <strong>em lugar nenhum</strong> do Pod.
      <div class="kw-muted mt-1">Primeiro a ser despejado sob pressão de memória no node. Ok para
      coisa descartável, perigoso para qualquer coisa com que você se importa.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

Você não <em>escolhe</em> uma classe de QoS — o Kubernetes a <strong>deriva</strong> dos seus
`resources` e a mostra no <code>kubectl describe pod</code> (<code>QoS Class:</code>). Ela
decide a <strong>ordem de eviction</strong> quando um node fica sem memória.

</div>

</div>

<!--
Speaker: precisão importa aqui — o atalho "alguns definidos" do AC é frouxo, então enuncie as
regras exatas. GUARANTEED: todo container do Pod tem cpu E memória definidos, e para cada um o
request é igual ao limit. Pegadinha sutil que vale dizer em voz alta: se você define SÓ limits,
o Kubernetes os copia para os requests, então um Pod só-limits ainda é Guaranteed, não Burstable.
BURSTABLE: pelo menos um container tem algum request ou limit, mas o Pod não alcança a barra do
Guaranteed — este é o caso comum do mundo real. BESTEFFORT: nada definido em lugar nenhum. Por
que importa: sob pressão de memória no node o kubelet despeja BestEffort primeiro, depois
Burstable excedendo os requests, e Guaranteed por último — então QoS é o seu seguro contra
eviction. Você nunca digita uma classe de QoS; ela é derivada e aparece no `describe pod`. O lab
confirma as três lendo o `describe`.
-->

---
clicks: 3
---

<span class="kw-kicker">Right-sizing · os números vêm de um gráfico, não de achismo</span>

# Dimensione contra o que a aplicação realmente usa

<div class="mt-2">
  <RightSizing :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Um request **chutado** reserva capacidade que ninguém usa — o livro-caixa do node se enche de ficção e Pods reais ficam `Pending`.
- **Right-size:** defina o request no **steady state** observado — a reserva bate com a realidade.
- Defina o **limit** como folga de burst acima dele — o pico diário cabe, nada é OOMKilled, nada fica acumulado.

</v-clicks>
</div>

<!--
Speaker: conduza com os cliques — este é o momento de gráfico de dashboard que todo time de
plataforma vive. (0) a única verdade: o uso observado, steady state ~90Mi com um burst diário.
(1) o request chutado, 512Mi "por garantia": a faixa sombreada é capacidade que o scheduler
RETÉM — lembre, requests são uma reserva, não uma medição — então um node cheio de requests
chutados está "cheio" enquanto seu uso real fica ocioso; é assim que clusters acabam 30%
utilizados e ainda rejeitando Pods. (2) right-size: o request logo acima do steady state — o
mesmo Pod, contabilizado com honestidade. (3) o limit como folga de burst: o pico cabe abaixo de
256Mi, então sem OOMKill (beat da assimetria!), e nada acima do request fica acumulado. As duas
direções de falha para dizer em voz alta: request ALTO demais desperdiça o cluster (dinheiro,
vizinhos Pending); limit BAIXO demais mata o burst (exit 137, da animação anterior). Próximo
slide: de onde vêm esses números observados.
-->

---
layout: code-annotated
heading: 'O loop de observação — `kubectl top`, depois ajuste'
compact: true
lab: labs/day-2/13-resources.md
---

```console {none|1-3|5|all}
$ kubectl top pod -l app=s13     # uso vs o que você definiu
NAME                    CPU(cores)   MEMORY(bytes)
web-6d5f8c7b9d-x2x7v    3m           92Mi

$ kubectl describe node <node>   # → "Allocated resources"
```

::notes::

<CodeNote at="1" label="uso, ao vivo" variant="ok">
Um <code>92Mi</code> estável contra um request de <code>128Mi</code> é honesto; contra
<code>512Mi</code> é acumulação. Precisa do <strong>metrics-server</strong> (a seção de HPA
o instala).
</CodeNote>

<CodeNote at="2" label="o livro-caixa do node">
<code>Allocated resources</code> soma os <strong>requests</strong> de todos os Pods
contra o alocável. Uma distância grande entre <em>requested</em> e <em>used</em> é
dívida de right-sizing.
</CodeNote>

<CodeNote at="3" label="um loop — e VPA em escala" variant="ok">
Observe → ajuste → acompanhe (<code>OOMKilled</code>, throttling,
<code>Pending</code>). Em escala o <strong>VerticalPodAutoscaler</strong>
recomenda tamanhos; o HPA escala <em>para fora</em> — não aponte os dois para um mesmo recurso.
</CodeNote>

<!--
Speaker: o gráfico do slide anterior é aspiracional até você ter números — é daqui que eles vêm.
kubectl top lê o pipeline de métricas (metrics-server), que é um add-on: o kind não o traz de
fábrica, a seção de HPA S16 o instala, e clusters gerenciados normalmente o têm. Times de verdade
observam janelas mais longas do que um top ao vivo — uma stack de métricas (o Prometheus + Grafana
do S23) dá os percentis; o top é a versão de cinco segundos do mesmo loop. A tabela Allocated
resources do describe node é o livro-caixa do scheduler do slide de modelo mental tornado
visível — percorra: requests somados vs alocável, e a distância até o uso real é exatamente a
faixa sombreada do gráfico. Feche com a escada de automação: o VPA observa o uso por Pod e
recomenda (ou aplica) mudanças de requests — nível de conceito aqui, é uma instalação separada e
o modo de aplicação reinicia Pods; o HPA muda as RÉPLICAS. A cautela clássica: não deixe o VPA
redimensionar e o HPA escalar na mesma métrica ou eles ficam se perseguindo. O quebre→conserte
do Lab 13 já mostrou os modos de falha que o right-sizing evita.
-->

---
layout: comparison
class: kw-cmp-compact
heading: 'Guarda-corpos de namespace — para ninguém precisar lembrar'
leftHeading: 'LimitRange'
leftBadge: 'por objeto'
rightHeading: 'ResourceQuota'
rightBadge: 'total do namespace'
---

Defaults & limites **por container**, na admission.

```yaml
apiVersion: v1
kind: LimitRange
metadata: { name: defaults }
spec:
  limits:
    - type: Container
      default: { cpu: 500m, memory: 256Mi }
      defaultRequest: { cpu: 100m, memory: 128Mi }
      max: { cpu: '2', memory: 1Gi }
```

<v-clicks>

- **Injeta** requests/limits quando omitidos → BestEffort vira Burstable.
- Rejeita containers **acima do `max`** / abaixo do `min`.

</v-clicks>

::right::

Um teto agregado **do namespace inteiro** — a soma de todos os Pods.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata: { name: team-cap }
spec:
  hard:
    requests.cpu: '2'
    requests.memory: 2Gi
    limits.cpu: '4'
    limits.memory: 4Gi
    pods: '10'
```

<v-clicks>

- A quota nomeia um recurso → todo Pod **precisa** defini-lo (`must specify…`).
- Estourou o orçamento → admission `exceeded quota:` (nada é criado).

</v-clicks>

<!--
Speaker: dois trabalhos diferentes, ambos em tempo de admission. LimitRange é POR OBJETO: fornece
requests/limits default aos containers que não os definem (que é como você impede Pods BestEffort
de entrarem escondidos) e impõe min/max por container. ResourceQuota é o teto AGREGADO DO
NAMESPACE: a soma de todos os requests/limits (e contagens de objetos) não pode exceder os
valores hard. A interação que o lab explora: uma vez que uma quota restringe, digamos,
requests.memory, um Pod que o OMITE falha com "must specify requests.memory", enquanto um Pod que
o DEFINE ALTO DEMAIS falha com "exceeded quota" — dois erros diferentes, e os defaults do
LimitRange são o que salva você do primeiro. Ambos rejeitam na admission, então o Pod nunca
existe — contraste isso com o OOMKill, que acontece a um Pod que existe de verdade. Esse
contraste é a pergunta do recap.
-->

---
layout: recap
heading: 'Recap — reserve, limite, e saiba o caminho do enforcement'
story: 'O container OOMKilled voltou (RESTARTS 1); o Pod que estourou a quota nunca chegou a existir — enforcement de runtime vs de admission.'
next: 'Health probes — readiness, liveness, startup, e como elas controlam tráfego vs restart'
---

- **requests** dirigem o **agendamento** (reserva + retenção); **limits** dirigem o **enforcement** (teto de runtime)
- CPU acima do limit → **throttled** (lento, vivo); memória acima do limit → **OOMKilled** (exit 137) → reiniciado
- **QoS** é *derivado*: **Guaranteed** (tudo definido, request==limit) · **Burstable** (algum) · **BestEffort** (nenhum) — define a ordem de eviction
- **LimitRange** = defaults/limites por objeto (injeta requests); **ResourceQuota** = teto agregado do namespace
- Duas rejeições, um insight: **OOMKilled** = runtime (o kubelet reinicia) vs **exceeded quota** = admission (o API server rejeita — nada é criado)

<!--
Speaker: amarre o fio condutor. O gancho mental são os dois momentos de enforcement: admission
(antes de o objeto existir — quota/LimitRange dizem "não, nunca") vs runtime (o objeto existe e
se comporta mal — throttle ou OOMKill). Essa é literalmente a pergunta do recap no lab: "por que
o container OOMKilled foi reiniciado mas o Pod que violou a quota nunca foi criado?" — porque um
é imposto pelo kubelet em runtime e o outro pelo API server na admission. Faça right-sizing
observando o uso real (kubectl top, métricas) e defina os requests no steady state, os limits
como uma folga segura de burst; limit de memória ≈ request para qualquer coisa que você não pode
se dar ao luxo de ver morta. Passe o bastão para o Lab 13: ler as três classes de QoS, forçar um
OOMKill e ler o exit 137, depois bater numa ResourceQuota. Próxima seção: probes — o outro
motivo pelo qual um Pod Running não é necessariamente saudável.
-->

---
layout: lab
lab: labs/day-2/13-resources.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 13 — Teste de pressão

- Aplique as variantes Burstable / Guaranteed / BestEffort e leia a **QoS Class** no
  `kubectl describe pod`
- **Quebre→conserte:** rode um container que aloca além do seu limit de memória → **OOMKilled**
  (`exit 137`, restarts) → aumente o limit e confirme que ele estabiliza
- Aplique uma **ResourceQuota**, depois tente criar um Pod que a **exceda** → erro de admission
  `exceeded quota:`
- Responda a manchete: *por que o container OOMKilled foi reiniciado, mas o Pod que
  violou a quota nunca foi criado?*
