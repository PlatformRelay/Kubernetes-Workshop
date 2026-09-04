---
layout: section-cover
image: /covers/section-14-clinic.webp
day: Day 2
section: '14'
tier: core
track: Workloads
---

# Health probes

Um Pod `Running` não está necessariamente **pronto** para servir — nem sequer **saudável**.

**core** · sugerido para o Day 2 · trilha Workloads

<!--
Seção S14 — Health probes. Tempo: ~30 min de slides + 30 min de lab. Vem depois do S13.
Resultado: os participantes conseguem dizer o que cada uma das três probes faz — readiness
controla o tráfego, liveness reinicia o container, startup protege inicializações lentas e
suspende as outras duas — os mecanismos de probe (httpGet/tcpSocket/exec/grpc) e os campos-chave
de timing, e as misconfigurations clássicas (liveness que flapa, readiness que nunca passa).
Beats: problema (Running ≠ pronto ≠ saudável) · modelo mental (três probes, três trabalhos) ·
code-annotated (uma readiness probe, cada campo decodificado) · magic-move (+readiness → +liveness
→ +startup no Deployment web do fio condutor) · animação ServiceRouting REUSADA (falha de
readiness drena um Pod da EndpointSlice, zero downtime — a variante US-X3 para a qual o componente
foi construído) · bifurcação de duas setas divergentes (readiness ✗ = fora dos endpoints, sem
restart / liveness ✗ = restart) · beat de misconfig · recap → lab.
Animação: ServiceRouting.vue REUSADA conforme a guarda de reuso do AGENT.md e o AC da US-S14
("reused animation, US-X3 variant, extends S07"); nenhum componente novo. A metade liveness das
"duas setas divergentes" é uma bifurcação estática com KwCard, não uma segunda animação.
Red line: estende o Deployment `web` do S06/S07 adicionando probes; o quadro final do magic-move
bate byte a byte com o spec de container do deployment-probes.yaml do lab (estilo âncora S07/S08).
CKx: CKAD Observability — probes de liveness/readiness/startup e seus efeitos de tráfego/restart.
-->

---
layout: statement
kicker: O problema
---

`Running` é uma mentira que você conta aos seus usuários.

O Deployment `web` reporta `3/3` e todo Pod diz `Running` — então o Service envia
tráfego. Mas `Running` só significa *o processo iniciou*: a aplicação pode ainda estar aquecendo,
esperando uma dependência, ou travada em um deadlock, servindo nada além de erros. O Kubernetes
não consegue distinguir um Pod ocupado de um Pod quebrado **a menos que você o ensine a
perguntar**. É isso que uma **probe** é.

<!--
Speaker: o beat do "por que eu deveria me importar". Phase == Running é uma barra baixa —
significa que o PID 1 está de pé, nada mais. Dois modos de falha se escondem atrás dela: (1) um
Pod que está de pé mas AINDA não consegue servir (aquecimento lento, esperando uma dependência) —
envie tráfego e os usuários recebem erros em todo rollout; (2) um Pod que SERVIA mas desde então
travou (deadlock, connection pool vazado) — ele vai ficar ali Running para sempre, um buraco
negro no seu load balancer. Ambos são invisíveis para o `kubectl get pods`. Uma probe é como você
entrega ao Kubernetes uma pergunta de saúde para fazer em seu nome, numa cadência. Próximo slide:
as três perguntas, e as três coisas diferentes que o Kubernetes faz com as respostas.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · três probes, três trabalhos diferentes</span>

# Faça uma pergunta · aja sobre a resposta

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="readiness — posso receber tráfego?" kind="pod" variant="ok">
      Falha → o Pod é retirado da <strong>EndpointSlice</strong> do seu Service. Ele continua
      <strong>Running</strong>; só para de receber requisições até passar de novo.
      <div class="kw-muted mt-1">Controla o tráfego. Sem restart.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="liveness — você ainda está vivo?" kind="pod" variant="warn">
      Falha <code>failureThreshold</code> vezes → o kubelet <strong>reinicia o
      container</strong> no lugar (<code>RESTARTS ↑</code>). Para processos travados que nunca
      vão se recuperar sozinhos.
      <div class="kw-muted mt-1">Dispara restart. Neutro para o tráfego.</div>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="startup — você terminou de subir?" kind="pod" variant="danger">
      Roda <strong>primeiro</strong> e <strong>suspende</strong> readiness &amp; liveness até
      passar — para um boot lento não ser confundido com um crash.
      <div class="kw-muted mt-1">Protege quem inicia devagar.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 kw-muted text-sm">

A que derruba todo mundo: **readiness e liveness não são o mesmo check.** Readiness ✗
significa *não me mande trabalho ainda*; liveness ✗ significa *estou quebrado, me reinicie*.
Ligue o mesmo check falhando às duas e um soluço de aquecimento vira um loop de restart.

</div>

</div>

<!--
Speaker: o slide-âncora. As três probes mapeiam para três verbos — readiness → REMOVER DOS
ENDPOINTS, liveness → REINICIAR, startup → ESPERAR. Readiness é a válvula de segurança de todo
rolling update (S06/S07): um Pod novo fica fora do load balancer até estar genuinamente pronto,
então os usuários nunca acertam uma réplica meio-iniciada. Liveness é a válvula de self-healing:
um processo que trava em deadlock (ainda Running, respondendo nada) leva um bounce. Startup é a
mais nova e mais subutilizada — ela existe porque as pessoas costumavam gambiarrar
`initialDelaySeconds` na liveness para sobreviver a boots lentos, o que é frágil; a startup dá a
quem inicia devagar um orçamento generoso e separado e só ENTÃO passa o bastão para a liveness. O
clique 4 é o equívoco a matar cedo: readiness != liveness. Se o seu endpoint de saúde checa um DB
downstream e você o liga à LIVENESS, um soluço do DB reinicia todos os seus Pods (piorando tudo);
ligue-o à READINESS e eles apenas drenam até o DB voltar. Check certo, probe certa.
-->

---
layout: code-annotated
heading: 'Uma probe, cada botão que importa'
compact: true
lab: labs/day-2/14-probes.md
---

```yaml {none|2|3|5|6-7}
readinessProbe:
  httpGet:                    # mecanismo: HTTP GET
    path: /ready
    port: 8080
  initialDelaySeconds: 0      # espere isso antes da PRIMEIRA probe
  periodSeconds: 5            # depois, uma probe a cada 5s
  failureThreshold: 3         # tantas falhas seguidas = falhou
```

::notes::

<CodeNote at="1" label="mecanismo — quatro formas de perguntar" variant="ok">
<code>httpGet</code> (2xx/3xx = passou, ≥400 = falhou), <code>tcpSocket</code> (consigo abrir a
porta?), <code>exec</code> (rode um comando, exit 0 = passou), e <code>grpc</code> (health
nativo de gRPC). Escolha o que reflete saúde <em>de verdade</em>, não só "porta aberta".
</CodeNote>

<CodeNote at="2" label="path — sonde um endpoint dedicado">
<code>/ready</code> aqui, não <code>/</code>. A aplicação de demo é dona deste endpoint e responde
200 ou 503 a partir da sua própria lógica — então readiness reflete "consigo realmente servir",
não "o processo do web server está escutando".
</CodeNote>

<CodeNote at="3" label="initialDelaySeconds — carência antes da primeira pergunta" variant="warn">
Dê à aplicação tempo de iniciar antes da primeira probe. Em quem inicia devagar este é o campo
que as pessoas abusam — uma <strong>startupProbe</strong> é a ferramenta certa no lugar (daqui
a dois slides).
</CodeNote>

<CodeNote at="4" label="periodSeconds / failureThreshold — quão nervosa">
Tempo efetivo de reação ≈ <code>periodSeconds × failureThreshold</code>. Apertado demais → soluços
saudáveis tiram o Pod da rotação; frouxo demais → demora a notar uma falha real. <code>3 × 5s = 15s</code>
aqui.
</CodeNote>

<!--
Speaker: o slide de nível de campo — estes botões causam a maioria dos bugs de probe.
MECANISMOS: httpGet é o comum, e note a regra de sucesso (qualquer 2xx ou 3xx passa; 400+
falha — é assim que o lab quebra a readiness: POST /fail vira o /ready da aplicação para 503).
tcpSocket para não-HTTP (bancos, brokers). exec para "rode um script" (o mais flexível, o mais
caro — faz fork de um processo a cada período). grpc para serviços que falam o protocolo padrão
de health de gRPC. TIMING: a janela de reação é periodSeconds × failureThreshold — memorize, é
isso que você ajusta. Uma liveness probe com periodSeconds 1 / failureThreshold 1 vai reiniciar
um Pod por causa de uma única pausa de GC; esse é o antipattern da "liveness que flapa" dois
slides adiante. initialDelaySeconds é o período de carência tosco que as pessoas pregam na
liveness para apps lentas — a startup probe o substitui. Esta é uma readiness probe sozinha; o
lab entrega as três no Deployment em execução.
-->

---
layout: code-walkthrough
heading: 'Construa passo a passo — ensine o Deployment web a reportar a própria saúde'
lab: labs/day-2/14-probes.md
---

````md magic-move
```yaml
# 1: o container web como a seção de Service o deixou — "Running" no instante em que o processo inicia
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    ports: [{ containerPort: 8080 }]
    # sem probes → o Kubernetes assume processo-de-pé = pronto E saudável
```

```yaml
# 2: +readiness — controle o tráfego por um endpoint dedicado que a própria aplicação possui
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    ports: [{ containerPort: 8080 }]
    readinessProbe:
      httpGet: { path: /ready, port: 8080 }   # 200 = mande tráfego, 503 = me drene
      periodSeconds: 5
      failureThreshold: 3
```

```yaml
# 3: +liveness — reinicie o container se ele travar (uma pergunta DIFERENTE da readiness)
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    ports: [{ containerPort: 8080 }]
    readinessProbe:
      httpGet: { path: /ready, port: 8080 }
      periodSeconds: 5
      failureThreshold: 3
    livenessProbe:
      httpGet: { path: /healthz, port: 8080 }  # 200 enquanto o processo serve
      periodSeconds: 10
      failureThreshold: 3
```

```yaml
# 4: +startup — dê espaço a um boot lento; readiness & liveness ficam suspensas até ela passar
containers:
  - name: web
    image: ghcr.io/platformrelay/workshop-web:v1
    ports: [{ containerPort: 8080 }]
    readinessProbe:
      httpGet: { path: /ready, port: 8080 }
      periodSeconds: 5
      failureThreshold: 3
    livenessProbe:
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 10
      failureThreshold: 3
    startupProbe:
      httpGet: { path: /healthz, port: 8080 }
      periodSeconds: 3
      failureThreshold: 30          # até 90s para subir antes de a liveness assumir
```
````

<!--
Speaker: QUATRO quadros, cada um um estado real do mesmo container web que o deck carrega desde a
S06. (1) Sem probes: "Running" é o único sinal, e ele é uma mentira no momento em que a aplicação
precisa de aquecimento. (2) +readiness em /ready — a aplicação de demo é dona deste endpoint no
próprio código (exatamente o que você quer que apps reais façam), e ele pode ser virado em
runtime: POST /fail faz o /ready responder 503, POST /recover o vira de volta. É assim que o lab
quebra a readiness de UM Pod sem tocar no processo (readiness falha → o Pod drena, mas a liveness
em /healthz ainda é 200, então ele NÃO é reiniciado). (3) +liveness em /healthz —
deliberadamente um alvo DIFERENTE da readiness, para que as duas não possam ser confundidas:
/healthz responde 200 enquanto o processo servir, /ready responde "devo receber tráfego agora".
(4) +startup em /healthz com um orçamento generoso de 30×3s = 90s; enquanto ela roda, readiness e
liveness ficam retidas, então um boot lento não pode ser confundido com um crash loop. O spec de
container do quadro 4 é byte a byte o deployment-probes.yaml do lab — o mesmo manifesto do fio
condutor. Para chegar ao lab, aplique isso e veja os três Pods alcançarem READY 1/1.
-->

---

<span class="kw-kicker">Readiness falha · drene, não reinicie</span>

# Um Pod fica NotReady — o tráfego só reroteia

<div class="mt-2">
  <ServiceRouting :step="$clicks" reason="com a readiness probe falhando" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Estado estável: o Service balanceia a carga entre **os três** endpoints.
- A readiness probe de um Pod começa a falhar — ele vira **NotReady**, ainda `Running`, e por
  um instante seu IP ainda está na slice.
- O endpoint controller **o remove da EndpointSlice**; o tráfego reroteia para os dois saudáveis
  — **nenhum erro chega a quem chamou**.

</v-clicks>
</div>

<!--
Speaker: esta é a animação ServiceRouting do S07, reusada — readiness é literalmente o mecanismo
que decide quem está na EndpointSlice de um Service. Conduza com os cliques: (0) três Pods Ready,
três endpoints. (1) uma requisição se espalha — balanceada. (2) a readiness de um Pod fica
vermelha; ele continua Running (esta é a parte crucial — ele NÃO é reiniciado, NÃO é deletado) e
por um instante seu IP AINDA está na slice — o kubelet o marcou NotReady mas o endpoint
controller ainda não reconciliou. (3) o controller remove o IP da slice, o kube-proxy reprograma,
e o tráfego para de alcançá-lo. Os outros dois absorvem o tráfego; o usuário não vê nada — isso
é zero-downtime por design. É exatamente nisso que um rolling update se apoia: um Pod novo é
mantido fora da slice até a readiness passar, então os usuários nunca tocam uma réplica
meio-aquecida. No lab você vai causar isso com um POST /fail em UM Pod (o /ready dele vira 503) e
ver o IP dele sumir do `get endpointslices` enquanto o curl continua retornando 200 dos outros.
Contraste com a liveness no próximo slide — falha de aparência igual, desfecho completamente
diferente.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mesmo sintoma · resposta oposta — a bifurcação para lembrar</span>

# Readiness drena · liveness reinicia

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="readiness ✗  →  fora dos endpoints" kind="pod" variant="warn">
    O Pod continua <strong>Running</strong>, <code>READY 0/1</code>, <code>RESTARTS 0</code>.
    Removido da EndpointSlice → sem tráfego. Passa de novo → <strong>volta</strong>, sem
    restart, sem dados perdidos.
    <div class="kw-muted mt-1">Use para: aquecimento, um momento de pico, uma dependência ausente.</div>
  </KwCard>
  <KwCard heading="liveness ✗  →  reiniciado no lugar" kind="pod" variant="danger">
    O kubelet mata &amp; reinicia o container → <code>RESTARTS ↑</code>, a phase continua
    <strong>Running</strong>. Continua quicando estilo OOM → <strong>CrashLoopBackOff</strong>.
    <div class="kw-muted mt-1">Use para: deadlocks que um restart realmente resolve.</div>
  </KwCard>
</div>

<div v-click="1" class="mt-4 text-sm">

<span class="kw-kicker">e a guarda na frente das duas</span>

<KwCard heading="startup ✗ (ainda rodando)  →  ninguém entra em pânico ainda" icon="⏳">
Enquanto a probe de <strong>startup</strong> ainda está tentando, readiness e liveness ficam
<strong>suspensas</strong> — um boot de 45 segundos não pode estourar um timeout de liveness de
15 segundos. A startup finalmente passa → as outras duas assumem. A startup <em>esgota</em> seu
orçamento → o container é morto como failed-to-start.
</KwCard>

</div>

</div>

<!--
Speaker: o slide-punchline — duas setas divergentes a partir da mesma falha aparente. ESQUERDA
(readiness): o Pod está bem, ele só diz "agora não" — sem restart, RESTARTS fica em 0, ele sai
dos endpoints e volta limpo. Esta é a segura, reversível. DIREITA (liveness): o kubelet toma
uma atitude — mata e reinicia o container; se o que está errado persiste, cada restart falha de
novo e você tem CrashLoopBackOff com um timer de backoff exponencial. A armadilha que os alunos
precisam evitar: colocar um check de dependência (DB alcançável?) na LIVENESS — agora uma queda
do DB reinicia todos os Pods, transformando um brown-out em outage; o mesmo check na READINESS
só os drena até o DB voltar. Clique 1: a startup é o árbitro — ela segura as outras duas durante
o boot, para você parar de abusar de initialDelaySeconds na liveness.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">As duas formas de as probes morderem de volta</span>

# Misconfigurations clássicas

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Liveness que flapa" kind="pod" variant="danger">
      Um check de liveness apertado demais (<code>periodSeconds 1</code>) ou apontado para uma
      dependência lenta reinicia o container por causa de uma pausa de GC ou um soluço do DB.
      Restarts não consertam uma aplicação *ocupada* — eles multiplicam a carga →
      <strong>CrashLoopBackOff</strong> na frota inteira.
      <div class="kw-muted mt-1">Conserto: afrouxe o timing; sonde a <em>si mesmo</em>, não os
      downstreams; use <strong>startup</strong> para boots lentos.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Readiness que nunca passa" kind="pod" variant="warn">
      Um path/porta errado, ou um check de readiness esperando algo que nunca chega, mantém todo
      Pod em <code>READY 0/1</code>. Os endpoints ficam vazios, o Service não tem para onde
      rotear, e um <strong>rolling update trava</strong> — o novo ReplicaSet nunca fica Available.
      <div class="kw-muted mt-1">Conserto: <code>describe pod</code> → leia o evento de falha da
      probe; corrija o path/porta.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 kw-muted text-sm">

As duas aparecem nos Events do <code>kubectl describe pod</code> como
<code>Readiness probe failed…</code> / <code>Liveness probe failed…</code> — o primeiro lugar
para olhar quando um Pod está `Running` mas nada funciona.

</div>

</div>

<!--
Speaker: os dois modos de falha que as pessoas de fato colocam em produção. LIVENESS QUE FLAPA:
o outage de probe mais comum que existe. Sintomas: RESTARTS subindo em muitos Pods ao mesmo
tempo, geralmente correlacionado com carga ou uma oscilação de dependência. Causas:
periodSeconds/failureThreshold agressivos demais, ou — a grande — uma liveness probe que checa
transitivamente um banco/cache, então quando AQUILO soluça todo Pod é reiniciado e o estouro da
manada torna a recuperação impossível. Cura: a liveness deve testar apenas "ESTE processo está
travado?", mantenha-a barata e tolerante, e mova a tolerância a boot lento para uma startup
probe. READINESS QUE NUNCA PASSA: um rollout que para em silêncio — os Pods do novo ReplicaSet
ficam 0/1 para sempre, o Deployment mostra réplicas unavailable, e como a readiness controla o
rollout, ele nunca completa (os Pods antigos continuam servindo, que é o recurso de segurança,
mas o seu deploy está travado). A causa é quase sempre um path/porta com typo ou um gate de
readiness sobre algo que não está de pé neste ambiente. Ambos são diagnosticáveis em um comando:
describe no Pod, leia os Events. Essa é a memória muscular que o lab constrói. O lab torna as
duas setas físicas: POST /fail → seta da esquerda (drenar); aponte a liveness para uma porta
morta → seta da direita (restart).
-->

---
layout: recap
heading: 'Recap — Running é um piso, não uma promessa'
story: 'Virar o `/ready` de um Pod para falha o drenou com zero downtime; apontar a liveness para uma porta morta quicou o container até consertarmos — mesmo sintoma, cura oposta.'
next: 'Jobs & CronJobs — workloads que rodam até completar, não para sempre'
---

- **readiness** controla o tráfego (dentro/fora da EndpointSlice) · **liveness** reinicia o
  container · **startup** protege um boot lento e suspende as outras duas
- Readiness ✗ = `Running`, `0/1`, drenado, **sem restart**; liveness ✗ = `RESTARTS ↑`, depois
  **CrashLoopBackOff**
- Mecanismos: `httpGet` (≥400 falha) · `tcpSocket` · `exec` · `grpc`; reação ≈
  `periodSeconds × failureThreshold`
- Sonde a **si mesmo**, não os downstreams — um check de dependência na *liveness* transforma um
  soluço em tempestade de restarts
- **Leia os Events:** `describe pod` mostra `Readiness/Liveness probe failed…` — a primeira
  parada quando `Running` não está servindo

<!--
Speaker: amarre o fio condutor. A seção inteira é uma correção a um instinto de iniciante —
"meu Pod está Running, então funciona". Running significa que o processo iniciou; readiness,
liveness e startup são como você prende significado real a isso. A bifurcação de duas setas é a
lembrança-chave: readiness é reversível e só-tráfego (drena/volta), liveness é um martelo
(restart/CrashLoop) — então mapeie cada check para a resposta que você realmente quer. Sonde a
própria saúde, mantenha a liveness barata e tolerante, e recorra à startup em vez de empilhar
initialDelaySeconds na liveness. O domínio Observability da CKAD mora bem aqui. Passe o bastão
para o Lab 14: adicionar as três probes, POST /fail para drenar um Pod com zero downtime, quebrar
a liveness para forçar restarts, e ver uma startup probe pastorear quem inicia devagar. Próxima
seção: Jobs & CronJobs — os primeiros workloads que DEVEM parar.
-->

---
layout: lab
lab: labs/day-2/14-probes.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 14 — Quebre as probes

- Adicione probes de readiness, liveness e startup ao Deployment `web`; confirme `READY 1/1` e
  três IPs na EndpointSlice
- **Quebre a readiness** em um Pod (`POST /fail` — o `/ready` dele vira 503) → ele sai da slice, o `curl` continua
  retornando 200 dos outros — **zero downtime** — depois conserte e veja-o voltar
- **Quebre a liveness** (aponte-a para uma porta morta) → `RESTARTS` sobe até `CrashLoopBackOff` →
  conserte e veja os restarts pararem
- Veja uma probe de **startup** pastorear um container deliberadamente lento para iniciar que a
  liveness mataria no meio do boot
- Responda: *a readiness falhou mas a aplicação nunca reiniciou — por quê?* e *por que os usuários
  não viram erros durante a quebra da readiness?*
