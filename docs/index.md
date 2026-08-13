---
hide:
  - navigation
  - toc
  - title
---

# Kubernetes Practitioner Workshop

**Um workshop de Kubernetes gratuito, open-source e vendor-neutral** — apresentações
Slidev, labs prontos para rodar e um protótipo portátil de quiz. Use para aprender
sozinho, para ensinar colegas ou para conduzir uma entrega completa de vários dias.
Adapte, mude o estilo, redistribua sob a
[Licença 0BSD](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/LICENSE)
(sem exigência de atribuição).

<p markdown="1">

[![CI](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/ci.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/ci.yml)
[![Pages](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/pages.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/pages.yml)
[![CodeQL](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/codeql.yml/badge.svg)](https://github.com/PlatformRelay/Kubernetes-Workshop/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/PlatformRelay/Kubernetes-Workshop)](https://github.com/PlatformRelay/Kubernetes-Workshop/releases)
[![License: 0BSD](https://img.shields.io/github/license/PlatformRelay/Kubernetes-Workshop)](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/LICENSE)

</p>

**Decks ao vivo:** [Day 1](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-1/) ·
[Day 2](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-2/) ·
[Day 3](https://platformrelay.github.io/Kubernetes-Workshop/deck/day-3/) ·
[Corte de 3 dias](https://platformrelay.github.io/Kubernetes-Workshop/deck/3day/) ·
[Superset](https://platformrelay.github.io/Kubernetes-Workshop/deck/)

[Decks interativos :octicons-arrow-right-24:](downloads.md#interactive-slidev-decks){ .md-button .md-button--primary }
[Downloads em PDF :octicons-download-24:](downloads.md#pdf-downloads){ .md-button }
[Rodar localmente :octicons-terminal-24:](run-slides.md){ .md-button }

## Por que este workshop

| | |
| --- | --- |
| **Gratuito** | Sem paywall, sem conta, sem telemetria. Clone e comece. |
| **Pronto para ensinar** | Decks + labs + notas do facilitador para você explicar Kubernetes aos colegas. |
| **Mão na massa** | Labs autônomos em Markdown (cerca de metade do tempo) com comandos prontos para copiar e colar. |
| **Entrega flexível** | Estudo solo, uma única tarde ou o corte canônico de três dias. |
| **Vários formatos** | Slidev ao vivo no navegador, preview local com Node.js e PDFs para download. |
| **Seu para adaptar** | Mude o estilo do tema, reordene as seções, faça fork ou venda livremente sob a 0BSD. |

## Comece por aqui

| Objetivo | Vá para |
| --- | --- |
| Ver os slides no navegador | [Decks ao vivo](downloads.md#interactive-slidev-decks) |
| Baixar os handouts em PDF | [Downloads em PDF](downloads.md#pdf-downloads) / [GitHub Releases](https://github.com/PlatformRelay/Kubernetes-Workshop/releases) |
| Rodar o Slidev no seu laptop | [Rodar os slides localmente](run-slides.md) |
| Fazer os labs | [Guia dos labs](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/labs#readme) · [Lab 00 setup](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/labs/day-1/00-setup.md) |
| Subir um cluster kind local | [Setup local com kind](setup.md) |
| Testar o protótipo do quiz | [README do quiz](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz#readme) |
| Ver o mapa completo de seções | [Syllabus](syllabus.md) |
| Conduzir uma turma | [Guia do facilitador](facilitator-guide.md) |

## Espinha dorsal do currículo

A "linha vermelha" (red line) faz uma mesma aplicação crescer passo a passo:

**Pod → Deployment → Service → Ingress → Gateway API**

Os tópicos posteriores (config, storage, probes, security, Helm, GitOps, operators) se
apoiam nesse mesmo workload. Mapa completo: [syllabus](syllabus.md).
