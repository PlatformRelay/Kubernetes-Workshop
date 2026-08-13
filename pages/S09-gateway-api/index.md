---
layout: section-cover
image: /covers/section-09-modular-customs-house.webp
day: Day 2
section: '09'
tier: recommended
track: Core
---

# Gateway API

"Linha vermelha" 5/5 · O sucessor tipado e com papéis separados do Ingress — o mesmo
modelo mental de roteamento, sem o espalhamento de annotations.

**recommended** · sugerido para o Day 2 · trilha Core

<!--
Seção S09 — Gateway API. Tempo: ~35 min de slides + 25 min de lab. Abre o Day 2 e
fecha a red line Pod → Deployment → Service → Ingress → Gateway API.
Resultado: os participantes conseguem explicar POR QUE o Gateway API existe (o teto do
Ingress visto no S08), nomear os três papéis (GatewayClass / Gateway / HTTPRoute) e quem
é dono de cada um, traduzir um Ingress em um Gateway + HTTPRoute na frente dos MESMOS
Services web/web2, adicionar um header match tipado + split ponderado, ler
status.conditions (Accepted / Programmed / ResolvedRefs) como o sinal de "conectou ou
não", e nomear a família de routes além do HTTP (GRPCRoute / TLSRoute / TCPRoute /
UDPRoute) com os modos TLS do listener (Terminate vs Passthrough).
Stack: CRDs do standard channel do Gateway API v1.5.1 + Envoy Gateway v1.8.2 (classe `eg`)
— fixados em infra/versions.env.
Beats: problema (espalhamento de annotations do Ingress, concretamente) · modelo mental
(separação de papéis em 3 caixas, parentRefs) · magic-move Ingress → Gateway + HTTPRoute →
header match tipado → split ponderado · animação GatewayRouting · pré-requisito (CRDs no
standard channel + um controller conformante + uma GatewayClass declarada explicitamente) ·
estado (conditions vs a opacidade do Ingress) · família de routes além do HTTP · modos TLS
Terminate/Passthrough · recap da red line · lab.
ACCURACY LOCKS da família de routes (verificados contra gateway-api.sigs.k8s.io + as
release notes v1.5.0/v1.6.0, 2026-08):
- GRPCRoute: GA, standard channel desde a v1.1.0.
- TLSRoute: GA (v1), standard channel desde a v1.5.0 — NÃO chame de experimental;
  roteia TLS Passthrough por SNI sem descriptografar.
- TCPRoute/UDPRoute: experimentais (v1alpha2) no NOSSO canal fixado v1.5;
  graduaram para standard (v1) na v1.6.0 — o slide diz exatamente isso.
- Os modos TLS do listener são Terminate e Passthrough; Passthrough pareia com
  TLSRoute; TCPRoute é encaminhamento L4 que ignora TLS.
Red line: o Gateway + HTTPRoute construídos aqui roteiam para os Services `web`/`web2`
do S07 — ele SUBSTITUI o ingress.yaml do S08 na frente dos mesmos backends. CKx: o CKA
agora inclui Gateway API; exposição de service no CKAD.
-->

---
layout: statement
kicker: O problema
---

No Lab 08, no momento em que você precisou de **mais do que host + path**, a config saiu do spec.

Um timeout de resposta, um header match, um peso de canary — nada disso está no schema do
Ingress, então vive em **annotations específicas de controller**: strings sem tipo,
sem validação e diferentes para cada controller. Um Ingress ajustado para um controller
não se move para o próximo — as annotations não acompanham. E um único objeto plano mistura
o que o **operador do cluster** possui (ports, TLS) com o que o **time de aplicação**
possui (paths, pesos). Você cresceu além do objeto.

<!--
Speaker: este é o cliffhanger do S08 tornado concreto. Mostre assim: no momento em que um
requisito real (timeout, roteamento por header, canary) aparece, você cai em annotations
por fornecedor e perde tipagem, validação, portabilidade e qualquer fronteira de papéis. O
controller do S08 ensinou isso com honestidade — o Contour lê um punhado de annotations
projectcontour.io/*, e sua resposta mais rica é o próprio CRD HTTPProxy: mesmo formato de
lock-in, outro fornecedor. Essa é exatamente a lacuna que o Gateway API foi projetado para
fechar — ele não substitui a *ideia* de roteamento, é só um lar mais bem tipado para ela.
O Lab 09 vem depois desta seção.
-->

---

<span class="kw-kicker">Modelo mental · um objeto virou três papéis</span>

# Três recursos, dois donos, conectados por nome

<div class="kw-cols-3 mt-4 text-sm">
  <v-click at="1">
    <KwCard heading="GatewayClass" icon="🏭">
      <strong>Infra.</strong> Nomeia uma implementação de controller (como um
      <code>IngressClass</code>). Escopo de cluster, instalada uma vez. O time de
      aplicação nunca toca nela.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Gateway" icon="🚪">
      <strong>Operador do cluster.</strong> O ponto de entrada de fato — <strong>listeners</strong>,
      ports, protocolo e <strong>TLS</strong> compartilhado. Referencia um
      <code>gatewayClassName</code>.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="HTTPRoute" icon="🛣️" variant="plain">
      <strong>Time de aplicação.</strong> As regras de roteamento — paths, <strong>headers</strong>,
      métodos, <strong>pesos</strong>. Anexa-se a um Gateway com
      <code>parentRefs</code>.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 kw-muted text-sm">

Essa separação é o ponto central. A infra é dona da porta; o time de aplicação é dono do
roteamento — cada um em seu **próprio objeto tipado**, em seu **próprio namespace**,
conectados por uma referência `parentRefs`. Sem objeto plano compartilhado, sem
annotations à solta.

</div>

<!--
Speaker: revele os três cards, depois o payoff. Mapeie cada um de volta ao Ingress:
GatewayClass ≈ IngressClass (infra); Gateway é a NOVIDADE — um ponto de entrada tipado, de
primeira classe, que o operador possui (o Ingress não tinha equivalente — ports/TLS
ficavam espalhados por annotations); HTTPRoute são as regras do time de aplicação. O
aperto de mão do parentRefs é o que permite aos dois times entregar de forma independente.
Essa separação de papéis é a razão nº 1 de grandes organizações adotarem o Gateway API,
não os tipos extras de match.
-->

---
layout: code-walkthrough
heading: 'Traduza o Ingress — um objeto vira Gateway + HTTPRoute'
lab: labs/day-2/09-gateway-api.md
---

````md magic-move
```yaml
# Ingress — um objeto plano; qualquer coisa além de host/path vira annotation
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  annotations:
    projectcontour.io/response-timeout: "15s"    # string sem tipo
    projectcontour.io/websocket-routes: "/ws"    # o dialeto de um controller
spec:
  ingressClassName: contour
  rules:
    - host: web.example.com
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: web, port: { number: 80 } } } }
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: eg             # precisa bater com `kubectl get gatewayclass`
  listeners:
    - name: http
      port: 80
      protocol: HTTP
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web                    # anexa ao Gateway chamado "web"
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }  # o MESMO Service do Lab 07
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
          headers:
            - { name: x-env, value: canary }   # match tipado — sem annotation
      backendRefs:
        - { name: web2, port: 80 }
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:                     # split ponderado tipado — sem annotation
        - { name: web,  port: 80, weight: 90 }
        - { name: web2, port: 80, weight: 10 }
```
````

<!--
Speaker: QUATRO frames. (1) o Ingress do Lab 08 — reduzido à sua primeira regra de host e
empurrado além do teto: um timeout ou uma rota de websocket exige annotations
projectcontour.io/*, sem tipo, no dialeto de um controller, e elas não se movem com você.
(2) divida-o: um Gateway (infra, listener :80) e um HTTPRoute (aplicação, parentRefs → o
Gateway) roteando / para o MESMO Service `web` — a red line continua, porta de entrada
nova, mesmo backend. Este frame é o `gateway.yaml` + `route.yaml` do lab, byte a byte — a
âncora. (3) o upgrade do time de aplicação: um match TIPADO de headers: em x-env=canary →
web2 — este frame É o `route-header.yaml` do lab. (4) o peso de canary que antes era uma
annotation vira um inteiro validado: backendRefs ponderados 90/10 entre web/web2 — o
stretch do lab, `route-canary.yaml`. Aponte para parentRefs como o aperto de mão, e para
gateway.networking.k8s.io/v1 (GA, standard channel). No frame 3 a regra de header, mais
específica, vence — especificidade, não ordem, decide.
-->

---

<span class="kw-kicker">O payoff · mesmo modelo de roteamento, um nível acima</span>

# Gateway ← HTTPRoute → seus Services, ao vivo

<div class="mt-2">
  <GatewayRouting :step="$clicks" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Um `GET /` simples casa com a regra de path e cai no Service **`web`** — o corpo responde `workshop-web v1`, o backend que o Ingress atendia.
- Adicione `x-env: canary` e a regra **mais específica** vence: um split ponderado 90/10 **tipado** — contável direto da linha de versão `v1`/`v2`.

</v-clicks>
</div>

<!--
Speaker: esta é a animação GatewayRouting — a história de roteamento do S07 elevada um
nível: em vez de selector→EndpointSlice→Pods, é request→Gateway→HTTPRoute→backendRefs.
Avance clique a clique: estado de repouso (duas raias de propriedade) → GET / roteia para
web → GET / com o header de canary cai no split ponderado. Feche o ponto: o HTTPRoute
escolhe os backends, o Gateway só é dono da porta; cada match e peso é um campo tipado que
a API valida. O lab torna isso observável sem truque de HTML: cada resposta do
workshop-web imprime sua versão (v1/v2) e o nome do pod, então o header match e o split
90/10 são legíveis direto na saída do curl.
-->

---

<span class="kw-kicker">Pré-requisito · ele também não vem embutido</span>

# CRDs no standard channel + um controller conformante

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="A API é distribuída como CRDs" icon="📦">
    O Gateway API <strong>não</strong> está no core do Kubernetes. Você instala os CRDs do
    <strong>standard channel</strong> (GatewayClass, Gateway, HTTPRoute são GA) —
    um único <code>kubectl apply</code> a partir do release do Gateway API.
  </KwCard>
  <KwCard heading="Um controller o implementa" icon="⚙️">
    Igual ao Ingress: os CRDs ficam inertes até que um <strong>controller conformante</strong>
    (Envoy Gateway, Istio, Contour, um LB de cloud…) seja dono do
    <code>gatewayClassName</code> e programe proxies reais.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

O mesmo formato em duas partes do Ingress — **API vs implementação** — mais um passo
explícito: **você mesmo declara a `GatewayClass`** (a nossa é `eg`), nomeando o controller
que é dono dela. Um `gatewayClassName` que nenhum controller possui deixa seu Gateway
esperando para sempre — o sinal está em `kubectl get gatewayclass`. Essa é a quebra
proposital do Lab 09.

</div>

<!--
Speaker: tranquilize a turma — este é o padrão de Ingress que eles já conhecem: os CRDs
são a API, um controller é a implementação, e nada roteia até um controller reivindicar a
classe. A única novidade são os "channels": standard = GA (no nosso pin v1.5 isso é
GatewayClass/Gateway/HTTPRoute mais GRPCRoute, TLSRoute, ReferenceGrant,
BackendTLSPolicy, ListenerSet), experimental = kinds ainda amadurecendo (TCPRoute,
UDPRoute na v1.5 — standard a partir da v1.6 — mais alguns extras do HTTPRoute). Ensine o
standard. Nuance de versão que vale dizer em voz alta: fixe a versão do canal de CRDs que
seu controller COMPILA CONTRA, não o release mais novo — existe um standard channel mais
novo (v1.6.0), mas nosso controller (Envoy Gateway v1.8) é construído e testado em
conformance contra a v1.5.1, então v1.5.1 é o pin deliberado (infra/versions.env). Segunda
novidade: a instalação do controller não cria uma GatewayClass — a infra a declara
explicitamente, o espelho exato do beat de IngressClass do Lab 08. O Passo 1 do Lab 09 faz
os três no kind (CRDs, controller, GatewayClass); o cluster compartilhado os tem
pré-provisionados, espelhando a divisão do Lab 08.
-->

---

<span class="kw-kicker">Observabilidade · o Ingress nunca te contou isso</span>

# Leia o status — `Accepted`, `Programmed`, `ResolvedRefs`

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="O Ingress era opaco" icon="🌫️" variant="warn">
    Um Ingress com <code>ADDRESS</code> vazio não te dá nenhuma razão. Classe errada?
    Sem controller? Você roda <code>describe</code> e chuta. Não existe um "porquê" tipado.
  </KwCard>
  <KwCard heading="O Gateway API te conta" icon="✅">
    Todo objeto carrega <code>status.conditions</code>:
    <code>Gateway: Accepted / Programmed</code>,
    <code>HTTPRoute: Accepted / ResolvedRefs</code> — cada uma com uma string de razão.
  </KwCard>
</div>

<div v-click class="mt-4 text-sm">

```console
$ kubectl get gateway web
NAME   CLASS   ADDRESS   PROGRAMMED   AGE
web    eg                False        30s
# a condition diz o PORQUÊ: Programmed=False (AddressNotAssigned) — o kind não tem
# load balancer para distribuir um endereço; o proxy ainda atende via port-forward.
```

</div>

<!--
Speaker: este é o ganho de qualidade de vida que os times sentem imediatamente. Accepted =
o controller reivindicou o objeto e provisionou um data plane; Programmed = um endereço
foi atribuído e réplicas do Envoy estão disponíveis; ResolvedRefs (na route) = todo
backendRef resolveu para um Service/port real. O bloco de console é a saída HONESTA do
kind: nosso controller provisiona um Service LoadBalancer por Gateway, o kind não tem
controller de LB, então nenhum endereço é atribuído e Programmed fica False com a razão
AddressNotAssigned — uma condition tipada que nomeia exatamente o que falta, onde o
Ingress só mostrava um ADDRESS vazio e silencioso. Em um cluster de cloud/compartilhado
ela vira True com o endereço do LB. O break→fix do lab vai um nível mais fundo: um
gatewayClassName sem dono deixa as conditions default do próprio CRD — Unknown (Pending)
"Waiting for controller" — e a questão do ResolvedRefs=False (BackendNotFound) mostra o
"porquê tipado" reportado pelo controller. Quando o roteamento quebra, você lê uma
condition e uma razão em vez de chutar.
-->

---

<span class="kw-kicker">Além do HTTP · uma gramática, muitos protocolos</span>

# O HTTPRoute tem irmãos

<div class="kw-cols-3 mt-4 text-sm">
  <v-click at="1">
    <KwCard heading="GRPCRoute" icon="📡" variant="ok">
      Roteamento <strong>gRPC</strong> tipado — match por service e método em vez de
      paths de URL. GA, <strong>standard channel</strong> desde a v1.1.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="TLSRoute" icon="🔐" variant="ok">
      Roteia tráfego <strong>criptografado</strong> por <strong>SNI</strong> — o
      hostname no handshake TLS — <em>sem descriptografá-lo</em>. GA,
      <strong>standard channel</strong> desde a v1.5.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="TCPRoute / UDPRoute" icon="🔌" variant="plain">
      <strong>Encaminhamento L4</strong> puro — bancos de dados, brokers, DNS. Ainda
      <strong>experimentais</strong> no nosso canal fixado v1.5; standard a partir da v1.6.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 kw-muted text-sm">

A mesma gramática em toda parte: `parentRefs` para um listener do Gateway, `backendRefs`
para Services. Um Gateway pode atender HTTP, gRPC e TCP puro **lado a lado** — toda a
família de protocolos que o modelo de dados HTTP-only do Ingress jamais poderia expressar.

</div>

<!--
Speaker: este é o beat "é uma família, não um objeto" — e uma grande razão prática de os
times crescerem além do Ingress antes mesmo da dor das annotations: o Ingress simplesmente
não tem resposta para roteamento por método gRPC, passthrough por SNI ou uma porta de
banco de dados. Percorra os cards. GRPCRoute: gRPC é HTTP/2 por baixo, mas sua identidade
é service/método, não path — o GRPCRoute torna isso um match tipado (standard desde a
v1.1). TLSRoute: o Gateway lê apenas o SNI no ClientHello e encaminha o stream ainda
criptografado — TLS de ponta a ponta com roteamento no meio (standard desde a v1.5, então
no nosso pin v1.5.1 ele É instalável pelo standard channel). TCPRoute/UDPRoute: nenhuma
consciência de protocolo, uma porta de listener encaminhada para backends — no nosso canal
fixado v1.5 esses dois ainda são experimentais; graduaram para standard na v1.6.0, então
diga "confira a versão do seu canal" em vez de "não os use". A linha em cinza é o ponto a
cravar: a gramática (parentRefs/backendRefs) é idêntica em toda a família — os
participantes já sabem ler cada um deles. O Envoy Gateway (nosso controller) implementa as
routes não-HTTP também; o lab fica no HTTPRoute.
-->

---
layout: comparison
class: kw-cmp-compact
heading: 'Duas formas de um listener tratar TLS'
leftHeading: 'Terminate'
leftBadge: 'descriptografa na porta'
rightHeading: 'Passthrough'
rightBadge: 'roteia sem descriptografar'
---

O **Gateway** descriptografa. O listener guarda o cert (`certificateRefs` → um
Secret `kubernetes.io/tls`) e as routes veem **HTTP puro**.

<v-clicks>

- Pareia com **HTTPRoute** — matches de host, path e header funcionam todos, porque os
  bytes são legíveis.
- Este é o bloco `tls:` do S08, crescido: mesma ideia, mas o cert vive em um
  **listener tipado** que o operador do cluster possui.

</v-clicks>

::right::

O Gateway encaminha o **stream criptografado intocado**, roteando apenas por **SNI**.

<v-clicks>

- Pareia com **TLSRoute** — o backend guarda o cert, então a criptografia corre
  **de ponta a ponta** através do proxy.
- O preço: sem match de path/header — o Gateway nunca vê dentro da
  conexão. (**TCPRoute** vai além ainda: ignora TLS, encaminhamento puro de porta.)

</v-clicks>

<!--
Speaker: uma decisão por listener: modo Terminate ou modo Passthrough. Terminate é o mundo
do S08 tornado tipado: o cert é um Secret kubernetes.io/tls referenciado pelo LISTENER
(certificateRefs) — propriedade do operador, exatamente a separação de papéis do slide das
três caixas — e como o proxy descriptografa, o vocabulário completo de match do HTTPRoute
se aplica; é aqui também que o cert-manager (o beat de TLS do S08) se encaixa do lado do
Gateway. Passthrough troca inspeção por criptografia de ponta a ponta: o proxy lê o SNI do
ClientHello, escolhe um backend via TLSRoute e canaliza os bytes criptografados — o
backend termina. Amigável a compliance, mas sem match L7 por definição. E se o tráfego nem
for TLS, TCPRoute é o piso da família, que ignora TLS. Ponte para o recap: separação de
papéis, campos tipados, uma família de protocolos e status legível — essa é a história
completa do Gateway API com que a red line termina.
-->

---
layout: recap
heading: 'Recap — a red line está completa'
story: 'Uma aplicação, uma família de manifestos — de um Pod solitário a uma porta de entrada Gateway tipada, cada passo estendeu o anterior.'
compact: true
next: 'ConfigMap & Secret — separe a config da image (o Day 2 continua)'
---

- **Gateway API** — o sucessor tipado: **GatewayClass** → **Gateway** → **HTTPRoute**, conectados por `parentRefs`
- Atende os **mesmos** Services `web`/`web2` — substitui o `ingress.yaml`, não os backends — red line **5/5**
- Annotations viram **campos tipados**: matches de header/método e splits ponderados são de primeira classe
- **CRDs + controller conformante** — e uma `GatewayClass` **declarada**; nada roteia até um controller ser dono da classe
- **`status.conditions`** (**Accepted / Programmed / ResolvedRefs**) dizem o *porquê* — strings de razão, não silêncio
- A espinha do Day 1: **`pod` → `deployment` → `service` → `ingress` → `gateway` + `httproute`**

<!--
Speaker: isto fecha a red line que começou com um único Pod. Percorra-a em voz alta uma
última vez — um Pod roda o container, um Deployment mantém N saudáveis, um Service dá um
endereço estável, um Ingress/Gateway o expõe — cada passo estendeu o anterior. Depois
pivote para o resto do Day 2: agora que a aplicação está alcançável, vamos torná-la
configurável (S10), durável (S11), stateful (S12) e bem-comportada sob carga. Passe o
bastão para o Lab 09 — instalar os CRDs + o controller, declarar a GatewayClass `eg`,
traduzir o Ingress, adicionar um canary com match de header, e apontar um Gateway para uma
classe sem dono para ver seu status esperar por um controller que nunca chega.
-->

---
layout: lab
lab: labs/day-2/09-gateway-api.md
duration: 25 min
env: kind ✓ (CRDs + controller install) · namespace ✓ (CRDs/controller pre-provided)
---

## Lab 09 — Roteie com um Gateway e um HTTPRoute

- **kind:** instale os CRDs do Gateway API + um controller, depois **declare** a
  GatewayClass `eg` · **compartilhado:** pré-provisionado — confirme que `kubectl get gatewayclass` mostra `ACCEPTED=True`
- Aplique um **Gateway** (listener `:80`); leia `Accepted=True` — e a razão tipada de
  `Programmed` ficar `False` no kind (sem load balancer)
- Aplique um **HTTPRoute** (`parentRefs` → Gateway, `PathPrefix /` → o Service `web`);
  `curl` via port-forward → `workshop-web v1`
- Estenda-o com um **header match** (`x-env: canary`) para `web2`; `curl` com e sem o header
- **Quebre:** um `gatewayClassName` sem dono → o status fica em `Waiting for controller`; conserte e veja-o ser reivindicado
- Stretch: divida um path **90/10** entre dois `backendRefs` e conte as linhas `v1`/`v2`.
