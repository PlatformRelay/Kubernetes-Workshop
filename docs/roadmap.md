# Roadmap

Para onde o workshop está indo — um **resumo público** para facilitadores e
contribuidores. Os status usam apenas vocabulário honesto: **in progress**, **planned**
ou **exploring**. Nada aqui é um compromisso, um cronograma ou uma promessa de que o
trabalho será entregue em uma data. Itens listados como entregues vivem na `main`; todo o
resto é direção, não entrega.

Notas internas de planejamento (se houver) ficam fora do site publicado. Esta página
resume; ela não passa na frente dos trackers privados.

> **A escolha da ferramenta de GitOps está na `main`, não é direção.** A seção de GitOps
> (S21) entrega com **Argo CD como padrão** e **Flux como variante selecionável**, para que
> facilitadores possam usar a ferramenta que a sala realmente usa sem forkar o currículo.
> Escolha uma por entrega com `--gitops argocd|flux`; veja
> [rodando os slides](./run-slides.md).
>
> [Discuta a escolha da ferramenta de GitOps →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/22)

> **O escopo de OpenTelemetry está decidido, não é direção.** OpenTelemetry é coberto como
> **conceitos dentro da seção do Prometheus operator (S23)**: OTLP como protocolo de fio e
> o collector como formato de pipeline, com traces citados mas não exercitados. Nenhuma
> seção, lab ou add-on de ambiente dedicado está planejado; a decisão e as condições que
> reabririam o tema estão registradas na
> [ADR 0013](./decisions/0013-opentelemetry-scope.md).
>
> [Discuta OpenTelemetry →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/23)

## Vocabulário de status

| Status | Significado |
| --- | --- |
| **in progress** | Trabalho ativo rumo a algo que ainda não está na `main`. |
| **planned** | Próximo trabalho pretendido; arquitetura ou sequenciamento ainda podem estar em aberto. |
| **exploring** | Apenas em consideração — explicitamente **não** comprometido. |

## Direção

### Quizzes ao vivo — planned

Perguntas de retrieval por seção mais um add-on de live-quiz self-hosted para a sala.
Um protótipo portátil de banco de questões já existe em
[`quiz/`](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz).
O spike de arquitetura avaliou três candidatos FOSS de live host e **não adotou
nenhum deles (0/3)** — então o live host e o banco de questões completo seguem **planned**,
com a arquitetura ainda em aberto.

[Discuta os quizzes ao vivo →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/21)

## Dívidas em aberto (referenciadas, não repetidas)

Estas já estão documentadas em páginas dedicadas; o roadmap apenas aponta para elas:

- **Validação ao vivo em Windows / WSL2** — a rota é testada por contrato; o live-smoke
  ainda está pendente. Veja [Windows / WSL2](./windows-wsl2.md).
- **Evidência de ensaio humano / saída do beta** — cobertura em papel e no CI antes de uma
  passada completa pelo caminho kind. Veja [Limitações conhecidas](./beta-limitations.md),
  o [checklist de ensaio](./rehearsal-checklist.md) e a
  [matriz de validação](./validation-matrix.md).

[Discuta as dívidas em aberto →](https://github.com/PlatformRelay/Kubernetes-Workshop/discussions/24)

## Feedback

Cada item acima linka para uma GitHub Discussion. Use essas threads para interesse,
trade-offs e evidências — não como fila de suporte nem como tracker de entrega.
