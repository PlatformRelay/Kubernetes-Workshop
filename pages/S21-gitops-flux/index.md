---
layout: section-cover
image: /covers/section-21-oracle-lighthouse.webp
day: Day 3
section: '21'
tier: recommended
track: Delivery
---

# GitOps com Flux

Dirija o estado desejado a partir do Git; entenda reconcile, prune, suspend e drift.

**recommended** · sugerido para o Day 3 · trilha Delivery

<!--
Seção S21 — GitOps com Flux (variante selecionada pelo facilitador). Recommended, Day 3,
trilha Delivery. Tempo: ~30 min de slides + 25 min de lab (mesmo slot da variante Argo CD
— cronograma net-zero; deixe os orçamentos de minutos do manifest intocados).
Resultado: os participantes conseguem explicar GitOps pull-based, ler/escrever
`GitRepository` + `Kustomization` do Flux (e reconhecer `HelmRelease`), e prever o
comportamento de reconcile / prune / suspend — e então sentir isso no lab do Flux
(instalar o Flux, aplicar os sources, ver Ready, gerar drift na mão, provar que o suspend
deixa o drift ficar).
Beats: problema (apply push-based não tem detecção de drift) · modelo mental (pull-based) ·
GitRepository (code-annotated) · três comportamentos (reconcile / drift / prune+suspend) ·
magic-move construindo Kustomization / HelmRelease · ReconcileLoop com controller="Flux" ·
status/conditions · quatro princípios do OpenGitOps com callout de ferramentas espelhado
(Argo CD como a alternativa) · recap → S22 · lab.

Animação: REUTILIZAR ReconcileLoop (US-X1, construído no S03) — passar controller="Flux",
resource="réplica", desiredSource="Git". Mesmo guardrail de reuso da variante Argo CD.

ACCURACY LOCKS (verificados contra a doc do Flux v2 / GitOps Toolkit, 2026-08-06):
- Install: CLI primeiro (`brew install fluxcd/tap/flux` ou https://fluxcd.io/install.sh).
  Caminho recomendado para cluster: `flux bootstrap` (instala os controllers, faz push dos
  manifestos, configura o Flux para se atualizar a partir do Git). Caminho kind /
  workshop: `flux install` (instalação dev — só os controllers, sem sync Git de bootstrap)
  ou `kubectl apply -f https://github.com/fluxcd/flux2/releases/latest/download/install.yaml`.
- API groups dos CRDs core: GitRepository → `source.toolkit.fluxcd.io/v1`;
  Kustomization → `kustomize.toolkit.fluxcd.io/v1`;
  HelmRelease → `helm.toolkit.fluxcd.io/v2`.
- Kustomization: `.spec.interval` (obrigatório) agenda reconcile + correção de drift;
  `.spec.prune` (bool obrigatório) faz garbage collection de objetos removidos do Git;
  `.spec.suspend` pausa o apply e a correção de drift (o análogo do selfHeal:false —
  o Flux não tem flag selfHeal separada; o reconcile ativo *é* o heal).
- Conditions: `Ready` / `Reconciling` / `Stalled` compatíveis com kstatus em sources e
  Kustomizations; leia com `flux get …` / `kubectl get gitrepository,kustomization`.
- Verbos de CLI usados no slide: `flux install`, `flux get`, `flux reconcile`,
  `flux suspend`. Só nas speaker notes: `flux bootstrap` (caminho de instalação de
  produção) e `flux resume` (desfaz o suspend) — nunca mostrados aos participantes num
  slide.
- Source de demo no slide: `stefanprodan/podinfo` público (exemplo da doc do Flux) — sem
  hospedagem, amigável ao kind. O stretch de repo gravável continua sendo um fork, mesma
  honestidade do lab do Argo.

ACCURACY LOCKS — callout do panorama de ferramentas (verificado 2026-08-06, só fatos de
mudança lenta):
- Graduação CNCF: **Argo** (guarda-chuva — Argo CD, Workflows, Rollouts, Events;
  graduado em 2022) e **Flux** (graduado em 2022) são ambos CNCF-graduated. O Argo CD
  sozinho NÃO é a entidade graduada — nunca afirme "Argo CD é CNCF-graduated" no slide.
- Eixos de posicionamento (UI vs composabilidade, multi-tenancy, escala) ficam FORA do
  slide — contestáveis e envelhecem rápido; as speaker notes carregam apenas a diferença
  mecânica.
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
em direção ao *desejado = `spec`*. Aqui, o **Flux** leva o cluster inteiro em direção ao
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
com o Git no slot de "desejado". Flux (e Argo CD) são as ferramentas CNCF que o
implementam. A seguir: o CRD de Source que aponta para o repo.
-->

---
layout: code-annotated
heading: 'Um CRD diz: este repo Git é a fonte do estado desejado'
compact: true
lab: labs/day-3/21-gitops-flux.md
---

```yaml {none|6-7|8-10|all}
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1m                    # consulta o Git por novos commits
  url: https://github.com/stefanprodan/podinfo
  ref:
    branch: master
```

::notes::

<CodeNote at="1" label="spec.interval" variant="ok">
Com que frequência o source-controller consulta o Git por uma nova revision. Um interval
mais curto vê pushes mais cedo; o Artifact (tarball) é atualizado quando a revision
resolvida muda.
</CodeNote>

<CodeNote at="2" label="spec.url + spec.ref" variant="ok">
Qual repo e qual ref (<code>branch</code> / <code>tag</code> / <code>semver</code>).
HTTPS ou SSH; credenciais via um <code>secretRef</code> opcional no mesmo namespace.
</CodeNote>

<div v-click="3" class="mt-2 text-sm kw-muted">
Um <code>GitRepository</code> é um <strong>Source</strong> — ele produz um Artifact.
Outra coisa (<code>Kustomization</code> / <code>HelmRelease</code>) precisa
<strong>aplicar</strong> esse Artifact no cluster. A seguir: esses CRDs de apply.
</div>

<!--
Speaker: o Flux separa "onde está a verdade?" de "como a aplicamos?". GitRepository
(source.toolkit.fluxcd.io/v1) é o Source: url + ref + interval → um Artifact dentro do
cluster. Ele NÃO aplica manifestos sozinho. O primeiro apply do lab é exatamente esta
forma apontando para um repo público sem hospedagem. Caminho de instalação no kind:
flux install (dev) — times de produção normalmente usam flux bootstrap para o Flux
gerenciar a si mesmo a partir do Git. A seguir: nomear os três comportamentos, depois
construir o lado do apply.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Três comportamentos · reconcile, detecção de drift, prune &amp; suspend</span>

# O que o agente realmente faz

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem;">
  <v-click at="1">
    <KwCard heading="Reconcile" icon="🔄" variant="ok">
      No <code>interval</code> (ou com <code>flux reconcile</code>), buscar o Source e
      aplicar até live == desejado. Sem intervenção depois de declarado.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Detecção de drift" icon="🔎" variant="warn">
      Cada reconcile faz dry-run / diff de live vs Git. A divergência é corrigida no
      próximo apply bem-sucedido — a menos que a reconciliação esteja suspensa.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Prune &amp; suspend" kind="deploy" variant="ok">
      <code>prune: true</code> deleta objetos removidos do Git.
      <code>suspend: true</code> (ou <code>flux suspend</code>) pausa o apply — o drift
      <strong>fica</strong> (o análogo do <code>selfHeal: false</code>).
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 text-sm">

<span class="kw-kicker">a punchline</span>

O Flux **não tem flag `selfHeal` separada**. O reconcile ativo *é* o heal: edições manuais
voltam no lugar no próximo interval. **`suspend`** é como você desliga o heal — a pergunta
obrigatória do lab depende exatamente dessa distinção.

</div>

</div>

<!--
Speaker: separe três coisas que as pessoas misturam. RECONCILE = buscar o Source + aplicar
(interval ou flux reconcile kustomization …). DETECÇÃO DE DRIFT = a comparação que roda
como parte do reconcile; com suspend:false, a correção é automática. PRUNE = garbage
collection dos objetos que saíram do Git (prune: true é obrigatório no spec da
Kustomization — defina-o deliberadamente). SUSPEND = pausar o loop (flux suspend / flux
resume, ou spec.suspend). Mapeie para o vocabulário do Argo se alguém perguntar:
selfHeal:true ≈ não suspenso; selfHeal:false ≈ suspenso; prune ≈ prune. A seguir:
construir os CRDs de apply campo a campo.
-->

---
layout: code-walkthrough
heading: 'Construa o lado do apply — Kustomization, depois HelmRelease'
lab: labs/day-3/21-gitops-flux.md
---

````md magic-move
```yaml
# 1 — uma Kustomization do Flux é um CRD (kustomize.toolkit.fluxcd.io)
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
```

```yaml
# 2 — SOURCE REF: qual Artifact de GitRepository aplicar
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 10m
  sourceRef:
    kind: GitRepository
    name: podinfo
```

```yaml
# 3 — PATH + PRUNE: onde no repo, e garbage collection das remoções
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 10m
  path: ./kustomize
  prune: true
  sourceRef:
    kind: GitRepository
    name: podinfo
  targetNamespace: default
```

```yaml
# 4 — FORMA HELM: HelmRelease aplica um chart a partir de um Source (CRD irmão)
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: podinfo
  namespace: default
spec:
  interval: 10m
  chart:
    spec:
      chart: podinfo
      sourceRef:
        kind: HelmRepository
        name: podinfo
```
````

<!--
Speaker: quatro frames. (1) Kustomization é um CRD em kustomize.toolkit.fluxcd.io/v1 — a
config de apply do GitOps é ela mesma YAML de Kubernetes. (2) sourceRef amarra ao Artifact
do GitRepository que você acabou de ver — Source e apply são objetos separados. (3) path +
prune + interval + targetNamespace: o apply sem intervenção. prune:true remove objetos do
cluster deletados do Git; interval dirige o reconcile contínuo (e a correção de drift).
(4) o irmão em forma de Helm: HelmRelease (helm.toolkit.fluxcd.io/v2) puxa um chart via um
HelmRepository (ou outro Source) — o mesmo loop de pull, empacotamento diferente. O lab usa
GitRepository + Kustomization; o HelmRelease é reconhecimento, não um exercício
obrigatório. Repare que não existe verbo "sync" no arquivo — declarar os objetos basta; os
controllers fazem o resto (ou flux reconcile para dar um empurrão). A seguir: esse "os
controllers fazem o resto" É o loop do S03.
-->

---

<span class="kw-kicker">O único loop sobre o qual tudo roda — de novo, com o Git</span>

# Reconcile é reconciliação com o Git como `spec`

<div class="mt-2">
  <ReconcileLoop :step="$clicks" controller="Flux" resource="réplica" desiredSource="Git" observedSource="cluster" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **O Git diz 3 réplicas; alguém escalou para 2 na mão.** O Flux *observa* a lacuna entre o Git e o cluster — isso é drift.
- **Diff → agir.** No próximo reconcile ele reaplica o Git e recria a réplica faltante. Ninguém rodou `kubectl` — o loop fechou a lacuna.
- **Ele nunca para — a menos que você o suspenda.** Com `suspend: false` (default), edite na mão um recurso gerenciado e o Flux o arrasta de volta ao Git, para sempre.

</v-clicks>
</div>

<!--
Speaker: este é o MESMO componente ReconcileLoop do S03 (guardrail de reuso — nenhuma
animação nova), com o Git encaixado no slot de "desejado": desiredSource="Git",
observedSource="cluster", controller="Flux". Clique por clique: Observe (o Git quer 3, o
cluster mostra 2 — uma escala manual derrubou uma) → Diff (desejado 3 ≠ observado 2, delta
+1) → Act (reaplicar o Git, recriar a réplica) → Repeat (em sincronia, seguir observando).
Aterrisse o callback: o S03 disse "o loop está sempre observando, delete um Pod e ele
volta." GitOps é essa mesma frase com o GIT como a coisa a ser igualada. O lab faz você
sentir isso — escale um Deployment gerenciado na mão e veja o Flux reverter; depois flux
suspend e prove que a edição manual fica. Ponteiro para frente: os operators do S22 são
este loop de novo, dirigido por um recurso customizado. A seguir: como o Flux reporta
estado.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Lendo o Flux · conditions, não uma UI de sync/health</span>

# Ready, Reconciling, Stalled

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Ready — o último reconcile teve sucesso?" icon="🔁" variant="ok">
      <KwChip>Ready=True</KwChip> aplicado + health checks passaram ·
      <KwChip>Ready=False</KwChip> apply/build/health falhou ·
      <KwChip>Unknown</KwChip> ainda trabalhando.
      <div class="kw-muted mt-1">Responde: <em>este objeto está convergindo?</em></div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Conditions de progresso — tem trabalho em voo ou travado?" kind="deploy" variant="ok">
      <KwChip>Reconciling</KwChip> apply em andamento ·
      <KwChip>Stalled</KwChip> não vai ter sucesso sem uma mudança ·
      mais <code>lastAppliedRevision</code> / revision do Artifact.
      <div class="kw-muted mt-1">Responde: <em>o que ele está fazendo agora?</em></div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

Leia **ambos**: o Source e o objeto de apply. `GitRepository` Ready + `Kustomization`
não Ready = o Artifact foi buscado, mas o apply/health falhou — conserte os manifestos no
Git (não faça patch na mão; o próximo reconcile vai sobrescrever). Use
`flux get kustomizations` / `kubectl get kustomization -A` do mesmo jeito que o lab do
Argo usa `argocd app get`.

</div>

</div>

<!--
Speaker: o Flux não traz uma UI embutida de sync/health como o Argo CD — o estado do dia a
dia vive nas conditions via kubectl / flux CLI. Ready (kstatus) é a manchete: True
significa que o último reconcile aplicou e os health checks passaram. Reconciling/Stalled
explicam em-voo vs travado. Caso didático do produto cruzado: Source Ready + Kustomization
Ready=False significa que o Git foi buscado sem problemas mas o apply/health falhou —
conserte NO GIT. Objetos suspensos param de mover as conditions de propósito. No lab você
vai ler ambos com flux get / kubectl get. A seguir: os princípios que fazem disto uma
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
      <K8sIcon name="flux-icon-white" size="1.5rem" alt="Logo do Flux" />
      <span><strong>Flux</strong> — os CRDs <code>GitRepository</code> + <code>Kustomization</code> / <code>HelmRelease</code></span>
    </div>
    <div class="flex items-center gap-2">
      <K8sIcon name="argo-icon-white" size="1.5rem" alt="Logo do projeto Argo" />
      <span><strong>Argo CD</strong> — o CRD <code>Application</code> (a outra escolha comum)</span>
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
Speaker: nomeie a disciplina para os participantes não reduzirem GitOps a "Flux". O
working group OpenGitOps da CNCF fixou quatro princípios: (1) DECLARATIVO — estado desejado
como dados; (2) VERSIONADO E IMUTÁVEL — esses dados vivem no Git com histórico completo e
revert fácil; (3) PUXADO AUTOMATICAMENTE — agentes fazem pull (vs um job de CI fazendo push
com credenciais do cluster); (4) RECONCILIADO CONTINUAMENTE — agentes seguem convergindo o
real em direção ao desejado. Feche o laço: esta seção inteira é o princípio nº 4 (o loop de
reconciliação) impondo os nº 1–3.

O callout de ferramentas — mantenha em ~30 segundos, espelhado da variante Argo CD. Flux e
Argo CD são as duas implementações que os participantes vão de fato encontrar.
Nomenclatura cuidadosa: o projeto CNCF-GRADUATED é o **Argo**, o guarda-chuva (Argo CD,
Workflows, Rollouts, Events) — o Argo CD é o componente de entrega contínua; o Flux é ele
mesmo um projeto graduado. Diferença mecânica, se perguntarem: o Flux é um toolkit de
controllers — `GitRepository` aponta para o repo, `Kustomization` / `HelmRelease`
reconciliam a partir dele; o estado do dia a dia vive no kubectl/CLI. O Argo CD é centrado
em app — um CRD `Application` amarra source→destination, mais uma Web UI mostrando estado
de sync/drift. Ambos são pull-based, ambos reconciliam continuamente — as habilidades
transferem. Se alguém perguntar "qual devemos rodar?": genuinamente tanto faz; times
escolhem por adequação operacional, não por lacunas de capacidade — não relitigue a
escolha do time de plataforma deles deste palco. Esta entrega usa Flux porque o
facilitador o selecionou; a variante Argo CD desta seção existe para a outra escolha. A
seguir: recap e passar para o lab.
-->

---
layout: recap
heading: 'Recap — o Git é a fonte da verdade, o cluster converge para ele'
story: 'O apply push-based deixava o drift sem detecção. Invertemos a seta: controllers do Flux dentro do cluster observam um GitRepository e reconciliam continuamente via Kustomization / HelmRelease — o reconcile por interval aplica o Git, o prune remove o que saiu do Git, e o suspend pausa o heal para as edições manuais ficarem. O mesmo loop de reconciliação, com o Git no slot de desejado.'
next: 'O padrão operator — o mesmo loop de reconciliação de novo, desta vez dirigido pelo seu próprio CRD'
---

- **Push → pull.** GitOps coloca o estado desejado no **Git** e faz agentes dentro do
  cluster puxá-lo e reconciliá-lo — versionado, auditável, autocorretivo; as credenciais do
  cluster nunca saem do cluster
- **Sources + CRDs de apply:** o **`GitRepository`** (`source.toolkit.fluxcd.io`) produz um
  Artifact; **`Kustomization`** / **`HelmRelease`** o aplicam (`interval`, `prune`, `suspend`)
- **Três comportamentos:** **reconcile** (aplicar o Git) · **detecção de drift** (a cada
  reconcile) · **prune / suspend** (`prune` deleta remoções; `suspend` é o botão de
  desligar o self-heal)
- **Leia as conditions:** **Ready** / **Reconciling** / **Stalled** no Source *e* nos
  objetos de apply — `flux get` / `kubectl get`; conserte falhas no Git
- **É o mesmo loop de reconciliação** com o Git como `spec` — e o **OpenGitOps** torna os
  quatro princípios agnósticos de ferramenta (Flux, Argo CD, …)
- **Amarração CKx:** GitOps é assunto de ecossistema/adjacente (não é um domínio duro de
  CKA/CKAD), mas o modelo mental do **loop de reconciliação** é núcleo da arquitetura de
  cluster da CKA

<!--
Speaker: puxe o fio. O problema era drift sem detecção; a solução foi mover o estado
desejado para o Git e deixar controllers dentro do cluster reconciliarem continuamente em
direção a ele. Crave quatro fatos: (1) push→pull e por quê; (2) GitRepository é o Source,
Kustomization / HelmRelease aplicam; (3) reconcile vs drift vs prune/suspend (suspend ≈
selfHeal desligado); (4) Ready/Reconciling/Stalled — leia o Source e o apply. Fio
condutor: o loop de reconciliação do S03 com o Git como desejado — preparação para o S22.
Passe para o Lab 21 (Flux): flux install no kind, aplicar GitRepository + Kustomization,
ver Ready, gerar drift na mão, então flux suspend e provar que o drift fica.
-->

---
layout: lab
lab: labs/day-3/21-gitops-flux.md
duration: 25 min
env: kind-only / facilitator-hosted (namespace = read-only)
---

## Lab 21 — Git como fonte da verdade (Flux)

- `flux install` no kind; aplique um **GitRepository** + uma **Kustomization** e veja-os ir a **Ready**
- Leia as conditions com `flux get` / `kubectl get gitrepository,kustomization`
- **Quebre→conserte (reconcile):** escale na mão um Deployment gerenciado → veja o Flux **revertê-lo** ao Git
- Responda: *o que acontece com uma edição manual se a Kustomization estiver suspensa?* (o drift fica — sem auto-revert)
- Stretch: faça fork do repo, mude um manifesto, `git push` → `flux reconcile` e veja a nova revision ser aplicada
