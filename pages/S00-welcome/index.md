---
layout: section-cover
image: /covers/section-00-arrival.webp
day: Day 1
section: '00'
tier: core
track: Foundations
---

# Boas-vindas & setup

Todo mundo consegue acessar seu ambiente e rodar kubectl.

**core** · sugerido para o Day 1 · trilha Foundations

<!--
Seção S00 — Boas-vindas & setup. Duração: ~20 min de slides + 15 min de lab.
Resultado: todo mundo consegue acessar seu ambiente e rodar kubectl.
Beats: objetivos + contrato 50/50 · agenda / red line · dois ambientes ·
regras da casa · como os labs funcionam · pré-requisitos · refresher opcional de
containers · troca de contexto. Amarração CKx: —. Lab: labs/day-1/00-setup.md.
-->

---
layout: statement
kicker: Por que estamos aqui
---

Três dias para levar você de **"o que é um container"** a
**criar, rodar e operar** com confiança os workloads centrais do Kubernetes.

Metade do tempo é slide, metade é o seu teclado: todo bloco de conceito termina
com um lab que você roda no **seu próprio** ambiente.

<!--
Speaker: diga o resultado em voz alta. O contrato 50/50 é a promessa do workshop
inteiro — toda ideia é praticada imediatamente. Aponte para a barra de progresso
no rodapé: eles vão ver a red line crescer o dia todo.
-->

---
layout: agenda
heading: Day 1 — fundamentos e a red line
kicker: O que construímos hoje
columns: 2
---

- **Containers** — images, layers, runtimes <em>· depois o Lab 01</em>
- **Segurança de containers** — images pequenas, non-root e escaneadas <em>· depois o Lab 02</em>
- **Modelo mental** — control plane, nodes, reconciliação <em>· depois o Lab 03</em>
- **kubectl** — get, describe, explain, apply <em>· depois o Lab 04</em>
- **Pod** 📦 — a menor unidade implantável <em>· depois o Lab 05</em>
- **Deployment** — estado desejado & rolling updates <em>· depois o Lab 06</em>
- **Service** — um endereço estável para Pods que se movem <em>· depois o Lab 07</em>
- **Ingress** — HTTP de fora do cluster <em>· depois o Lab 08</em>

<div class="mt-4 kw-muted text-sm" v-click>

A espinha central do core é uma única **"linha vermelha"** (red line) —
`Pod → Deployment → Service → Ingress → Gateway API` —
e cada passo **estende o mesmo manifesto**, então você sempre enxerga o fio condutor.

</div>

<!--
Speaker: os cards numerados são blocos de conceito; a tag "depois o Lab NN" é o
contrato 50/50 tornado visível. Gateway API (red line 5/5) chega no Day 2.
-->

---
layout: comparison
heading: 'Dois jeitos de trabalhar — escolha um, os dois acompanham'
leftHeading: Namespace atribuído
rightHeading: Cluster kind local
leftBadge: cluster compartilhado
rightBadge: seu laptop
---

- Uma fatia de um **cluster compartilhado** operado pelo facilitador.
- Você é dono de **um namespace** (ex.: `student-07`); sem cluster-admin.
- Nada para instalar além de `kubectl` + um kubeconfig.
- Alguns labs que exigem add-ons de cluster inteiro rodam **read-only** aqui.

::right::

- Um cluster descartável de um único node na **sua máquina**.
- Você é **admin** — todo lab funciona, incluindo instalação de add-ons.
- Precisa de `kind` + um container engine (Docker ou Podman).
- O panic reset é `kind delete cluster` → recriar em ~30 s.

<div class="mt-4 text-sm" v-click>

**Em qual estou?** Rode `kubectl config current-context`: um nome como
`kind-workshop` significa seu laptop; qualquer outra coisa é o cluster
compartilhado. Todo lab informa qual ambiente ele suporta.

</div>

<!--
Speaker: os labs são honestos quanto ao ambiente — cada um é marcado como
namespace ✓ / kind ✓, kind-only ou namespace: read-only. Ninguém fica para trás
em nenhum dos caminhos.
-->

---

<span class="kw-kicker">Regras da casa</span>

# Como esta sala funciona

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="Perguntas são bem-vindas" icon="🙋">
      Interrompa a qualquer momento. Se uma pessoa está confusa, outras cinco
      também estão — perguntar é fazer um favor a todo mundo.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Privilégio mínimo" icon="🔒">
      Nenhum lab precisa de <strong>cluster-admin</strong> a menos que esteja
      marcado como <code>kind-only</code>. No cluster compartilhado você fica
      dentro do seu namespace — isso é o RBAC fazendo o trabalho dele.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Você não consegue quebrar nada" icon="🧯" variant="plain">
      Todo lab termina com um <strong>panic reset</strong> restrito ao seu
      namespace. Um lab travado nunca bloqueia o próximo.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-6 kw-muted text-sm">

O ritmo de ensino se repete o dia inteiro: **explicar → rodar → observar →
quebrar de propósito → consertar → recapitular.** A quebra é o ponto — é ali
que o aprendizado acontece.

</div>

<!--
Speaker: enfatize o "quebrar de propósito". Todo lab tem um passo deliberado de
quebra→conserto para que falhas se tornem familiares, não assustadoras.
-->

---

<span class="kw-kicker">Como os labs funcionam</span>

# Toda tarefa vem com spoiler

Os labs são Markdown independentes — passos explícitos, prontos para copiar e
colar. **Nada de "vire-se".** Toda tarefa e toda pergunta é seguida de uma
resposta recolhida, então você nunca fica travado para sempre.

<div class="mt-4" v-click>

> **Tarefa:** defina seu namespace padrão e depois confirme que valeu.

</div>

<div class="mt-3" v-click>

> **Pergunta:** qual comando prova a mudança sem despejar o kubeconfig inteiro?

</div>

<div class="mt-3" v-click>

Travou? Abra o spoiler:

```console
$ kubectl config view --minify | grep namespace:
    namespace: student-07
```

`--minify` reduz a configuração ao contexto atual — uma linha, a resposta.

</div>

<div v-click class="mt-4 kw-muted text-sm">

No lab de verdade essa resposta vive dentro de um bloco <code>&lt;details&gt;</code>
recolhido. Tente primeiro; espie se precisar; siga em frente.

</div>

<!--
Speaker: demonstre o padrão de spoiler ao vivo — leia a tarefa, faça a pergunta
para a sala e então "abra o spoiler". Esse é exatamente o formato do Lab 00.
-->

---

<span class="kw-kicker">Antes do Lab 00</span>

# O que você precisa na sua máquina

<div class="kw-cols-2 mt-4">
  <KwCard heading="Obrigatório" icon="✅">
    <ul class="text-sm">
      <li><code>kubectl</code> no seu <code>PATH</code></li>
      <li>Um kubeconfig — namespace atribuído <em>ou</em> kind</li>
      <li>Um terminal onde você consiga copiar e colar</li>
    </ul>
  </KwCard>
  <KwCard heading="Para o caminho kind" icon="🐳" variant="plain">
    <ul class="text-sm">
      <li><code>kind</code> instalado</li>
      <li>Um container engine: Docker ou Podman</li>
      <li>Admin na sua própria máquina</li>
    </ul>
  </KwCard>
</div>

<div v-click class="mt-5 text-sm">

**Checagem pre-flight (Lab 00):** confirme que `kubectl version` alcança um
servidor, defina seu namespace e prove que `kubectl auth can-i create pods`
retorna `yes`. Isso coloca todo mundo na **mesma linha de base conhecida** antes
de qualquer conteúdo de verdade.

</div>

<LabCallout lab="labs/day-1/00-setup.md" />

<!--
Speaker: não debugue instalações ao vivo — mande quem estiver sem alguma
ferramenta para o apêndice de setup enquanto a sala começa o Lab 00. Um desvio
de uma versão minor entre client e server é aceitável; sinalize se erros
estranhos aparecerem depois.
-->

---
showRefresher: true
---

<span class="kw-kicker">Opcional · novo em containers?</span>

# Refresher de containers em 60 segundos

<div v-if="$frontmatter.showRefresher">

<div class="kw-cols-2 mt-2">
  <KwCard heading="Um container" icon="📦">
    Um processo (ou alguns) rodando em uma <strong>visão isolada</strong> do
    SO — com filesystem, rede e árvore de processos próprios — enquanto
    compartilha o <strong>kernel</strong> do host. Mais leve que uma VM, inicia
    em milissegundos.
  </KwCard>
  <KwCard heading="Uma image" icon="🧱" variant="plain">
    O <strong>template read-only</strong> a partir do qual um container é
    iniciado: sua aplicação e suas dependências, congeladas como
    <strong>layers</strong> empilhadas. O Kubernetes agenda containers; images
    são o que ele baixa (pull) para rodá-los.
  </KwCard>
</div>

<div class="mt-4 kw-muted text-sm">

Isso basta para começar. **As seções de container aprofundam** images, layers,
runtimes e hardening — mude <code>showRefresher: false</code> no frontmatter
deste slide para esconder este beat em uma turma mais avançada.

</div>

</div>

<!--
Speaker: toggle de build/v-if — para uma sala experiente defina showRefresher:
false e este slide colapsa para só o título. Sem animação compartilhada aqui.
-->

---
layout: code-annotated
heading: 'Aponte o kubectl para o lugar certo'
lab: labs/day-1/00-setup.md
---

```bash {none|1|2|3|4}
kubectl config get-contexts
kubectl config use-context kind-workshop
kubectl config set-context --current --namespace=student-07
kubectl config view --minify | grep namespace:
```

::notes::

<CodeNote at="1" label="get-contexts">
Lista todos os clusters que seu kubeconfig conhece. O <code>*</code> marca
aquele para o qual você está apontando agora.
</CodeNote>

<CodeNote at="2" label="use-context">
Troca de cluster. Usuários de kind já estão em <code>kind-workshop</code>;
usuários do cluster compartilhado escolhem o contexto que o facilitador entregou.
</CodeNote>

<CodeNote at="3" label="set-context --namespace">
Torna seu namespace o padrão, para você poder omitir o <code>-n</code> de todos
os comandos seguintes. Essa única linha economiza mil toques de tecla hoje.
</CodeNote>

<CodeNote at="4" label="verificar" variant="ok">
<code>--minify</code> mostra só o contexto ativo — a prova mais rápida de que
seu namespace pegou. Esta é a resposta do spoiler de antes.
</CodeNote>

<!--
Speaker: isso é todo o "gerenciamento de contexto" de que eles precisam para o
workshop. Todo o resto — RBAC, múltiplos clusters — vem depois (Lab 19).
-->

---
layout: lab
lab: labs/day-1/00-setup.md
duration: 15 min
env: namespace ✓ / kind ✓
---

## Lab 00 — Setup & checagem pre-flight

- Confirme que `kubectl version` alcança um **servidor**, não só um client
- Defina seu **namespace** atribuído (ou suba um cluster kind) como padrão
- Prove que você pode criar workloads: `kubectl auth can-i create pods` → `yes`
- **Quebre de propósito:** aponte para um contexto errado, leia o erro, volte
- Chegue à **linha de base limpa** compartilhada — e aprenda o panic reset para mais tarde
