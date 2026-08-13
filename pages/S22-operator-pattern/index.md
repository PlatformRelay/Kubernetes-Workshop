---
layout: section-cover
image: /covers/section-22-tireless-owl.webp
day: Day 3
section: '22'
tier: recommended
track: Operators
---

# O padrão operator

Codifique conhecimento operacional atrás da sua própria API: um CRD mais um controller.

**recommended** · sugerido para o Day 3 · trilha Operators

<!--
Seção S22 — O padrão operator. Recommended, Day 3, trilha Operators.
Tempo: ~25 min de slides + 15 min de lab.
Resultado: os participantes conseguem definir "operator = CRD (estende a API) + controller
customizado (o loop de reconciliação)"; distinguir um controller comum (reconcilia objetos
nativos) de um operator (empacota conhecimento de domínio/operacional atrás de um CRD);
ler um CRD + um CR de exemplo + pseudocódigo conceitual de reconcile; posicionar um
projeto nos Capability Levels da CNCF (1 Basic Install → 5 Auto Pilot); e, no lab,
instalar o cert-manager (um operator sem código), inspecionar seus CRDs, criar um Issuer +
Certificate, e ver o controller reconciliá-los num Secret — deletando o Secret para ver o
loop recriá-lo.
Beats: problema (algumas tarefas de operação — backup, failover, upgrades — não cabem num
recurso nativo) · recap do control loop do S03 (observar → diffar → agir) como fundação ·
modelo mental (CRD + controller customizado = operator) · code-annotated (um CRD cru
registra um novo kind) · magic-move (definição do CRD → CR de exemplo → pseudocódigo
conceitual de reconcile agindo sobre ele) · controller vs operator (operator =
conhecimento operacional codificado) · CNCF Capability Levels 1→5 (conceitual, SEM nomes
de vendors) · animação do loop de reconciliação dirigindo um recurso customizado
(reutiliza ReconcileLoop) · recap → lab.

Animação: REUTILIZAR ReconcileLoop (US-X1, construído no S03; o S21 o reutiliza para
GitOps). Aqui passe controller="Backup operator", resource="Backup", desired=1,
desiredSource="spec (your CR)", observedSource="cluster". Este é o guardrail de reuso: o
controller de um operator É o loop do S03, observando um recurso CUSTOMIZADO em vez de um
nativo. Nenhum componente novo.

ILUSTRATIVO vs LAB (pós-red-line, conforme o outline): o magic-move do slide ensina com um
CRD ilustrativo limpo `Backup`/`Database` para o padrão ficar óbvio; o LAB usa o
cert-manager concreto (Issuer/Certificate/Secret). Paridade byte a byte NÃO é exigida aqui
(esta é uma seção conceitual, não um recurso da red line do Day 1).

ACCURACY LOCKS (verificados na web em 2026-07-10):
- CRD = apiextensions.k8s.io/v1, kind CustomResourceDefinition. Registra um novo
  group/version/kind + scope (Namespaced/Cluster) + um schema OpenAPI v3; o kubectl então
  trata o novo kind como qualquer nativo (get/describe/explain/-w).
- Operator = CRD (estende a API) + um controller customizado (roda o loop de reconciliação
  sobre instâncias desse CRD). Um controller comum reconcilia objetos NATIVOS (ReplicaSet →
  Pods); um operator empacota conhecimento de domínio/day-2 (backup, failover, upgrade)
  atrás de um CRD, de modo que um humano declara a intenção e o controller executa o
  runbook.
- CNCF Operator "Capability Levels" (do modelo de maturidade do Operator Framework /
  operatorhub): L1 Basic Install · L2 Seamless Upgrades · L3 Full Lifecycle · L4 Deep
  Insights · L5 Auto Pilot. Conceitual apenas — SEM nomes de vendors/produtos (guardrail).
- O lab usa cert-manager v1.21.0 (estável atual, verificado). É um operator sem código: o
  controller de Certificate reconcilia um CR Certificate num Secret e RECRIA o Secret se
  deletado (o loop de reconciliação). NOTA: o Secret NÃO carrega ownerReference por
  default (--enable-certificate-owner-ref default é false) — a recriação é o LOOP, não
  GC. O slide não afirma o contrário.
Amarração CKx: CRDs/operators são tópicos de *extensão* da CKA (arquitetura de cluster /
extensão da API) — uma linha no recap; não é um domínio duro da CKAD.
-->

---
layout: statement
kicker: O problema
---

Alguns trabalhos operacionais — **fazer backup deste banco, fazer failover dele, atualizá-lo no lugar** — não podem ser expressos por nenhum recurso nativo.

Um `Deployment` mantém *N* réplicas de um Pod stateless rodando. Mas *"tire um backup consistente toda noite, e restaure a partir do mais recente se o primário morrer"* não é um campo de nenhum kind nativo — é um **runbook**: uma sequência de passos que precisa de **conhecimento de domínio** sobre *este* software específico. Você poderia rodar esse runbook na mão, ou enterrá-lo num pipeline de CI — mas aí nada estaria **continuamente** fazendo o cluster corresponder à sua intenção. E se você pudesse ensinar o runbook ao cluster, declarar *"eu quero um backup"*, e deixar um **loop** executá-lo?

<!--
Speaker: o beat do "por que operators existem". Recursos nativos cobrem padrões genéricos:
Deployment = manter N réplicas stateless; StatefulSet = Pods stateful ordenados com
identidade estável; Job = rodar até completar. Mas as operações day-2 de um sistema
ESPECÍFICO — backup/restore/failover de um banco, rebalanceamento de um message broker,
renovação de um certificado — codificam expertise que nenhum controller genérico tem.
Hoje você escreveria um runbook e o rodaria na mão (sujeito a erro, não contínuo) ou o
scriptaria no CI (fire-and-forget, sem correção de drift — exatamente a reclamação do
GitOps do S21, um nível abaixo). A ideia do operator: capturar essa expertise DENTRO de um
controller, expor a intenção como um novo recurso da API, e deixar o loop de reconciliação
rodar o runbook para sempre. A seguir: relembrar o loop que torna isso possível.
-->

---

<span class="kw-kicker">Relembrando o modelo mental · o único loop sobre o qual tudo roda</span>

# O control loop é a fundação: observar → diffar → agir

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="O que você já sabe" kind="deploy" variant="ok">
      Um controller nativo observa um recurso, compara o <strong>desejado</strong>
      (<code>spec</code>) com o <strong>observado</strong> (o mundo real), e age para
      fechar a lacuna — depois repete, para sempre. Delete um Pod e o ReplicaSet o refaz.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="O salto" icon="💡" variant="ok">
      Nada nesse loop é específico de <em>Pods</em>. Aponte o mesmo
      <strong>observar → diffar → agir</strong> para um recurso que <strong>você
      inventou</strong>, e coloque o <em>seu</em> conhecimento operacional no passo de
      "agir". Isso é um operator.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

**O Kubernetes já é uma plataforma de loops de reconciliação** — o modelo mental ensinou a
forma, o GitOps a reutilizou com o **Git** no slot de desejado. Esta seção a reutiliza uma
terceira vez com **o seu próprio recurso** no slot de desejado. Mesmo loop; novo estado a
reconciliar.

</div>

<!--
Speaker: ancore firme no S03. O loop de reconciliação — observar desejado vs observado,
diffar, agir para convergir, repetir — é A ideia do Kubernetes. Controllers nativos o
aplicam a kinds nativos (ReplicaSet→Pods, Deployment→ReplicaSets). O truque inteiro do
padrão operator é que o loop é agnóstico de kind: dê ao Kubernetes um novo kind e um
controller que roda observar→diffar→agir sobre instâncias dele, e você estendeu a
plataforma. Aponte de volta ao S21: GitOps era o mesmo loop com o Git como estado
desejado. Agora é o mesmo loop com um recurso customizado como estado desejado. A
repetição é a pedagogia — esta é a terceira vez que eles encontram este loop, e esse é o
ponto. A seguir: nomear os dois ingredientes com precisão.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · dois ingredientes, uma palavra</span>

# Operator = **CRD** (estende a API) + **controller customizado** (o loop)

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="CRD — estenda a API" kind="crd" variant="ok">
      Uma <strong>CustomResourceDefinition</strong> registra um <code>kind</code>
      novinho em folha (digamos <code>Backup</code>) com seu próprio schema. Depois de
      aplicada, <code>kubectl get backup</code> funciona exatamente como
      <code>kubectl get pod</code> — o API server armazena e valida seu recurso como
      qualquer nativo.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Controller customizado — rode o loop" icon="⚙️" variant="ok">
      Um Pod rodando no cluster que <strong>observa</strong> instâncias desse kind e as
      <strong>reconcilia</strong>: observar o <code>spec</code> do CR, diffar contra o
      mundo, e <strong>agir</strong> — usando o conhecimento de domínio que você
      programou.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">a definição para lembrar</span>

**Um CRD sem controller é só dado inerte** — o API server armazena seus objetos `Backup`,
mas nada nunca *acontece*. **Um controller sem CRD** é só um controller comum sobre kinds
nativos. **Juntos**, eles são um **operator**: uma nova API *mais* o software que a torna
real.

</div>

</div>

<!--
Speaker: o slide que carrega o peso — diga a equação e faça-os repetir. CRD =
CustomResourceDefinition = a extensão da API: ela ensina ao API server um novo kind
(group/version/kind + schema + scope). Uma vez registrado, seu kind é cidadão de primeira
classe: kubectl get/describe/explain/-w, RBAC, armazenamento no etcd, admission — tudo de
graça. Mas um CRD é PASSIVO; ele só armazena dados. O controller customizado é a metade
ATIVA: um Pod (normalmente um Deployment) que observa seus CRs e roda observar→diffar→agir
sobre eles, com a sua lógica operacional no "agir". Nenhum dos dois sozinho é um operator:
só-CRD = dado inerte; só-controller sobre nativos = um controller comum. Operator = os
dois. O lab torna isso concreto: o cert-manager É um CRD (Certificate) + um Pod controller
que reconcilia Certificates em Secrets. A seguir: como um CRD realmente se parece.
-->

---
layout: code-annotated
heading: 'Um CRD ensina um novo kind ao API server'
compact: true
lab: labs/day-3/22-operator-concept.md
---

```yaml {none|3-6|7-10|11-19|all}
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.example.com          # <plural>.<group>
spec:
  group: example.com
  names:
    kind: Backup                 # novo kind p/ `kubectl get`
    plural: backups
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:                    # validação OpenAPI v3
        openAPIV3Schema:
          type: object
          properties:
            spec: { type: object }
```

::notes::

<CodeNote at="1" label="name = plural.group" variant="ok">
O próprio nome do CRD deve ser <code>&lt;plural&gt;.&lt;group&gt;</code>. Isso registra o
caminho do recurso <code>/apis/example.com/v1/backups</code> no API server.
</CodeNote>

<CodeNote at="2" label="names + scope" variant="ok">
<code>names.kind</code> é o que você vai digitar (<code>Backup</code>); <code>scope</code>
decide se as instâncias vivem <strong>num namespace</strong> ou são de todo o cluster —
exatamente como os kinds nativos.
</CodeNote>

<CodeNote at="3" label="versions[].schema" variant="warn">
Cada versão carrega um <strong>schema OpenAPI v3</strong>. O API server o usa para
<strong>validar e armazenar</strong> seu recurso — então um <code>Backup</code> malformado é
rejeitado na hora do <code>apply</code>, sem precisar de controller.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
Aplique isto e <code>kubectl get backup</code>, <code>kubectl explain backup.spec</code>
e <code>-w</code> se acendem — mas nada <em>reconcilia</em> um <code>Backup</code>
ainda. O CRD é a API; o controller ainda está faltando.
</div>

<!--
Speaker: esta é a metade da extensão da API tornada concreta. Uma CustomResourceDefinition
é ela mesma um recurso nativo (apiextensions.k8s.io/v1) cujo trabalho é registrar OUTRO
kind. Percorra os highlights: name deve ser plural.group (é um caminho de discovery, não
arbitrário); group + versions + names.kind definem a nova superfície de API; scope =
Namespaced ou Cluster; o openAPIV3Schema é o que faz o kubectl explain funcionar e o que
valida/rejeita specs ruins na hora do apply. A punchline (clique 4): depois de aplicar SÓ
o CRD, todos os verbos do kubectl funcionam — get, describe, explain, watch — mas nada
ACONTECE com um Backup, porque não existe controller. Essa é a preparação para o
magic-move: CRD → uma instância → o loop que age sobre ela. (Schema encurtado para o
slide; CRDs reais detalham os campos do spec.) A seguir: construir os três.
-->

---
layout: code-walkthrough
heading: 'Da API à intenção à ação, em três frames'
lab: labs/day-3/22-operator-concept.md
---

````md magic-move
```yaml
# 1 — O CRD: registrar um novo kind (a extensão da API)
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: backups.example.com
spec:
  group: example.com
  names: { kind: Backup, plural: backups }
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                database: { type: string }   # qual DB deve receber backup
                schedule: { type: string }   # intenção estilo cron
```

```yaml
# 2 — UM CUSTOM RESOURCE: uma instância = a sua intenção declarada
apiVersion: example.com/v1
kind: Backup
metadata:
  name: nightly-orders
  labels: { app: s22 }
spec:
  database: orders            # estado DESEJADO, nas SUAS palavras
  schedule: "0 2 * * *"       # "backup de orders, toda noite às 02:00"
```

```yaml
# 3 — O CONTROLLER (pseudocódigo): observar → diffar → agir, para sempre
for each Backup cr in watch("example.com/v1", "Backup"):
    desired  = cr.spec                       # observar a intenção
    observed = find_snapshots(cr.spec.database)

    if not due(cr.spec.schedule, observed):  # diffar
        continue

    snapshot = take_snapshot(cr.spec.database)   # AGIR — conhecimento de domínio codificado
    upload(snapshot); prune_old(observed)

    cr.status.lastBackup = now()             # reportar o estado de volta no CR
    cr.status.conditions = [{type: "Ready", status: "True"}]
```
````

<!--
Speaker: O slide central — três frames, três ideias. Frame 1: o CRD, a extensão da API
(agora com campos de spec reais — database + schedule — para o schema significar algo).
Frame 2: uma única instância de Backup — isto é um usuário DECLARANDO INTENÇÃO em termos
de domínio ("backup do DB orders toda noite"); é só YAML que você aplica com kubectl, e é
o estado DESEJADO. Frame 3: o controller como pseudocódigo, deliberadamente na MESMA forma
observar→diffar→agir do S03: watch nos objetos Backup → ler o spec (observar a intenção) →
checar quais snapshots existem (observar o mundo) → diffar (tem backup vencendo?) → AGIR
(tirar/subir/podar — ISTO é o conhecimento operacional codificado, o runbook que um humano
costumava rodar) → escrever o status de volta no CR para o `kubectl get backup` mostrar
Ready e lastBackup. Aterrisse: os frames 1+3 juntos são o operator; o frame 2 é o que um
usuário faz com ele. O lab troca este Backup ilustrativo pelo cert-manager real, mas a
forma é idêntica. A seguir: por que um controller comum já não é um operator?
-->

---
layout: comparison
heading: 'Mesmo loop — a diferença é o que ele sabe'
leftHeading: 'Controller comum'
leftBadge: 'nativo'
rightHeading: 'Operator'
rightBadge: 'nativo + domínio'
---

Reconcilia objetos **nativos** com lógica **genérica**:

- ReplicaSet controller → manter *N* Pods
- Deployment controller → rolar ReplicaSets
- Job controller → rodar Pods até completar

O passo de "agir" é de **propósito geral** — *fazer N de uma coisa*. Ele não sabe nada
sobre o *seu* banco, broker ou certificados.

<div class="mt-3 text-sm kw-muted">Vem <strong>com</strong> o Kubernetes. Nenhuma API nova.</div>

::right::

Reconcilia um **CRD que você definiu**, com lógica de **domínio**:

- Um controller de `Backup` → snapshot, upload, prune, restore-em-failover
- Um controller de certificados → emitir, armazenar e **renovar** certificados
- Um controller de DB → semear, fazer failover, rodar upgrades de versão

O passo de "agir" é um **runbook** — a expertise day-2 que um operador humano costumava
carregar, agora **codificada** e executada continuamente.

<div class="mt-3 text-sm kw-muted">Vem <strong>como software que você instala</strong>. Nova API + novo comportamento.</div>

<!--
Speaker: a distinção da qual a pergunta obrigatória do lab depende ("o que torna isto um
operator e não só um controller?"). Ambos são o MESMO loop de reconciliação — esse é o
ponto, não deixe que pensem que um operator é um mecanismo novo. A diferença está
inteiramente em dois lugares: (1) O QUE ele reconcilia — um controller comum dirige kinds
nativos; um operator dirige um CRD que você adicionou; (2) O QUE ESTÁ NO "agir" — o agir de
um controller comum é genérico ("fazer N réplicas"); o agir de um operator é um runbook de
domínio (tirar um snapshot consistente do DB; fazer failover para uma réplica; renovar um
certificado antes de expirar). A frase para deixar com eles: um operator é CONHECIMENTO
OPERACIONAL CODIFICADO atrás de uma API. Um controller comum não tem opinião sobre o seu
software; um operator É a opinião. O cert-manager (o lab) é o exemplo limpo: ninguém
conseguiria expressar "mantenha este certificado TLS válido, renovando antes de expirar"
com kinds nativos — essa expertise vive no controller do cert-manager, exposta como o CRD
Certificate. A seguir: quão "maduro" um operator pode ser?
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Capability levels da CNCF · quanto ele consegue fazer por você?</span>

# Operators vêm em níveis de maturidade: Basic Install → Auto Pilot

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.6rem;">
  <v-click at="1">
    <KwCard heading="L1 · Basic Install" icon="📦" variant="ok">
      Provisiona a app a partir de um CR. Você declara; o operator a coloca de pé.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="L2 · Seamless Upgrades" icon="⬆️" variant="ok">
      Atualiza a app <em>e a si mesmo</em> sem acompanhamento manual nem surpresas de downtime.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="L3 · Full Lifecycle" icon="🔁" variant="ok">
      Operações day-2: backups, restores, failover, escala — o runbook, automatizado.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="L4 · Deep Insights" icon="📈" variant="ok">
      Entrega métricas, alertas e saúde para a app se explicar sozinha.
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="L5 · Auto Pilot" icon="🛰️" variant="ok">
      Auto-escala, auto-ajusta, auto-remedia, auto-agenda — mãos fora.
    </KwCard>
  </v-click>
</div>

<div v-click="6" class="mt-4 text-sm kw-muted">

A escada responde *quanto conhecimento operacional está codificado.* O L1 só instala; o L5
opera o sistema para você não precisar. A maioria dos operators reais fica em torno de
**L2–L3** — e isso costuma ser suficiente. **Mais níveis = mais do runbook movido da sua
cabeça para o loop.**

</div>

</div>

<!--
Speaker: os CNCF Operator Capability Levels (do modelo de maturidade do Operator
Framework) — uma régua conceitual para "quanto este operator realmente faz?" Cinco
degraus: L1 Basic Install (provisionar a partir de um CR); L2 Seamless Upgrades (atualizar
o workload E o próprio operator de forma limpa); L3 Full Lifecycle (day-2:
backup/restore, failover, escala — o runbook); L4 Deep Insights (métricas, alertas,
observabilidade do workload+operator); L5 Auto Pilot (auto-escala/ajuste/remediação — o
sistema opera a si mesmo). Enquadre como um espectro de CONHECIMENTO CODIFICADO, não uma
nota de qualidade: um ótimo operator L1 pode ser exatamente o certo para uma app simples.
Checagem de realidade: a maioria dos operators de produção vive em L2–L3; L5 é raro e
duramente conquistado. GUARDRAIL: mantenha isto neutro de vendor — descreva os níveis, não
nomeie NENHUM produto, mesmo que os participantes conheçam exemplos. A seguir: ver o loop
dirigir um recurso customizado, depois o lab.
-->

---

<span class="kw-kicker">O único loop sobre o qual tudo roda — uma terceira vez, com o seu CR</span>

# Um operator é reconciliação com **o seu recurso** como `spec`

<div class="mt-2">
  <ReconcileLoop :step="$clicks" :desired="1" controller="Backup operator" resource="Backup" desiredSource="spec (seu CR)" observedSource="cluster" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **Você aplicou um CR `Backup`; o operator o observa.** Desejado = 1 backup para hoje; observado = 0. Essa é a lacuna — exatamente o loop de reconciliação, mas o kind é *seu*.
- **Diff → agir.** O controller roda seu runbook: tirar o snapshot, subi-lo, podar os antigos. Ninguém rodou um script na mão — o loop rodou.
- **Ele nunca para.** Delete o artefato resultante e o loop percebe a lacuna e o refaz. No lab você vai deletar um **Secret** do cert-manager e vê-lo reaparecer.

</v-clicks>
</div>

<!--
Speaker: o MESMO componente ReconcileLoop do S03/S21 (guardrail de reuso — nenhuma
animação nova), agora com um recurso CUSTOMIZADO no slot de desejado: controller="Backup
operator", resource="Backup", desired=1, desiredSource="spec (seu CR)",
observedSource="cluster". Então ele lê "desejado 1, observado 0 → criar 1 Backup". Clique
por clique: Observe (seu CR quer um backup hoje; nenhum existe) → Diff (desejado 1 ≠
observado 0) → Act (rodar o runbook — snapshot, upload, prune) → Repeat (em sincronia,
seguir observando, refazer qualquer coisa que suma). Aterrisse o fio condutor em voz alta:
S03 = loop nativo; S21 = mesmo loop com o Git; S22 = mesmo loop com o SEU CRD. Um
mecanismo, três fontes de estado desejado. Ponteiro direto para o lab: o cert-manager é
exatamente isto — seu controller reconcilia um Certificate num Secret, e se você deletar o
Secret o loop o recria. A seguir: recap, depois ir sentir.
-->

---
layout: recap
heading: 'Recap — estenda a API, depois deixe o loop rodar o seu runbook'
story: 'Alguns trabalhos day-2 — backup, failover, upgrade — não são nenhum kind nativo; são um runbook que precisa de conhecimento de domínio. Um operator captura isso: um CRD estende a API com um novo kind, e um controller customizado roda o loop de reconciliação sobre instâncias dele, com a sua expertise operacional no passo de "agir". O mesmo loop do modelo mental e do GitOps — novo estado desejado.'
next: 'Um operator de produção na natureza — o mesmo padrão, empacotado e testado em batalha'
---

- **Por que operators existem:** kinds nativos cobrem padrões genéricos; **runbooks de
  domínio** (backup, failover, upgrade) precisam de expertise codificada que um controller
  genérico não tem
- **A equação:** **operator = CRD** (estende a API com um novo `kind` + schema) **+
  controller customizado** (um Pod rodando o loop observar → diffar → agir sobre seus CRs)
- **CRD sozinho = dado inerte; controller-sobre-nativos = um controller comum** — você
  precisa dos **dois**, e do *seu* conhecimento no passo de **agir**
- **Controller vs operator:** o mesmo loop; o operator reconcilia um **CRD que você
  definiu** com **lógica de domínio** — *conhecimento operacional codificado atrás de uma API*
- **Maturidade é um espectro:** os **capability levels da CNCF, L1 Basic Install → L5 Auto
  Pilot**; mais níveis = mais do runbook movido para o loop
- **Amarração CKx:** CRDs/operators são tópicos de **extensão** da CKA (extensão da API /
  arquitetura de cluster), não um domínio duro da CKAD — mas o loop de reconciliação é núcleo

<!--
Speaker: feche o laço. O problema: tarefas operacionais day-2 não são recursos nativos —
são runbooks que precisam de expertise de domínio. A resposta: operator = CRD (nova API) +
controller customizado (o loop de reconciliação com o seu runbook no "agir"). Quatro fatos
para deixar com eles: (1) a equação, e que AMBAS as metades são obrigatórias (só-CRD é
inerte, controller-sobre-nativos é só um controller comum); (2) a distinção
controller-vs-operator = conhecimento operacional codificado, não um mecanismo novo; (3) o
espectro de capability levels L1→L5 como "quanto do runbook está automatizado"; (4) é o
loop do S03 uma terceira vez (depois do GitOps do S21) — um mecanismo, três fontes de
estado desejado. Passe para o Lab 22: instalar o cert-manager (um operator sem código de
verdade), inspecionar seus CRDs com get crd / explain, criar um Issuer self-signed + um
Certificate, ver o controller reconciliá-los num Secret, então deletar o Secret e ver o
loop colocá-lo de volta — o padrão operator que dá para ver em ~15 minutos.
-->

---
layout: lab
lab: labs/day-3/22-operator-concept.md
duration: 15 min
env: namespace ✓ (read-only) / kind ✓ (self-install)
---

## Lab 22 — Conheça um operator de verdade

- Instale o **cert-manager** (um operator sem código: CRDs + um controller) e inspecione seus CRDs com `kubectl get crd` / `kubectl explain`
- Crie um **`Issuer`** self-signed e um **`Certificate`**; veja o controller reconciliá-los num **`Secret`** (`kubectl get certificate,secret -w`)
- Leia o **`.status`** do CR (`Ready=True`) — o controller reportando de volta
- **Quebre→conserte:** `kubectl delete secret …` → o controller o **recria** (o loop de reconciliação, *não* garbage collection)
- Responda: *o que torna isto um operator e não só um controller?* → **conhecimento operacional codificado atrás de um CRD**
