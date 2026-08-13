---
layout: section-cover
image: /covers/section-08-grand-gate.webp
day: Day 1
section: '08'
tier: core
track: Core
---

# Ingress

"Linha vermelha" 4/5 · Um único ponto de entrada L7 que roteia HTTP externo por
**host e path** para os seus Services — e não faz nada até um controller ficar
por trás dele.

**core** · sugerido para o Day 1 · trilha Core

<!--
Seção S08 — Ingress. Tempo: ~30 min de slides + 25 min de lab.
Resultado: os participantes conseguem colocar um Ingress na frente dos seus
Services, explicar que o objeto Ingress é inerte sem um controller, rotear por
host com o pathType obrigatório, terminar TLS, explicar como o cert-manager
emite e renova o Secret de TLS (Certificate → web-tls, annotation do
ingress-shim), situar a aposentadoria do ingress-nginx em 2026 (API congelada, a
escolha do controller importa, Contour é o caminho CNCF mantido aqui) e articular
por que o Ingress motiva o Gateway API.
Beats: problema (um Service é L4 + só dentro do cluster) · dependência (Ingress
inerte sem um controller; o IngressClass os liga) · regras (host/path/pathType
obrigatório) · magic-move construindo ingress.yaml (web.example.com → web,
web2.example.com → web2, + tls) · animação IngressActivation (inerte → reivindicado
→ programado → roteado) · beat de TLS (quem preenche o web-tls: manual vs
cert-manager · recurso Certificate + ingress-shim, referência futura à demo de
operator do S22) · beat da aposentadoria (o ÚNICO slide do workshop que nomeia o
controller aposentado) · pontos de dor → Gateway API (S09, red line 5/5)
· recap de fim do Day 1 de toda a família de manifestos · passagem para o lab.
cert-manager ACCURACY LOCKS (verificado contra a documentação do cert-manager.io,
2026-08): a API estável é cert-manager.io/v1 (Certificate/Issuer/ClusterIssuer);
o cert assinado + a chave caem no Secret kubernetes.io/tls nomeado por
spec.secretName; a renovação é automática antes da expiração; o ingress-shim cria
o Certificate a partir da annotation cert-manager.io/cluster-issuer (ou …/issuer)
usando o secretName + hosts do bloco tls do Ingress; os solvers ACME são HTTP-01
e DNS-01, exatamente dois; o cert-manager é um projeto CNCF **graduated**. O S22
instala o cert-manager como sua demo de operator sem código (CERT_MANAGER_VERSION
em infra/versions.env pertence àquele lab, não a este beat só de conceitos).
Red line: o ingress.yaml construído aqui É o manifesto de labs/day-1/08-ingress;
ele fica na frente dos backends workshop-web — `web` (workshop-web:v1) e `web2`
(workshop-web:v2), porta 80 do Service → container 8080 — atrás de um único ponto
de entrada. Fecha a espinha do Day 1: Pod → Deployment → Service → Ingress.
CKx: CKAD Ingress & exposição de services.
-->

---
layout: statement
kicker: O problema
---

Seu Service no Lab 07 era alcançável **apenas de dentro do cluster.**

Um `ClusterIP` é um IP virtual L4 — ele encaminha TCP para Pods, mas não sabe ler
uma requisição HTTP. Não consegue rotear `shop.example.com/` para uma aplicação e
`/api` para outra, não consegue terminar **TLS compartilhado** e não pode ser
alcançado de um navegador de jeito nenhum. Dar a cada aplicação seu próprio
`LoadBalancer` queima um IP de cloud para cada uma e continua sem rotear por URL.
Você precisa de **um** ponto de entrada L7 na frente de muitos Services — um
**Ingress.**

<!--
Speaker: o enquadramento é a escada de alcance do S07. ClusterIP = só dentro;
LoadBalancer = um IP externo por service, e ainda L4 (sem host/path). A lacuna
que o Ingress preenche é roteamento HTTP L7 + TLS compartilhado + um ponto de
entrada compartilhado para muitos backends. Aterrisse como "uma porta, muitos
cômodos." O Lab 08 vem depois desta seção — ele instala o Contour no kind (o
cluster compartilhado tem um controller pré-provisionado).
-->

---

<span class="kw-kicker">Modelo mental · a pegadinha que morde todo mundo</span>

# Um Ingress é só regras — o controller faz o trabalho

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Ingress (o objeto)" kind="ing">
    Um conjunto de <strong>regras</strong> de roteamento HTTP que você escreve:
    para este host e path, mande o tráfego para aquele Service. Pura declaração —
    ele não move nenhum pacote sozinho.
  </KwCard>
  <KwCard heading="Ingress controller (o motor)" icon="⚙️">
    Um Pod (Contour, Traefik, HAProxy, um LB de cloud…) que <strong>observa</strong>
    objetos Ingress e de fato faz o reverse-proxy do tráfego. Uma <strong>instalação
    separada</strong> — não vem embutido no Kubernetes.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

Um **`IngressClass`** amarra os dois: seu Ingress nomeia uma classe
(`ingressClassName: contour`), e o controller dono daquela classe o assume.
**Sem controller ⇒ seu Ingress não ganha endereço e não roteia nada** — a pegadinha
número um do Ingress, e a primeira coisa a checar quando "o Ingress não funciona".

</div>

<!--
Speaker: este é O modelo mental do Ingress e a fonte da maior parte da confusão.
O YAML aplicar sem erro não significa nada — um Ingress sem controller
correspondente fica lá com o ADDRESS vazio para sempre, sem erro nenhum. Diga com
todas as letras: o Kubernetes entrega a *API* de Ingress, mas não uma
*implementação*; o controller é você quem instala. O IngressClass é o
casamenteiro. O Passo 1 do Lab 08 instala o Contour no kind (ou usa o controller
do cluster compartilhado) — essa separação é o ponto inteiro. A animação de
ativação, dois slides adiante, encena exatamente essa transição.
-->

---

<span class="kw-kicker">As regras · três coisas que todo path precisa</span>

# Host, path e o `pathType` de que ninguém lembra

<div class="kw-cols-3 mt-4 text-sm">
  <v-click at="1">
    <KwCard heading="host" icon="🌐">
      Qual hostname esta regra casa — <code>shop.example.com</code>. Omita e a
      regra casa com <em>qualquer</em> host. É assim que um Ingress fica na frente
      de vários sites.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="path" icon="🛣️" variant="plain">
      O prefixo da URL — <code>/</code>, <code>/api</code>, <code>/v2</code>. O
      path mais específico que casar vence, então <code>/api</code> ganha do
      pega-tudo <code>/</code>. O path é encaminhado <em>como está</em> — o backend
      precisa servi-lo.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="pathType" icon="⚠️" variant="warn">
      <strong>Obrigatório.</strong> <code>Prefix</code> (casa isto e tudo abaixo),
      <code>Exact</code> (só esta string exata) ou
      <code>ImplementationSpecific</code> (o controller decide).
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 kw-muted text-sm">

Esqueça o `pathType` e o API server **rejeita o manifesto** — ele não tem default.
Esse é o break deliberado do lab: um `pathType` ausente falha no `apply`, muito
antes de qualquer tráfego fluir.

</div>

<!--
Speaker: revele um card por clique, depois o aviso. O pathType ser obrigatório
(sem default no server) derruba todo mundo que migra de exemplos antigos que o
omitiam. Prefix é o que você quer 95% do tempo. Contraste Prefix vs Exact
rapidamente: Prefix casa por SEGMENTOS do path da URL (/foo casa /foo e /foo/bar,
não /foobar), Exact casa a string inteira. Plante também o ponto do "encaminhado
como está" no card do path: o Ingress não sabe reescrever um path — o fan-out de
/v2 só funciona se o backend servir /v2. A demo do lab roteia por HOST exatamente
por essa razão, e o lab tem uma pergunta-spoiler sobre isso (ela antecipa o ponto
de dor das annotations). Não entre na toca do coelho; o break→fix do lab no
pathType torna o ponto do "obrigatório" concreto.
-->

---
layout: code-walkthrough
heading: 'Construa o Ingress — roteie por host, depois adicione TLS'
lab: labs/day-1/08-ingress.md
---

````md magic-move
```yaml
apiVersion: networking.k8s.io/v1   # o Ingress vive em networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour        # qual controller cuida deste
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour        # precisa casar com `kubectl get ingressclass`
  rules:
    - host: web.example.com        # cluster compartilhado: use seus hostnames designados
      http:
        paths:
          - path: /                # tudo neste host → o backend v1
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour        # precisa casar com `kubectl get ingressclass`
  rules:
    - host: web.example.com        # cluster compartilhado: use seus hostnames designados
      http:
        paths:
          - path: /                # tudo neste host → o backend v1
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: web2.example.com       # segundo site, mesmo ponto de entrada único
      http:
        paths:
          - path: /                # → o backend v2
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: contour
  tls:                             # termina HTTPS para o primeiro host
    - hosts: [web.example.com]
      secretName: web-tls          # um Secret kubernetes.io/tls (cert + chave)
  rules:
    - host: web.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: web2.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
```
````

<!--
Speaker: QUATRO frames. (1) esqueleto — note que o apiVersion é
networking.k8s.io/v1, não o core v1, e o ingressClassName nomeia o controller.
(2) uma regra de host: web.example.com → o Service `web` — a red line continua, o
Ingress fica NA FRENTE do padrão de Service do Lab 07; a porta 80 do backend é a
porta do SERVICE (o Service a mapeia para o 8080 do container). (3) adicione um
segundo host → `web2` — um ponto de entrada na frente de dois sites; isto é
fan-out por host, e o header Host decide. ESTE terceiro frame É o ingress.yaml de
labs/day-1/08-ingress, byte a byte — a âncora. (4) adicione um bloco tls:
terminando HTTPS com um Secret web-tls — esse é o stretch goal do lab (o
secretName bate). Aponte para backend.service.name/port: um Ingress roteia para
Services, nunca direto para Pods.
-->

---

<span class="kw-kicker">A recompensa · de YAML inerte a tráfego roteado</span>

# Aplicado ≠ funcionando — veja o controller dar vida a ele

<div class="mt-2">
  <IngressActivation :step="$clicks" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Instale um controller e o nome do **IngressClass** casa os dois — o Ingress é **reivindicado**.
- O controller **programa** seu proxy: listeners e regras de host viram configuração real de data plane.
- As requisições roteiam por **Host**: `web.example.com` → **web** (v1), `web2.example.com` → **web2** (v2).

</v-clicks>
</div>

<!--
Speaker: esta é a animação IngressActivation — a transição específica do S08 que
nenhuma outra seção tem: um objeto que é VÁLIDO mas INERTE até um motor
reivindicá-lo. Avance clique a clique: estado de repouso (Ingress aplicado, slot
de controller tracejado e vazio, "não roteia nada", sem data plane) → Contour
instalado, o nome do IngressClass casa, o Ingress é reivindicado → Envoy
programado (listeners :80/:443, rotas carregadas) → dois curls roteados pelo
header Host para web (v1) e web2 (v2). Aterrisse: o kubectl aceitar seu YAML não
prova nada sobre tráfego — a ativação é trabalho do controller. O lab reencena
cada um destes estados de verdade, incluindo a variante de falha silenciosa (um
ingressClassName que ninguém possui).
-->

---

<span class="kw-kicker">TLS · o Secret que ninguém quer babá</span>

# O `web-tls` não se preenche sozinho — entra o cert-manager

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="À mão" icon="🔧" variant="warn">
      Gere uma chave + certificado, <code>kubectl create secret tls web-tls …</code>,
      repita por host — e lembre de rotacionar antes de <strong>expirar</strong>.
      Ninguém lembra. Seguem-se indisponibilidades na porta da frente.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Com cert-manager" icon="🤖" variant="ok">
      Um controller (CNCF <strong>graduated</strong>) que observa recursos
      <strong>Certificate</strong>, obtém o cert de um
      <strong>Issuer / ClusterIssuer</strong> — por exemplo via <strong>ACME</strong>
      (Let's Encrypt) — o guarda no Secret nomeado e o <strong>renova
      automaticamente</strong> antes de expirar.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 kw-muted text-sm">

O Ingress não muda em nada — ele continua apontando para `secretName: web-tls`.
O trabalho do cert-manager é garantir que esse Secret **exista e continue válido**.

</div>

<!--
Speaker: o bloco tls: dois slides atrás nomeou um Secret — este beat responde de
onde ele vem nos clusters reais. À mão funciona (o stretch goal do lab faz
exatamente isso com um cert autoassinado), mas não escala além de um punhado de
hosts, e a expiração é uma bomba-relógio: hoje os certs são de vida curta de
propósito (certs ACME ~90 dias), então a rotação manual VAI ser esquecida. O
cert-manager é a resposta padrão do ecossistema e um projeto CNCF graduated: ele
introduz um recurso Certificate; um controller o reconcilia falando com um
issuer. Issuer é por namespace, ClusterIssuer é do cluster inteiro — mesmo
objeto, escopo diferente. ACME/Let's Encrypt é o caminho famoso (grátis,
automatizado, prova de domínio HTTP-01 ou DNS-01 — exatamente dois tipos de
solver), mas os issuers também podem ser uma CA privada ou o Vault. Enquadramento
chave para o próximo slide: o INGRESS fica intocado; a automação mira o Secret.
Isto também é um preview discreto de operator — o cert-manager é literalmente o
operator da demo do S22, onde você vai instalá-lo e ver o loop de reconcile
recriar um Secret deletado.
-->

---
layout: code-annotated
heading: 'Um recurso Certificate mantém o `web-tls` emitido e renovado'
compact: true
---

```yaml {none|1-2|5|6-9|all}
apiVersion: cert-manager.io/v1
kind: Certificate
metadata: { name: web }
spec:
  secretName: web-tls        # o Secret que o tls: do nosso Ingress nomeia
  dnsNames: [web.example.com]
  issuerRef:
    name: letsencrypt
    kind: ClusterIssuer      # cluster inteiro (Issuer = um ns)
```

::notes::

<CodeNote at="1" label="um CRD, não Kubernetes core">
A seção de <strong>operator</strong> instala o cert-manager de verdade.
</CodeNote>

<CodeNote at="2" label="secretName — o aperto de mãos" variant="ok">
Escreve o Secret <code>kubernetes.io/tls</code> que o bloco <code>tls:</code>
nomeia — e o <strong>renova automaticamente</strong>.
</CodeNote>

<CodeNote at="3" label="issuerRef — quem assina">
O <strong>ACME</strong> (Let's Encrypt) prova o controle — HTTP-01 via seu Ingress,
DNS-01 via TXT — e então assina.
</CodeNote>

<CodeNote at="4" label="ou pule o YAML — ingress-shim" variant="ok">
Anote o Ingress com <code>cert-manager.io/cluster-issuer</code> — o Certificate
é criado <em>para você</em>.
</CodeNote>

<!--
Speaker: percorra o YAML contra o ingress.yaml que eles acabaram de construir.
(1) É um CRD de cert-manager.io/v1 — nada aqui vem com o Kubernetes, e é por isso
que este é um beat de conceitos, não um passo de lab; o S22 instala o
cert-manager de verdade (fixado na infra daquele lab) e usa este exato recurso
para ensinar reconciliação. (2) O secretName é a integração inteira: o Ingress
consome o Secret, o Certificate o produz — acoplamento fraco através de um nome
bem conhecido, muito Kubernetes. O cert assinado + a chave caem em um Secret
kubernetes.io/tls (o tipo do beat de tipos de Secret do S10), e o controller
renova antes de expirar — delete o Secret e ele volta, que é a punchline do S22.
(3) O issuerRef escolhe a autoridade: ClusterIssuer (cluster inteiro) vs Issuer
(por namespace) é puro escopo; ACME com HTTP-01 é o loop elegante — o challenge é
servido pelo MESMO data path de Ingress que você acabou de construir — DNS-01
prova via registro TXT (necessário para wildcards). (4) O ingress-shim é o que a
maioria dos times de fato roda: uma annotation no Ingress e o cert-manager deriva
o Certificate. No kind não há DNS público, então o ACME não completa — o stretch
do lab fica no autoassinado; o fluxo aqui é o formato de produção.
-->

---

<span class="kw-kicker">Checagem de realidade 2026 · o único slide que dá nomes</span>

# O controller de referência se aposentou — a API não

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="ingress-nginx: aposentado" icon="🪦" variant="warn">
    O controller de referência que a maior parte da internet rodava. Aposentadoria
    anunciada em <strong>nov 2025</strong>; manutenção e correções de CVE
    <strong>encerradas em março de 2026</strong>; o repositório está arquivado.
    Continuar rodando = acumular CVEs sem correção na sua porta da frente.
  </KwCard>
  <KwCard heading="Ingress: congelado, não morto" kind="ing">
    A API (<code>networking.k8s.io/v1</code>) é <strong>estável e
    onipresente</strong> — ela não vai desaparecer. Mas está <strong>congelada</strong>:
    nenhuma feature nova. Novas capacidades de roteamento chegam no Gateway API.
  </KwCard>
  <KwCard heading="A escolha do controller agora importa" icon="⚙️">
    O controller é trocável por design — é para isso que o <code>IngressClass</code>
    existe. Este workshop usa o <strong>Contour</strong>: CNCF, baseado em Envoy,
    mantido, neutro de fornecedor. Traefik, HAProxy e LBs de cloud também servem.
  </KwCard>
  <KwCard heading="A saída é mecânica" icon="🌉" variant="plain">
    O <code>ingress2gateway</code> (kubernetes-sigs) converte recursos Ingress em
    recursos Gateway API. Suas regras sobrevivem à migração — o stretch goal do
    lab dá uma prévia.
  </KwCard>
</div>

<!--
Speaker: o ÚNICO lugar do workshop que nomeia o nginx — mantenha assim. A
história em um fôlego: por uma década "Ingress" na prática significava
ingress-nginx; o projeto anunciou a aposentadoria em novembro de 2025, a
manutenção de melhor esforço terminou em março de 2026 e o repositório foi
arquivado — sem mais correções de CVE para a coisa que termina TLS na borda de
milhares de clusters. Duas lições, cuidadosamente separadas: (1) a API de Ingress
está bem — congelada em v1, estável, presente em todo lugar, você VAI encontrá-la;
(2) o controller por trás dela é uma escolha que agora você precisa fazer
conscientemente. Ensinamos sobre o Contour porque é CNCF, baseado em Envoy e
mantido. E a ponte de saída é mecânica: kubernetes-sigs/ingress2gateway traduz
Ingress → Gateway + HTTPRoute — que é exatamente para onde o S09 vai.
-->

---

<span class="kw-kicker">Por que existe uma red line 5/5</span>

# O Ingress funciona — mas bateu no teto

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Alastramento de annotations" icon="🏷️" variant="warn">
    Qualquer coisa além de host/path — rewrites, pesos de canary, casamento de
    headers, timeouts — vive em <strong>annotations específicas de cada
    controller</strong>. Sem tipos, sem validação e diferentes para cada controller.
  </KwCard>
  <KwCard heading="Não portável" icon="📦" variant="warn">
    Um Ingress afinado para o dialeto de annotations de um controller não se move
    para o próximo — as annotations não acompanham. Cada troca de controller é uma
    reescrita.
  </KwCard>
  <KwCard heading="Sem separação de papéis" icon="👥" variant="plain">
    Um único objeto plano mistura o que o <strong>operador do cluster</strong>
    possui (portas, TLS, o load balancer) com o que o <strong>time da
    aplicação</strong> possui (paths, pesos). Nenhuma fronteira limpa.
  </KwCard>
  <KwCard heading="Modelo de dados raso" icon="📉" variant="plain">
    Host + path + backend, e é mais ou menos isso. Casamento por header/método,
    divisão de tráfego e rewrites de path simplesmente não estão no spec.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

O conserto é um sucessor tipado e com papéis separados: o **Gateway API** — red
line **5/5**, a seguir.

</div>

<!--
Speaker: o Ingress está congelado mas está em todo lugar — ensine-o. Seja honesto
sobre o teto: no momento em que você precisa de qualquer coisa além de host/path
você cai em annotations por fornecedor, e portabilidade + tipagem + separação de
papéis quebram todas. A aposentadoria afiou isso: dialetos de annotation morrem
com seu controller. Até o nosso lab sentiu o modelo de dados raso — roteamos por
host porque o spec não tem um jeito tipado de reescrever um path. Essa é
precisamente a lacuna que o Gateway API (GatewayClass/Gateway/HTTPRoute)
preenche, e ele reutiliza o mesmo modelo mental de roteamento. Ponte para o S09
como red line 5/5 — Day 2, ensinado sobre o Envoy Gateway (classe `eg`); o
ingress2gateway carrega suas regras de Ingress para lá.
-->

---
layout: recap
heading: 'Recap — a espinha completa do Day 1, uma família de manifestos'
next: 'Gateway API — o sucessor tipado e com papéis separados do Ingress (red line 5/5)'
---

- Um **Ingress** é um conjunto de regras HTTP L7 (host + path + `pathType`
  obrigatório) que roteiam para **Services** — a porta da frente norte-sul que um
  `ClusterIP` não podia ser
- Ele é **inerte sem um controller**; o `IngressClass` os liga, e um controller
  ausente = um Ingress sem endereço e sem tráfego (cheque isso primeiro)
- O `ingress.yaml` põe dois sites atrás de um ponto de entrada —
  `web.example.com` → **`web`** (v1), `web2.example.com` → **`web2`** (v2) — e
  pode terminar **TLS** — red line 4/5
- A API está **congelada** e o controller de referência aposentado tornou a
  **escolha de controller algo real** — rodamos o **Contour** (CNCF, mantido); o
  `ingress2gateway` faz a ponte adiante
- O Day 1 construiu uma família que cresce: **`pod.yaml` → `deployment.yaml` →
  `service.yaml` → `ingress.yaml`** — problema, modelo mental, YAML mínimo,
  executar, observar, quebrar, consertar

<!--
Speaker: este é o gran finale do Day 1. Percorra a família de manifestos em voz
alta: um Pod roda o container, um Deployment mantém N deles saudáveis e
atualizáveis, um Service lhes dá um endereço estável dentro do cluster, um
Ingress expõe isso por host com TLS. Cada passo estendeu o anterior. Depois
prepare o Day 2: o Gateway API termina a red line (mesmos backends web/web2,
roteamento tipado, Envoy Gateway), e o resto do Day 2 empilha configuração,
storage e preocupações de rodar bem. Passe o bastão para o Lab 08 — ele instala o
Contour no kind (ou usa o controller compartilhado), cria o IngressClass e prova
o roteamento por host mais o break barulhento do pathType e o break silencioso da
classe errada.
-->

---
layout: lab
lab: labs/day-1/08-ingress.md
duration: 25 min
env: kind ✓ (controller install) · namespace ✓ (shared controller)
---

## Lab 08 — Roteie dois hostnames através de um controller

- **kind:** instale o **Contour** (quickstart fixado) e crie o **IngressClass**
  `contour` · **compartilhado:** use o controller fornecido + seus hostnames designados
- Faça o deploy de dois backends — `web` (**workshop-web:v1**) e `web2` (**v2**), porta 80
  do Service → container 8080; adicione o `ingress.yaml` roteando um host para cada
- `curl` com um header `Host:` — o corpo da resposta **nomeia a versão** que respondeu
- **Quebre duas vezes:** remova o `pathType` → `apply` **rejeitado** (barulhento); aponte
  o `ingressClassName` para uma classe sem dono → 404 **silencioso**; conserte os dois
- Stretch: termine **TLS** com um Secret autoassinado · prévia do `ingress2gateway`.
