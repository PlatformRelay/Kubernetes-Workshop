---
layout: section-cover
image: /covers/section-07-lighthouse-switchboard.webp
day: Day 1
section: '07'
tier: core
track: Core
---

# Service

"Linha vermelha" 3/5 · Um endereço e um nome estáveis na frente de Pods que não
param de ir e vir — e o bug de selector que todo mundo encontra.

**core** · sugerido para o Day 1 · trilha Core

<!--
Seção S07 — Service. Tempo: ~30 min de slides + 30 min de lab.
Resultado: os participantes conseguem colocar um Service ClusterIP na frente de
um Deployment, explicar selector → EndpointSlice → Pod, alcançá-lo pelo DNS do
cluster e diagnosticar uma EndpointSlice vazia.
Beats: problema (IPs de Pod são efêmeros — a rotatividade do S06 provou) · tipos
(ClusterIP/NodePort/LoadBalancer/ExternalName/headless) · mecânica (selector →
EndpointSlices → Pods + nome DNS) · magic-move adicionando service.yaml ·
animação de roteamento do Service (US-X3, incl. variante de readiness → S14) ·
deep-dive opcional de kube-proxy (desligado por default) · recap rumo ao S08.
Red line: o service.yaml construído aqui É o manifesto de labs/day-1/07-service;
ele seleciona os Pods app: web do Deployment do S06. CKx: CKAD/CKA Services &
networking.
-->

---
layout: statement
kicker: O problema
---

Cada rollout no Lab 06 **mudou os IPs dos Pods.**

Pods são gado: reagendados, substituídos, escalados — cada um ganha um IP novo, e
o antigo se vai para sempre. Nenhum cliente pode fixar no código um endereço que
muda a cada deploy. Um **Service** dá a esse conjunto mutável de Pods **um IP
virtual estável e um nome DNS** que nunca mudam, não importa como os Pods girem
por baixo dele.

<!--
Speaker: isto aterrissa com mais força logo depois do S06 — eles acabaram de ver
o ReplicaSet cunhar Pods novos com IPs novos durante o rollout. O Service é a
porta da frente estável; os Pods atrás dele são livres para ir e vir. O Lab 07
vem depois desta seção.
-->

---

<span class="kw-kicker">Um recurso, vários alcances</span>

# Tipos de Service — escolha por *quem precisa alcançá-lo*

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="ClusterIP — o default" kind="svc">
    Um IP virtual estável <strong>dentro do cluster</strong>. Alcançável apenas de
    dentro do cluster. É o que o Lab 07 constrói, e sobre o que todos os outros
    tipos são construídos.
  </KwCard>
  <KwCard heading="NodePort" kind="svc" variant="plain">
    ClusterIP <em>mais</em> uma porta fixa em <strong>cada node</strong>. O caminho
    de baixo nível para entrar de fora — normalmente um bloco de construção, não
    um endpoint.
  </KwCard>
  <KwCard heading="LoadBalancer" kind="svc" variant="plain">
    NodePort <em>mais</em> um IP externo de cloud/provedor. A forma usual de expor
    <strong>um</strong> service externamente em L4.
  </KwCard>
  <KwCard heading="ExternalName" kind="svc" variant="plain">
    Sem proxy nenhum — apenas um <code>CNAME</code> de DNS para um host externo.
    Um alias dentro do cluster para algo fora dele.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

**Headless** (`clusterIP: None`) é o ponto fora da curva: nenhum IP virtual — o
DNS retorna os **IPs dos Pods diretamente**. É assim que os **StatefulSets** dão
a cada Pod um nome estável.

</div>

<!--
Speaker: a ideia organizadora é ALCANCE, não uma lista de features. ClusterIP =
dentro; NodePort/LoadBalancer = progressivamente mais fora; ExternalName =
ponteiro para fora; headless = sem VIP, IPs de Pod crus. Note o aninhamento:
LoadBalancer ⊃ NodePort ⊃ ClusterIP. Headless aponta para o S12 — não explique
demais aqui. O Lab 07 é só ClusterIP, que funciona de forma idêntica em
namespace e kind.
-->

---
clicks: 3
---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental</span>

# Um Service é um selector — o resto é contabilidade

<div class="mt-2">
  <ServiceSelectorMap :step="$clicks" />
</div>

</div>

<!--
Speaker: duas partes móveis, estável vs vivo. Estável: o ClusterIP e o nome DNS.
Vivo: a EndpointSlice, reescrita toda vez que um Pod aparece/desaparece ou muda
de readiness. Diga "EndpointSlices, não Endpoints" explicitamente — Endpoints
está deprecated. O enquadramento "selector é uma consulta" se paga no Passo 4 do
lab, onde um selector errado esvazia a slice silenciosamente.
-->

---
layout: code-walkthrough
heading: 'Adicione um Service que seleciona o Deployment'
lab: labs/day-1/07-service.md
---

````md magic-move
```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  selector:
    app: web            # o MESMO label que o Deployment carimba nos seus Pods
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  selector:
    app: web            # seleciona todo Pod que carrega este label
  ports:
    - name: http
      port: 80          # a porta do Service — o que os clientes acessam
      targetPort: 8080  # a porta do container (containerPort no Pod)
```
````

<!--
Speaker: construa em camadas: identidade (nome) → a fiação (selector = o label
app: web do Deployment) → as portas. Enfatize port vs targetPort: port é o que os
clientes acessam no Service; targetPort é o containerPort no Pod. Aqui eles
DIFEREM — os clientes usam :80 puro enquanto a aplicação escuta sem privilégio em
:8080 — que é exatamente o ponto que as pessoas perdem quando os dois calham de
ser iguais. Este frame final É o service.yaml de labs/day-1/07-service, byte a
byte; ele fica AO LADO do deployment.yaml, não o edita.
-->

---

<span class="kw-kicker">A recompensa · roteamento</span>

# Selector → EndpointSlice → Pods, ao vivo

<div class="mt-2">
  <ServiceRouting :step="$clicks" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- O ClusterIP nunca se move; as requisições fazem **load-balance** entre o que estiver na slice naquele momento.
- Derrube a **readiness** de um Pod e ele vira **NotReady** — ainda `Running`, e por um instante seu IP ainda está na slice.
- Então o endpoint controller **o remove da slice** — o tráfego é redirecionado para os dois saudáveis, quem chama não vê nada.

</v-clicks>
</div>

<!--
Speaker: esta é a animação compartilhada de roteamento de Service US-X3, que
pertence a esta seção e é reutilizada pelo S14 para a história do readiness probe
(mesmo componente, o Pod removido é o que falha na readiness). Avance por QUATRO
estados: slice populada → requisição se espalha → um Pod fica NotReady enquanto
seu IP AINDA está listado (o probe falhou; o endpoint controller ainda não
reagiu — essa janelinha é real) → o controller remove o IP da slice e o tráfego
vai para dois. Fixe a ponte: "pertencer à slice = readiness, e o S14 transforma
isso em um botão." O lab prova a versão sombria — um selector errado esvazia a
slice por completo.
-->

---
showKubeProxy: false
---

<div class="kw-slide-dense">

<span class="kw-kicker">Deep-dive opcional · desligado por default</span>

# Como o ClusterIP de fato encaminha

<div v-if="$frontmatter.showKubeProxy">

<div class="kw-cols-2 mt-2 text-sm">
  <KwCard heading="O kube-proxy programa o node" icon="⚙️">
    O ClusterIP é <strong>virtual</strong> — em cada node o <strong>kube-proxy</strong>
    escreve regras de <strong>iptables</strong> (ou IPVS) que fazem DNAT para o IP de um Pod pronto.
  </KwCard>
  <KwCard heading="iptables vs IPVS" icon="🔀" variant="plain">
    <strong>iptables</strong> é o default comum; <strong>IPVS</strong> escala
    melhor com muitos Services. Clusters mais novos podem usar <strong>nftables</strong>.
  </KwCard>
</div>

<div class="mt-3 kw-muted text-sm">

"Load-balancing" é na verdade <strong>regras de pacote por node</strong>, atualizadas
quando a EndpointSlice muda — nenhum Pod de proxy no caminho dos dados.

</div>

</div>

</div>

<!--
Speaker: toggle de build/v-if — defina showKubeProxy: true só para uma sala
curiosa de infra; o default mantém este slide colapsado no heading para o fluxo
central seguir enxuto. Espelha o padrão showRefresher do S00. O único takeaway
durável se você mostrar: o ClusterIP é uma ficção mantida pelo kube-proxy como
regras locais em cada node — por isso não existe um Pod de proxy como gargalo.
-->

---
layout: recap
heading: 'Recap — porta da frente estável, backend vivo'
story: 'Depois de cada rollout os IPs dos Pods mudaram, mas `curl http://web` continuou funcionando — o selector reescreveu a slice por baixo.'
next: 'Ingress — um único ponto de entrada L7 roteando por host e path'
---

- Um **Service** é um ClusterIP estável + nome DNS sobre um conjunto de Pods em
  rotatividade — o conserto para os IPs efêmeros que o Deployment vivia mudando
- O `selector` é uma **consulta**; os IPs dos Pods que casam caem em uma
  **EndpointSlice** (não o legado `Endpoints`), atualizada ao vivo conforme Pods
  e readiness mudam
- O `service.yaml` fica **ao lado** do `deployment.yaml` e seleciona seus Pods
  `app: web` — red line 3/5
- A armadilha clássica: um selector errado deixa o Service **com aparência
  saudável mas com zero endpoints** — quando um Service "não funciona", cheque os
  endpoints primeiro

<!--
Speaker: a punchline do lab é a falha silenciosa — Service verde, curl morto,
porque a slice está vazia. Treine o reflexo: "cheque os endpoints, não o objeto
Service." Depois passe o bastão: um ClusterIP é só dentro do cluster; alcançá-lo
de fora por host e path com TLS é o S08, Ingress. Mantenha service.yaml +
deployment.yaml no disco para o Lab 08.
-->

---
layout: lab
lab: labs/day-1/07-service.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 07 — Exponha & debugue o roteamento

- Adicione o `service.yaml` ao lado do Deployment; confirme um `ClusterIP` estável
- Leia a **EndpointSlice** — um endereço por Pod; `curl http://web` por DNS a partir de um Pod temporário
- **Quebre o selector** para um label que nenhum Pod tem → a slice esvazia, o curl dá timeout, o Service continua verde
- Conserte o label → os endpoints repopulam em um segundo; guarde os dois arquivos para o Lab 08.
