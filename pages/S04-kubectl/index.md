---
layout: section-cover
image: /covers/section-04-command-wand.webp
day: Day 1
section: '04'
tier: core
track: Foundations
---

# kubectl

A única ferramenta com que você opera qualquer cluster — descubra, inspecione e altere.

**core** · sugerido para o Day 1 · trilha Foundations

<!--
Seção S04 — kubectl. Tempo: ~30 min de slides + 25 min de lab.
Resultado: os participantes conseguem operar e inspecionar qualquer cluster com
fluência — os verbos centrais, os modos de output (incl. jsonpath), dry-run
client vs server, e labels/selectors como linguagem de consulta — consolidando o
"hábito do explain" do S03 — e conhecem o k9s como a UI de terminal sobre a
mesma API (mesmo kubeconfig, mesmo RBAC, labs kubectl-first).
Beats: imperativo pontual vs apply declarativo · tour de verbos · modos de
output com um exemplo de jsonpath (magic-move crescendo um comando) · dry-run
client vs server · labels & selectors · namespaces/contexts de volta ao Lab 00 ·
tour do k9s (o que é/o que não é · como operar · views + guarda-corpo --readonly).
k9s ACCURACY LOCKS (verificado contra k9scli.io + o README do k9s, 2026-08):
binário único; lê o context do kubeconfig; age sob o SEU RBAC (nada que o
kubectl não pudesse fazer); o modo de comando `:` aceita nomes de recursos E
aliases (`:pods` e `:pod` resolvem ambos); `/` filtra; hotkeys de linha
d/l/s/y/e/ctrl-d; view de dependências `:xray`; dashboard de cluster `:pulses`;
`--readonly` desabilita todos os comandos de modificação. O k9s está fixado no
mise.toml e documentado em docs/setup.md — os slides o apresentam; não existe
lab de k9s por decisão de design.
Amarração CKx: CKAD/CKA — o workflow central do kubectl em todos os domínios.
Lab: labs/day-1/04-kubectl.md.
-->

---
layout: comparison
heading: 'Duas formas de operar — e quando cada uma se encaixa'
leftHeading: Imperativo
rightHeading: Declarativo
leftBadge: 'kubectl run / create / scale'
rightBadge: 'kubectl apply -f'
---

- Comandos pontuais que agem **agora**: `run`, `create`, `scale`, `delete`.
- Rápidos para **explorar**, fazer demos e gerar um manifesto inicial.
- Nada registra *o que você queria* — só o cluster lembra.
- Repetir uma mudança? Você redigita e torce para sair igual à última vez.

::right::

- Você mantém o estado desejado em **arquivos** e faz `apply` deles.
- O arquivo é a fonte da verdade — **versione, revise, reaplique**.
- Reexecutar o `apply` é seguro e converge para o mesmo resultado (idempotente).
- É assim que todo workload real é entregue — e o que tudo, do Pod em diante, constrói.

<div class="mt-4 text-sm" v-click>

Use o imperativo para **aprender e gerar esqueletos** (`--dry-run=client -o yaml`
imprime o manifesto); use o declarativo para **executar e manter**. Os labs de
hoje geram YAML imperativamente e depois fazem `apply`.

</div>

<!--
Speaker: não moralize "declarativo bom, imperativo ruim" — o imperativo é a forma
mais rápida de produzir um primeiro manifesto. A ponte é o `--dry-run=client -o yaml`,
no qual tanto o slide de output quanto o lab se apoiam. Conecta direto ao pod.yaml do S05.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Oito verbos cobrem quase tudo</span>

# O tour dos verbos centrais

<div class="kw-cols-3 mt-3">
  <v-click at="1">
    <KwCard heading="Ler" icon="🔍">
      <strong>get</strong> · <strong>describe</strong> · <strong>explain</strong> —
      liste, mergulhe fundo com os Events e leia o schema.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Alterar" icon="✏️">
      <strong>apply</strong> · <strong>diff</strong> · <strong>edit</strong> —
      declare, pré-visualize ou ajuste objetos ao vivo.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Executar &amp; debugar" icon="🐚" variant="plain">
      <strong>logs</strong> · <strong>exec</strong> · <strong>port-forward</strong> —
      saída, shell dentro do container e túnel quando você precisar.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: mantenha uma linha por verbo. O pareamento a fixar: get→describe→logs é
a sequência de triagem; apply→diff é a sequência de mudança segura. O `exec`
retorna em todo lab que inspeciona um container em execução.
-->

---
clicks: 3
---

<span class="kw-kicker">História · percorra os verbos em ordem</span>

# Veja o comando, depois a recompensa

<div class="mt-2">
  <KubectlVerbDemo :step="$clicks" />
</div>

<!--
Speaker: avance clique a clique pela cadeia de plantão (três cliques: describe →
logs → diff/apply). Cada passo mostra um comando realista e o trecho de output
que de fato responde à pergunta — não é um tour de features. Fixe o hábito: get
para a manchete, describe para os Events, logs para a verdade da aplicação, diff
antes de apply ao mudar arquivos. `clicks: 3` reserva o orçamento — sem ele
`$clicks` fica em 0 e a demo nunca sai do `get`.
-->

---
clicks: 9
---

<span class="kw-kicker">Cresça um comando · digite, Enter, leia</span>

# Modos de output — obtenha exatamente o que você precisa

<div class="mt-2">
  <KubectlOutputDemo :step="$clicks" />
</div>

<div class="mt-3 text-sm kw-muted">

`-o json` é o mesmo que `yaml` para ferramentas que querem JSON. **`jsonpath`**
transforma o `kubectl` em uma fonte de dados precisa — o lab o usa para extrair
um único valor.

</div>

<!--
Speaker: cada modo são dois cliques — (1) o comando é digitado, cursor piscando;
(2) Enter — o output de exemplo aparece. Depois a próxima flag. Caminho: tabela →
wide → yaml → jsonpath → um valor. O caminho do jsonpath espelha a árvore de
objetos que eles viram com o `explain` no S03 (`.spec.nodeName`). `-o wide` é o
hábito mais barato: sempre mais contexto de graça. `clicks: 9` = cinco modos ×
(digitar + Enter) − 1.
-->

---
layout: code-annotated
heading: '`--dry-run` — renderize, ou valide, sem mudar nada'
lab: labs/day-1/04-kubectl.md
---

```bash {none|1|2|3}
kubectl apply -f pod.yaml --dry-run=client
kubectl apply -f pod.yaml --dry-run=server
kubectl apply -f pod.yaml
```

::notes::

<CodeNote at="1" label="--dry-run=client">
Renderiza e faz apenas checagens <strong>locais</strong> — nunca contata a
admission ou a validação do API server. Ótimo para <em>gerar YAML</em>
(<code>-o yaml</code>) e para checagens rápidas de sanidade. Ele não tem como
saber nada que só o <strong>server</strong> sabe — como se o namespace de destino
sequer existe.
</CodeNote>

<CodeNote at="2" label="--dry-run=server" variant="ok">
Envia o objeto pelo <strong>caminho completo do server</strong> — validação de
schema, defaulting e <strong>admission</strong> — e então o descarta em vez de
persistir. Isso captura o que o client não consegue: quota, webhooks,
referências ausentes. Mesmo formato de output, validação de verdade.
</CodeNote>

<CodeNote at="3" label="sem flag" variant="warn">
O apply de verdade — valida <em>e</em> escreve no etcd. O break do lab mostra um
objeto que <strong>passa no client mas falha no server</strong>, para você sentir
a diferença antes que ela te morda de verdade.
</CodeNote>

<!--
Speaker: o resumo em uma linha — client = "isto renderiza?", server = "o cluster
de fato aceitaria isto?". O lab torna concreto: aplicar em um namespace
inexistente passa no dry-run client e falha no dry-run server.
-->

---
layout: code-annotated
heading: 'Labels & selectors — o kubectl tem uma linguagem de consulta'
lab: labs/day-1/04-kubectl.md
---

```bash {none|1|2|3}
kubectl get pods -l app=web
kubectl get pods -l 'env in (staging, prod)'
kubectl get pods -l app=web,tier=frontend
```

::notes::

<CodeNote at="1" label="igualdade">
<code>-l key=value</code> — o filtro do dia a dia. Seleciona objetos que carregam
exatamente aquele label. É assim que um Service encontra seus Pods e que o
cleanup de todo lab delimita um delete.
</CodeNote>

<CodeNote at="2" label="baseado em conjuntos">
<code>in (…)</code>, <code>notin (…)</code>, e <code>key</code> puro /
<code>!key</code> para existência. Mais expressivo quando um único valor não basta.
</CodeNote>

<CodeNote at="3" label="combinados com AND" variant="ok">
Separe por vírgulas para exigir <strong>todos</strong> eles. Labels não são
decoração — são a chave de junção sobre a qual o sistema inteiro seleciona.
Defina-os deliberadamente.
</CodeNote>

<!--
Speaker: enquadre labels como uma linguagem de consulta, não metadata. Antecipe o
S06 (o selector de um Deployment) e o S07 (o selector de um Service) — ambos são
consultas de label. Os labels recomendados `app.kubernetes.io/*` aparecem no S06.
-->

---
layout: statement
kicker: 'Onde estou, e o hábito que te salva'
---

Você está sempre apontado para **um context** e **um namespace** — o par que
você configurou lá no **Lab 00**.

<div class="mt-6 text-base kw-muted">

```bash
kubectl config current-context                 # qual cluster?
kubectl config view --minify | grep namespace: # qual namespace?
kubectl config set-context --current --namespace=<ns>
```

</div>

<div class="mt-6" v-click>

Quando algo te surpreender: **`kubectl explain <field>`** e
**`kubectl get … -o yaml`**. O cluster documenta a si mesmo — recorra a ele antes
de uma busca na web. Esse é o hábito que o resto do workshop pressupõe.

</div>

<!--
Speaker: feche o ciclo com o Lab 00 — a maioria dos momentos "não está
funcionando" é um context/namespace errado. Depois replante o hábito do explain
do S03. O lab é uma caça ao tesouro que força get/describe/explain antes de
qualquer um criar qualquer coisa. Depois a coda do k9s: agora que eles conhecem
os verbos, mostre o cockpit construído sobre eles.
-->

---

<span class="kw-kicker">Mesma API, cockpit mais amigável</span>

# k9s — uma UI de terminal sobre a API que você acabou de aprender

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="O que é" icon="🐶">
      Uma <strong>UI de terminal</strong> de binário único que <strong>observa</strong> o
      cluster ao vivo — os recursos, Events e logs que você vinha puxando à mão,
      atualizando no lugar. Ela já está na toolchain do workshop.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="O que não é" icon="🔑" variant="plain">
      Não é uma porta dos fundos. O k9s lê seu <strong>kubeconfig</strong> e fala com o
      mesmo API server sob o seu <strong>RBAC</strong> — ele não consegue fazer nada
      que o <code>kubectl</code> não pudesse.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 kw-muted text-sm">

Pense nele como `kubectl get … -w` para **tudo de uma vez**: navegação em vez de
redigitar, com describe, logs e um shell a uma tecla de distância.

</div>

<!--
Speaker: por que apresentar o k9s DEPOIS do tour de verbos e não no lugar dele —
você precisa do vocabulário do kubectl primeiro, porque o k9s é uma *view* sobre
exatamente esses verbos e recursos; cada painel que ele mostra mapeia para um
get/describe/logs que você agora conhece. Ele vem na toolchain do workshop
(fixado via mise, veja docs/setup.md), então todo mundo já o tem — `k9s` no mesmo
shell onde o kubectl funciona. Fixe com força a fronteira de confiança: ele
autentica com o MESMO context e namespace do kubeconfig que você configurou no
Lab 00 e está sujeito ao mesmo RBAC — no cluster compartilhado ele vê o seu
namespace, nada mais. Sem agente, sem instalação server-side. O enquadramento
"-w para tudo" é o pitch honesto: o núcleo do k9s é um loop de watch ao vivo
sobre as views de recursos.
-->

---
layout: code-annotated
heading: 'Opere — um comando `:` e um punhado de teclas'
compact: true
---

```text {none|1|2|3|4}
:pods          # uma view de recursos ao vivo (:deploy, :svc, :ns …)
/web           # filtre enquanto digita
d · l · s · y  # describe · logs · shell · YAML
ctrl-d         # delete — pergunta antes
```

::notes::

<CodeNote at="1" label="modo de comando `:`">
<code>:</code> mais um nome de recurso — <code>:pods</code>, <code>:deploy</code> —
abre aquela view, <strong>ao vivo</strong>.
</CodeNote>

<CodeNote at="2" label="filtre, não role">
<code>/</code> estreita enquanto você digita — mais rápido que <code>-l</code> + <code>grep</code>.
</CodeNote>

<CodeNote at="3" label="as teclas de triagem" variant="ok">
<strong>get → describe → logs</strong> viram teclas únicas; <code>s</code> abre um shell.
</CodeNote>

<CodeNote at="4" label="verbos de modificação confirmam" variant="warn">
<code>ctrl-d</code> / <code>e</code> perguntam antes — mesmo API server, mesmo RBAC.
</CodeNote>

<!--
Speaker: faça isto como uma demo ao vivo de 60 segundos se a sala permitir — abra
o k9s ao lado do deck, digite :pods, filtre, aperte d e l em uma linha. Narre o
mapeamento em voz alta a cada vez ("isso é o kubectl describe", "isso é o kubectl
logs -f"). Os comandos de dois-pontos aceitam os mesmos nomes de recursos e nomes
curtos que o kubectl usa (aliases funcionam: :pod e :pods resolvem ambos), e é
por isso que ensinamos os verbos primeiro. Sem demo ao vivo: as teclas no slide
são o kit inicial completo — modo de comando, filtro, d/l/s/y e o delete que
confirma. Tudo é a mesma chamada de API por baixo, então nada aqui contorna
audit logs ou RBAC.
-->

---

<span class="kw-kicker">Views &amp; guarda-corpos</span>

# Visão de raio-X — e uma trava de segurança read-only

<div class="kw-cols-3 mt-4 text-sm">
  <v-click at="1">
    <KwCard heading=":xray" icon="🩻">
      Uma <strong>árvore de dependências</strong> por recurso — <code>:xray deploy</code>
      percorre Deployment → ReplicaSet → Pods. Você vai conhecer essa cadeia de
      ownership nas próximas duas seções; volte aqui e a veja ao vivo.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading=":pulses" icon="📈" variant="plain">
      Um <strong>dashboard do cluster</strong> em uma tela — workloads, events e
      erros pulsando em tempo real. A view de "tem alguma coisa pegando fogo?".
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="--readonly" icon="🛑" variant="ok">
      <code>k9s --readonly</code> desabilita <strong>todo comando de modificação</strong> —
      o default certo quando você está inspecionando um cluster que não é seu.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 kw-muted text-sm">

Os labs continuam **`kubectl`-first** — a CLI é a língua que todo doc, script e
pipeline fala. Recorra ao k9s quando estiver *assistindo* algo se desenrolar, e
continue traduzindo o que ele mostra de volta para os verbos.

</div>

<!--
Speaker: duas views poderosas e um guarda-corpo. O :xray mostra cadeias de
ownership/dependência — vai fazer muito mais sentido depois do S06 (Deployment →
ReplicaSet → Pod), então plante como "volte aqui depois"; é um foreshadow
genuíno, não uma dependência. O :pulses é o dashboard de relance — útil projetado
numa parede durante os labs. O --readonly importa no cluster compartilhado: ele
transforma o k9s em um observador puro (também configurável por context na sua
config). Feche com o enquadramento que o workshop mantém do início ao fim:
kubectl é a língua, k9s é um jeito mais rápido de ler; usar bem o k9s EXIGE o
modelo mental do kubectl, e é por isso que isto é uma coda e não a abertura.
Opcional: convide os participantes a manter o k9s aberto em um segundo terminal
durante o Lab 04+.
-->

---
layout: lab
lab: labs/day-1/04-kubectl.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 04 — Caça ao tesouro de descoberta

- **Só inspecione:** responda perguntas com `get`, `describe`, `explain` — não crie nada
- **Gere YAML:** `kubectl run … --dry-run=client -o yaml` e `create deployment … --dry-run=client -o yaml`
- **Consulte:** extraia o nome de um node com `-o jsonpath`; filtre com `-l`
- **Quebre de propósito:** um objeto que **passa no `--dry-run=client` mas falha no `--dry-run=server`**
- **Nada aplicado** — o YAML gerado é local e deletável
