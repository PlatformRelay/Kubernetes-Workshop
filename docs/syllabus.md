# Syllabus — Kubernetes Practitioner Workshop

Um workshop de Kubernetes moderno, cheio de código e vendor-neutral. Ele leva quem aprende
de "o que é um container", passando por "o que é um cluster", até escrever, rodar e operar
com confiança os workloads centrais do Kubernetes. Cada bloco de conceito vem acompanhado
de um lab prático: aproximadamente **50% apresentação, 50% prática**.

Este documento é o cronograma público e autocontido. Um facilitador deve conseguir
reconstruir o workshop inteiro só a partir deste arquivo. Veja também:

- [`labs/README.md`](../labs/README.md) — porta de entrada do participante (como os labs funcionam, pré-requisitos).
- [`docs/facilitator-guide.md`](./facilitator-guide.md) — porta de entrada do facilitador (setup de sala/ambiente, ritmo).
- [`docs/decisions/`](./decisions/) — architecture decision records (por que o repositório tem este formato).

## Premissa e público

O workshop é construído em torno de uma **"linha vermelha" (red line) de recursos
centrais** e depois empilha temas de containers, operação, entrega e segurança sobre
essa base.

**Nível: iniciante a intermediário**, não iniciante puro. O arco vai dos fundamentos de
containers até operators, GitOps e hardening contra pod escape.

**Pré-requisitos assumidos** (declarados logo de início e reforçados nos labs):

- Um shell no qual você se sinta à vontade, e noções de Git.
- Noções de YAML, de HTTP e de vocabulário de containers.
- Um de dois ambientes de lab: um **namespace atribuído** em um cluster compartilhado, **ou**
  um cluster **kind** local. Veja [`labs/README.md`](../labs/README.md) para as ferramentas exatas.

As duas seções de containers (S01/S02) são oferecidas como **rampa de entrada** para quem é
novo em containers — elas rodam inteiramente local e não precisam de cluster.

## The red line

A espinha dorsal do workshop é uma única aplicação levada passo a passo pelos cinco recursos
centrais de networking/workload:

> **Pod → Deployment → Service → Ingress → Gateway API** (seções S05–S09)

Cada recurso **estende o manifesto anterior** em vez de começar do zero, então quem aprende
vê uma mesma aplicação crescer de um Pod puro até um Deployment, ganhar um endereço estável
de Service, ser exposta no sentido norte-sul via Ingress e, por fim, ser roteada com a
Gateway API. Todo tema posterior (config, storage, health, security, entrega, observabilidade)
se pendura nessa mesma aplicação em execução.

## Superset vs. the canonical 3-day cut

O mapa de seções abaixo (**S00–S27**) é um **content superset** — ele contém
deliberadamente **mais material do que cabe em três dias**. Isso permite que o workshop seja
escrito com riqueza e **reduzido a cada entrega**, ligando ou desligando seções. Nada é
desperdiçado: cada seção é uma unidade autocontida e individualmente alternável.

- Toda seção carrega um **Tier** — `core`, `recommended` ou `optional` — e um **dia sugerido**
  para o corte canônico.
- O **corte canônico de 3 dias** (veja [The 3-day cut](#the-canonical-3-day-cut)) é o
  subconjunto que precisa ficar perto de **~390 minutos/dia com ~50/50 slides:lab**. O superset
  como um todo não fica, por design.
- O corte de 3 dias = todas as seções `core` + seções `recommended` selecionadas; as seções
  `optional` são as primeiras a cair. O facilitador compõe cada entrega a partir de seções já
  escritas, em vez de cortar material ao vivo.

> **Nota sobre tempos.** Os tempos por seção abaixo são a primitiva. Os totais por dia no
> corte canônico são **estimativas de planejamento que ainda não foram ensaiadas de ponta a
> ponta** — confirmar que o corte fica perto de ~390 minutos/dia com ~50/50 é explicitamente
> uma tarefa de ensaio pré-entrega ainda em aberto. Trate os totais como alvos de ritmo, não
> como fatos verificados.

## Section map (S00–S27)

**Tier:** `core` (sempre no corte) · `recommended` (entra no corte se houver tempo) ·
`optional` (o primeiro a cair). **Day** é o agrupamento sugerido para o corte canônico de 3 dias.

| ID | Section | Tier | Day | Status | Track |
| --- | --- | --- | --- | --- | --- |
| S00 | Welcome & setup | core | 1 | authored | Foundations |
| S01 | Containers | recommended | 1 | authored | Foundations |
| S02 | Container security & supply chain | recommended | 1 | authored | Foundations |
| S03 | Kubernetes mental model | core | 1 | authored | Foundations |
| S04 | kubectl | core | 1 | authored | Foundations |
| S05 | Pod *(red line 1/5)* | core | 1 | authored | Core |
| S06 | Deployment *(red line 2/5)* | core | 1 | authored | Core |
| S07 | Service *(red line 3/5)* | core | 1 | authored | Core |
| S08 | Ingress *(red line 4/5)* | core | 1 | authored | Core |
| S09 | Gateway API *(red line 5/5)* | recommended | 2 | authored | Core |
| S10 | ConfigMap & Secret | core | 2 | authored | Core |
| S11 | Storage (PV/PVC/StorageClass) | core | 2 | authored | Workloads |
| S12 | StatefulSet | recommended | 2 | authored | Workloads |
| S13 | Resources & limits | core | 2 | authored | Workloads |
| S14 | Health probes | core | 2 | authored | Workloads |
| S15 | Jobs & CronJobs | recommended | 2 | authored | Workloads |
| S16 | Autoscaling (HPA) | optional | 2 | authored | Workloads |
| S17 | Pod security (securityContext + PSS) | core | 3 | authored | Security |
| S18 | NetworkPolicy | recommended | 3 | authored | Security |
| S19 | RBAC | optional | 3 | authored | Security |
| S20 | Helm | core | 3 | authored | Delivery |
| S21 | GitOps with Argo CD | recommended | 3 | authored | Delivery |
| S22 | The operator pattern | recommended | 3 | authored | Operators |
| S23 | Prometheus Operator | recommended | 3 | authored | Operators |
| S24 | Operator dev 101 (kubebuilder) | optional | 3 | deferred | Operators |
| S25 | Security & pod escape | recommended | 3 | authored | Security |
| S26 | Best practices (capstone) | core | 3 | authored | Wrap |
| S27 | Wrap-up & next steps | core | 3 | authored | Wrap |

> O **dia sugerido** é orientação, não cronograma rígido. Desligue qualquer seção
> `recommended` / `optional` para caber em uma sala mais curta.

## Per-section outcomes, timings, and labs

Cada seção combina slides de conceito com um lab independente em
[`labs/day-N/`](../labs/README.md). O tempo é **slides + lab**.

### Day 1 — Fundamentos, containers e a red line central

| ID | Resultado | Lab | Slides | Tempo de lab |
| --- | --- | --- | --- | --- |
| S00 | Todo mundo alcança o seu ambiente e roda kubectl. | [`labs/day-1/00-setup.md`](../labs/day-1/00-setup.md) | 20 | 15 |
| S01 | Explicar o que uma container image *é* e buildar uma. | [`labs/day-1/01-containers.md`](../labs/day-1/01-containers.md) | 30 | 25 |
| S02 | Buildar/escolher images pequenas, non-root e escaneadas (segurança em tempo de build). | [`labs/day-1/02-container-security.md`](../labs/day-1/02-container-security.md) | 30 | 25 |
| S03 | Descrever o control plane, os nodes e a reconciliação. | [`labs/day-1/03-cluster-tour.md`](../labs/day-1/03-cluster-tour.md) | 30 | 20 |
| S04 | Fluência para descobrir, inspecionar e mudar com kubectl — e o k9s como UI de terminal sobre a mesma API. | [`labs/day-1/04-kubectl.md`](../labs/day-1/04-kubectl.md) | 30 | 25 |
| S05 | Escrever, inspecionar e deletar um Pod; conhecer o seu ciclo de vida. | [`labs/day-1/05-pod.md`](../labs/day-1/05-pod.md) | 30 | 25 |
| S06 | Rodar e atualizar um Deployment; entender ReplicaSets e rollouts. | [`labs/day-1/06-deployment.md`](../labs/day-1/06-deployment.md) | 35 | 30 |
| S07 | Dar aos Pods um endereço estável; depurar o roteamento selector→endpoint. | [`labs/day-1/07-service.md`](../labs/day-1/07-service.md) | 30 | 30 |
| S08 | Expor HTTP no sentido norte-sul através de um Ingress controller; saber como o cert-manager mantém o Secret de TLS emitido e renovado. | [`labs/day-1/08-ingress.md`](../labs/day-1/08-ingress.md) | 30 | 25 |

### Day 2 — Routing moderno e como rodar bem os workloads

| ID | Resultado | Lab | Slides | Tempo de lab |
| --- | --- | --- | --- | --- |
| S09 | Rotear com a Gateway API, explicar por que ela sucede o Ingress e nomear a família de routes além do HTTP. | [`labs/day-2/09-gateway-api.md`](../labs/day-2/09-gateway-api.md) | 35 | 25 |
| S10 | Injetar configuração e secrets; conhecer as ressalvas e os padrões de entrega segura. | [`labs/day-2/10-config.md`](../labs/day-2/10-config.md) | 30 | 25 |
| S11 | Anexar storage durável e raciocinar sobre a stack de storage. | [`labs/day-2/11-storage.md`](../labs/day-2/11-storage.md) | 30 | 30 |
| S12 | Rodar um workload stateful com identidade estável e storage por Pod. | [`labs/day-2/12-statefulset.md`](../labs/day-2/12-statefulset.md) | 30 | 30 |
| S13 | Definir requests/limits, raciocinar sobre scheduling e QoS, e dimensionar a partir do uso observado. | [`labs/day-2/13-resources.md`](../labs/day-2/13-resources.md) | 35 | 30 |
| S14 | Configurar corretamente as liveness, readiness e startup probes. | [`labs/day-2/14-probes.md`](../labs/day-2/14-probes.md) | 30 | 30 |
| S15 | Rodar workloads batch e agendados. | [`labs/day-2/15-jobs.md`](../labs/day-2/15-jobs.md) | 20 | 20 |
| S16 | Escalar um workload sob demanda com um HPA. | [`labs/day-2/16-hpa.md`](../labs/day-2/16-hpa.md) | 20 | 20 |

### Day 3 — Segurança, entrega, operators, boas práticas

| ID | Resultado | Lab | Slides | Tempo de lab |
| --- | --- | --- | --- | --- |
| S17 | Endurecer um Pod e entender os Pod Security Standards. | [`labs/day-3/17-pod-security.md`](../labs/day-3/17-pod-security.md) | 30 | 25 |
| S18 | Isolar workloads na camada de rede (default-deny + allows explícitos). | [`labs/day-3/18-networkpolicy.md`](../labs/day-3/18-networkpolicy.md) | 25 | 25 |
| S19 | Conceder acesso de menor privilégio com RBAC. | [`labs/day-3/19-rbac.md`](../labs/day-3/19-rbac.md) | 25 | 25 |
| S20 | Instalar e customizar aplicações com Helm; fazer upgrade e rollback. | [`labs/day-3/20-helm.md`](../labs/day-3/20-helm.md) | 30 | 30 |
| S21 | Dirigir o estado desejado a partir do Git; entender sync e drift. | [`labs/day-3/21-gitops.md`](../labs/day-3/21-gitops.md) | 30 | 25 |
| S22 | Explicar o que é um operator e por que ele importa. | [`labs/day-3/22-operator-concept.md`](../labs/day-3/22-operator-concept.md) | 25 | 15 |
| S23 | Ver um operator gerenciando um sistema real; aprender o básico de observabilidade. | [`labs/day-3/23-prometheus.md`](../labs/day-3/23-prometheus.md) | 30 | 25 |
| S24 † | Fazer o scaffold de um operator minúsculo e entender o reconcile. | [`labs/day-3/24-kubebuilder.md`](../labs/day-3/24-kubebuilder.md) *(stub)* | 40 | 40 |
| S25 | Entender como configurações fracas de Pod permitem escape, e como impedir isso. | [`labs/day-3/25-pod-escape.md`](../labs/day-3/25-pod-escape.md) | 35 | 30 |
| S26 | Revisar criticamente manifestos reais contra um checklist de produção. | [`labs/day-3/26-capstone.md`](../labs/day-3/26-capstone.md) | 30 | 40 |
| S27 | Saber para onde ir depois. | *(nenhum — slides-only: Q&A aberto / office hours)* | 20 | — |

† **S24 é um stub deferred.** Os slides e o lab estão esboçados, mas ainda não foram
totalmente escritos — precisam de uma toolchain Go + kubebuilder e estão previstos para um
milestone posterior. O seu tempo é o slot planejado, não conteúdo entregue. Consulte o
[guia do facilitador](./facilitator-guide.md) antes de incluí-lo.

## The canonical 3-day cut

A redução que um facilitador entrega por padrão. Alvo: **~390 minutos/dia com ~50/50**.
Tudo que **não** está listado fica desligado naquela entrega. Os add-backs já escritos
continuam disponíveis no deck Optional / Appendix; entradas deferred aparecem como stubs, mas
ficam fora de agenda. O corte é deliberadamente ajustável — os add-backs listados são os
primeiros botões a girar.

### Day 1 (~375 minutos planejados)

**Seções:** S00, S03, S04, S05, S06, S07, S08.

- **S01 Containers** e **S02 Container security** são oferecidas como **pré-leitura opcional
  ou bloco noturno de "day 0"** — elas *não* estão no corte central do Day 1 acima, mesmo que
  o mapa de seções as marque como Day 1. Se a sala precisar de base em containers, encaixe as
  duas e empurre **S09 Gateway API** para o Day 2 para abrir espaço.

| Seção | Slides | Lab | Total |
| --- | --- | --- | --- |
| S00 | 20 | 15 | 35 |
| S03 | 30 | 20 | 50 |
| S04 | 30 | 25 | 55 |
| S05 | 30 | 25 | 55 |
| S06 | 35 | 30 | 65 |
| S07 | 30 | 30 | 60 |
| S08 | 30 | 25 | 55 |
| **Day 1** | **205** | **170** | **375** |

### Day 2 (~360 minutos planejados)

**Seções:** S09, S10, S11, S12, S13, S14.

- **S15 Jobs & CronJobs** e **S16 HPA** são os primeiros **add-backs** se houver tempo
  (cada um ~40 minutos).

| Seção | Slides | Lab | Total |
| --- | --- | --- | --- |
| S09 | 35 | 25 | 60 |
| S10 | 30 | 25 | 55 |
| S11 | 30 | 30 | 60 |
| S12 | 30 | 30 | 60 |
| S13 | 35 | 30 | 65 |
| S14 | 30 | 30 | 60 |
| **Day 2** | **190** | **170** | **360** |

### Day 3 (~420 minutos planejados)

**Seções:** S17, S20, S21, S22, S23, S25, S26, S27.

- **S18 NetworkPolicy** e **S19 RBAC** são add-backs opcionais para uma entrega mais longa.
  **S24 kubebuilder está deferred e fora de agenda** até que os seus slides e lab pareados
  atendam ao contrato de autoria.

| Seção | Slides | Lab | Total |
| --- | --- | --- | --- |
| S17 | 30 | 25 | 55 |
| S20 | 30 | 30 | 60 |
| S21 | 30 | 25 | 55 |
| S22 | 25 | 15 | 40 |
| S23 | 30 | 25 | 55 |
| S25 | 35 | 30 | 65 |
| S26 | 30 | 40 | 70 |
| S27 | 20 | — | 20 |
| **Day 3** | **230** | **190** | **420** |

> **Como ler os totais.** Day 1 (375) e Day 2 (360) ficam abaixo do alvo de ~390, deixando
> folga para a pré-leitura S01/S02 (Day 1) e para os add-backs S15/S16 (Day 2). O Day 3 como
> listado soma **420** — acima do alvo — então um facilitador que precise fechar no horário
> deve cortar um dos add-backs do Day 3 (S18/S19 já estão fora, e o S24 deferred está fora de
> agenda); enxugar o lab do capstone S26 ou mover uma seção recommended. Estas são estimativas
> de planejamento não ensaiadas; o [guia do facilitador](./facilitator-guide.md#timing-and-pacing)
> explica como manter o ritmo em cima delas.

## Alinhamento com CKAD / CKA

O alinhamento é uma **verificação de design**, não a estrutura do workshop — preparação para
certificação explicitamente *não* é o princípio organizador. A cobertura de temas é mapeada
aos domínios do CKA/CKAD para que o workshop seja uma base forte para certificação e para que
quem tem curiosidade sobre certificação consiga se situar sozinho.

> **Atualidade.** Verifique a release atual do Kubernetes e as versões dos currículos
> CKA/CKAD no momento da entrega; este documento não fixa uma versão. O CKA foi revisado
> substancialmente (reduzindo para cinco domínios e adicionando **Gateway API, Helm/Kustomize
> e CRDs/Operators**), tudo que este workshop ensina — então a espinha dorsal é
> deliberadamente moderna.

### Coberto pelo workshop

| Domínio da certificação (tema) | Seções | CKAD | CKA |
| --- | --- | --- | --- |
| Container images & build | S01, S02 | Design & Build | — |
| Cluster architecture & API model | S03, S04 | Design & Build | Cluster Arch |
| Workloads & scheduling (Pod, Deployment, StatefulSet, resources, jobs, HPA) | S05, S06, S12, S13, S15, S16 | Design & Build / Deployment | Workloads & Scheduling |
| Services & networking (Service, Ingress, Gateway API, NetworkPolicy) | S07, S08, S09, S18 | Services & Networking | Services & Networking |
| Configuration (ConfigMap, Secret) | S10 | App Env, Config & Security | Workloads & Scheduling |
| Storage (PV/PVC/StorageClass) | S11, S12 | Design & Build (volumes) | Storage |
| Observability (probes, metrics, debugging) | S14, S23 | Observability & Maintenance | Troubleshooting |
| Security (image, PSS, securityContext, RBAC, NetworkPolicy, hardening) | S02, S17, S18, S19, S25 | App Env, Config & Security | Cluster Arch / Troubleshooting |
| Packaging & delivery (Helm, GitOps) | S20, S21 | App Deployment (Helm) | Cluster Arch (Helm/Kustomize) |
| Extensibility (CRDs, operators) | S22, S23, S24 | App Env (CRD/Operators) | Cluster Arch (CRDs/operators) |

### Intencionalmente opcional / próximos passos

Mencionados no fechamento (S27) como "para onde ir depois", em vez de ensinados a fundo:

- **Padrões multi-container** (sidecar/init/ambassador/adapter, incluindo native sidecar
  containers) — um item de CKAD; tocado em S05.
- **Controles de scheduling em nodes** — nodeAffinity, taints/tolerations, topology spread — um
  item de workloads do CKA; candidato a uma futura seção opcional.
- **Canary / blue-green** — um item de estratégia do CKAD; demo conceitual em S06/S21.
- **Internals do cluster** — CoreDNS, `crictl` e as interfaces de extensão CNI/CSI/CRI;
  o `crictl` é tocado no debugging de node em S25, e o CRI em S01/S03.
- **Trilha de administração (fora de escopo para quem desenvolve aplicações)** — ciclo de
  vida/upgrades com kubeadm, backup/restore do etcd, control plane em HA, `drain`/`cordon` de
  node. Apontados para recursos externos e pulados.

## Para onde ir depois (recursos gratuitos)

Apresentados em S27 como opções seguintes — certificação é uma possibilidade, não o objetivo.

- **Documentação oficial** — <https://kubernetes.io/docs/home/> · tutorial interativo
  Kubernetes Basics · Gateway API (<https://gateway-api.sigs.k8s.io/>) · Pod Security Standards.
- **CNCF / Linux Foundation** — o curso gratuito LFS158 "Introduction to Kubernetes" e os
  currículos open source de CKA/CKAD (<https://github.com/cncf/curriculum>).
- **Prática hands-on (gratuita)** — cenários CKA/CKAD do Killercoda "Killer Shell" e
  playgrounds de clusters efêmeros.
- **Containers & images** — a OCI image spec, Trivy, Sigstore/cosign, SLSA e as base images
  distroless.
- **Operators** — o Kubebuilder Book e o Operator SDK.
- **Segurança (defensiva)** — NSA/CISA Kubernetes Hardening Guidance, MITRE ATT&CK for
  Containers, e ferramentas como kube-bench, Trivy, Kubescape e Falco.
