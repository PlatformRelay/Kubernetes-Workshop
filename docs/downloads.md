# Decks ao vivo e downloads de PDF

## Interactive Slidev decks

Estes são os builds sempre atualizados do GitHub Pages (com hash routing sob `/deck/`,
para que a navegação entre slides e os refreshes forçados funcionem no Pages de projeto).

| Deck | URL |
| --- | --- |
| **Home da documentação** (este site) | <https://platformrelay.github.io/Kubernetes-Workshop/> |
| **Superset** de conteúdo completo | <https://platformrelay.github.io/Kubernetes-Workshop/deck/> |
| **Corte canônico de 3 dias** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/3day/> |
| Entrada do **Day 1** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/day-1/> |
| Entrada do **Day 2** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/day-2/> |
| Entrada do **Day 3** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/day-3/> |
| **Galeria de templates** | <https://platformrelay.github.io/Kubernetes-Workshop/deck/templates/> |

Faça deep-link para um slide com um fragmento de hash, por exemplo
`…/deck/day-1/#/5` para o slide 5 do Day 1.

Redirecionamentos de compatibilidade: os paths legados `/3day/` e `/templates/`
encaminham para os locais `/deck/…` acima.

## PDF downloads

Todo GitHub Release `v*` publica exports em PDF (e um zip do site para uso offline).
Prefira a página do **latest release** para que os links continuem atuais entre as tags:

- **Todos os assets do release:** [GitHub Releases](https://github.com/PlatformRelay/Kubernetes-Workshop/releases)
- **Latest (pode ser um pre-release):** [Releases · latest](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/latest)

Nomes típicos dos artefatos (com a tag substituindo `<tag>`):

| Artefato | Conteúdo |
| --- | --- |
| `kubernetes-workshop-day-1-<tag>.pdf` | Entrada ao vivo do Day 1 |
| `kubernetes-workshop-day-2-<tag>.pdf` | Entrada ao vivo do Day 2 |
| `kubernetes-workshop-day-3-<tag>.pdf` | Entrada ao vivo do Day 3 |
| `kubernetes-workshop-full-<tag>.pdf` | Superset de compatibilidade |
| `kubernetes-workshop-3day-<tag>.pdf` | Corte de três dias de compatibilidade |
| `kubernetes-workshop-site-<tag>.zip` | Bundle HTML offline |

Exemplos de pins da **`v0.6.0`**:

- [PDF do Day 1](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.6.0/kubernetes-workshop-day-1-v0.6.0.pdf)
- [PDF do Day 2](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.6.0/kubernetes-workshop-day-2-v0.6.0.pdf)
- [PDF do Day 3](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/download/v0.6.0/kubernetes-workshop-day-3-v0.6.0.pdf)
- [PDFs full / 3-day e zip do site](https://github.com/PlatformRelay/Kubernetes-Workshop/releases/tag/v0.6.0)

Tags de pre-release continuam adicionando as [limitações conhecidas](./beta-limitations.md)
no início do corpo das release notes. Como as tags são cortadas: [release.md](./release.md).

## Labs e quizzes

| Recurso | Link |
| --- | --- |
| Labs do participante | [labs/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/labs#readme) |
| Lab 00 (comece aqui) | [labs/day-1/00-setup.md](https://github.com/PlatformRelay/Kubernetes-Workshop/blob/main/labs/day-1/00-setup.md) |
| Protótipo de quiz | [quiz/README.md](https://github.com/PlatformRelay/Kubernetes-Workshop/tree/main/quiz#readme) |
