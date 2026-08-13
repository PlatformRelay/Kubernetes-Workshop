---
layout: section-cover
image: /covers/section-01-wild-crates.webp
day: Day 1
section: '01'
tier: recommended
track: Foundations
---

# Containers

Explique o que é uma container image — e construa uma.

**recommended** · sugerido para o Day 1 · trilha Foundations

<!--
Seção S01 — Containers. Duração: ~30 min de slides + 25 min de lab.
Resultado: as pessoas conseguem explicar o que uma container image É e construir
uma, para que Pods façam sentido desde a base.
Beats: por que containers vs VMs · image = layers endereçadas por conteúdo ·
anatomia da string de referência · engine vs runtime / CRI / namespaces+cgroups ·
Dockerfile construído campo a campo · multi-stage · latest não é versão ·
layers observadas.
Amarração CKx: CKAD Application Design & Build (fundamentos de image).
Lab: labs/day-1/01-containers.md.
-->

---
layout: comparison
heading: 'Por que containers — mesma máquina, paredes mais fortes'
leftHeading: Máquina virtual
rightHeading: Container
leftBadge: virtualização de hardware
rightBadge: virtualização de SO
---

- Emula **hardware**; carrega um **SO guest inteiro + kernel**.
- Sobe em **segundos a minutos**; gigabytes em disco.
- Isolamento forte — um kernel completo por workload.
- Um punhado por host.

::right::

- Compartilha o **kernel do host**; carrega só sua **aplicação + dependências**.
- Inicia em **milissegundos**; dezenas de megabytes.
- Isolamento vindo de recursos do kernel, não de um segundo kernel.
- **Centenas** por host — a densidade sobre a qual o Kubernetes agenda.

<div class="mt-4 text-sm" v-click>

Os mesmos objetivos de isolamento, com muito menos overhead. Essa densidade e o
início rápido são exatamente o que um scheduler quer — e é por isso que um
**container** é a coisa que o Kubernetes roda.

</div>

<!--
Speaker: a troca é um kernel compartilhado — mais leve, mas a fronteira de
isolamento são recursos do kernel (namespaces + cgroups), não hardware. Essa
fronteira é o que o módulo de pod-escape do Day 3 ataca e endurece.
-->

---
layout: code-annotated
heading: 'Uma image são layers — endereçadas por conteúdo'
---

```text {none|1|1|2|3|4}
registry.example.com/team/app:1.4.2@sha256:9b2c...e41
└──────────────┬──────────────┘ └─┬─┘ └──────┬──────┘
        registry / repository     tag      digest
```

::notes::

<CodeNote at="1" label="registry / repository">
<strong>Onde</strong> e <strong>o quê</strong>. O registry é o host que armazena
images; o repository é o caminho nomeado dentro dele. Omita o registry e o
engine assume um registry público padrão.
</CodeNote>

<CodeNote at="2" label="tag">
Um <strong>rótulo humano</strong> que aponta para um digest — e pode ser movido.
Prático, porém mutável: <code>1.4.2</code> hoje pode apontar para outro lugar amanhã.
</CodeNote>

<CodeNote at="3" label="digest" variant="ok">
Um <strong>hash de conteúdo</strong> da image exata. Mesmo digest = image
byte a byte idêntica, para sempre. É isso que "fixar por digest" (pin by digest)
significa — imutável por construção.
</CodeNote>

<CodeNote at="4" label="layers">
A image em si é uma <strong>pilha ordenada de layers</strong>, cada uma um diff
de filesystem com seu próprio digest. Layers de base compartilhadas são baixadas
e cacheadas <strong>uma vez</strong>.
</CodeNote>

<!--
Speaker: o endereçamento por conteúdo é o truque inteiro — layers e images são
nomeadas pelo hash dos seus bytes, então cache e integridade vêm de graça.
Tag vs digest volta na quebra deliberada do lab.
-->

---

<span class="kw-kicker">O que realmente roda um container</span>

# Engine, runtime e as primitivas do kernel

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="Engine / CRI" icon="🛠️">
      Aquilo com que o kubelet conversa: <strong>containerd</strong> ou <strong>CRI-O</strong>,
      falando a <strong>Container Runtime Interface</strong>. Baixa images,
      gerencia o ciclo de vida dos containers.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="OCI runtime" icon="⚙️">
      A ferramenta de baixo nível que de fato inicia o processo:
      <strong>runc</strong> ou <strong>crun</strong>. Dado um bundle + config,
      ela pede ao kernel um processo isolado.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Primitivas do kernel" icon="🧬" variant="plain">
      O isolamento em si: <strong>namespaces</strong> (visão separada de PIDs,
      rede, mounts, usuários) + <strong>cgroups</strong> (limitam CPU, memória, I/O).
      Nenhuma mágica — só Linux.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-6 kw-muted text-sm">

`kubelet → CRI (containerd/CRI-O) → OCI runtime (runc/crun) → namespaces + cgroups`.
A coluna **container runtime** reaparece no diagrama de node do modelo mental — este é aquele box, aberto por dentro.

</div>

<!--
Speaker: um container não é um tipo de objeto que o kernel conhece — é um
processo comum que o kernel foi instruído a isolar. Namespaces = o que ele vê;
cgroups = o que ele pode usar.
-->

---
layout: code-walkthrough
heading: 'Construa uma image — uma instrução, uma layer'
lab: labs/day-1/01-containers.md
---

````md magic-move
```dockerfile
# comece de uma base image (ela mesma uma pilha de layers)
FROM golang:1.24
```

```dockerfile
FROM golang:1.24
# um diretório de trabalho estável para tudo o que vem depois
WORKDIR /src
```

```dockerfile
FROM golang:1.24
WORKDIR /src
# copie o código-fonte — o digest desta layer muda quando o código muda
COPY . .
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
# rode um passo de build; o resultado vira uma nova layer
RUN go build -o /bin/app .
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
# embuta configuração como variáveis de ambiente
ENV PORT=8080
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
ENV PORT=8080
# abandone o root — o processo roda como usuário sem privilégios
RUN useradd -u 10001 app
USER 10001
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
ENV PORT=8080
RUN useradd -u 10001 app
USER 10001
# documente a porta e então defina o processo a iniciar
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
```
````

<!--
Speaker: cada instrução que altera o filesystem adiciona uma layer; ENV/EXPOSE
são metadados. A ordem importa para o cache — passos baratos e que raramente
mudam primeiro, COPY do código-fonte por último. USER antes do ENTRYPOINT é o
hábito non-root sobre o qual o S02 constrói.
-->

---
layout: two-cols-code
heading: 'Multi-stage — construa pesado, entregue enxuto'
lab: labs/day-1/01-containers.md
---

````md magic-move
```dockerfile
# um estágio só: o toolchain é entregue junto com a aplicação — ~800 MB
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
USER 10001
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# estágio 1: build com o toolchain completo
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
# CGO_ENABLED=0 → um binário estático que roda em uma base minúscula
RUN CGO_ENABLED=0 go build -o /bin/app .

# estágio 2: entregue só o binário — ~15 MB
FROM alpine:3.20
RUN adduser -D -u 10001 app
COPY --from=build /bin/app /bin/app
USER 10001
ENTRYPOINT ["/bin/app"]
```
````

::right::

<div class="text-sm">

O **estágio de build é descartado** — só o que você levar com `COPY --from=build`
é entregue. O toolchain, o código-fonte e quaisquer secrets de build ficam para trás.

<div class="mt-3">
  <KwChip variant="ok">menor = pulls mais rápidos</KwChip>
  <KwChip variant="ok">menor = menos superfície de ataque</KwChip>
</div>

<div class="mt-4 kw-muted">

A seção de segurança de containers leva isso adiante — bases distroless, scanning e proveniência.

</div>

</div>

<!--
Speaker: a queda de tamanho é a vitória visível; a vitória de segurança (sem
compilador, sem código-fonte, sem secrets vazados nas layers entregues) é a que
importa. No lab eles medem as duas images com `docker images`.
-->

---
layout: code-annotated
heading: '`latest` é um ponteiro, não uma versão'
lab: labs/day-1/01-containers.md
---

```bash {none|1|2|3}
docker build -t demo:1 .
docker run demo:latest        # só existe demo:1...
docker run demo:1@sha256:9b2c...e41
```

::notes::

<CodeNote at="1" label="uma tag de verdade">
Você construiu e nomeou <code>demo:1</code>. Essa tag agora aponta para o digest
do que você acabou de construir.
</CodeNote>

<CodeNote at="2" label="latest ≠ mais nova" variant="warn">
<code>latest</code> é só uma tag que por acaso é o padrão — você nunca a definiu,
então ela não está lá. O engine procura localmente, depois tenta fazer <strong>pull</strong>,
depois falha. "Latest" não garante nada.
</CodeNote>

<CodeNote at="3" label="fixe por digest" variant="ok">
Referencie o <strong>digest</strong> e você sempre recebe os bytes exatos que
testou — a reprodutibilidade que tags não conseguem prometer. O lab quebra isso
de propósito.
</CodeNote>

<!--
Speaker: esta é a surpresa mais comum de quem está começando — "latest" soa como
"mais nova", mas é só uma tag padrão. Prenuncia o beat de fixar por digest da
S02 e o quebre→conserte do lab.
-->

---
layout: lab
lab: labs/day-1/01-containers.md
duration: 25 min
env: local — no cluster needed
---

## Lab 01 — Construa & inspecione uma image

- **Build:** construa o Dockerfile fornecido, rode em modo detached e mapeie uma porta
- **Exec:** entre no container — inspecione os processos e o usuário non-root, depois a config da image
- **Layers:** leia-as com `history`; altere um `COPY` e veja o cache invalidar
- **Quebre de propósito:** `run demo:latest` quando só existe `demo:1` → conserte
- **Multi-stage:** reconstrua enxuto e compare os tamanhos em `docker images` antes/depois
