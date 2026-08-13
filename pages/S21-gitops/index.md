---
layout: section-cover
image: /covers/section-21-oracle-lighthouse.webp
day: Day 3
section: '21'
tier: recommended
track: Delivery
---

# GitOps com Argo CD

Dirija o estado desejado a partir do Git; entenda sync, self-heal e drift.

**recommended** · sugerido para o Day 3 · trilha Delivery

<!--
Seção S21 — GitOps com Argo CD. Recommended, Day 3, trilha Delivery.
Tempo: ~30 min de slides + 25 min de lab.
Resultado: os participantes conseguem explicar GitOps pull-based, ler/escrever uma
`Application` do Argo CD e prever o comportamento de sync / self-heal / drift — e então
sentir isso no lab (criar uma Application, vê-la sincronizar Healthy, gerar drift na mão,
ver o self-heal reverter).
Beats: problema (apply push-based não tem detecção de drift — "o que está rodando vs o
que está no Git?") · modelo mental (pull-based: um agente dentro do cluster reconcilia
continuamente o cluster em direção ao Git) · CRD Application (source repo/path/revision +
destination cluster/namespace + syncPolicy) · três comportamentos (sync / self-heal /
drift) · magic-move construindo o manifesto da Application (== application.yaml do lab) ·
animação do loop de reconciliação com GIT como fonte do estado desejado (reutiliza
ReconcileLoop, callback ao S03, aponta para o S22) · sync status vs health status (dois
eixos) · quatro princípios do OpenGitOps · recap → S22 · lab.

Animação: REUTILIZAR ReconcileLoop (US-X1, construído no S03) — passar controller="Argo CD",
resource="réplica", desiredSource="Git". Este é o guardrail de reuso em ação: o loop do
GitOps É o loop de reconciliação do S03 com o Git no slot de desejado. As novas props
desiredSource/observedSource foram adicionadas de forma retrocompatível (default
spec/status) para o S03 permanecer byte-idêntico.

ACCURACY LOCKS (verificados contra a doc do Argo CD stable / v3.x, 2026-07-10):
- Install: kubectl create namespace argocd; kubectl apply -n argocd --server-side
  --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
  (server-side apply — o manifesto de instalação é grande demais para o last-applied
  client-side).
- CRD Application: apiVersion argoproj.io/v1alpha1, kind Application, vive no namespace
  `argocd`. spec.source{repoURL,targetRevision,path} = estado desejado no Git;
  spec.destination{server,namespace} = onde aterrissa (server
  https://kubernetes.default.svc = a mesma API dentro do cluster); spec.syncPolicy.automated
  {prune,selfHeal}.
- selfHeal=true → o Argo reverte edições manuais de volta ao Git. prune=true → recursos
  deletados do Git são removidos do cluster.
- Sync status: Synced / OutOfSync (/ Unknown) — o cluster == Git? Health status:
  Healthy / Progressing / Degraded / Suspended / Missing (/ Unknown) — os workloads estão
  realmente OK? Dois eixos INDEPENDENTES.
- Secret inicial de admin: `argocd-initial-admin-secret` (CLI: argocd admin
  initial-password -n argocd).
- O lab usa o repo PÚBLICO canônico argoproj/argocd-example-apps, path guestbook —
  executável no kind sem hospedar nada. A continuidade da red line (a app `web`) é
  deliberadamente quebrada aqui: fazer push de uma mudança no Git exige um repo gravável
  que não hospedamos, então o beat obrigatório "mudar o Git → re-sync" vira um stretch
  baseado em fork, enquanto o quebre→conserte estrela do self-heal com drift não precisa de
  escrita no Git. Registrado honestamente no lab.

ACCURACY LOCKS — callout do panorama de ferramentas (verificado 2026-08-06, só fatos de
mudança lenta):
- Graduação CNCF: **Argo** (o projeto guarda-chuva — Argo CD, Workflows, Rollouts, Events;
  graduado em 2022) e **Flux** (graduado em 2022) são ambos CNCF-graduated. O Argo CD
  sozinho NÃO é a entidade graduada — nunca afirme "Argo CD é CNCF-graduated" no slide.
- CRDs core do Flux (v2.x): GitRepository (source.toolkit.fluxcd.io), Kustomization
  (kustomize.toolkit.fluxcd.io), HelmRelease (helm.toolkit.fluxcd.io).
- Eixos de posicionamento (UI vs composabilidade, multi-tenancy, escala) foram
  deliberadamente MANTIDOS FORA do slide — contestáveis e envelhecem rápido; as speaker
  notes carregam apenas a diferença mecânica. O logo vendorizado é a marca guarda-chuva
  "Argo", então o slide combina a variante de ícone com uma legenda textual explícita
  "Argo CD" (ver public/icons/README.md).
Amarração CKx: GitOps é assunto de ecossistema/adjacente — não é um domínio duro de
CKA/CKAD, mas o modelo mental do loop de reconciliação é claramente arquitetura de
cluster da CKA. Aterrissou no recap.
-->

---
layout: statement
kicker: O problema
---

Você rodou `kubectl apply` do seu laptop na terça passada. **O cluster ainda é o que você aplicou?**

Entrega push-based — `kubectl apply` / `helm upgrade` de um laptop ou de um job de CI — dispara **uma vez** e vai embora. Não fica registro de *o que deveria estar rodando*, e nada vigia o **drift**: alguém faz `kubectl edit` num Deployment, escala na mão às 2 da manhã, ou um rollout pela metade deixa o cluster num estado que **nenhum arquivo descreve**. Você não consegue responder à única pergunta que importa — *o que está rodando versus o que está no Git?* — porque a fonte da verdade é um comando que alguém digitou, não um arquivo que você pode diffar.

<!--
Speaker: a dor é real e universal. O apply push-based (kubectl/helm de um laptop ou de
um runner de CI) tem três buracos: (1) nenhum estado desejado persistido — a "verdade"
foi um comando transitório; (2) nenhuma detecção de drift — ninguém reverte um hotfix
manual, então o cluster diverge silenciosamente de qualquer arquivo; (3) nenhuma
auditoria — quem mudou o quê, quando? O Git já resolve versionamento/auditoria/revisão
para código. GitOps pergunta: e se o cluster CONTINUAMENTE se fizesse igual a um repo
Git? A seguir: inverter push para pull.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · inverta a seta — pull, não push</span>

# GitOps: o Git é o estado desejado, o cluster o puxa

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Push (o que você fez até agora)" icon="📤" variant="warn">
      Um humano ou o CI roda <code>kubectl apply</code> <em>contra</em> o cluster, de fora.
      Fire-and-forget: sem estado desejado armazenado, sem detecção de drift, credenciais vivem no CI.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Pull (GitOps)" icon="📥" variant="ok">
      Um <strong>agente dentro do cluster</strong> observa um repo Git e reconcilia
      continuamente o cluster <em>em direção</em> a ele. O Git é a única fonte da verdade; o
      agente tem as credenciais, não o seu laptop.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

**É o mesmo loop de reconciliação, um nível acima.** Lá, um controller levava o *observado*
em direção ao *desejado = `spec`*. Aqui, o **Argo CD** leva o cluster inteiro em direção ao
*desejado = **Git***. O mesmo observar → diffar → agir → repetir — o estado desejado só se
mudou para um repo versionado, revisável e auditável.

</div>

</div>

<!--
Speaker: duas setas. PUSH: o ator está fora, apontando um comando para o cluster — é todo
apply/helm que você já rodou. PULL: um agente DENTRO do cluster assina um repo Git e faz
a realidade coincidir com ele, para sempre. Consequências que valem nomear: o estado
desejado agora é um arquivo com histórico/revisão/auditoria (Git); o drift é corrigido
automaticamente; as credenciais do cluster nunca saem do cluster (o CI só precisa de
push-para-o-Git). Amarre com força ao S03 — isto é literalmente o loop de reconciliação
com o Git no slot de "desejado". Argo CD (e Flux) são as ferramentas CNCF que o
implementam. A seguir: o único recurso que expressa "reconcilie este repo neste cluster."
-->

---
layout: code-annotated
heading: 'Um CRD diz: reconcilie este repo neste cluster'
compact: true
lab: labs/day-3/21-gitops.md
---

```yaml {none|6-10|11-13|14-18|all}
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  source:                                    # DESEJADO — onde a verdade vive no Git
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:                               # ONDE deve rodar
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:                               # manter em sincronia, sem intervenção
      prune: true
      selfHeal: true
```

::notes::

<CodeNote at="1" label="spec.source" variant="ok">
O estado desejado, <strong>no Git</strong>: qual <code>repoURL</code>, qual
<code>targetRevision</code> (branch/tag/commit — <code>HEAD</code> = ponta), e o
<code>path</code> até os manifestos. Mude esses arquivos no Git e a app acompanha.
</CodeNote>

<CodeNote at="2" label="spec.destination" variant="ok">
Onde os manifestos renderizados aterrissam: um cluster (<code>server</code> —
<code>https://kubernetes.default.svc</code> é <em>este</em> cluster) e um
<code>namespace</code>. Um único Argo CD pode dirigir vários clusters.
</CodeNote>

<CodeNote at="3" label="syncPolicy.automated" variant="warn">
<code>selfHeal: true</code> reverte edições manuais de volta ao Git; <code>prune: true</code>
deleta recursos que você removeu do Git. Omita este bloco e o sync vira
<strong>manual</strong> (um botão / <code>argocd app sync</code>).
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
A <code>Application</code> é ela mesma um recurso Kubernetes (um CRD do Argo) que vive no
namespace <code>argocd</code> — então a configuração do GitOps <em>também</em> é só YAML que
você pode colocar no Git.
</div>

<!--
Speaker: esta é a seção inteira num slide. Uma Application é um CRD (instalado junto com o
Argo CD) que amarra um SOURCE no Git a um DESTINATION no cluster e diz como mantê-los em
sincronia. source = repoURL + targetRevision + path (o estado desejado, versionado no Git);
destination = server (kubernetes.default.svc = dentro do cluster) + namespace. syncPolicy:
sem `automated`, o Argo mostra o drift mas espera você clicar em Sync; COM automated +
selfHeal, ele reverte mudanças manuais; + prune, ele deleta o que você deletou do Git. Ponto
meta para o padrão "app of apps" mais adiante (vizinhança do S22): a Application é ela mesma
YAML, então você pode gerenciar Applications com GitOps também. Este manifesto exato é o
application.yaml do lab. A seguir: nomear os três comportamentos com precisão.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Três comportamentos · sync, self-heal, detecção de drift</span>

# O que o agente realmente faz

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem;">
  <v-click at="1">
    <KwCard heading="Sync" icon="🔄" variant="ok">
      Aplicar os manifestos do Git ao cluster até live == desejado. Manual
      (<code>argocd app sync</code> / um botão) ou <strong>automated</strong>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Detecção de drift" icon="🔎" variant="warn">
      Comparar continuamente live vs Git. Qualquer divergência → a app é marcada
      <code>OutOfSync</code> — haja ou não correção automática.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Self-heal" kind="deploy" variant="ok">
      Com <code>selfHeal: true</code>, o drift não é só <em>reportado</em> — o Argo
      reaplica o Git e <strong>reverte</strong> a mudança manual automaticamente.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 text-sm">

<span class="kw-kicker">a punchline</span>

A detecção de drift roda **sempre** (você sempre vai *ver* `OutOfSync`). O self-heal é o que
transforma ver em *consertar*. Desligue o self-heal e uma edição manual fica lá como
`OutOfSync` até um humano decidir — ligue-o e o cluster se recusa a permanecer em drift.

</div>

</div>

<!--
Speaker: separe três coisas que as pessoas misturam. SYNC = o ato de aplicar o Git ao
cluster (pode ser manual ou automated). DETECÇÃO DE DRIFT = a comparação contínua; sua
saída é o status OutOfSync/Synced — isso roda independente de política, então o Argo sempre
MOSTRA o drift. SELF-HEAL = a resposta automática ao drift: reaplicar o Git, desfazer a
mudança manual. A pergunta obrigatória do lab depende exatamente dessa distinção: com
selfHeal OFF, edite um recurso gerenciado → ele vai a OutOfSync e FICA (o Argo reporta mas
não reverte); com selfHeal ON → ele volta no lugar. O prune é o irmão de deleção do
self-heal (remover do Git → remover do cluster). A seguir: ver o manifesto ser construído,
depois ver o loop rodar.
-->

---
layout: code-walkthrough
heading: 'Construa a Application, campo a campo'
lab: labs/day-3/21-gitops.md
---

````md magic-move
```yaml
# 1 — uma Application do Argo CD é um CRD no namespace argocd
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
```

```yaml
# 2 — SOURCE: o estado desejado, versionado no Git
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
```

```yaml
# 3 — DESTINATION: em qual cluster + namespace ele aterrissa
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
```

```yaml
# 4 — SYNC POLICY: manter em sincronia, sem intervenção (== labs/day-3/21-gitops.md)
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```
````

<!--
Speaker: quatro frames, e cada um adiciona uma ideia. (1) É um CRD no namespace argocd — a
config do GitOps é ela mesma YAML de Kubernetes. (2) SOURCE amarra o estado desejado a um
repo/revision/path no Git — esta é a alegação inteira "o Git é a verdade" em três linhas.
(3) DESTINATION diz onde: a API dentro do cluster (kubernetes.default.svc) + namespace
default. (4) adicione project (o AppProject default) e syncPolicy.automated{prune,selfHeal}
— agora é sem intervenção. O frame final é o application.yaml do lab byte a byte; o lab
aplica exatamente isto. Repare que não existe verbo "sync" no arquivo — declarar a
Application basta; o agente faz o resto. A seguir: esse "o agente faz o resto" É o loop
do S03.
-->

---

<span class="kw-kicker">O único loop sobre o qual tudo roda — de novo, com o Git</span>

# Self-heal é reconciliação com o Git como `spec`

<div class="mt-2">
  <ReconcileLoop :step="$clicks" controller="Argo CD" resource="réplica" desiredSource="Git" observedSource="cluster" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **O Git diz 3 réplicas; alguém escalou para 2 na mão.** O Argo *observa* a lacuna entre o Git e o cluster — isso é drift.
- **Diff → agir.** Ele reaplica o Git e recria a réplica faltante. Ninguém rodou `kubectl` — o loop fechou a lacuna, exatamente como um controller nativo.
- **Ele nunca para.** Isto é `selfHeal: true`: edite na mão um recurso gerenciado e o Argo o arrasta de volta ao Git, para sempre.

</v-clicks>
</div>

<!--
Speaker: este é o MESMO componente ReconcileLoop do S03 (guardrail de reuso — nenhuma
animação nova), com o Git encaixado no slot de "desejado": desiredSource="Git",
observedSource="cluster", controller="Argo CD". Clique por clique: Observe (o Git quer 3, o
cluster mostra 2 — uma escala manual derrubou uma) → Diff (desejado 3 ≠ observado 2, delta
+1) → Act (reaplicar o Git, recriar a réplica) → Repeat (em sincronia, seguir observando).
Aterrisse o callback: o S03 disse "o loop está sempre observando, delete um Pod e ele
volta." GitOps é essa mesma frase com o GIT como a coisa a ser igualada. O lab faz você
sentir isso — escale um Deployment gerenciado na mão e veja o Argo reverter. Ponteiro para
frente: os operators do S22 são este loop de novo, dirigido por um recurso customizado. A
seguir: como o Argo reporta estado.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Lendo o Argo · duas perguntas, dois statuses independentes</span>

# Sync status vs health status

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Sync status — o cluster bate com o Git?" icon="🔁" variant="ok">
      <KwChip>Synced</KwChip> live == Git ·
      <KwChip>OutOfSync</KwChip> eles diferem ·
      <KwChip>Unknown</KwChip> ainda não dá para dizer.
      <div class="kw-muted mt-1">Responde: <em>a realidade é o que o Git diz?</em></div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Health status — os workloads estão OK?" kind="deploy" variant="ok">
      <KwChip>Healthy</KwChip> · <KwChip>Progressing</KwChip> ·
      <KwChip>Degraded</KwChip> · <KwChip>Missing</KwChip> / <KwChip>Suspended</KwChip>.
      <div class="kw-muted mt-1">Responde: <em>a coisa que está rodando realmente funciona?</em></div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

Eles são **ortogonais.** `Synced + Degraded` = você fez o deploy fiel de um **manifesto
quebrado** (o Git é a verdade, e a verdade está quebrada — conserte o Git, não faça patch na
mão). `OutOfSync + Healthy` = o patch manual de alguém por acaso funciona, mas **não está no
Git** — o self-heal vai revertê-lo. Você precisa de *ambas* as respostas para saber o que
está acontecendo; o lab lê as duas no `argocd app get`.

</div>

</div>

<!--
Speaker: a coisa mais útil de internalizar sobre a UI do Argo. Dois eixos separados. SYNC
STATUS (Synced/OutOfSync/Unknown) responde "live == Git?" — um diff puro. HEALTH STATUS
(Healthy/Progressing/Degraded/Missing/Suspended) responde "os workloads estão realmente de
pé?" — os health checks por recurso do Argo. Eles se movem de forma independente, e os
produtos cruzados são os casos didáticos: Synced+Degraded significa que você entregou
corretamente um manifesto ruim — o Argo fez o trabalho dele, seu YAML está errado, conserte
NO GIT (não faça patch na mão, ele vai ser revertido). OutOfSync+Healthy significa uma
mudança manual que por acaso funciona mas não está no Git — o self-heal vai desfazê-la,
então leve-a para o Git se quiser mantê-la. No lab você vai ler os dois campos no
`argocd app get` / `kubectl get application`. A seguir: os princípios que fazem disto uma
disciplina, não só uma ferramenta.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">OpenGitOps · os quatro princípios (CNCF)</span>

# GitOps é uma disciplina, não um produto

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="1 · Declarativo" icon="📜" variant="ok">
      O sistema inteiro é descrito de forma declarativa — estado desejado como dados, não
      scripts de passos.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="2 · Versionado e imutável" icon="🔒" variant="ok">
      Esse estado é armazenado no Git: versionado, com histórico imutável, revertível a
      qualquer commit anterior.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="3 · Puxado automaticamente" icon="📥" variant="ok">
      Agentes de software fazem <em>pull</em> do estado desejado do Git — ninguém aponta
      credenciais para o cluster.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="4 · Reconciliado continuamente" kind="deploy" variant="ok">
      Agentes observam continuamente e <strong>convergem</strong> o estado real em direção
      ao desejado — o loop de novo.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-4 text-sm">
  <div class="kw-cols-2">
    <div class="flex items-center gap-2">
      <K8sIcon name="argo-icon-white" size="1.5rem" alt="Logo do projeto Argo" />
      <span><strong>Argo CD</strong> — o CRD <code>Application</code> que você acabou de ler</span>
    </div>
    <div class="flex items-center gap-2">
      <K8sIcon name="flux-icon-white" size="1.5rem" alt="Logo do Flux" />
      <span><strong>Flux</strong> — os CRDs <code>GitRepository</code> + <code>Kustomization</code> / <code>HelmRelease</code></span>
    </div>
  </div>
  <div class="mt-2 kw-muted">
  Duas implementações do mesmo loop pull-based, ambas sob projetos CNCF-graduated. Os
  princípios — não a ferramenta — são o que o projeto <strong>OpenGitOps</strong> da CNCF
  padronizou; esta seção inteira é o princípio 4 aplicado aos princípios 1–3.
  </div>
</div>

</div>

<!--
Speaker: nomeie a disciplina para os participantes não reduzirem GitOps a "Argo CD". O
working group OpenGitOps da CNCF fixou quatro princípios: (1) DECLARATIVO — estado desejado
como dados; (2) VERSIONADO E IMUTÁVEL — esses dados vivem no Git com histórico completo e
revert fácil; (3) PUXADO AUTOMATICAMENTE — agentes fazem pull (vs um job de CI fazendo push
com credenciais do cluster); (4) RECONCILIADO CONTINUAMENTE — agentes seguem convergindo o
real em direção ao desejado. Feche o laço: esta seção inteira é o princípio nº 4 (o loop de
reconciliação) impondo os nº 1–3.

O callout de ferramentas — mantenha em ~30 segundos, ele substitui a antiga frase única,
não é material novo. Argo CD e Flux são as duas implementações que os participantes vão de
fato encontrar. Nomenclatura cuidadosa: o projeto CNCF-GRADUATED é o **Argo**, o
guarda-chuva (Argo CD, Workflows, Rollouts, Events) — o Argo CD é o componente de entrega
contínua; o Flux é ele mesmo um projeto graduado. Diferença mecânica, se perguntarem: o
Argo CD é centrado em app — um CRD `Application` amarra source→destination, mais uma Web
UI mostrando estado de sync/drift; o Flux é um toolkit de controllers — `GitRepository`
aponta para o repo, `Kustomization` / `HelmRelease` reconciliam a partir dele; o estado do
dia a dia vive no kubectl/CLI, não numa UI embutida. Ambos são pull-based, ambos
reconciliam continuamente — as habilidades transferem. Se alguém perguntar "qual devemos
rodar?": genuinamente tanto faz; times escolhem por adequação operacional, não por lacunas
de capacidade — não relitigue a escolha do time de plataforma deles deste palco. O lab usa
Argo CD porque a UI torna o estado de sync/drift VISÍVEL enquanto os participantes ainda
estão formando o modelo mental. A seguir: recap e passar para o lab.
-->

---
layout: recap
heading: 'Recap — o Git é a fonte da verdade, o cluster converge para ele'
story: 'O apply push-based deixava o drift sem detecção. Invertemos a seta: um agente dentro do cluster (Argo CD) observa o source Git de uma Application e reconcilia continuamente o cluster em direção a ele — o sync aplica o Git, a detecção de drift reporta divergência, e o self-heal reverte edições manuais automaticamente. O mesmo loop de reconciliação, com o Git no slot de desejado.'
next: 'O padrão operator — o mesmo loop de reconciliação de novo, desta vez dirigido pelo seu próprio CRD'
---

- **Push → pull.** GitOps coloca o estado desejado no **Git** e faz um agente dentro do
  cluster puxá-lo e reconciliá-lo — versionado, auditável, autocorretivo; as credenciais do
  cluster nunca saem do cluster
- **O CRD `Application`** amarra um **source** no Git (`repoURL`/`targetRevision`/`path`) a
  um **destination** (cluster + namespace), com uma **`syncPolicy`**
- **Três comportamentos:** **sync** (aplicar o Git) · **detecção de drift** (sempre ligada →
  `OutOfSync`) · **self-heal** (`selfHeal: true` reverte edições manuais; `prune` deleta o
  que saiu do Git)
- **Dois statuses independentes:** **sync** (Synced/OutOfSync — bate com o Git?) vs
  **health** (Healthy/Progressing/Degraded — workloads OK?); leia os dois
- **É o mesmo loop de reconciliação** com o Git como `spec` — e o **OpenGitOps** torna os
  quatro princípios agnósticos de ferramenta (Argo CD, Flux, …)
- **Amarração CKx:** GitOps é assunto de ecossistema/adjacente (não é um domínio duro de
  CKA/CKAD), mas o modelo mental do **loop de reconciliação** é núcleo da arquitetura de
  cluster da CKA

<!--
Speaker: puxe o fio. O problema era drift sem detecção; a solução foi mover o estado
desejado para o Git e deixar um agente dentro do cluster reconciliar continuamente em
direção a ele. Crave quatro fatos: (1) push→pull e por quê (auditoria, revert, credenciais
ficam no cluster); (2) a Application amarra source→destination com uma syncPolicy; (3)
sync vs detecção de drift vs self-heal são três coisas diferentes (o self-heal é o
auto-revert; a detecção de drift roda sempre); (4) sync status e health status são
ortogonais — leia os dois. E o fio condutor: este é o loop de reconciliação do S03 com o
Git como estado desejado — que é exatamente a preparação para o S22, onde você escreve o
SEU próprio controller para o SEU próprio CRD. Passe para o Lab 21: instalar o Argo CD no
kind, aplicar a Application guestbook, vê-la ir a Synced/Healthy, então gerar drift na mão
e ver o self-heal reverter.
-->

---
layout: lab
lab: labs/day-3/21-gitops.md
duration: 25 min
env: kind-only / facilitator-hosted (namespace = read-only)
---

## Lab 21 — Git como fonte da verdade

- Instale o Argo CD no kind; aplique a **Application** `guestbook` e veja-a ir a **Synced / Healthy**
- Leia os dois statuses no `argocd app get` / `kubectl get application`
- **Quebre→conserte (self-heal):** escale na mão um Deployment gerenciado → veja o Argo **revertê-lo** ao Git
- Responda: *o que acontece com uma edição manual se o `selfHeal` estiver desligado?* (`OutOfSync`, sem auto-revert)
- Stretch: faça fork do repo, mude um manifesto, `git push` → veja a app fazer re-sync para o novo commit
