---
layout: section-cover
image: /covers/section-20-shipwrights-bottle.webp
day: Day 3
section: '20'
tier: core
track: Delivery
---

# Helm

Instale e customize aplicações com Helm; faça upgrade e rollback.

**core** · sugerido para o Day 3 · trilha Delivery

<!--
Seção S20 — Helm. Core, Day 3, trilha Delivery. Tempo: ~30 min de slides + 30 min de lab.
Resultado: os participantes conseguem empacotar a já familiar aplicação `web` como um chart,
instalá-la como um release, sobrescrever values, fazer upgrade para uma nova revision e
rollback — e sabem dizer o que uma revision armazena e o que o rollback restaura. Beats:
problema (YAML copiado e colado por ambiente, values editados à mão → drift) · modelo mental
(chart = Chart.yaml/values.yaml/templates/; release = uma instância instalada; revision = um
snapshot versionado) · code-annotated (o Deployment `web` templatizado) · magic-move (saída
renderizada: defaults → --set replicaCount → --set image.tag = as revisions) · releases &
revisions (install rev1 → upgrade rev2 → rollback = uma NOVA rev) · distribuição (repos E OCI
registries) · contraste com Kustomize + quando NÃO templatizar · helm template vs helm install
--dry-run · recap → S21 · lab.
Animação: NENHUMA (conforme o outline — o render de value→manifesto é uma transição de código,
não uma máquina de estados que mereça um componente). O chart que os slides ensinam É o chart
que o lab instala.
ACCURACY LOCKS (verificados contra o Helm v4.2.2 neste ambiente):
- Chart.yaml apiVersion: v2 (v2 = Helm 3/4; v1 era Helm 2 / Tiller). Sem Tiller — o Helm é um
  client que renderiza localmente e fala com o API server como você.
- Uma revision de release armazena os manifestos RENDERIZADOS + os values fornecidos + a
  metadata do chart, persistidos como um Secret do tipo helm.sh/release.v1 no namespace do release.
- `helm rollback web N` NÃO deleta revisions nem move um ponteiro para trás — ele reaplica os
  manifestos armazenados da revision N como uma NOVA revision, de número mais alto.
- `helm template` renderiza 100% client-side (nunca contata o API server). `helm install
  --dry-run=server` renderiza E envia ao server para validação, mas não persiste.
- OCI (oci://…, `helm push`/`helm pull`, GA desde a 3.8) é referenciado por URL diretamente —
  NÃO via `helm repo add` (esse é o modelo clássico de repo com index.yaml).
- O template ensinado renderiza exatamente o Deployment/Service `web` do S06/S07 (nome de
  release `web`), byte a byte igual ao chart do lab.
Amarração CKx: o CKA agora cobre Helm & Kustomize (packaging & templating). Aterrissa no recap.
-->

---
layout: statement
kicker: O problema
---

Você tem **uma** aplicação e **três** ambientes — e **três** cópias do mesmo YAML que já se afastaram entre si.

Dev roda 1 réplica na `:v1`, staging 2 réplicas na `:v2`, prod 4 réplicas na `:v1` com um resource limit diferente. Mesmo Deployment, editado à mão por ambiente, mantido em sincronia por **lembrar** de editar os três. Esqueça um e os ambientes divergem em silêncio. Você não quer três arquivos — quer **um template** e **três conjuntos de values**.

<!--
Speaker: a motivação de templating, e é uma dor que todo aluno já sentiu. O Deployment `web` do
Day 1 serve bem para UM lugar. No momento em que você tem dev/staging/prod (ou por tenant, ou
por região) você copia o manifesto e edita à mão replicas, tag de image, limits, hostnames.
Agora a "fonte da verdade" são N arquivos quase idênticos que dão drift no instante em que
alguém edita um e esquece os outros. A resposta do Helm: mantenha UM template parametrizado
mais um pequeno arquivo de values por ambiente. Mesma ideia de uma função com argumentos em vez
de N funções copiadas e ajustadas. A seguir: o que é, de fato, um chart.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · um chart é um template, um release é uma instância</span>

# Três arquivos fazem um chart

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Chart.yaml — a metadata" icon="📦" variant="ok">
      Nome, <code>version</code> do chart, <code>appVersion</code> e <code>apiVersion: v2</code>
      (v2 = Helm 3/4 — sem Tiller). É este arquivo que torna um diretório um chart.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="values.yaml — os defaults" icon="🎛️" variant="ok">
      Os botões e seus valores padrão (<code>replicaCount</code>, <code>image.tag</code>,
      …). Sobrescreva qualquer um deles na hora do install/upgrade.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="templates/ — os manifestos" icon="📄" variant="ok">
      Seu YAML do Kubernetes com <code>values</code> encaixados como placeholders. O Helm
      renderiza template + values → manifestos puros.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="um release — o chart instalado" kind="deploy" variant="warn">
      <code>helm install web ./demo-app</code> renderiza o chart e o aplica como um
      <strong>release</strong> nomeado. Instale duas vezes = dois releases, dois nomes.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-4 text-sm kw-muted">

**renderiza → aplica:** `template + values → manifestos → o API server`. O Helm é um
**client** — ele renderiza na sua máquina e aplica como *você*. Nada roda server-side (sem
Tiller desde o Helm 3).

</div>

</div>

<!--
Speaker: três arquivos e uma palavra. Chart.yaml (identidade + versões + apiVersion v2 —
sinalize que v2 significa Helm 3/4, v1 era a era Helm-2/Tiller, morta há muito tempo),
values.yaml (os defaults, ou seja, os botões), templates/ (seus manifestos com buracos
{{ .Values.x }}). Um CHART é o pacote (o template). Um RELEASE é uma instalação dele sob um
nome — instale o mesmo chart duas vezes com nomes/values diferentes e você tem dois releases
independentes. Correção crítica de um mito comum: Helm 3/4 NÃO tem componente server. `helm
install` renderiza localmente e aplica com o seu kubeconfig/RBAC — se você não consegue dar
`kubectl apply`, o Helm também não consegue. A seguir: como um template realmente se parece — e
é a aplicação `web` que você já conhece.
-->

---
layout: code-annotated
heading: 'Um template é o seu manifesto com values encaixados'
compact: true
lab: labs/day-3/20-helm.md
---

```yaml {none|4|8|20|all}
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: 8080
```

::notes::

<CodeNote at="1" label=".Release.Name" variant="ok">
Dados embutidos do release. <code>helm install <strong>web</strong> ./demo-app</code> faz cada
<code>.Release.Name</code> renderizar como <code>web</code> — então este chart produz
exatamente o Deployment <code>web</code> do Day 1.
</CodeNote>

<CodeNote at="2" label=".Values.replicaCount" variant="ok">
Vem do <code>values.yaml</code> (default <code>1</code>). Sobrescreva por ambiente sem tocar
neste template.
</CodeNote>

<CodeNote at="3" label=".Values.image.*" variant="ok">
Repository e tag vindos do <code>values.yaml</code>. Um botão só para subir a image em todos os
ambientes que renderizam este chart.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
Continua sendo apenas um Deployment — o Helm preenche os buracos de placeholder a partir de
<code>.Values</code> e <code>.Release</code> e depois aplica YAML puro. Sem mágica, só
substituição.
</div>

<!--
Speaker: este é o truque inteiro, e é deliberadamente o Deployment `web` do S06 com buracos
recortados nele. Duas fontes alimentam os buracos: .Release.* (fatos embutidos sobre ESTA
instalação — Name, Namespace, …) e .Values.* (o que o values.yaml definir, sobrescrevível na
CLI). Com o nome de release `web`, .Release.Name renderiza `web`, então este chart emite byte a
byte o Deployment web do Day 1 — o ponto é que um chart não é um novo tipo de objeto, são os
seus mesmos manifestos, parametrizados. Templates também podem ter loop/condicional (Go
templates + Sprig), mas guarde isso — o modelo mental é "manifesto com variáveis". A seguir:
veja os values de fato fluindo para a saída renderizada.
-->

---
layout: code-walkthrough
heading: 'Mesmo template, values diferentes — isso é uma revision'
lab: labs/day-3/20-helm.md
---

````md magic-move
```yaml
# helm install web ./demo-app        → revision 1  (defaults do values.yaml)
# replicaCount: 1  ·  image.tag: "v1"
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: web
          image: "ghcr.io/platformrelay/workshop-web:v1"
```

```yaml
# helm upgrade web ./demo-app --set replicaCount=3     → revision 2
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3        # um value mudou → o manifesto foi rerrenderizado
  template:
    spec:
      containers:
        - name: web
          image: "ghcr.io/platformrelay/workshop-web:v1"
```

```yaml
# helm upgrade web ./demo-app --set image.tag=v2     → revision 3
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: web
          image: "ghcr.io/platformrelay/workshop-web:v2"    # subiu, replicas mantidas
```
````

<!--
Speaker: três frames = três revisions, e o diff é a história. Frame 1: install com os defaults
do values.yaml → replicas 1, tag v1 — essa é a revision 1. Frame 2: `helm upgrade --set
replicaCount=3` rerrenderiza o MESMO template com um value alterado → replicas 3, todo o resto
idêntico — revision 2. Frame 3: `--set image.tag=v2` → a image sobe, replicas CONTINUAM 3
porque o upgrade carrega os values anteriores adiante a menos que você os sobrescreva (vale
nomear esse comportamento de reusar os values anteriores). Todo install/upgrade renderiza
manifestos novos e os armazena como uma revision numerada. Estes são os bytes exatos que o
`helm template` imprime — o lab os renderiza de verdade. É esse histórico armazenado que torna
possível o rollback do próximo slide.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Releases & revisions · install → upgrade → rollback</span>

# Toda mudança é uma revision numerada e reversível

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem;">
  <v-click at="1">
    <KwCard heading="install → revision 1" kind="deploy" variant="ok">
      <code>helm install web ./demo-app</code>. Cria o release e armazena a revision 1.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="upgrade → revision 2, 3, …" icon="⬆️" variant="ok">
      <code>helm upgrade web ./demo-app --set …</code>. Rerrenderiza, aplica e armazena uma nova
      revision. <code>helm history web</code> lista todas.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="rollback → mais uma revision" icon="↩️" variant="warn">
      <code>helm rollback web 2</code> reaplica os manifestos da revision 2 como uma
      <strong>nova</strong> revision 4. Ele nunca deleta histórico — anda para a frente rumo a
      um estado antigo.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 text-sm">

<span class="kw-kicker">o que uma revision armazena · o que o rollback restaura</span>

Uma revision é um **snapshot**: os *manifestos renderizados* + os *values* + a *metadata do
chart*, salvos como um `Secret` (`helm.sh/release.v1`) no namespace do release. `rollback N`
reaplica esse snapshot — então ele restaura exatamente os **manifestos e os values**, e faz
isso criando a *próxima* revision, mantendo a trilha intacta.

</div>

</div>

<!--
Speaker: isto responde à pergunta obrigatória do lab, então aterrisse com precisão. Um release
tem um histórico numerado; o install é a revision 1, cada upgrade adiciona uma. Cada revision é
um SNAPSHOT armazenado no cluster — não "um diff", e sim o conjunto inteiro de manifestos
renderizados + os values + a metadata do chart — persistido como um Secret do tipo
helm.sh/release.v1 no namespace (kubectl get secret -l owner=helm mostra eles). O rollback é a
parte que as pessoas entendem errado: `helm rollback web 2` NÃO deleta as revisions 3/4 nem
rebobina um ponteiro — ele lê o snapshot armazenado da revision 2 e o reaplica COMO uma
revision nova, de número mais alto. Então o histórico só cresce, e você pode rolar para frente
de novo. O que ele "restaura", portanto, são os manifestos + values da revision alvo. É por
isso que o rollback do Helm é seguro e auditável: nada é destruído, todo estado é reproduzível.
O lab quebra um upgrade e faz rollback para sentir isso.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Distribuição · onde os charts moram</span>

# Duas formas de entregar um chart

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Chart repository (index.yaml)" icon="🗂️" variant="ok">
      Um servidor HTTP hospedando charts empacotados + um <code>index.yaml</code>.
      <div class="kw-muted mt-1">
        <code>helm repo add prometheus-community https://…</code><br>
        <code>helm install mon prometheus-community/kube-prometheus-stack</code>
      </div>
      O modelo clássico — você <em>adiciona um repo</em> e depois referencia
      <code>repo/chart</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="OCI registry (o padrão atual)" icon="🐳" variant="ok">
      Guarde charts como OCI artifacts nos <em>mesmos registries das suas images</em> (GHCR,
      ECR, Harbor, …).
      <div class="kw-muted mt-1">
        <code>helm push demo-app-0.1.0.tgz oci://registry/charts</code><br>
        <code>helm install web oci://registry/charts/demo-app --version 0.1.0</code>
      </div>
      Sem <code>repo add</code> — referencie a URL <code>oci://</code> diretamente.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm kw-muted">

O suporte a OCI é **GA** (desde o Helm 3.8) e hoje é a forma recomendada de distribuir charts —
um registry, uma única história de autenticação para images e charts. `helm pull` baixa um
chart sem instalá-lo.

</div>

</div>

<!--
Speaker: dois modelos de distribuição, e a indústria mudou de lado. (1) O REPO clássico de
charts: um servidor HTTP com um catálogo index.yaml; você dá `helm repo add nome url` e depois
instala `nome/chart`. Ainda está em todo lugar (prometheus-community, grafana etc.). (2) OCI
registries: um chart é só um OCI artifact, então ele vive no MESMO registry das suas container
images — dê push com `helm push chart.tgz oci://…`, instale direto da URL `oci://` com
`--version`, sem passo de `repo add`. Mantenha os dois mentalmente distintos: repo = index.yaml
+ `repo add`; OCI = URL por referência. OCI virou GA na 3.8 e é o caminho recomendado agora —
um registry e uma autenticação para images + charts. `helm pull` só baixa um chart (para
inspecionar/vendorizar) sem instalar. O stretch opcional do lab dá push do chart de demo para
um OCI registry local.
-->

---
layout: comparison
heading: 'Template vs overlay — e quando não fazer nenhum dos dois'
leftHeading: Helm
rightHeading: Kustomize
leftBadge: templates + values
rightBadge: patches + overlays
---

- **Parametrize** um manifesto com placeholders `.Values.*` (os buracos templatizados acima).
- Um chart, um arquivo de values por ambiente; também te dá **releases, revisions, rollback**.
- Entrega e versiona como um **pacote** (repo ou OCI); ótimo para redistribuir aplicações.
- Custo: seu YAML agora é um **Go template** — bugs de lógica e de indentação moram no template.

::right::

- **Faça patch** de YAML puro e válido com overlays — sem placeholders, a base continua sendo YAML de Kubernetes de verdade.
- `kubectl apply -k` é **embutido** — sem ferramenta extra, sem conceito de release/rollback.
- Ótimo para a *sua própria* aplicação em alguns ambientes (um `base/` + `overlays/dev,prod`).
- Custo: sem packaging/versionamento/rollback; expressar diferenças grandes via patches fica verboso.

<div class="mt-4 text-sm" v-click>

**Quando NÃO templatizar:** para uma aplicação em um único lugar, um `kubectl apply -f` puro
está de bom tamanho — recorra ao Helm quando você **redistribui** um chart ou precisa do
**ciclo de vida de release** (revisions + rollback), e ao Kustomize quando quer fazer
**overlay** dos seus próprios manifestos sem transformá-los em templates.

</div>

<!--
Speaker: não é Helm-vs-Kustomize como guerra — eles resolvem problemas sobrepostos de formas
diferentes, e você pode até combiná-los. Helm TEMPLATIZA: placeholders + values, mais todo o
ciclo de vida de release (install/upgrade/history/rollback) e o packaging (repo/OCI). Melhor
quando você ENTREGA uma aplicação para outros instalarem, ou quer releases versionados aos
quais pode voltar. Kustomize faz OVERLAY: sem linguagem de templating — sua base é YAML real e
válido, e os overlays fazem patch nela; é embutido no kubectl (`apply -k`), mas não há objeto
de release, nem rollback, nem packaging. Melhor para os seus próprios manifestos em um punhado
de ambientes. E a terceira opção honesta: para uma aplicação em um namespace, não templatize
nada — `kubectl apply -f` está ótimo. Templatizar tem um custo: seu YAML vira um Go template e
você debuga indentação/lógica. Case a ferramenta com o caso: redistribuir (Helm), fazer overlay
do que é seu (Kustomize), ou apenas implantar uma vez (YAML puro).
-->

---
layout: code-annotated
heading: 'Veja a saída antes de tocar no cluster'
compact: true
lab: labs/day-3/20-helm.md
---

```bash {none|1-2|4-5|all}
# renderiza localmente — NUNCA contata o cluster
helm template web ./demo-app --set replicaCount=3

# renderiza E envia ao API server para validar — mas não instala
helm install web ./demo-app --dry-run=server
```

::notes::

<CodeNote at="1" label="helm template" variant="ok">
Render puramente <strong>client-side</strong>. Imprime os manifestos que o Helm
<em>aplicaria</em>. Funciona sem cluster nenhum — perfeito para diff e code review.
</CodeNote>

<CodeNote at="2" label="install --dry-run=server" variant="warn">
Renderiza <em>e</em> submete ao API server para <strong>validação/admission</strong>
(schema, PSA, webhooks) — e depois joga fora. Nada é armazenado, nenhum release é criado.
</CodeNote>

<div v-click="3" class="mt-2 text-sm kw-muted">
Regra de bolso: <code>helm template</code> para <em>ver o YAML</em>;
<code>--dry-run=server</code> para <em>perguntar ao cluster se ele aceitaria</em>. Nenhum dos
dois instala.
</div>

<!--
Speaker: duas ferramentas de "olhe antes de pular" que as pessoas confundem. `helm template` é
100% local: renderiza o chart no stdout e nunca fala com o API server — você pode rodar offline,
em CI, em code review, e mandar por pipe para `kubectl apply --dry-run=client -f -` ou para um
differ. `helm install --dry-run=server` renderiza E envia o resultado ao API server, então ele
roda validação e admission de verdade (checagens de schema, o gate restricted do PSA do S17,
webhooks mutating/validating) — e depois descarta; nenhum release é armazenado. Ou seja:
template = "o que isso renderizaria?", dry-run=server = "o cluster aceitaria mesmo?". Use
template para escrever/comparar, dry-run=server como o pre-flight antes de um install real. O
lab usa `helm template` para inspecionar o chart antes de instalá-lo de verdade.
-->

---
layout: recap
heading: 'Recap — um template, muitos values, releases reversíveis'
story: 'O YAML copiado e colado por ambiente virou um chart com um arquivo de values. O install criou a revision 1 do release; cada upgrade rerrenderizou e armazenou uma nova revision; o rollback reproduziu um snapshot antigo como uma nova revision — histórico intacto.'
next: 'GitOps com Argo CD — coloque o estado desejado no Git e deixe o cluster reconciliar até ele'
---

- Um **chart** = `Chart.yaml` + `values.yaml` + `templates/`; um **release** é uma instância
  instalada; o Helm é um **client** (renderiza localmente, aplica como você — sem Tiller)
- **Values fluem para dentro dos templates:** placeholders `.Values.*` / `.Release.*` →
  manifestos renderizados; sobrescreva por ambiente sem copiar YAML
- **Revisions são snapshots:** cada uma guarda manifestos renderizados + values + metadata do
  chart (um `Secret`); **`rollback N` reproduz a revision N como uma *nova* revision** — nada é destruído
- **Distribuição:** os **repos** clássicos (`repo add` + `index.yaml`) **e** os **OCI registries**
  (`oci://` por URL, GA desde a 3.8, hoje recomendado)
- **Olhe antes de pular:** `helm template` (render client-side) vs `install --dry-run=server`
  (validação no server); e saiba quando fazer **overlay com Kustomize** ou não templatizar nada
- **Amarração CKA:** o exame agora cobre **Helm & Kustomize** — install/upgrade/rollback,
  estrutura de chart e overlays

<!--
Speaker: puxe o fio todo junto. O ponto nunca foi "aprender uma ferramenta" — é "parar de
manter N cópias de um manifesto". Um template + values por ambiente substituem o copiar e
colar; o modelo de release te dá histórico numerado e reversível de graça. Fixe os três fatos
que ficam: (1) chart = template, release = instância, o Helm não tem server; (2) uma revision é
um snapshot completo e o rollback rola PARA FRENTE rumo a um estado antigo (nova revision,
histórico preservado); (3) duas formas de entregar — repos e, agora preferido, OCI. Depois o
julgamento: Helm para empacotar/redistribuir, Kustomize para fazer overlay do seu próprio YAML,
apply puro para casos avulsos. O CKA agora avalia Helm e Kustomize, então isso está em cheio no
edital. Passe o bastão ao Lab 20: instale o chart de demo, renderize-o, sobrescreva + faça
upgrade ao longo das revisions, quebre um upgrade e faça rollback. A próxima seção, S21, leva o
"declare o estado desejado" até o fim — o Git vira a fonte da verdade e o Argo CD reconcilia.
-->

---
layout: lab
lab: labs/day-3/20-helm.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 20 — Ciclo de vida de um release

- Instale o chart `demo-app` como o release `web`; use `helm list` e `helm template` para inspecionar
- Sobrescreva `replicaCount` / `image.tag` com `--set` e `-f`, depois `helm upgrade`
- Leia o `helm history`; **quebre** um upgrade (tag de image errada → pods nunca ficam Ready), então `helm rollback`
- Responda: *o que uma revision armazena e o que o rollback restaura?*
- Stretch: empacote o chart e dê `helm push` para um **OCI** registry local
