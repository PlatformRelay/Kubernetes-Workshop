# Kubernetes Practitioner Workshop

[![CI](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/ci.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/ci.yml)
[![Pages](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/pages.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/pages.yml)
[![CodeQL](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/codeql.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/codeql.yml)
[![Documentation](https://img.shields.io/badge/documentation-GitHub%20Pages-2ea44f?logo=readthedocs&logoColor=white)](https://platformrelay.github.io/Kubernetes-Workshop/)
[![Release](https://img.shields.io/github/v/release/PlatformRelay/Kubernetes-Workshop)](https://github.com/PlatformRelay/Kubernetes-Workshop/releases)
[![License: 0BSD](https://img.shields.io/github/license/PlatformRelay/Kubernetes-Workshop)](./LICENSE)

**Gratuito. Open source. Sem paywall.** Um workshop de Kubernetes vendor-neutral que você
pode conduzir para si mesmo, para colegas ou como uma entrega completa de vários dias — com
slides interativos, labs prontos para rodar, um protótipo portátil de quiz e PDFs para
download.

Use para **aprender**, para **explicar conceitos de Kubernetes ao seu time** ou para
**facilitar** uma sala. Mude o estilo, reordene, faça fork, redistribua ou venda sob a
[0BSD License](./LICENSE) — sem exigência de atribuição. Sem royalties, sem contas e sem
telemetria.

**Decks ao vivo** (builds sempre atuais no GitHub Pages):

- [Day 1 — Fundamentos](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-1/)
- [Day 2 — Rodando workloads](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-2/)
- [Day 3 — Segurança, entrega, operators](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-3/)
- [Corte canônico de 3 dias](https://platformrelay.github.io/Kubernetes-Workshop/deck/3day/) ·
  [Conteúdo completo (superset)](https://platformrelay.github.io/Kubernetes-Workshop/deck/) ·
  [Início da documentação](https://platformrelay.github.io/Kubernetes-Workshop/)

## Experimente em sessenta segundos

| | |
| --- | --- |
| **Documentação** | <https://platformrelay.github.io/Kubernetes-Workshop/> |
| **Decks ao vivo** | [Day 1](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-1/) · [Day 2](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-2/) · [Day 3](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-3/) · [Corte de 3 dias](https://platformrelay.github.io/Kubernetes-Workshop/deck/3day/) · [Superset](https://platformrelay.github.io/Kubernetes-Workshop/deck/) |
| **Handouts em PDF** | [GitHub Releases](https://github.com/PlatformRelay/Kubernetes-Workshop/releases) (PDFs por dia + completo + 3 dias em cada tag `v*`) |
| **Labs** | [`labs/README.md`](./labs/README.md) · comece por [`labs/day-1/00-setup.md`](./labs/day-1/00-setup.md) |
| **Quizzes** | [`quiz/README.md`](./quiz/README.md) (protótipo portátil; host FOSS ao vivo ainda em aberto) |
| **Rodar os slides localmente** | [`docs/run-slides.md`](./docs/run-slides.md) (Node.js + pnpm) |
| **Limitações conhecidas** | [`docs/beta-limitations.md`](./docs/beta-limitations.md) (stub de S24; backlog de smoke dos add-ons) |
| **Roadmap** | [`docs/roadmap.md`](./docs/roadmap.md) (quizzes, OpenTelemetry — sem datas) |

![Tour animado do deck do workshop — slides reais avançando pelas suas animações de clique](docs/images/deck-showcase.gif)

<sub>Deck real, sem screenshots tirados à mão: o CI regera este tour a partir das fontes dos
slides (`pnpm showcase:gif`). Frame estático: [`docs/images/deck-preview.png`](docs/images/deck-preview.png).</sub>

## O que você leva

- **~50% slides / ~50% prática** — decks Slidev acompanhados de labs Markdown independentes.
- **Uma "linha vermelha" (red line) clara** — uma aplicação crescendo por
  **Pod → Deployment → Service → Ingress → Gateway API**, e depois config, storage, probes,
  security, Helm, GitOps e operators sobre o mesmo workload.
- **Dois ambientes de lab** — um namespace atribuído em um cluster compartilhado, ou um
  cluster **kind** local via [`./workshop up`](./docs/setup.md).
- **Apoio ao facilitador** — syllabus, notas de ritmo e checklists de add-ons em
  [`docs/facilitator-guide.md`](./docs/facilitator-guide.md).
- **PDFs offline** — cada release exporta os decks de cada dia mais os PDFs de
  compatibilidade completo/3 dias.

## Público

**Iniciante a intermediário.** À vontade em um shell, com noções de Git, YAML, HTTP e
vocabulário de containers. Os labs de rampa de entrada em containers (S01/S02) não precisam
de cluster.

**Ao final, quem aprende consegue** buildar e proteger uma image; explicar o control plane;
escrever e operar os workloads centrais até o Gateway API; injetar config e storage; definir
resources e probes; endurecer com PSA, NetworkPolicy e RBAC; entregar com Helm e GitOps; e
ler um operator no mundo real — mapeado aos domínios do CKA/CKAD como verificação de design
(preparação para certificação não é o princípio organizador).

## O currículo em resumo

O workshop é um **superset de 28 seções** (`S00`–`S27`), reduzido em cada entrega a um
**corte canônico de 3 dias**. Espinha dorsal: **Pod → Deployment → Service → Ingress →
Gateway API** (`S05`–`S09`).

| Day | Tema | Seções |
| --- | --- | --- |
| **Day 1** | Fundamentos + red line | `S00`, `S03`–`S08` |
| **Day 2** | Rodando workloads bem | `S09`–`S14` |
| **Day 3** | Segurança, entrega, operators | `S17`, `S20`–`S23`, `S25`–`S27` |

As seções escritas de rampa de entrada / add-back (`S01`, `S02`, `S15`, `S16`, `S18`, `S19`)
ficam em **Optional / Appendix**; `S24` é um stub deferred (fora de agenda).
**26 of 28 sections are fully authored** (`S27` é slides-only, de fechamento). Mapa completo:
[`docs/syllabus.md`](./docs/syllabus.md) — verificado por contrato contra
`scripts/deck-manifest.mjs`.

## Por que este, e não X?

- **vs. plataformas pagas** (KodeKloud, A Cloud Guru, cursos da Linux Foundation) — este é
  **gratuito para sempre**, 0BSD, sem conta, sem assinatura, sem labs atrás de paywall. Um
  `git clone` (ou o site do Pages ao vivo) já entrega tudo: slides, labs e PDFs.
- **vs. Kubernetes the Hard Way** — o KTHW ensina a fazer o bootstrap de um control plane do
  zero, na mão; é profundo, mas estreito, e para antes de você rodar qualquer workload. Este
  workshop assume que o cluster existe (`kind` ou compartilhado) e ensina o **caminho do
  praticante**: workloads, config, storage, probes, security, entrega e operators — onde uma
  pessoa de engenharia realmente gasta o seu tempo.
- **vs. cursos em vídeo único** (walkthroughs no YouTube, vídeos avulsos pagos/Udemy) — ótimos
  como introdução, mas em geral uma gravação linear, sem labs independentes para você rodar,
  sem estrutura de vários dias e sem material de facilitação. Aqui são slides **mais** labs
  práticos separados, um syllabus e um [guia do facilitador](./docs/facilitator-guide.md) —
  feito para rodar como uma sala de verdade, não só para assistir.
- **vs. a documentação/tutoriais oficiais do Kubernetes** — uma referência excelente, mas uma
  referência não é um currículo. Não há red line, não há ritmo, não há progressão de labs que
  faça uma aplicação crescer de ponta a ponta.
- **Propriedade** — 0BSD significa que você pode mudar o estilo, recortar a sua própria agenda
  do superset de 28 seções, ensinar dentro da sua empresa ou revender. Sem exigência de
  atribuição, sem royalties, nunca.

## Escolha o seu caminho

- **Conhecer** — [site de documentação](https://platformrelay.github.io/Kubernetes-Workshop/) e
  [decks ao vivo](https://platformrelay.github.io/Kubernetes-Workshop/deck/) ·
  [releases em PDF](https://github.com/PlatformRelay/Kubernetes-Workshop/releases).
- **Participar** — [`labs/README.md`](./labs/README.md) e então o Lab 00. Para o kind:
  [`docs/setup.md`](./docs/setup.md).
- **Facilitar** — [`docs/facilitator-guide.md`](./docs/facilitator-guide.md).
- **Contribuir** — regras de autoria em [`AGENT.md`](./AGENT.md).

## Rodar os slides na sua máquina

Caminho completo de copiar e colar (Node 22 + pnpm — este repositório não traz lockfile do npm):

```bash
git clone https://github.com/PlatformRelay/Kubernetes-Workshop.git
cd Kubernetes-Workshop

corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile

pnpm dev:day1          # http://localhost:3030/ — or pnpm dev / dev:3day / dev:superset
```

Mais detalhes (build, preview, árvore do Pages): [`docs/run-slides.md`](./docs/run-slides.md).

## Desenvolver (mantenedores)

```bash
pnpm install
pnpm dev                # gum menu when available
pnpm deck -- --list
pnpm build              # live day entries
pnpm export             # PDFs (playwright-chromium)
pnpm lint && pnpm link-check
pnpm test:pages         # Pages wiring contract
pnpm pages:build        # MkDocs + hash-routed decks → ./site (needs MkDocs)
```

## Estrutura

| Path | Propósito |
| --- | --- |
| `docs/` | Documentação MkDocs (landing do GitHub Pages) |
| `scripts/deck-manifest.mjs` | Metadados das seções + composição gerada dos decks |
| `slides-day-{1,2,3}.md` | Entradas ao vivo de cada dia |
| `slides.md` / `slides-3day.md` | Superset de compatibilidade / corte de três dias |
| `pages/SNN-topic/` | Fontes das seções |
| `labs/day-*/` | Labs independentes |
| `quiz/` | Protótipo portátil de quiz |
| `theme/` | Tema Slidev local |
| `docs/decisions/` | ADRs |

## Integração contínua e publicação

| Workflow | Gatilho | Papel |
| --- | --- | --- |
| `ci.yml` | PR + `main` | Lint dos labs, builds dos decks, link-check, testes do contrato do Pages, GIF de showcase |
| `pages.yml` | `main` (+ manual) | MkDocs + Slidev → GitHub Pages |
| `release.yml` | tags `v*` | GitHub Release com PDF + zip offline |
| `lab-smoke.yml` | schedule / dispatch / subconjunto em PR | Smoke descartável do Day 1 em kind |
| `codeql.yml` | `main` / schedule | Code scanning |

Política de release (tags imutáveis, artefatos dos decks por dia): [`docs/release.md`](./docs/release.md).

## Licença

**[0BSD](./LICENSE)** — use, copie, modifique, redistribua e venda livremente. Sem exigência
de atribuição. Copyright (C) 2026 Platform Relay.
