---
layout: section-cover
image: /covers/section-18-paddock-fences.webp
day: Day 3
section: '18'
tier: recommended
track: Security
---

# NetworkPolicy

Isole workloads: default-deny, depois allows explícitos.

**recommended** · sugerido para o Day 3 · trilha Security

<!--
Seção S18 — NetworkPolicy. Day 3 (M5), o complemento de rede do S17 (que aplicou hardening no
que um Pod É; aqui controlamos com o que um Pod pode FALAR). Tempo: ~25 min de slides + 25 min
de lab. Resultado: os participantes conseguem partir de uma rede de Pods plana, aplicar uma
política default-deny de ingress para virar os Pods selecionados para deny-all, reabrir uma
única via direcionada com um allow aditivo, e sabem que a política é um no-op a menos que um
CNI capaz de políticas a imponha.
Beats: problema (rede plana — todo Pod alcança todo Pod → a amarração com o S17: um Pod
comprometido circula) · modelo mental (NetworkPolicy = selector + regras de allow; sem política
= allow-all; a primeira política a selecionar um Pod vira aquela direção para default-deny;
políticas são aditivas/allow-only) · code-annotated (o default-deny de duas linhas) ·
magic-move (construir allow-frontend-to-backend campo a campo; frame final == o arquivo do lab)
· selectors (podSelector vs namespaceSelector; a pegadinha do AND/OR; ingress vs egress) ·
ressalva do CNI (sem enforcement = no-op silencioso → o lab se autotesta) · animação
NetworkFence · recap → S25 · lab.
Animação: NetworkFence.vue (novo, autocontido) — plano → cerca default-deny → um portão aberto.
NÃO é reúso do AdmissionGate.vue: aquele é tempo-de-admission (um request de CREATE de Pod
negado antes de existir); este é TRÁFEGO pod-a-pod em runtime permitido/descartado pelo CNI —
outra camada, logo um componente distinto (mesma decisão do S11/S12/S13/S16).

ACCURACY LOCKS (verificados contra a documentação atual de NetworkPolicy):
- Nenhuma política selecionando um Pod = allow-all para aquele Pod. A PRIMEIRA política que o
  seleciona para uma direção vira aquela direção para default-deny; só a UNIÃO das regras de
  allow correspondentes passa.
- default-deny (ingress) = `podSelector: {}` + `policyTypes: [Ingress]`, sem regras de ingress.
  Um podSelector vazio seleciona TODOS os Pods do namespace.
- Ingress e egress são INDEPENDENTES. Uma política default-deny de *ingress* NÃO toca no egress
  — o DNS continua funcionando (essa é a pergunta "por que o DNS não quebrou?" do lab; timeout
  exit 28, não exit 6).
- Políticas são ADITIVAS/ALLOW-ONLY (unidas por união). Não existe regra de deny; um Pod é
  default-deny para uma direção apenas porque uma política o selecionou e nada permitiu o tráfego.
- Numa lista `from[]`: selectors em UM elemento são unidos por AND; elementos separados, por OR.
- Imposta pelo CNI. `kubectl apply` aceita o objeto mesmo que o CNI o ignore (no-op silencioso).
  Enforcers: Calico, Cilium, Antrea e o kindnet moderno; alguns CNIs gerenciados/básicos não →
  o lab AUTOTESTA o enforcement (aplica default-deny, confirma que o tráfego quebra) antes de
  confiar nele.
Amarração CKx: CKA e CKAD Services & Networking (NetworkPolicy).
-->

---
layout: statement
kicker: O problema
---

Por padrão, **todo Pod pode alcançar qualquer outro Pod** — entre namespaces, sem firewall no meio.

A rede de Pods do Kubernetes é **plana**: seu `frontend`, o `backend`, o banco de dados e um Pod
de que você nunca ouviu falar podem todos abrir conexão entre si. Nada do que você construiu até
agora mudou isso. Então, no momento em que **um** Pod é comprometido — exatamente o cenário
contra o qual a segurança de Pods fazia hardening —, ele pode varrer o cluster inteiro e falar
com qualquer coisa que responder.

<!--
Speaker: o beat do "por que se importar", e ele deliberadamente continua o S17. O S17 encolheu
o que um único Pod pode FAZER (non-root, sem caps, seccomp). Mas mesmo um Pod perfeitamente
endurecido está sobre uma rede L3 plana onde alcança o IP de qualquer outro Pod diretamente —
Services são só nomes de conveniência em cima dessa alcançabilidade plana. Nomeie o blast
radius: um invasor com pé dentro de um Pod web pode fazer port-scan no namespace, atingir uma
API interna sem autenticação, chegar ao banco. Firewalls de borda não fazem nada pelo tráfego
leste-oeste entre Pods. NetworkPolicy é o firewall in-cluster: "o backend só aceita tráfego do
frontend", imposto pelo data plane. Default-deny e depois allow explícito é o mesmo formato da
escada de admission do S17 — comece fechado, abra só o necessário. Uma defesa nomeada no S25.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · um selector mais uma lista de pares permitidos</span>

# NetworkPolicy = *escolha Pods* + *permita estas conexões*

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Ela seleciona Pods e apenas PERMITE" kind="netpol" variant="ok">
      Um <code>podSelector</code> escolhe os Pods que esta política governa. As regras listam o
      que é <strong>permitido</strong> — <strong>não existe regra de deny</strong>. Você permite
      <code>ingress</code> (quem pode conectar <em>até</em> eles) e/ou <code>egress</code> (para
      onde eles podem conectar <em>saindo</em>).
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Sem política = allow-all" icon="🌐" variant="warn">
      Um Pod que <strong>nenhuma</strong> política seleciona está escancarado — a rede plana.
      Não há nada a configurar para ficar aberto; esse é o padrão.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">a única regra que derruba todo mundo</span>

A **primeira** política que seleciona um Pod para uma direção vira aquele Pod para
**default-deny** naquela direção — depois, só a **união** das regras de allow correspondentes
passa. Ou seja: você nega ao *selecionar*, e reabre com allows explícitos. Políticas são
**aditivas**: mais políticas só podem *adicionar* tráfego permitido, nunca subtrair. Ingress e
egress são interruptores **independentes**.

</div>

</div>

<!--
Speaker: três ideias, nesta ordem. (1) Uma NetworkPolicy é selector + regras de allow; é
allow-only, deliberadamente não existe regra de deny (deny é outra API, mais nova —
AdminNetworkPolicy — fora de escopo). Duas direções independentes: ingress = conexões PARA os
Pods selecionados, egress = PARA FORA. (2) O padrão com zero políticas é allow-all — a rede
plana. (3) A parte contraintuitiva: você não "liga" o deny. No momento em que QUALQUER política
seleciona um Pod para ingress, o ingress daquele Pod vira default-deny, e só passa o que as
políticas permitirem explicitamente. Múltiplas políticas selecionando o mesmo Pod são unidas
por OR (união dos allows) — só podem alargar, nunca estreitar. Por isso o idioma é "política
default-deny primeiro, depois adicione políticas de allow": o default-deny é só uma política
que seleciona tudo e não permite nada. A seguir: o default-deny de duas linhas.
-->

---
layout: code-annotated
heading: 'Default-deny: selecione todos os Pods, não permita nada'
compact: true
lab: labs/day-3/18-networkpolicy.md
---

```yaml {none|7|8-9|all}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  labels: { app: s18 }
spec:
  podSelector: {}            # seleciona todos os Pods do namespace
  policyTypes:
    - Ingress                # governa o ingress; sem regras abaixo → nega tudo
```

::notes::

<CodeNote at="1" label="podSelector: {} — tudo" variant="warn">
Um selector <strong>vazio</strong> corresponde a <strong>todos os Pods</strong> do namespace.
Agora todo Pod está "selecionado para ingress", então todo Pod vira default-deny.
</CodeNote>

<CodeNote at="2" label="policyTypes: Ingress — uma direção" variant="ok">
Governamos o <strong>ingress</strong> e não escrevemos <strong>nenhuma</strong> regra de
ingress → todo tráfego de entrada negado. <code>egress</code> <em>não</em> está listado, então
continua escancarado — inclusive o DNS.
</CodeNote>

<div v-click="3" class="mt-2 text-sm kw-muted">
É isso: sem a chave <code>ingress:</code>, o conjunto de origens permitidas é "zero". Este único
objeto leva um namespace de allow-all para <strong>deny-all de entrada</strong> — a lousa limpa
na qual você depois abre furos.
</div>

<!--
Speaker: a menor política útil. podSelector: {} = todos os Pods (um selector vazio é "casa com
tudo", o oposto do que as pessoas esperam). policyTypes nomeia as direções pelas quais esta
política responde; listamos apenas Ingress. Como não há bloco `ingress:`, o conjunto de origens
permitidas é vazio → nega todo tráfego de entrada. Crucialmente, NÃO listamos Egress, então o
egress fica intocado — saída e DNS continuam funcionando (essa é a pergunta "por que o DNS não
quebrou?" do lab). Aplique isto e todo Pod do namespace para de aceitar conexões; a seguir
reabrimos exatamente um caminho.
-->

---
layout: code-walkthrough
heading: 'Abra um portão — permita ingress vindo de `app=frontend`'
lab: labs/day-3/18-networkpolicy.md
---

````md magic-move
```yaml
# quais Pods ESTA política governa? → o backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels:
      app: backend
```

```yaml
# +policyTypes — estamos escrevendo um allow de ingress
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
```

```yaml
# +from — permite ingress apenas VINDO de Pods com label app=frontend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
```

```yaml
# +ports — …e apenas para TCP 8080. Frame final == o arquivo do lab.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels:
      app: backend           # esta política governa os Pods do backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend  # …apenas de Pods com label app=frontend
      ports:
        - protocol: TCP
          port: 8080
```
````

<!--
Speaker: QUATRO frames, construindo a política de allow que reabre o único caminho que
queremos. Frame 1: o podSelector escolhe o backend — "esta política é sobre quem pode falar com
o backend." Frame 2: policyTypes: Ingress — igual ao default-deny, estamos governando a
entrada. Frame 3: a lista `from` — permite origens cujos Pods carregam app=frontend. Frame 4:
estreita para a porta 8080 (uma política com lista `ports` permite APENAS aquelas portas). Duas
sutilezas: (a) esta política e o default-deny COEXISTEM — são aditivas, então a regra efetiva é
"o backend aceita 8080 do frontend, e nada mais"; você não deleta o default-deny. (b) `from`
seleciona os Pods de ORIGEM, o `podSelector` do topo seleciona os Pods de DESTINO — iniciantes
confundem os dois. O frame final é o arquivo exato que o lab aplica.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Selecionando pares · os formatos e a pegadinha</span>

# `podSelector`, `namespaceSelector`, e AND vs OR

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Dois tipos de selector" kind="netpol" variant="ok">
      <code>podSelector</code> — pares por <strong>label de Pod</strong>, mesmo namespace por
      padrão. <code>namespaceSelector</code> — pares por <strong>label de namespace</strong>,
      qualquer Pod nos namespaces correspondentes (é assim que você permite cross-namespace).
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Ingress vs egress" icon="↔️" variant="ok">
      <code>ingress.from</code> = <strong>origens</strong> permitidas;
      <code>egress.to</code> = <strong>destinos</strong> permitidos. Independentes — defina um,
      o outro, ou ambos.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">a diferença de um traço que inverte o significado</span>

Dentro de **um único** elemento `from`, `namespaceSelector` **e** `podSelector` são unidos por
**AND** — *"Pods frontend **em** namespaces team=web."* Separe-os em **dois** elementos `from`
e eles viram **OR** — *"qualquer coisa em namespaces team=web, **ou** qualquer Pod frontend."*
As mesmas duas linhas, um traço de distância, resultado oposto. `egress.to` usa exatamente os
mesmos formatos.

</div>

</div>

<!--
Speaker: este é o slide que economiza uma hora de debugging. podSelector casa com labels do POD
par; namespaceSelector casa com labels do NAMESPACE par. Um podSelector sozinho tem escopo no
PRÓPRIO namespace da política — para permitir de outro namespace você precisa de um
namespaceSelector (namespaceSelector: {} = todos os namespaces). A pegadinha é pura estrutura
de lista YAML: dois selectors em UM elemento `from` são AND ("pods casando com X que também
vivem em namespaces casando com Y"); como DOIS elementos, viram OR. Um traço, significado
oposto. Aponte de volta para a política do nosso lab: um único podSelector, mesmo namespace,
uma origem — o caso mais simples. A seguir: a ressalva que faz ou desfaz tudo isso.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">A ressalva · uma política é só papel sem um enforcer</span>

# NetworkPolicy precisa de um **CNI capaz de políticas**

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="A API sempre aceita" icon="⚠️" variant="danger">
      <code>kubectl apply</code> armazena a política em <strong>qualquer</strong> cluster — sem
      erro. Se ela é <strong>imposta</strong> depende inteiramente do CNI. Um CNI que não impõe
      transforma toda política em um <strong>no-op silencioso</strong>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Logo: enforcers vs o resto" kind="netpol" variant="ok">
      Impõem: <strong>Calico, Cilium, Antrea</strong> e o <strong>kindnet</strong> moderno.
      Podem não impor: alguns CNIs gerenciados/básicos. <strong>Verifique testando</strong>,
      nunca assuma.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm kw-muted">
É por isso que o Lab 18 é <strong>kind ✓</strong> com um <strong>autoteste de enforcement</strong>
primeiro (aplique o default-deny; confirme que o tráfego realmente quebra). Em um cluster
compartilhado cujo CNI não impõe, o lab tem um caminho <strong>somente leitura</strong>:
inspecionar uma política pré-aplicada com <code>kubectl describe netpol</code>.
</div>

</div>

<!--
Speaker: a armadilha operacional, e é crítica de guardrail (mantenha-se atualizado).
NetworkPolicy é um OBJETO de API imposto pelo DATA PLANE — o CNI. O API server armazena
alegremente uma política em um cluster cujo CNI a ignora; você recebe zero feedback e zero
enforcement. Um `kubectl apply` verde não prova nada. CNIs que impõem: Calico, Cilium, Antrea,
Weave — e, em releases recentes, o próprio kindnet do kind (via kube-network-policies). Um kind
mais antigo ou um CNI cru/gerenciado pode não impor. A única jogada segura é TESTAR: aplique um
default-deny e confirme que o tráfego quebra; se não quebrar, seu CNI não está impondo. É
exatamente o que o lab faz logo de cara, e por isso o caminho do cluster compartilhado é
somente leitura quando o CNI da sala é um no-op. NOTA DE ENTREGA: reverifique antes da sessão
se a versão de kind da sala impõe — é o fato com mais chance de ter mudado.
-->

---

<span class="kw-kicker">Plano → cercado → um portão aberto</span>

# A cerca sobe, depois um portão abre

<div class="mt-2">
  <NetworkFence :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- **Sem política:** a rede é plana — `frontend`, `other` e `scanner` alcançam todos o backend (`200`).
- **`default-deny` de ingress:** o backend é selecionado → **toda** conexão é descartada (elas travam e dão timeout).
- **`allow-frontend-to-backend`:** aditivo — exatamente um portão abre. O `frontend` passa; `other` e `scanner` continuam do lado de fora da cerca.

</v-clicks>
</div>

<!--
Speaker: conduza com os cliques; este é o lab em forma de imagem, e a cerca de pasto da capa.
(0) plano: três vias verdes até o backend — o padrão. (1) default-deny: a cerca sobe de
repente, as três vias ficam vermelhas — e diga: os pacotes são DESCARTADOS, então quem chama
trava e dá timeout (não "connection refused" — não há ninguém dizendo não, o pacote simplesmente
some; essa distinção timeout-vs-refused é uma pergunta do lab). (2) allow-frontend-to-backend:
a via do frontend fica verde enquanto other/scanner continuam vermelhas — a união dos allows é
exatamente uma origem. Mesmo backend, mesmos clientes — a única coisa que mudou foi quais
políticas o selecionam. Esse é o loop inteiro do Lab 18.
-->

---
layout: recap
heading: 'Recap — negue ao selecionar, permita de propósito'
story: 'A rede plana deixava tudo alcançar o backend. Uma política default-deny o cercou — todo chamador deu timeout. Uma única regra allow-from-frontend abriu exatamente um portão, e só o frontend voltou a entrar.'
next: 'RBAC — de "quem pode conectar" para "quem pode agir": identidades, verbos e bindings de menor privilégio'
---

- A rede de Pods é **plana por padrão** — todo Pod alcança todo Pod; NetworkPolicy é o
  firewall in-cluster
- Uma política **seleciona Pods e permite** ingress/egress — não existe regra de deny; a
  **primeira** política a selecionar um Pod o vira para **default-deny** naquela direção
- **default-deny + allow explícito** é o idioma; políticas são **aditivas** (união de allows,
  nunca subtraem)
- **`policyTypes` delimita a direção** — negue o ingress e o egress/DNS continuam funcionando;
  tranque o egress e você precisa reautorizar o DNS
- Imposta **apenas pelo CNI** — `kubectl apply` funciona mesmo quando nada impõe; **teste**
- Faz par com **segurança de Pods** (hardening de workload) e é uma defesa nomeada contra um
  **pod escape**

<!--
Speaker: consolide o modelo de duas partes que segue para o S25. O S17 endureceu o que um Pod
É; o S18 controla com o que um Pod pode FALAR — juntos, encolhem tanto o ponto de entrada
quanto o blast radius. Quatro coisas: (1) plana por padrão; (2) você nega ao SELECIONAR um Pod,
depois reabre com allows explícitos, e políticas só somam; (3) policyTypes decide quais
direções você governa — um default-deny de INGRESS deixa egress/DNS em paz, geralmente o começo
que você quer; (4) nada disso significa algo se o CNI não impõe, então verifique. Passe ao Lab
18: faça o deploy das aplicações, prove que elas se falam, derrube um default-deny e veja o curl dar
timeout, então adicione uma regra de allow e veja exatamente o frontend voltar — com o
autoteste de enforcement primeiro, para ninguém debugar um CNI no-op por vinte minutos.
-->

---
layout: lab
lab: labs/day-3/18-networkpolicy.md
duration: 25 min
env: 'kind ✓ (policy CNI) / namespace: read-only'
---

## Lab 18 — Cerque o tráfego

- **Autoteste:** confirme que seu CNI realmente impõe (o default-deny precisa quebrar o tráfego)
- Faça o deploy de `frontend`, `other`, `scanner` e `backend`; prove que os três fazem curl no backend (`200`)
- **Quebre:** aplique `default-deny-ingress` → todo curl dá **timeout** (descartado, não recusado)
- **Conserte:** aplique `allow-frontend-to-backend` → só o `frontend` volta a entrar; os outros seguem bloqueados
- Observe: o DNS continua resolvendo sob o deny de ingress; troque o label do `frontend` e o allow para de casar
