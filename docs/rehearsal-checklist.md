# Checklist de ensaio — caminho kind, lab a lab

Um checklist de **dry-run** pré-entrega para o facilitador. Ele percorre o
**caminho canônico `kind`** do workshop de ponta a ponta — o caminho em que o facilitador
(ou um aluno com cluster-admin) instala todos os add-ons por conta própria — para que as
instalações dos add-ons, o break→fix deliberado de cada lab e o cleanup de estado limpo
sejam todos exercitados uma vez contra um cluster descartável **antes** de haver
qualquer pessoa na sala.

Por que o caminho `kind`: ele é o caminho mais completo. Em um cluster compartilhado os
add-ons já vêm pré-instalados e vários labs rodam em modo somente leitura, então um ensaio
em cluster compartilhado nunca exercita as instalações. Ensaiar no `kind` cobre tudo; uma
entrega em cluster compartilhado passa a ser um subconjunto. Veja o
[guia do facilitador](./facilitator-guide.md#add-ons-what-to-pre-install-per-lab) para a
tabela de add-ons que este checklist espelha, e o
[syllabus](./syllabus.md#section-map-s00s27) para o mapa canônico de seções.

> **Escopo.** Este checklist cobre **todas as seções do syllabus (S00–S27)**, não apenas o
> corte de 3 dias, porque um ensaio deve exercitar todo o superset escrito. A coluna
> **Tier** marca o que é `core` / `recommended` / `optional`, para que você possa pular as
> seções fora do corte se estiver ensaiando apenas uma entrega específica. **S24 é um stub
> `deferred`** (não ensaie como lab executável); **S27 é somente slides** (sem lab).

Mais duas coisas para deixar claras antes de começar:

> **Isto é um checklist, não um log de resultados.** Registre os tempos medidos e os
> bloqueadores no [template de timing-results](./timing-results-template.md) separado —
> mantenha números medidos fora deste arquivo. Este checklist também complementa a
> [matriz de validação US-BETA-3](./validation-matrix.md) (escrita em uma trilha irmã):
> aquela matriz acompanha a validação de manifestos por lab (dry-run client/server,
> confirmação em cluster ao vivo); este checklist é a passada humana pelo caminho de
> entrega.

## Como usar este checklist

1. Crie um cluster `kind` novo (`kind create cluster` com o `kind-cluster.yaml` do lab
   quando o lab trouxer um — S08 precisa da node label `ingress-ready`).
2. Trabalhe de cima para baixo. Para cada seção: rode os slides abertos em uma janela,
   faça o lab em outra, instale qualquer add-on **antes** do passo do lab que precisa
   dele, chegue ao **break→fix** deliberado e então rode o **Cleanup / panic reset** do
   lab.
3. Marque as caixas conforme avança. Registre os números no
   [template de timing-results](./timing-results-template.md), não aqui.
4. Por contrato de autoria (veja o [guia do facilitador](./facilitator-guide.md)), todo
   lab executável carrega um **break→fix deliberado** (cujo formato exato varia — um valor
   errado, um selector quebrado, um manifesto falho para auditar) e termina com um
   **Cleanup / panic reset**. Confirme que ambos realmente disparam. (S24 é um stub e S27 é
   somente slides — nenhum dos dois se aplica ali.)

## Pré-voo (uma vez, antes da Seção S00)

- [ ] `kubectl` no `PATH`, dentro de uma minor version do API server alvo.
- [ ] `kind` + um container engine (Docker ou Podman) instalado; RAM adequada.
- [ ] `helm` v3.8+ no `PATH` (necessário para S20, S23).
- [ ] Acesso de pull ao registry a partir da rede do ensaio (images públicas baixam sem
      problemas).
- [ ] Para S02: um scanner (Trivy ou Grype), opcionalmente cosign.
- [ ] `export NS=workshop` (a convenção do kind) e confirme que o namespace existe.

## Day 1 — Fundamentos e a red line central

| ✓ | ID | Tier | Lab | Add-on a instalar antes | break→fix presente | Cleanup roda |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | S00 | core | [00-setup](../labs/day-1/00-setup.md) | nenhum | contexto errado | [ ] |
| [ ] | S01 | recommended | [01-containers](../labs/day-1/01-containers.md) | nenhum (local, sem cluster) | `latest` não é "o mais novo" | [ ] |
| [ ] | S02 | recommended | [02-container-security](../labs/day-1/02-container-security.md) | nenhum (local, sem cluster) | um secret "apagado" continua indo junto | [ ] |
| [ ] | S03 | core | [03-cluster-tour](../labs/day-1/03-cluster-tour.md) | nenhum | um typo no `explain` | [ ] |
| [ ] | S04 | core | [04-kubectl](../labs/day-1/04-kubectl.md) | nenhum | o client diz sim, o server diz não | [ ] |
| [ ] | S05 | core | [05-pod](../labs/day-1/05-pod.md) | nenhum | uma image ruim (ImagePullBackOff) | [ ] |
| [ ] | S06 | core | [06-deployment](../labs/day-1/06-deployment.md) | nenhum | um rollout que trava | [ ] |
| [ ] | S07 | core | [07-service](../labs/day-1/07-service.md) | nenhum | quebrar o selector (falha silenciosa) | [ ] |
| [ ] | S08 | core | [08-ingress](../labs/day-1/08-ingress.md) | **Contour** (manifesto quickstart pinado) | esquecer o `pathType` | [ ] |

**Instalação de add-on do Day 1 a verificar:** para **S08**, o cluster `kind` precisa
carregar os port mappings 80/443 de ingress-ready (o kind cluster config do repositório os
define); então faça `kubectl apply -f` do quickstart pinado do Contour v1.33.5 e aguarde o
controller ficar pronto **antes** do passo de Ingress.

## Day 2 — Roteamento moderno e rodar workloads direito

| ✓ | ID | Tier | Lab | Add-on a instalar antes | break→fix presente | Cleanup roda |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | S09 | recommended | [09-gateway-api](../labs/day-2/09-gateway-api.md) | **CRDs da Gateway API + Envoy Gateway** | um `gatewayClassName` que ninguém possui | [ ] |
| [ ] | S10 | core | [10-config](../labs/day-2/10-config.md) | nenhum | rotacionar um valor — env vars não atualizam ao vivo | [ ] |
| [ ] | S11 | core | [11-storage](../labs/day-2/11-storage.md) | nenhum (StorageClass padrão no kind) | uma StorageClass que não existe | [ ] |
| [ ] | S12 | recommended | [12-statefulset](../labs/day-2/12-statefulset.md) | nenhum (StorageClass padrão no kind) | um `serviceName` apontando para nada | [ ] |
| [ ] | S13 | core | [13-resources](../labs/day-2/13-resources.md) | nenhum | empurrar um container além do seu memory limit | [ ] |
| [ ] | S14 | core | [14-probes](../labs/day-2/14-probes.md) | nenhum | quebrar a readiness, depois a liveness | [ ] |
| [ ] | S15 | recommended | [15-jobs](../labs/day-2/15-jobs.md) | nenhum | um Job que falha até o `backoffLimit` | [ ] |
| [ ] | S16 | optional | [16-hpa](../labs/day-2/16-hpa.md) | **metrics-server** (kind: `--kubelet-insecure-tls`) | um HPA sem nada por que dividir | [ ] |

**Instalações de add-on do Day 2 a verificar:** para **S09**, faça `kubectl apply -f` dos
CRDs do standard channel da Gateway API (v1.5.1) e depois do `install.yaml` do Envoy
Gateway (que fornece a GatewayClass `eg`), **antes** do passo de rota. Para **S16**, faça
`kubectl apply -f` do `components.yaml` do metrics-server **com o patch
`--kubelet-insecure-tls` do kind**, e então confirme que o `kubectl top` reporta antes do
passo do HPA (caso contrário, `TARGETS <unknown>`).

## Day 3 — Segurança, entrega, operators, boas práticas

| ✓ | ID | Tier | Lab | Add-on a instalar antes | break→fix presente | Cleanup roda |
| --- | --- | --- | --- | --- | --- | --- |
| [ ] | S17 | core | [17-pod-security](../labs/day-3/17-pod-security.md) | nenhum (PSA embutido no API server) | o Pod inseguro é recusado na porta | [ ] |
| [ ] | S18 | recommended | [18-networkpolicy](../labs/day-3/18-networkpolicy.md) | **CNI com suporte a policy** (kindnet aplica; Calico como fallback) | `default-deny` cerca o backend (self-test) | [ ] |
| [ ] | S19 | optional | [19-rbac](../labs/day-3/19-rbac.md) | nenhum | rodar comandos reais como a SA e bater no deny | [ ] |
| [ ] | S20 | core | [20-helm](../labs/day-3/20-helm.md) | nenhum (precisa do CLI `helm`) | quebrar um upgrade, depois fazer rollback | [ ] |
| [ ] | S21 | recommended | [21-gitops](../labs/day-3/21-gitops.md) | **Argo CD** (`install.yaml` no ns `argocd`) | provocar drift na mão e ver o self-heal reverter | [ ] |
| [ ] | S22 | recommended | [22-operator-concept](../labs/day-3/22-operator-concept.md) | **cert-manager** | deletar o Secret e ver o loop recriá-lo | [ ] |
| [ ] | S23 | recommended | [23-prometheus](../labs/day-3/23-prometheus.md) | **kube-prometheus-stack** (Helm) | diagnosticar na página `/targets` do Prometheus | [ ] |
| [ ] | S24 † | optional | [24-kubebuilder](../labs/day-3/24-kubebuilder.md) | **STUB `DEFERRED` — não ensaie como lab executável** | n/a (não escrito) | n/a |
| [ ] | S25 | recommended | [25-pod-escape](../labs/day-3/25-pod-escape.md) | nenhum — **somente kind**, escape controlado; nunca em compartilhado/prod | (escape controlado + hardening) | [ ] |
| [ ] | S26 | core | [26-capstone](../labs/day-3/26-capstone.md) | nenhum | auditar um manifesto falho e depois corrigi-lo | [ ] |
| [ ] | S27 | core | *(somente slides — Q&A aberto / office hours, sem lab)* | nenhum | n/a (sem lab) | n/a |

† **S24 é um stub `deferred`** — os slides e o lab estão esboçados, mas não escritos (precisa
de uma toolchain Go + kubebuilder). Não agende como passo de ensaio executável.

**Instalações de add-on do Day 3 a verificar:** **S18** — confirme que a sua CNI realmente
*aplica* a policy (o kindnet atual do kind aplica, via kube-network-policies; o Passo 2 do
lab é um self-test de enforcement com fallback para Calico). **S21** — `kubectl create
namespace argocd` e então `kubectl apply -n argocd --server-side` do `install.yaml` do Argo
CD. **S22** — `kubectl apply -f` do manifesto de release do cert-manager. **S23** — `helm
repo add` do prometheus-community e então `helm install` do kube-prometheus-stack em um
namespace `monitoring`.

## Fechamento pós-ensaio

- [ ] O **Cleanup / panic reset** de cada lab deixou o cluster em estado limpo (sem
      workloads, PVCs, CRDs ou namespaces sobrando que você não esperava).
- [ ] Derrubada: `kind delete cluster` e recriar do zero confirma uma reconstrução limpa
      (~30 s) — o panic reset documentado para o caminho kind.
- [ ] Todas as instalações de add-on completaram em um tempo viável na rede do ensaio
      (registre as durações reais no
      [template de timing-results](./timing-results-template.md)).
- [ ] Qualquer lab em que o break→fix ou o cleanup **não** se comportou como o lab descreve
      foi registrado como [issue de beta-feedback](../.github/ISSUE_TEMPLATE/beta-feedback.yml).
- [ ] Tempos de todas as seções capturados no
      [template de timing-results](./timing-results-template.md), para que as estimativas
      de planejamento possam finalmente ser confrontadas com a realidade medida.
