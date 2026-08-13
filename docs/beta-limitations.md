## Limitações conhecidas

Pendências assumidas com honestidade, para facilitadores — não são bloqueio de release e
**não** são um contrato de pacing. O ritmo da sala depende do apresentador, da audiência e
de quais seções opcionais você mantém.

- **S24 (Operator dev / kubebuilder) é um stub `deferred`** — depende de uma toolchain Go +
  kubebuilder e não está programado como lab hands-on completo enquanto não for escrito.
- **Alguns labs com muitos add-ons** (em especial os caminhos de Contour, Envoy Gateway,
  metrics-server, cert-manager, Argo CD e kube-prometheus) têm cobertura mais forte no
  papel/CI do que smoke de ponta a ponta em `kind` limpo para todas as combinações. Os
  dry-runs e os comandos escritos estão na árvore do repositório; espere eventual variação
  de ordem de instalação ou de strings do `describe` em um cluster novo, e reserve tempo
  para um dry-run dos add-ons que o *seu* corte precisa.
- **As marcações de minutos do syllabus** são apoios de planejamento para facilitadores,
  não fatos medidos de entrega. Ajuste no dia.

> **Fonte da verdade.** Este arquivo é a única cópia versionada da declaração de limitações
> conhecidas. Tags de pré-release (semver com um `-`, por exemplo `v0.5.0-beta.1`) ainda
> prefixam este arquivo às release notes geradas automaticamente no GitHub via
> `release.yml`. Edite aqui — não duplique o texto em outro lugar.
