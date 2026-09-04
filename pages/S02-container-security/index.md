---
layout: section-cover
image: /covers/section-02-customs-inspection.webp
day: Day 1
section: '02'
tier: recommended
track: Foundations
---

# Segurança de containers & supply chain

Construa images pequenas, non-root e escaneadas — a metade build-time da segurança.

**recommended** · sugerido para o Day 1 · trilha Foundations

<!--
Seção S02 — Segurança de containers & supply chain. Duração: ~30 min de slides + 25 min de lab.
Resultado: as pessoas conseguem construir e escolher images pequenas, non-root e
escaneadas — a metade build-time da segurança no Kubernetes (S17/S25 cobrem a
metade de runtime).
Beats: a image arriscada (pesada + root + secret embutido) · quatro movimentos
de build-time · endureça uma correção por passo (magic-move) · uma layer
deletada ainda é entregue · scanning (ilustrativo, ferramentas como exemplos) ·
SBOM · assinar + fixar por digest · prenúncio de S17/S25/S26.
Amarração CKx: fundamentos de segurança CKAD/CKA (higiene de image precede o
hardening de runtime).
Lab: labs/day-1/02-container-security.md.
-->

---
layout: code-annotated
heading: 'A image que entrega seu próximo incidente'
compact: true
---

```dockerfile {none|1|3|4|6}
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
ENTRYPOINT ["/bin/app"]
```

::notes::

<CodeNote at="1" label="base pesada" variant="warn">
O toolchain Go completo — compilador, shell, gerenciador de pacotes — <strong>vai
para produção</strong>. Cada um deles é código que um atacante pode usar e uma
CVE que agora é sua.
</CodeNote>

<CodeNote at="2" label="COPY . ." variant="warn">
Copia o <strong>build context inteiro</strong> para uma layer — <code>.git</code>,
arquivos <code>.env</code> locais, fixtures de teste. O que você não queria
entregar agora foi entregue.
</CodeNote>

<CodeNote at="3" label="secret embutido" variant="danger">
Uma chave privada escrita em uma layer. Mesmo que um passo posterior a delete, a
layer que a adicionou <strong>ainda existe</strong> no histórico da image —
recuperável por qualquer um que fizer pull.
</CodeNote>

<CodeNote at="4" label="root" variant="danger">
Sem <code>USER</code>, o PID 1 é <strong>root</strong>. Um escape de processo a
partir deste container começa como root no node — exatamente o que o módulo de
pod-escape do Day 3 ataca.
</CodeNote>

<!--
Speaker: quatro erros independentes em seis linhas, e todos são comuns. Este
slide é o "antes"; o magic-move dois slides adiante é o "depois". O secret e o
usuário root são os dois que evoluem para ataques de runtime (S17/S25).
-->

---

<span class="kw-kicker">A metade build-time da segurança</span>

# Quatro movimentos que encolhem a superfície de ataque

<div class="kw-cols-2 mt-4">
  <v-click at="1">
    <KwCard heading="Base mínima / distroless" icon="📦" variant="ok">
      Entregue sua aplicação e suas dependências de runtime — <strong>nada mais</strong>.
      Sem shell, sem gerenciador de pacotes, menos bibliotecas → menos CVEs e nada por onde pivotar.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Rode como non-root" icon="🙅" variant="ok">
      Um <code>USER</code> na image (ou uma base <code>nonroot</code>). A vitória
      isolada mais barata: um escape cai como um UID sem privilégios, não como root.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Multi-stage, sem secrets nas layers" icon="🧅" variant="ok">
      Construa pesado, entregue enxuto — o toolchain <em>e</em> os secrets de build
      ficam em um estágio descartado. Um arquivo deletado em uma layer posterior <strong>não</strong> desapareceu.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Fixe por digest, escaneie, assine" icon="🔏" variant="ok">
      Referencie bytes exatos com <code>@sha256:…</code>; escaneie em busca de CVEs
      conhecidas; assine para que consumidores possam verificar a proveniência.
      Prove <em>o que</em> você entregou e <em>de onde</em> veio.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-5 kw-muted text-sm">

Tudo isso são coisas que você faz em **build time**. O Kubernetes impõe a metade
de runtime depois — Pod Security Standards, NetworkPolicy, admission.

</div>

<!--
Speaker: estes mapeiam um a um para as correções por passo do magic-move.
Apresente scanners e assinadores como categorias, não produtos — você cita
exemplos em seguida, não endossos.
-->

---
layout: code-walkthrough
heading: 'Endureça — uma correção por passo'
lab: labs/day-1/02-container-security.md
---

````md magic-move
```dockerfile
# ANTES: base pesada, secret em uma layer, roda como root
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# FIX 1 — multi-stage: o toolchain nunca chega à image final
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
# CGO desligado → um binário estático que roda em uma base minúscula
RUN CGO_ENABLED=0 go build -o /bin/app .

# um estágio final novo e limpo — não herda nada que não recebeu explicitamente
FROM alpine:3.20
COPY --from=build /bin/app /bin/app
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# syntax=docker/dockerfile:1
# FIX 2 — monte o secret; ele é usado, nunca escrito em layer alguma
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

FROM alpine:3.20
COPY --from=build /bin/app /bin/app
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# syntax=docker/dockerfile:1
# FIX 3 — distroless + non-root: sem shell, sem gerenciador de pacotes, UID sem privilégios
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

FROM gcr.io/distroless/static:nonroot
COPY --from=build /bin/app /bin/app
USER 65532:65532
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# syntax=docker/dockerfile:1
# FIX 4 — fixe a base por digest: bytes exatos, não uma tag móvel
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

FROM gcr.io/distroless/static:nonroot@sha256:5759d19...   # base fixada
COPY --from=build /bin/app /bin/app
USER 65532:65532
ENTRYPOINT ["/bin/app"]
```
````

<!--
Speaker: uma correção por passo, espelhando os quatro movimentos. CGO_ENABLED=0
torna o binário Go estático para rodar em alpine/distroless (sem libc). O FIX 2
precisa da diretiva `# syntax=docker/dockerfile:1` para `--mount=type=secret`
(BuildKit). O distroless/static:nonroot do FIX 3 não traz shell — você não
consegue `exec sh` nele, e esse é o ponto. O digest do FIX 4 é ilustrativo — no
lab eles buscam o real. Esta image "depois" é a que o lab escaneia contra a "antes".
-->

---
layout: code-annotated
heading: 'Uma layer deletada ainda é entregue'
compact: true
---

```bash {none|1|2|3|4}
COPY deploy_key /src/deploy_key   # layer N — o secret está na image
RUN rm /src/deploy_key            # layer N+1 — escondido, não apagado

docker history --no-trunc demo:insecure
docker save demo:insecure -o img.tar && tar xf img.tar
```

::notes::

<CodeNote at="1" label="a layer que o adiciona" variant="danger">
Adicionar o arquivo cria uma layer cujo conteúdo <strong>é</strong> o secret.
Essa layer agora faz parte da identidade da image.
</CodeNote>

<CodeNote at="2" label="rm não reescreve o histórico" variant="warn">
Uma layer posterior registra um <em>whiteout</em> que esconde o arquivo do
filesystem final — mas a layer N, com o secret, <strong>continua lá, disponível para pull</strong>.
</CodeNote>

<CodeNote at="3" label="history revela">
<code>history</code> lista cada layer e a instrução que a construiu. A layer do
<code>COPY deploy_key</code> fica visível para qualquer um com a image.
</CodeNote>

<CodeNote at="4" label="a correção de verdade" variant="ok">
Você não consegue se salvar deletando — você precisa nunca <strong>adicionar</strong>
o secret a uma layer entregue. Secret mounts em build time (FIX 2) ou um estágio
de build descartado são as únicas correções reais. O lab prova isso de ponta a ponta.
</CodeNote>

<!--
Speaker: este é o erro de iniciante mais caro desta seção. O gancho mental:
layers são append-only; `rm` é uma layer nova, não uma edição. Rotacione
qualquer secret que um dia tenha tocado uma layer entregue — assuma que ele é público.
-->

---
layout: two-cols-code
heading: 'Escaneie antes e depois — venda a queda'
lab: labs/day-1/02-container-security.md
---

````md magic-move
```text
# demo:insecure  (base pesada + toolchain)
Total: 61 (UNKNOWN: 0, LOW: 18, MEDIUM: 27, HIGH: 14, CRITICAL: 2)

  ├─ os-pkgs   glibc, openssl, bash …   fixable + unfixable
  └─ go-mod    stdlib pinned to 1.24
```

```text
# demo:hardened  (distroless/static:nonroot)
Total: 0 (UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0)

  └─ scanner found no OS packages and no known-vulnerable modules
```
````

::right::

<div class="text-sm">

Um scanner (**ex.: Trivy, Grype**) lê os metadados de pacotes da image e os cruza
com feeds de CVE — pacotes do SO **e** dependências de linguagem.

<div class="mt-3">
<KwChip variant="warn">HIGH / CRITICAL primeiro</KwChip>
<KwChip>fixable vs unfixable</KwChip>
<KwChip variant="ok">trave o CI por severidade</KwChip>
</div>

<div class="mt-4 kw-muted">

As contagens são **ilustrativas e mudam todo dia** — o número que importa é o
**delta**: uma base mínima quase não tem o que encontrar. Ligue o scan ao CI
para que uma regressão falhe o build.

</div>

</div>

<!--
Speaker: não memorize números — os bancos de dados atualizam o tempo todo
(guardrail de atualidade). O ponto de ensino é relativo: base pesada = dezenas
de achados que você não escreveu; distroless = quase zero porque quase não há
pacotes. Ferramentas citadas como exemplos, não endossos. No lab eles rodam o
antes/depois de verdade.
-->

---

<span class="kw-kicker">Saiba o que tem dentro — e prove de onde veio</span>

# SBOM, assinatura e proveniência

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="SBOM" icon="📋">
      Uma <strong>lista de materiais</strong> (bill of materials) — cada pacote e
      versão na image, como <strong>SPDX</strong> ou <strong>CycloneDX</strong>.
      Gerada no build (ex.: Syft). Quando a próxima CVE cair, você faz grep nos
      seus SBOMs em vez de adivinhar.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Assinar & verificar" icon="✍️">
      Assine a image pelo <strong>digest</strong> (ex.: cosign / Sigstore);
      consumidores rodam <code>verify</code> antes de executar. Uma image
      adulterada ou não assinada <strong>falha na checagem</strong> — a confiança
      vira algo que dá para exigir.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Proveniência / SLSA" icon="🧾" variant="plain">
      Uma <strong>attestation</strong> assinada de <em>como</em> a image foi
      construída (fonte, builder, passos). Os níveis <strong>SLSA</strong> graduam
      essa cadeia de "confia em mim" a "verificável de forma independente".
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 text-sm">

As três coisas se penduram em um só ponto: o **digest**. `app:1.4` pode se mover;
`app@sha256:…` não — então é ele que você escaneia, assina, atesta e, no fim,
usa para **fazer o deploy**.

</div>

<!--
Speaker: o SBOM responde "fui afetado?" rápido; a assinatura responde "essa image
é mesmo nossa?"; a proveniência responde "como ela foi construída?". Profundidade
só de modelo mental — o lab faz SBOM de verdade e demonstra sign/verify como
saída esperada. A imposição (admitir só images assinadas) é S17/S25.
-->

---
layout: recap
heading: 'Segurança em build time, em um arco só'
story: 'O alerta do plantão não era um exploit de runtime — era uma image inchada que ainda carregava um secret de build no histórico de layers.'
next: 'O modelo mental do Kubernetes: control plane, nodes, reconciliação'
---

- **Base mínima / distroless** → menos pacotes, menos CVEs, nada por onde pivotar
- **`USER` non-root** → um escape cai sem privilégios, não como root no node
- **Multi-stage + secret mounts** → toolchains e secrets nunca chegam a uma layer entregue
- **Uma layer deletada ainda é entregue** → nunca *adicione* um secret; rotacione qualquer um que já tenha entrado
- **Escaneie, SBOM, assine, fixe por digest** → saiba o que tem dentro e prove de onde veio

<div class="mt-4 kw-muted text-sm">

Esta é a metade de **build time**. O Kubernetes impõe a metade de **runtime**
depois — Pod Security Standards + NetworkPolicy, o walkthrough de pod-escape e o
checklist de prontidão para produção. CKx: fundamentos de segurança — higiene de
image precede o hardening de runtime.

</div>

<!--
Speaker: feche o loop aberto no S01 ("o S02 aprofunda"). O Gremlin/ameaça que o
Day 3 caça começa como um clandestino em uma image inchada — esse é o fio
condutor daqui até o S25.
-->

---
layout: lab
lab: labs/day-1/02-container-security.md
duration: 25 min
env: local — no cluster needed
---

## Lab 02 — Escaneie & endureça uma image

- **Escaneie** uma image deliberadamente vulnerável e registre a contagem de HIGH/CRITICAL
- **Endureça:** base mínima + `USER` non-root + multi-stage → **re-escaneie** e compare
- **SBOM:** gere um para a image hardened e encontre uma dependência nele
- **Quebre de propósito:** embuta um secret, recupere-o do histórico da image e então remova-o *corretamente*
- **Assine & fixe:** (opcional) assine/verifique e então fixe a referência final por **digest**
